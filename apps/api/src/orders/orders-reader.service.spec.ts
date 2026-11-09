import { test } from "node:test";
import assert from "node:assert/strict";
import { OrdersReaderService } from "./orders-reader.service.js";

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: "order-1",
    version: 1,
    status: "PENDING",
    createdAt: new Date("2026-11-09T10:00:00.000Z"),
    checkoutPolicyVersion: 2,
    paymentDeadline: new Date(Date.now() + 60_000),
    items: [
      {
        productId: "product-1",
        productName: "Latte",
        size: "M",
        basePrice: 30000,
        sizeExtraPrice: 5000,
        unitPrice: 35000,
        qty: 2,
        lineTotal: 70000,
        toppings: [],
      },
    ],
    subtotal: 70000,
    discountTotal: 7000,
    total: 63000,
    promotionSnapshot: { code: "DEMO10" },
    paidAt: null,
    cancelReason: null,
    paymentAttempts: [],
    loyaltyEntry: { points: 63, reversedAt: null },
    loyaltyPointsExpected: 63,
    reservations: [
      { productId: "product-1", qty: 2, state: "ACTIVE" },
    ],
    ...overrides,
  };
}

function createService(order: any) {
  const prisma = {
    $transaction: async (callback: (tx: any) => any) =>
      callback({
        order: {
          findFirst: async () => order,
        },
      }),
  };

  return new OrdersReaderService(prisma as any);
}

test("Order Reader returns promotion code and discount", async () => {
  const result = await createService(makeOrder()).getOrderDetail(
    "user-1",
    "order-1",
  );

  assert.deepEqual(result.promotion, {
    code: "DEMO10",
    discountAmount: 7000,
  });
});

test("Order Reader returns null promotion for invalid snapshot", async () => {
  const result = await createService(
    makeOrder({ promotionSnapshot: ["DEMO10"] }),
  ).getOrderDetail("user-1", "order-1");

  assert.equal(result.promotion, null);
});

test("Order Reader returns earned and reversed loyalty points", async () => {
  const earned = await createService(makeOrder()).getOrderDetail(
    "user-1",
    "order-1",
  );

  assert.equal(earned.loyaltyPointsEarned, 63);
  assert.equal(earned.loyaltyPointsReversed, 0);

  const reversed = await createService(
    makeOrder({
      loyaltyEntry: {
        points: 63,
        reversedAt: new Date(),
      },
    }),
  ).getOrderDetail("user-1", "order-1");

  assert.equal(reversed.loyaltyPointsEarned, 63);
  assert.equal(reversed.loyaltyPointsReversed, 63);
});

test("Order Reader enables payment and cancellation for valid pending order", async () => {
  const result = await createService(makeOrder()).getOrderDetail(
    "user-1",
    "order-1",
  );

  assert.equal(result.canPay, true);
  assert.equal(result.canCancel, true);
});
