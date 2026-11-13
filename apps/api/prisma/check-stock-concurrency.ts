import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  aggregateNeeds,
  precheckStock,
  reserveStock,
  OutOfStock,
  StockConflict,
} from '../src/database/stock.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing DATABASE_URL.');
if (new URL(connectionString).pathname !== '/brewlite_s2_test') {
  throw new Error('This script requires brewlite_s2_test.');
}

const createClient = () => new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const first = createClient();
const second = createClient();
const suffix = randomUUID();
const productId = `s3-race-product-${suffix}`;
const userId = `s3-race-user-${suffix}`;
const orderIds = [randomUUID(), randomUUID()];
const needs = aggregateNeeds([{ productId, qty: 1 }]);

async function main() {
  try {
    await first.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: `${suffix}@example.invalid`,
          passwordHash: 'TEST_ONLY_NOT_A_LOGIN_HASH',
        },
      });
      await tx.product.create({
        data: {
          id: productId,
          name: 'Last product test',
          description: 'Isolated concurrency fixture',
          price: 10000,
          imageUrl: '/test.svg',
          stock: 1,
        },
      });
    });

    let ready = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const observedAvailable: number[] = [];

    const attempt = (client: PrismaClient, orderId: string) =>
      client.$transaction(async (tx) => {
        const plan = await precheckStock(tx, needs);
        observedAvailable.push(plan[0]!.stock - plan[0]!.reservedStock);

        // Both transactions must read available stock before either writes.
        ready += 1;
        if (ready === 2) release();
        await gate;

        await tx.order.create({
          data: {
            id: orderId,
            userId,
            requestKey: randomUUID(),
            requestHash: 'test-only',
            subtotal: 10000,
            total: 10000,
            checkoutPolicyVersion: 2,
            paymentDeadline: new Date(Date.now() + 900000),
            loyaltyPolicySnapshot: { version: 1, divisor: 10000 },
            loyaltyPointsExpected: 1,
            items: {
              create: {
                productId,
                productName: 'Last product test',
                size: 'S',
                basePrice: 10000,
                sizeExtraPrice: 0,
                unitPrice: 10000,
                qty: 1,
                lineTotal: 10000,
              },
            },
          },
        });

        await reserveStock(tx, orderId, plan, new Date());
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 5000,
        timeout: 15000,
      });

    const results = await Promise.allSettled([
      attempt(first, orderIds[0]!),
      attempt(second, orderIds[1]!),
    ]);

    assert.equal(ready, 2);
    assert.deepEqual(observedAvailable, [1, 1]);
    console.log('PASS 1: both transactions observed the last available product.');

    const winners = results.filter((result) => result.status === 'fulfilled');
    const losers = results.filter((result) => result.status === 'rejected');
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);

    const error: unknown = losers[0]!.reason;
    const retryable =
      error instanceof StockConflict ||
      (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      );
    assert.ok(retryable, `Unexpected losing transaction error: ${String(error)}`);
    console.log('PASS 2: one transaction committed; the other hit a stock conflict.');

    const product = await first.product.findUniqueOrThrow({
      where: { id: productId },
    });
    assert.equal(product.stock, 1);
    assert.equal(product.reservedStock, 1);
    assert.equal(product.stockVersion, 1);

    assert.equal(
      await first.order.count({ where: { id: { in: orderIds } } }),
      1,
    );
    assert.equal(
      await first.orderItem.count({ where: { orderId: { in: orderIds } } }),
      1,
    );

    const reservations = await first.stockReservation.findMany({
      where: { productId },
    });
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0]!.qty, 1);
    assert.equal(reservations[0]!.state, 'ACTIVE');
    console.log('PASS 3: only one order/item/reservation remains; no overselling.');

    await assert.rejects(
      () => second.$transaction((tx) => precheckStock(tx, needs)),
      OutOfStock,
    );
    console.log('PASS 4: a fresh transaction sees out-of-stock.');
  } finally {
    // Delete only this run's isolated fixtures, in foreign-key order.
    await first.$transaction(async (tx) => {
      await tx.stockReservation.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await tx.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await tx.order.deleteMany({
        where: { id: { in: orderIds } },
      });
      await tx.product.deleteMany({ where: { id: productId } });
      await tx.user.deleteMany({ where: { id: userId } });
    });
  }

  assert.equal(
    await first.product.count({ where: { id: productId } }),
    0,
  );
  assert.equal(
    await first.user.count({ where: { id: userId } }),
    0,
  );
  console.log('PASS 5: isolated concurrency fixtures were cleaned up.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([
    first.$disconnect(),
    second.$disconnect(),
  ]));