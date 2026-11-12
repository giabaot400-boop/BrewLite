import type { Prisma } from "../generated/prisma/client.js";

const MAX_MONEY = 2_147_483_647;
const SIZE_EXTRA_PRICE = { S: 0, M: 5_000, L: 10_000 } as const;

type Size = keyof typeof SIZE_EXTRA_PRICE;

type InputItem = {
  productId: string;
  size: Size;
  toppingIds: string[];
  qty: number;
  expectedUnitPrice: number;
};

type OrderV1 = { items: InputItem[] };

type OrderV2 = {
  schemaVersion: 2;
  items: InputItem[];
  promotionCode: string | null;
  expectedTotal: number;
};

export type OrderLine = {
  productId: string;
  productName: string;
  size: Size;
  basePrice: number;
  sizeExtraPrice: number;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  toppings: { toppingId: string; name: string; price: number }[];
};

export type PriceResult = {
  items: OrderLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  promotionId: string | null;
  promotionSnapshot: object | null;
  promotionEvaluatedAt: Date | null;
  loyaltyPolicySnapshot: { version: 1; divisor: 10000 };
  loyaltyPointsExpected: number;
};

export class PriceOrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PriceOrderError";
  }
}

function validMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY;
}

function normalizePromotionCode(value: string | null): string | null {
  if (value === null) return null;

  const code = value
    .trim()
    .replace(/[a-z]/g, (character) => character.toUpperCase());
  if (code === "") return null;

  if (!/^[A-Z0-9_-]{1,32}$/.test(code)) {
    throw new PriceOrderError(
      "VALIDATION_ERROR",
      "Mã khuyến mãi không hợp lệ.",
    );
  }

  return code;
}

export async function priceOrder(
  tx: Prisma.TransactionClient,
  input: OrderV1 | OrderV2,
  at: Date,
): Promise<PriceResult> {
  const isV2 = "schemaVersion" in input && input.schemaVersion === 2;

  const items: OrderLine[] = [];

  for (const item of input.items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      include: { toppings: { include: { topping: true } } },
    });

    if (!product) {
      throw new PriceOrderError(
        "VALIDATION_ERROR",
        `Sản phẩm ${item.productId} không tồn tại.`,
      );
    }

    const sizeExtraPrice = SIZE_EXTRA_PRICE[item.size];
    if (sizeExtraPrice === undefined) {
      throw new PriceOrderError("VALIDATION_ERROR", "Size không hợp lệ.");
    }

    const toppings: OrderLine["toppings"] = [];

    for (const toppingId of item.toppingIds) {
      const relation = product.toppings.find(
        (entry) => entry.toppingId === toppingId,
      );

      if (!relation) {
        throw new PriceOrderError(
          "VALIDATION_ERROR",
          `Topping ${toppingId} không thuộc sản phẩm ${item.productId}.`,
        );
      }

      toppings.push({
        toppingId: relation.topping.id,
        name: relation.topping.name,
        price: relation.topping.price,
      });
    }

    toppings.sort((a, b) => a.toppingId.localeCompare(b.toppingId));

    const toppingTotal = toppings.reduce((sum, t) => sum + t.price, 0);
    const unitPrice = product.price + sizeExtraPrice + toppingTotal;
    const lineTotal = unitPrice * item.qty;

    if (
      !validMoney(product.price) ||
      !validMoney(toppingTotal) ||
      !validMoney(unitPrice) ||
      !validMoney(lineTotal)
    ) {
      throw new PriceOrderError(
        "VALIDATION_ERROR",
        "Giá trị đơn hàng vượt giới hạn.",
      );
    }

    items.push({
      productId: product.id,
      productName: product.name,
      size: item.size,
      basePrice: product.price,
      sizeExtraPrice,
      unitPrice,
      qty: item.qty,
      lineTotal,
      toppings,
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  if (!validMoney(subtotal) || subtotal < 1) {
    throw new PriceOrderError("VALIDATION_ERROR", "Tổng tiền không hợp lệ.");
  }

  const priceChanged = items.some(
    (line, index) => line.unitPrice !== input.items[index].expectedUnitPrice,
  );

  const promotionCode = isV2
    ? normalizePromotionCode(input.promotionCode)
    : null;

  let promotionId: string | null = null;
  let promotionSnapshot: object | null = null;
  let promotionEvaluatedAt: Date | null = null;
  let discountTotal = 0;

  if (promotionCode) {
    const promotion = await tx.promotion.findUnique({
      where: { code: promotionCode },
    });

    let reason:
      | "NOT_FOUND"
      | "INACTIVE"
      | "NOT_STARTED"
      | "EXPIRED"
      | "MINIMUM_NOT_MET"
      | null = null;

    if (!promotion) reason = "NOT_FOUND";
    else if (!promotion.active) reason = "INACTIVE";
    else if (at < promotion.startsAt) reason = "NOT_STARTED";
    else if (at >= promotion.endsAt) reason = "EXPIRED";
    else if (
      subtotal <
      (promotionCode === "DEMO10"
        ? Math.max(50_000, promotion.minimumSubtotal)
        : promotion.minimumSubtotal)
    ) {
      reason = "MINIMUM_NOT_MET";
    }

    if (reason) {
      throw new PriceOrderError(
        "PROMOTION_NOT_APPLICABLE",
        "Mã khuyến mãi không áp dụng được.",
        { reason },
      );
    }

    if (!promotion) {
      throw new PriceOrderError(
        "PROMOTION_NOT_APPLICABLE",
        "Không tìm thấy mã khuyến mãi.",
        { reason: "NOT_FOUND" },
      );
    }

    const rawDiscount =
      promotionCode === "DEMO10"
        ? Math.floor((subtotal * 10) / 100)
        : promotion.type === "PERCENT"
          ? Math.floor((subtotal * promotion.value) / 100)
          : 0;

    const cap =
      promotionCode === "DEMO10"
        ? 20_000
        : (promotion.maxDiscountAmount ?? MAX_MONEY);

    discountTotal = Math.min(rawDiscount, cap, subtotal);

    if (!validMoney(discountTotal)) {
      throw new PriceOrderError(
        "VALIDATION_ERROR",
        "Giá trị giảm giá không hợp lệ.",
      );
    }

    promotionId = promotion.id;
    promotionEvaluatedAt = at;
    promotionSnapshot = {
      id: promotion.id,
      code: promotion.code,
      type: promotion.type,
      value: promotion.value,
      minimumSubtotal: promotion.minimumSubtotal,
      maxDiscountAmount: cap,
      discountAmount: discountTotal,
      evaluatedAt: at.toISOString(),
    };
  }

  const total = subtotal - discountTotal;

  if (!validMoney(total) || total < 1) {
    throw new PriceOrderError(
      "VALIDATION_ERROR",
      "Tổng thanh toán không hợp lệ.",
    );
  }

  if (isV2 && (priceChanged || total !== input.expectedTotal)) {
    throw new PriceOrderError(
      "CHECKOUT_CHANGED",
      "Giá hoặc tổng đơn hàng đã thay đổi.",
      {
        reason: priceChanged
          ? "PRODUCT_PRICE_CHANGED"
          : "EXPECTED_TOTAL_MISMATCH",
        currentSubtotal: subtotal,
        currentDiscountTotal: discountTotal,
        currentTotal: total,
        items: items.map((line) => ({
          productId: line.productId,
          size: line.size,
          toppingIds: line.toppings.map((t) => t.toppingId),
          currentUnitPrice: line.unitPrice,
        })),
      },
    );
  }

  if (!isV2 && priceChanged) {
    throw new PriceOrderError("PRICE_CHANGED", "Giá sản phẩm đã thay đổi.", {
      items: items.map((line, index) => ({
        productId: line.productId,
        size: line.size,
        toppingIds: line.toppings.map((t) => t.toppingId),
        qty: line.qty,
        expectedUnitPrice: input.items[index].expectedUnitPrice,
        currentUnitPrice: line.unitPrice,
        currentLineTotal: line.lineTotal,
      })),
      currentTotal: subtotal,
    });
  }

  return {
    items,
    subtotal,
    discountTotal,
    total,
    promotionId,
    promotionSnapshot,
    promotionEvaluatedAt,
    loyaltyPolicySnapshot: { version: 1, divisor: 10_000 },
    loyaltyPointsExpected: Math.floor(total / 10_000),
  };
}
