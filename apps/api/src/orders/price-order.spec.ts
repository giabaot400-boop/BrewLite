import { test } from "node:test";
import assert from "node:assert/strict";
import { priceOrder, PriceOrderError } from "./price-order.js";

const now = new Date("2026-11-09T10:00:00.000Z");

function createTx(promotion: any = null, productPrice = 40_000) {
  const product = {
    id: "p1",
    name: "Latte",
    price: productPrice,
    toppings: [
      {
        toppingId: "t1",
        topping: { id: "t1", name: "Pearl", price: 5_000 },
      },
    ],
  };

  return {
    product: {
      findUnique: async () => product,
    },
    promotion: {
      findUnique: async () => promotion,
    },
  } as never;
}

test("Pricing: tính đúng giá size và topping", async () => {
  const result = await priceOrder(
    createTx(),
    {
      items: [{
        productId: "p1",
        size: "M",
        toppingIds: ["t1"],
        qty: 2,
        expectedUnitPrice: 50_000,
      }],
    },
    now,
  );

  assert.equal(result.subtotal, 100_000);
  assert.equal(result.items[0].unitPrice, 50_000);
  assert.equal(result.items[0].lineTotal, 100_000);
  assert.equal(result.total, 100_000);
});

test("Promotion: áp dụng DEMO10 và giới hạn giảm giá", async () => {
  const promotion = {
    id: "promo1",
    code: "DEMO10",
    active: true,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z"),
    minimumSubtotal: 50_000,
    type: "PERCENT",
    value: 10,
    maxDiscountAmount: 20_000,
  };

  const result = await priceOrder(
    createTx(promotion),
    {
      schemaVersion: 2,
      items: [{
        productId: "p1",
        size: "M",
        toppingIds: ["t1"],
        qty: 2,
        expectedUnitPrice: 50_000,
      }],
      promotionCode: "DEMO10",
      expectedTotal: 90_000,
    },
    now,
  );

  assert.equal(result.subtotal, 100_000);
  assert.equal(result.discountTotal, 10_000);
  assert.equal(result.total, 90_000);
  assert.equal(result.promotionId, "promo1");
  assert.equal(result.loyaltyPointsExpected, 9);
});

test("Promotion: chuẩn hóa mã chữ thường", async () => {
  let queriedCode = "";

  const promotion = {
    id: "promo1",
    code: "DEMO10",
    active: true,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: new Date("2027-01-01T00:00:00.000Z"),
    minimumSubtotal: 50_000,
    type: "PERCENT",
    value: 10,
    maxDiscountAmount: 20_000,
  };

  const tx = createTx(promotion) as any;
  tx.promotion.findUnique = async ({ where }: any) => {
    queriedCode = where.code;
    return promotion;
  };

  await priceOrder(
    tx,
    {
      schemaVersion: 2,
      items: [{
        productId: "p1",
        size: "M",
        toppingIds: ["t1"],
        qty: 2,
        expectedUnitPrice: 50_000,
      }],
      promotionCode: "demo10",
      expectedTotal: 90_000,
    },
    now,
  );

  assert.equal(queriedCode, "DEMO10");
});

test("Promotion: từ chối mã không tồn tại", async () => {
  await assert.rejects(
    priceOrder(
      createTx(null),
      {
        schemaVersion: 2,
        items: [{
          productId: "p1",
          size: "M",
          toppingIds: ["t1"],
          qty: 2,
          expectedUnitPrice: 50_000,
        }],
        promotionCode: "UNKNOWN",
        expectedTotal: 100_000,
      },
      now,
    ),
    (error: unknown) =>
      error instanceof PriceOrderError &&
      error.code === "PROMOTION_NOT_APPLICABLE",
  );
});

// C phân biệt nguyên nhân để backend trả đúng CHECKOUT_CHANGED.details.reason.
test("V2 CHECKOUT_CHANGED: reason PRODUCT_PRICE_CHANGED takes priority", async () => {
  await assert.rejects(
    priceOrder(
      createTx(null, 41_000),
      {
        schemaVersion: 2,
        items: [{
          productId: "p1",
          size: "M",
          toppingIds: ["t1"],
          qty: 2,
          expectedUnitPrice: 50_000,
        }],
        promotionCode: null,
        expectedTotal: 100_000,
      },
      now,
    ),
    (error: unknown) => {
      assert.ok(error instanceof PriceOrderError);
      assert.equal(error.code, "CHECKOUT_CHANGED");
      assert.deepEqual(error.details, {
        reason: "PRODUCT_PRICE_CHANGED",
        currentSubtotal: 102_000,
        currentDiscountTotal: 0,
        currentTotal: 102_000,
        items: [{
          productId: "p1",
          size: "M",
          toppingIds: ["t1"],
          currentUnitPrice: 51_000,
        }],
      });
      return true;
    },
  );
});

test("V2 CHECKOUT_CHANGED: reason EXPECTED_TOTAL_MISMATCH when unit prices match", async () => {
  await assert.rejects(
    priceOrder(
      createTx(),
      {
        schemaVersion: 2,
        items: [{
          productId: "p1",
          size: "M",
          toppingIds: ["t1"],
          qty: 2,
          expectedUnitPrice: 50_000,
        }],
        promotionCode: null,
        expectedTotal: 99_000,
      },
      now,
    ),
    (error: unknown) => {
      assert.ok(error instanceof PriceOrderError);
      assert.equal(error.code, "CHECKOUT_CHANGED");
      assert.deepEqual(error.details, {
        reason: "EXPECTED_TOTAL_MISMATCH",
        currentSubtotal: 100_000,
        currentDiscountTotal: 0,
        currentTotal: 100_000,
        items: [{
          productId: "p1",
          size: "M",
          toppingIds: ["t1"],
          currentUnitPrice: 50_000,
        }],
      });
      return true;
    },
  );
});
