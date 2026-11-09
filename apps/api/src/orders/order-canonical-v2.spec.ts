import "reflect-metadata";

import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalizeOrderV2,
  type OrderV2Input,
} from "./order-canonical-v2.js";

function createOrderV2(): OrderV2Input {
  return {
    schemaVersion: 2,
    items: [
      {
        productId: "cappuccino",
        size: "M",
        toppingIds: [],
        qty: 2,
        expectedUnitPrice: 50000,
      },
    ],
    promotionCode: "DEMO10",
    expectedTotal: 90000,
  };
}

test("UT-S3-D01: Canonical V2 matches contract fixture", () => {
  const result = canonicalizeOrderV2(createOrderV2());

  assert.equal(
    result.canonicalJson,
    '{"version":2,"items":[{"productId":"cappuccino","size":"M","toppingIds":[],"qty":2,"expectedUnitPrice":50000}],"promotionCode":"DEMO10","expectedTotal":90000}',
  );

  assert.equal(
    result.requestHash,
    "a38540a34fa5af8427da8d7e995514f9c62ca3ed8715967800bca388b1b65c01",
  );

  assert.equal(result.canonicalVersion, 2);
});

test("UT-S3-D02: Promotion normalization preserves identity", () => {
  const orderA = createOrderV2();
  const orderB = createOrderV2();

  orderA.promotionCode = " demo10 ";
  orderB.promotionCode = "DEMO10";

  assert.equal(
    canonicalizeOrderV2(orderA).requestHash,
    canonicalizeOrderV2(orderB).requestHash,
  );
});

test("UT-S3-D03: Changing expectedTotal changes hash", () => {
  const orderA = createOrderV2();
  const orderB = createOrderV2();

  orderB.expectedTotal = 95000;

  assert.notEqual(
    canonicalizeOrderV2(orderA).requestHash,
    canonicalizeOrderV2(orderB).requestHash,
  );
});

test("UT-S3-D04: V2 does not mutate input topping order", () => {
  const order = createOrderV2();
  order.items[0].toppingIds = ["pearl", "cream"];

  canonicalizeOrderV2(order);

  assert.deepEqual(order.items[0].toppingIds, ["pearl", "cream"]);
});
import { BadRequestException } from "@nestjs/common";
// UT-S3-D05: Đảo thứ tự sản phẩm không đổi hash.
test("UT-S3-D05: Item order does not change hash", () => {
  const orderA = createOrderV2();
  orderA.items.push({
    productId: "americano",
    size: "S",
    toppingIds: [],
    qty: 1,
    expectedUnitPrice: 40000,
  });

  const orderB = structuredClone(orderA);
  orderB.items.reverse();

  assert.equal(
    canonicalizeOrderV2(orderA).requestHash,
    canonicalizeOrderV2(orderB).requestHash,
  );
});

// UT-S3-D06: Đảo thứ tự topping không đổi hash.
test("UT-S3-D06: Topping order does not change hash", () => {
  const orderA = createOrderV2();
  orderA.items[0].toppingIds = ["cream", "pearl"];

  const orderB = structuredClone(orderA);
  orderB.items[0].toppingIds.reverse();

  assert.equal(
    canonicalizeOrderV2(orderA).requestHash,
    canonicalizeOrderV2(orderB).requestHash,
  );
});

// UT-S3-D07: Hai dòng trùng cấu hình bị từ chối.
test("UT-S3-D07: Duplicate configuration is rejected", () => {
  const order = createOrderV2();

  order.items.push({
    productId: "cappuccino",
    size: "M",
    toppingIds: [],
    qty: 1,
    expectedUnitPrice: 50000,
  });

  assert.throws(
    () => canonicalizeOrderV2(order),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);

      const response = error.getResponse() as {
        error: {
          code: string;
          fieldErrors: Record<string, string[]>;
        };
      };

      assert.equal(response.error.code, "VALIDATION_ERROR");
      assert.deepEqual(response.error.fieldErrors["items[1]"], [
        "Cấu hình sản phẩm đã xuất hiện trong đơn hàng.",
      ]);

      return true;
    },
  );
});

// UT-S3-D08: Topping trùng trong một dòng bị từ chối.
test("UT-S3-D08: Duplicate topping is rejected", () => {
  const order = createOrderV2();
  order.items[0].toppingIds = ["cream", "cream"];

  assert.throws(() => canonicalizeOrderV2(order), BadRequestException);
});

// UT-S3-D09: Mã khuyến mãi không hợp lệ.
test("UT-S3-D09: Invalid promotion code is rejected", () => {
  const order = createOrderV2();
  order.promotionCode = "DEMO@10";

  assert.throws(() => canonicalizeOrderV2(order), BadRequestException);
});

// UT-S3-D10: Sai schemaVersion bị từ chối.
test("UT-S3-D10: Invalid schema version is rejected", () => {
  const order = {
    ...createOrderV2(),
    schemaVersion: 3,
  };

  assert.throws(
    () => canonicalizeOrderV2(order as unknown as OrderV2Input),
    BadRequestException,
  );
});

// UT-S3-D11: Thay đổi mã khuyến mãi làm đổi hash.
test("UT-S3-D11: Promotion change changes hash", () => {
  const orderA = createOrderV2();
  const orderB = createOrderV2();

  orderB.promotionCode = "OTHER10";

  assert.notEqual(
    canonicalizeOrderV2(orderA).requestHash,
    canonicalizeOrderV2(orderB).requestHash,
  );
});

// UT-S3-D12: expectedTotal không hợp lệ.
test("UT-S3-D12: Invalid expected total is rejected", () => {
  for (const invalidTotal of [0, -1, 1.5, 2147483648]) {
    const order = createOrderV2();
    order.expectedTotal = invalidTotal;

    assert.throws(() => canonicalizeOrderV2(order), BadRequestException);
  }
});
