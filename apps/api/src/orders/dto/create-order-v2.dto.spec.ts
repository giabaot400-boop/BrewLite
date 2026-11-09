import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateOrderV2Dto } from "./create-order-v2.dto.js";

function validOrder() {
  return {
    schemaVersion: 2,
    items: [
      {
        productId: "cappuccino",
        size: "M",
        toppingIds: [] as string[],
        qty: 2,
        expectedUnitPrice: 50000,
      },
    ],
    promotionCode: "DEMO10",
    expectedTotal: 90000,
  };
}

async function validateOrder(data: object) {
  const dto = plainToInstance(CreateOrderV2Dto, data);
  return validate(dto);
}

test("UT-S3-D13: DTO V2 accepts valid order", async () => {
  const errors = await validateOrder(validOrder());
  assert.equal(errors.length, 0);
});

test("UT-S3-D14: Reject invalid schemaVersion", async () => {
  const errors = await validateOrder({
    ...validOrder(),
    schemaVersion: 1,
  });
  assert.ok(errors.length > 0);
});

test("UT-S3-D15: Reject empty items", async () => {
  const errors = await validateOrder({
    ...validOrder(),
    items: [],
  });
  assert.ok(errors.length > 0);
});

test("UT-S3-D16: Reject invalid size", async () => {
  const data = validOrder();
  data.items[0].size = "XL";

  const errors = await validateOrder(data);
  assert.ok(errors.length > 0);
});

test("UT-S3-D17: Reject invalid qty", async () => {
  const data = validOrder();
  data.items[0].qty = 0;

  const errors = await validateOrder(data);
  assert.ok(errors.length > 0);
});

test("UT-S3-D18: Reject duplicate topping", async () => {
  const data = validOrder();
  data.items[0].toppingIds = ["kem", "kem"];

  const errors = await validateOrder(data);
  assert.ok(errors.length > 0);
});

test("UT-S3-D19: Reject invalid expectedTotal", async () => {
  const errors = await validateOrder({
    ...validOrder(),
    expectedTotal: 0,
  });
  assert.ok(errors.length > 0);
});

test("UT-S3-D20: Accept null promotionCode", async () => {
  const errors = await validateOrder({
    ...validOrder(),
    promotionCode: null,
  });
  assert.equal(errors.length, 0);
});

test("UT-S3-D21: Reject numeric promotionCode", async () => {
  const errors = await validateOrder({
    ...validOrder(),
    promotionCode: 123,
  });
  assert.ok(errors.length > 0);
});

test("UT-S3-D22: Reject more than 20 items", async () => {
  const errors = await validateOrder({
    ...validOrder(),
    items: Array.from({ length: 21 }, () => ({
      ...validOrder().items[0],
    })),
  });
  assert.ok(errors.length > 0);
});
