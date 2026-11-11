import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  aggregateNeeds,
  precheckStock,
  reserveStock,
  consumeStock,
  releaseStock,
  returnStock,
  OutOfStock,
  StockConflict,
} from '../src/database/stock.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing DATABASE_URL.');

const database = new URL(connectionString).pathname.slice(1);
if (database !== 'brewlite_s2_test') {
  throw new Error('This script requires brewlite_s2_test.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const marker = new Error('EXPECTED_TEST_ROLLBACK');
const suffix = randomUUID();
const productId = `s3-stock-${suffix}`;
const userId = `s3-stock-user-${suffix}`;

async function main() {
  try {
    await prisma.$transaction(async (tx) => {
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
          name: 'Stock test',
          description: 'Temporary test product',
          price: 10000,
          imageUrl: '/test.svg',
          stock: 3,
        },
      });

      const createOrder = (qty: number) => tx.order.create({
        data: {
          userId,
          requestKey: randomUUID(),
          requestHash: 'test-only',
          subtotal: 10000 * qty,
          total: 10000 * qty,
          checkoutPolicyVersion: 2,
          paymentDeadline: new Date(Date.now() + 900000),
          loyaltyPolicySnapshot: { version: 1, divisor: 10000 },
          loyaltyPointsExpected: qty,
          items: {
            create: {
              productId,
              productName: 'Stock test',
              size: 'S',
              basePrice: 10000,
              sizeExtraPrice: 0,
              unitPrice: 10000,
              qty,
              lineTotal: 10000 * qty,
            },
          },
        },
      });

      const checkStock = async (
        stock: number,
        reservedStock: number,
        stockVersion: number,
      ) => {
        const row = await tx.product.findUniqueOrThrow({
          where: { id: productId },
        });
        assert.equal(row.stock, stock);
        assert.equal(row.reservedStock, reservedStock);
        assert.equal(row.stockVersion, stockVersion);
      };

      const needs = aggregateNeeds([
        { productId, qty: 1 },
        { productId, qty: 1 },
      ]);
      assert.equal(needs.length, 1);
      assert.equal(needs[0]!.qty, 2);
      console.log('PASS 1: duplicate product demands are aggregated.');

      const order = await createOrder(2);
      const plan = await precheckStock(tx, needs);
      await reserveStock(tx, order.id, plan, new Date());
      await checkStock(3, 2, 1);
      console.log('PASS 2: reserve increments held stock and version.');

      await assert.rejects(
        () => precheckStock(tx, needs),
        OutOfStock,
      );
      await checkStock(3, 2, 1);
      console.log('PASS 3: insufficient stock is rejected without writes.');

      await consumeStock(tx, order.id, new Date());
      await checkStock(1, 0, 2);
      const consumed = await tx.stockReservation.findMany({
        where: { orderId: order.id },
      });
      assert.equal(consumed.length, 1);
      assert.equal(consumed[0]!.state, 'CONSUMED');
      assert.ok(consumed[0]!.resolvedAt);
      console.log('PASS 4: consumption decrements stock and held stock.');

      // Helper fixture only; full payment/points workflow is not tested here.
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'PAID' },
      });
      await returnStock(tx, order.id, new Date());
      await checkStock(3, 0, 3);
      const returned = await tx.stockReservation.findFirstOrThrow({
        where: { orderId: order.id },
      });
      assert.equal(returned.state, 'RETURNED');
      console.log('PASS 5: return restores stock.');

      await assert.rejects(
        () => returnStock(tx, order.id, new Date()),
      );
      await checkStock(3, 0, 3);
      console.log('PASS 6: repeated return cannot add stock.');

      const second = await createOrder(1);
      const secondPlan = await precheckStock(
        tx,
        aggregateNeeds([{ productId, qty: 1 }]),
      );
      await reserveStock(tx, second.id, secondPlan, new Date());
      await releaseStock(tx, second.id, new Date());
      await checkStock(3, 0, 5);
      const released = await tx.stockReservation.findFirstOrThrow({
        where: { orderId: second.id },
      });
      assert.equal(released.state, 'RELEASED');
      assert.ok(released.resolvedAt);
      console.log('PASS 7: release preserves total stock.');

      await assert.rejects(
        () => releaseStock(tx, second.id, new Date()),
      );
      await checkStock(3, 0, 5);
      console.log('PASS 8: repeated release cannot subtract held stock.');
            const third = await createOrder(1);
      const stalePlan = await precheckStock(
        tx,
        aggregateNeeds([{ productId, qty: 1 }]),
      );

      await tx.product.update({
        where: { id: productId },
        data: { stockVersion: { increment: 1 } },
      });

      await assert.rejects(
        () => reserveStock(tx, third.id, stalePlan, new Date()),
        StockConflict,
      );

      await checkStock(3, 0, 6);

      assert.equal(
        await tx.stockReservation.count({
          where: { orderId: third.id },
        }),
        0,
      );

      console.log('PASS 10: stale stock plan is rejected without reservation.');

      throw marker;
    }, { timeout: 15000 });
  } catch (error) {
    if (error !== marker) throw error;
  }

  assert.equal(
    await prisma.product.count({ where: { id: productId } }),
    0,
  );
  assert.equal(
    await prisma.user.count({ where: { id: userId } }),
    0,
  );
  console.log('PASS 9: test fixtures were rolled back.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());