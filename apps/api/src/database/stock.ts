import type { Prisma } from '../generated/prisma/client.js';

const MAX_INT = 2_147_483_647;

export type StockLine = {
  productId: string;
  qty: number;
};

export type Need = {
  kind: 'PRODUCT';
  id: string;
  qty: number;
};

export type StockPlan = Array<Need & {
  stock: number;
  reservedStock: number;
  stockVersion: number;
}>;

export class StockConflict extends Error {
  constructor() {
    super('Stock changed; roll back and retry the whole transaction.');
    this.name = 'StockConflict';
  }
}

export class OutOfStock extends Error {
  constructor(
    public readonly resources: Array<{
      kind: 'PRODUCT';
      id: string;
      requested: number;
      available: number;
    }>,
  ) {
    super('Insufficient product stock.');
    this.name = 'OutOfStock';
  }
}

export function aggregateNeeds(items: readonly StockLine[]): Need[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (
      !item.productId ||
      !Number.isSafeInteger(item.qty) ||
      item.qty < 1
    ) {
      throw new Error('Invalid stock demand.');
    }

    const qty = (totals.get(item.productId) ?? 0) + item.qty;
    if (qty > MAX_INT) {
      throw new Error('Stock demand exceeds the integer limit.');
    }

    totals.set(item.productId, qty);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([id, qty]) => ({ kind: 'PRODUCT', id, qty }));
}

export async function precheckStock(
  tx: Prisma.TransactionClient,
  needs: readonly Need[],
): Promise<StockPlan> {
  // Normalize again so duplicate product IDs cannot bypass aggregation.
  const normalized = aggregateNeeds(needs.map((need) => {
    if (need.kind !== 'PRODUCT') {
      throw new Error('Unsupported stock resource.');
    }
    return { productId: need.id, qty: need.qty };
  }));

  const products = await tx.product.findMany({
    where: { id: { in: normalized.map((need) => need.id) } },
    select: {
      id: true,
      stock: true,
      reservedStock: true,
      stockVersion: true,
    },
  });

  const byId = new Map(products.map((product) => [product.id, product]));
  const shortages: OutOfStock['resources'] = [];
  const plan: StockPlan = [];

  for (const need of normalized) {
    const product = byId.get(need.id);
    if (!product) {
      throw new Error(`Missing stock product: ${need.id}`);
    }

    const available = product.stock - product.reservedStock;
    if (available < need.qty) {
      shortages.push({
        kind: 'PRODUCT',
        id: need.id,
        requested: need.qty,
        available,
      });
    }

    plan.push({ ...need, ...product });
  }

  if (shortages.length > 0) {
    throw new OutOfStock(shortages);
  }

  return plan;
}
export async function reserveStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  plan: StockPlan,
  at: Date,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      checkoutPolicyVersion: true,
      status: true,
      items: {
        select: { productId: true, qty: true },
      },
      reservations: {
        select: { id: true },
      },
    },
  });

  if (
    !order ||
    order.checkoutPolicyVersion !== 2 ||
    order.status !== 'PENDING' ||
    order.reservations.length > 0
  ) {
    throw new Error('Order is not eligible for stock reservation.');
  }

  const expected = aggregateNeeds(order.items);
  const sortedPlan = [...plan].sort(
    (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  if (
    expected.length === 0 ||
    expected.length !== sortedPlan.length ||
    expected.some((need, index) => {
      const row = sortedPlan[index];
      return !row ||
        row.kind !== 'PRODUCT' ||
        row.id !== need.id ||
        row.qty !== need.qty;
    })
  ) {
    throw new Error('Stock plan does not match order snapshots.');
  }

  // Validate the entire plan before the first write.
  for (const row of sortedPlan) {
    if (
      !Number.isInteger(row.stock) ||
      !Number.isInteger(row.reservedStock) ||
      !Number.isInteger(row.stockVersion) ||
      row.stock < 0 ||
      row.stock > MAX_INT ||
      row.reservedStock < 0 ||
      row.reservedStock > row.stock ||
      row.stockVersion < 0 ||
      row.stockVersion >= MAX_INT ||
      row.qty > row.stock - row.reservedStock
    ) {
      throw new Error('Invalid or exhausted stock plan.');
    }
  }

  for (const row of sortedPlan) {
    const result = await tx.product.updateMany({
      where: {
        id: row.id,
        stock: row.stock,
        reservedStock: row.reservedStock,
        stockVersion: row.stockVersion,
      },
      data: {
        reservedStock: { increment: row.qty },
        stockVersion: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new StockConflict();
    }

    await tx.stockReservation.create({
      data: {
        orderId,
        productId: row.id,
        qty: row.qty,
        state: 'ACTIVE',
        createdAt: at,
      },
    });
  }
}
export async function consumeStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  at: Date,
): Promise<void> {
  // Caller must lock the Order row before invoking this helper.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      checkoutPolicyVersion: true,
      status: true,
      items: { select: { productId: true, qty: true } },
      reservations: true,
    },
  });

  if (
    !order ||
    order.checkoutPolicyVersion !== 2 ||
    !['PENDING', 'PAYMENT_FAILED'].includes(order.status)
  ) {
    throw new Error('Order is not eligible for stock consumption.');
  }

  const needs = aggregateNeeds(order.items);
  const reservations = new Map(
    order.reservations.map((row) => [row.productId, row]),
  );

  if (
    needs.length === 0 ||
    needs.length !== order.reservations.length
  ) {
    throw new Error('Incomplete stock reservations.');
  }

  // Verify all reservations before any write.
  for (const need of needs) {
    const row = reservations.get(need.id);
    if (
      !row ||
      row.qty !== need.qty ||
      row.state !== 'ACTIVE' ||
      row.resolvedAt !== null
    ) {
      throw new Error('Reservation does not match order snapshots.');
    }
  }

  const products = await tx.product.findMany({
    where: { id: { in: needs.map((need) => need.id) } },
    select: {
      id: true,
      stock: true,
      reservedStock: true,
      stockVersion: true,
    },
  });
  const byId = new Map(products.map((row) => [row.id, row]));

  for (const need of needs) {
    const product = byId.get(need.id);
    if (
      !product ||
      product.stock < need.qty ||
      product.reservedStock < need.qty ||
      product.stockVersion >= MAX_INT
    ) {
      throw new Error('Inconsistent stock during consumption.');
    }
  }

  // aggregateNeeds sorts products by ID for a consistent lock order.
  for (const need of needs) {
    const product = byId.get(need.id)!;
    const reservation = reservations.get(need.id)!;

    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        stock: product.stock,
        reservedStock: product.reservedStock,
        stockVersion: product.stockVersion,
      },
      data: {
        stock: { decrement: need.qty },
        reservedStock: { decrement: need.qty },
        stockVersion: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw new StockConflict();
    }

    const resolved = await tx.stockReservation.updateMany({
      where: {
        id: reservation.id,
        state: 'ACTIVE',
        resolvedAt: null,
      },
      data: {
        state: 'CONSUMED',
        resolvedAt: at,
      },
    });

    if (resolved.count !== 1) {
      throw new StockConflict();
    }
  }
}
export async function releaseStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  at: Date,
): Promise<void> {
  // Caller must lock the Order row first.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      checkoutPolicyVersion: true,
      status: true,
      items: { select: { productId: true, qty: true } },
      reservations: true,
    },
  });

  if (
    !order ||
    order.checkoutPolicyVersion !== 2 ||
    !['PENDING', 'PAYMENT_FAILED'].includes(order.status)
  ) {
    throw new Error('Order is not eligible for stock release.');
  }

  const needs = aggregateNeeds(order.items);
  const reservations = new Map(
    order.reservations.map((row) => [row.productId, row]),
  );

  if (
    needs.length === 0 ||
    needs.length !== order.reservations.length
  ) {
    throw new Error('Incomplete stock reservations.');
  }

  for (const need of needs) {
    const row = reservations.get(need.id);
    if (
      !row ||
      row.qty !== need.qty ||
      row.state !== 'ACTIVE' ||
      row.resolvedAt !== null
    ) {
      throw new Error('Reservation does not match order snapshots.');
    }
  }

  const products = await tx.product.findMany({
    where: { id: { in: needs.map((need) => need.id) } },
    select: {
      id: true,
      stock: true,
      reservedStock: true,
      stockVersion: true,
    },
  });
  const byId = new Map(products.map((row) => [row.id, row]));

  for (const need of needs) {
    const product = byId.get(need.id);
    if (
      !product ||
      product.reservedStock < need.qty ||
      product.stockVersion >= MAX_INT
    ) {
      throw new Error('Inconsistent stock during release.');
    }
  }

  for (const need of needs) {
    const product = byId.get(need.id)!;
    const reservation = reservations.get(need.id)!;

    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        stock: product.stock,
        reservedStock: product.reservedStock,
        stockVersion: product.stockVersion,
      },
      data: {
        reservedStock: { decrement: need.qty },
        stockVersion: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw new StockConflict();
    }

    const resolved = await tx.stockReservation.updateMany({
      where: {
        id: reservation.id,
        state: 'ACTIVE',
        resolvedAt: null,
      },
      data: {
        state: 'RELEASED',
        resolvedAt: at,
      },
    });

    if (resolved.count !== 1) {
      throw new StockConflict();
    }
  }
}
export async function returnStock(
  tx: Prisma.TransactionClient,
  orderId: string,
  at: Date,
): Promise<void> {
  // Caller must lock the Order row first.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      checkoutPolicyVersion: true,
      status: true,
      items: { select: { productId: true, qty: true } },
      reservations: true,
    },
  });

  if (
    !order ||
    order.checkoutPolicyVersion !== 2 ||
    order.status !== 'PAID'
  ) {
    throw new Error('Order is not eligible for stock return.');
  }

  const needs = aggregateNeeds(order.items);
  const reservations = new Map(
    order.reservations.map((row) => [row.productId, row]),
  );

  if (
    needs.length === 0 ||
    needs.length !== order.reservations.length
  ) {
    throw new Error('Incomplete stock reservations.');
  }

  for (const need of needs) {
    const row = reservations.get(need.id);
    if (
      !row ||
      row.qty !== need.qty ||
      row.state !== 'CONSUMED' ||
      row.resolvedAt === null
    ) {
      throw new Error('Reservation does not match order snapshots.');
    }
  }

  const products = await tx.product.findMany({
    where: { id: { in: needs.map((need) => need.id) } },
    select: {
      id: true,
      stock: true,
      reservedStock: true,
      stockVersion: true,
    },
  });
  const byId = new Map(products.map((row) => [row.id, row]));

  for (const need of needs) {
    const product = byId.get(need.id);
    if (
      !product ||
      product.stock > MAX_INT - need.qty ||
      product.stockVersion >= MAX_INT
    ) {
      throw new Error('Invalid stock or integer limit during return.');
    }
  }

  for (const need of needs) {
    const product = byId.get(need.id)!;
    const reservation = reservations.get(need.id)!;

    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        stock: product.stock,
        reservedStock: product.reservedStock,
        stockVersion: product.stockVersion,
      },
      data: {
        stock: { increment: need.qty },
        stockVersion: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw new StockConflict();
    }

    const resolved = await tx.stockReservation.updateMany({
      where: {
        id: reservation.id,
        state: 'CONSUMED',
        resolvedAt: reservation.resolvedAt,
      },
      data: {
        state: 'RETURNED',
        resolvedAt: at,
      },
    });

    if (resolved.count !== 1) {
      throw new StockConflict();
    }
  }
}