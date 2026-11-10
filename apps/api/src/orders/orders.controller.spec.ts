import "reflect-metadata";

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";

import type { Request, Response } from "express";
import type { OrdersService } from "./orders.service.js";
import type { OrdersReaderService } from "./orders-reader.service.js";
import type { CreateOrderDto } from "./dto/create-order.dto.js";
import type { CreateOrderV2Dto } from "./dto/create-order-v2.dto.js";

import { OrdersController } from "./orders.controller.js";

const USER_ID = "user-001";

const v1Body = {
  items: [
    {
      productId: "coffee-milk",
      size: "M",
      toppingIds: ["cream"],
      qty: 1,
      expectedUnitPrice: 47000,
    },
  ],
};

const v2Body = {
  schemaVersion: 2,
  items: v1Body.items,
  promotionCode: null,
  expectedTotal: 47000,
};

type ServiceCall = {
  version: "V1" | "V2";
  userId: string;
  requestKey: string;
  dto: CreateOrderDto | CreateOrderV2Dto;
};

function setup() {
  const calls: ServiceCall[] = [];

  const service = {
    createOrder: async (
      userId: string,
      requestKey: string,
      dto: CreateOrderDto,
    ) => {
      calls.push({ version: "V1", userId, requestKey, dto });

      return {
        httpStatus: 201,
        body: { id: "order-v1", status: "PENDING", total: 47000 },
      };
    },

    createOrderV2: async (
      userId: string,
      requestKey: string,
      dto: CreateOrderV2Dto,
    ) => {
      calls.push({ version: "V2", userId, requestKey, dto });

      return {
        httpStatus: 201,
        body: { id: "order-v2", status: "PENDING", total: 47000 },
      };
    },
  };

  const controller = new OrdersController(
    service as unknown as OrdersService,
    {} as OrdersReaderService,
  );

  const req = {
    user: { id: USER_ID },
  } as unknown as Request;

  let statusCode = 200;
  let responseBody: unknown;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },

    json(body: unknown) {
      responseBody = body;
      return this;
    },
  } as Response;

  return {
    controller,
    calls,
    req,
    res,
    getResponse: () => ({
      statusCode,
      body: responseBody,
    }),
  };
}

async function expectValidationError(
  action: () => Promise<unknown>,
): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 400);

    const response = error.getResponse() as {
      error?: { code?: string };
    };

    assert.equal(response.error?.code, "VALIDATION_ERROR");

    return true;
  });
}

test("TC-D-V01: V1 khong co schemaVersion", async () => {
  const ctx = setup();
  const key = randomUUID();

  await ctx.controller.createOrder(v1Body, key, ctx.req, ctx.res);

  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].version, "V1");
  assert.equal(ctx.calls[0].userId, USER_ID);
  assert.equal(ctx.getResponse().statusCode, 201);
});

test("TC-D-V02: V2 schemaVersion = 2", async () => {
  const ctx = setup();

  await ctx.controller.createOrder(v2Body, randomUUID(), ctx.req, ctx.res);

  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].version, "V2");
  assert.equal(ctx.getResponse().statusCode, 201);
});

test("TC-D-V03: Tu choi schemaVersion = 3", async () => {
  const ctx = setup();

  await expectValidationError(() =>
    ctx.controller.createOrder(
      { ...v2Body, schemaVersion: 3 },
      randomUUID(),
      ctx.req,
      ctx.res,
    ),
  );

  assert.equal(ctx.calls.length, 0);
});

test("TC-D-V04: Tu choi schemaVersion dang chuoi", async () => {
  const ctx = setup();

  await expectValidationError(() =>
    ctx.controller.createOrder(
      { ...v2Body, schemaVersion: "2" },
      randomUUID(),
      ctx.req,
      ctx.res,
    ),
  );

  assert.equal(ctx.calls.length, 0);
});

test("TC-D-V05: V2 thieu expectedTotal", async () => {
  const ctx = setup();
  const { expectedTotal: _removed, ...invalidBody } = v2Body;

  await expectValidationError(() =>
    ctx.controller.createOrder(invalidBody, randomUUID(), ctx.req, ctx.res),
  );

  assert.equal(ctx.calls.length, 0);
});

test("TC-D-V06: V1 co thuoc tinh du", async () => {
  const ctx = setup();

  await expectValidationError(() =>
    ctx.controller.createOrder(
      { ...v1Body, unexpectedField: "invalid" },
      randomUUID(),
      ctx.req,
      ctx.res,
    ),
  );

  assert.equal(ctx.calls.length, 0);
});

test("TC-D-V07: Tu choi Idempotency-Key sai", async () => {
  const ctx = setup();

  await expectValidationError(() =>
    ctx.controller.createOrder(v1Body, "not-a-uuid", ctx.req, ctx.res),
  );

  assert.equal(ctx.calls.length, 0);
});

test("TC-D-V08: Giu nguyen Idempotency-Key", async () => {
  const ctx = setup();
  const key = randomUUID();

  await ctx.controller.createOrder(v2Body, key, ctx.req, ctx.res);

  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].requestKey, key);
  assert.equal(ctx.calls[0].userId, USER_ID);
  assert.equal(ctx.calls[0].version, "V2");
});
