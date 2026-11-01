import "reflect-metadata";

import test from "node:test";
import assert from "node:assert/strict";

import { BadRequestException } from "@nestjs/common";
import { canonicalizeOrder } from "./order-canonical.js";
import type { CreateOrderDto } from "./dto/create-order.dto.js";

// Tạo dữ liệu đơn hàng dùng chung cho các bài test.
function createOrder(): CreateOrderDto {
  return {
    items: [
      {
        productId: "coffee-milk",
        size: "M",
        toppingIds: ["cream", "pearl"],
        qty: 2,
        expectedUnitPrice: 52000,
      },
      {
        productId: "americano",
        size: "S",
        toppingIds: [],
        qty: 1,
        expectedUnitPrice: 40000,
      },
    ],
  };
}

// UT-D01: Đổi thứ tự sản phẩm không đổi hash.
test("UT-D01: Item order does not change hash", () => {
  const orderA = createOrder();
  const orderB = createOrder();

  orderB.items.reverse();

  const hashA = canonicalizeOrder(orderA).requestHash;
  const hashB = canonicalizeOrder(orderB).requestHash;

  assert.equal(hashA, hashB);
});

// UT-D02: Đổi thứ tự topping không đổi hash.
test("UT-D02: Topping order does not change hash", () => {
  const orderA = createOrder();
  const orderB = createOrder();

  orderB.items[0].toppingIds.reverse();

  const hashA = canonicalizeOrder(orderA).requestHash;
  const hashB = canonicalizeOrder(orderB).requestHash;

  assert.equal(hashA, hashB);
});

// UT-D03: Thay đổi qty phải thay đổi hash.
test("UT-D03: Quantity change changes hash", () => {
  const orderA = createOrder();
  const orderB = createOrder();

  orderB.items[0].qty = 3;

  assert.notEqual(
    canonicalizeOrder(orderA).requestHash,
    canonicalizeOrder(orderB).requestHash,
  );
});

// UT-D04: Thay đổi expectedUnitPrice phải đổi hash.
test("UT-D04: Expected price change changes hash", () => {
  const orderA = createOrder();
  const orderB = createOrder();

  orderB.items[0].expectedUnitPrice = 57000;

  assert.notEqual(
    canonicalizeOrder(orderA).requestHash,
    canonicalizeOrder(orderB).requestHash,
  );
});

// UT-D05: Kiểm tra version và cấu trúc canonical.
test("UT-D05: Canonical JSON has version 1", () => {
  const result = canonicalizeOrder(createOrder());
  const parsed = JSON.parse(result.canonicalJson);

  assert.equal(result.canonicalVersion, 1);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.items.length, 2);
  assert.equal(result.requestHash.length, 64);
  assert.equal(Object.hasOwn(parsed.items[0], "originalIndex"), false);
});

// UT-D06: Cấu hình món trùng phải bị từ chối.
test("UT-D06: Duplicate configuration is rejected", () => {
  const order = createOrder();

  order.items.push({
    productId: "coffee-milk",
    size: "M",
    toppingIds: ["pearl", "cream"],
    qty: 1,
    expectedUnitPrice: 52000,
  });

  assert.throws(
    () => canonicalizeOrder(order),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal(error.getStatus(), 400);

      const response = error.getResponse() as {
        error: {
          code: string;
          fieldErrors: Record<string, string>;
        };
      };

      assert.equal(response.error.code, "VALIDATION_ERROR");
      assert.ok(response.error.fieldErrors["items[2]"]);

      return true;
    },
  );
});
