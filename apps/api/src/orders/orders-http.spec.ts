import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { Module, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AuthGuard } from "../auth/auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { createOrderValidationException } from "../common/order-validation.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { OrdersReaderService } from "./orders-reader.service.js";

const calls: string[] = [];

const mockOrdersService = {
  async createOrder() {
    calls.push("V1");

    return {
      httpStatus: 201,
      body: {
        id: "order-v1",
        status: "PENDING",
        total: 35000,
      },
    };
  },

  async createOrderV2() {
    calls.push("V2");

    return {
      httpStatus: 201,
      body: {
        id: "order-v2",
        status: "PENDING",
        total: 35000,
      },
    };
  },
};

const mockOrdersReader = {
  async getMyOrders() {
    return [];
  },

  async getOrderDetail() {
    return {};
  },
};

const mockAuthService = {
  async validateSession(authorization?: string) {
    if (authorization !== "Bearer test-token") {
      throw new UnauthorizedException();
    }

    return { id: "test-user" };
  },
};
Reflect.defineMetadata("design:paramtypes", [AuthService], AuthGuard);
Reflect.defineMetadata(
  "design:paramtypes",
  [OrdersService, OrdersReaderService],
  OrdersController,
);
@Module({
  controllers: [OrdersController],
  providers: [
    AuthGuard,
    {
      provide: AuthGuard,
      useValue: new AuthGuard(mockAuthService as unknown as AuthService),
    },
    {
      provide: AuthService,
      useValue: mockAuthService,
    },
    {
      provide: OrdersService,
      useValue: mockOrdersService,
    },
    {
      provide: OrdersReaderService,
      useValue: mockOrdersReader,
    },
  ],
})
class OrdersHttpTestModule {}

let baseUrl = "";
let app: Awaited<ReturnType<typeof NestFactory.create>>;

before(async () => {
  app = await NestFactory.create(OrdersHttpTestModule, {
    logger: ["error", "warn"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      exceptionFactory: createOrderValidationException,
    }),
  );
  const guard = app.get(AuthGuard);

  console.log("HTTP TEST GUARD:", {
    guardExists: guard !== undefined,
    authServiceExists:
      (guard as unknown as { authService?: unknown }).authService !== undefined,
  });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();

  assert.ok(address && typeof address !== "string");

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (app) {
    await app.close();
  }
});

beforeEach(() => {
  calls.length = 0;
});

function makeV1Body() {
  return {
    items: [
      {
        productId: "product-1",
        size: "S",
        toppingIds: [],
        qty: 1,
        expectedUnitPrice: 35000,
      },
    ],
  };
}

function makeV2Body() {
  return {
    schemaVersion: 2,
    items: makeV1Body().items,
    expectedTotal: 35000,
  };
}

async function postOrder(
  path: string,
  body: unknown,
  options: {
    authorization?: string | null;
    requestKey?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": options.requestKey ?? randomUUID(),
  };

  if (options.authorization !== null) {
    headers.Authorization = options.authorization ?? "Bearer test-token";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json();

  return {
    status: response.status,
    body: result,
  };
}

test("HTTP-D01: V1 POST /orders", async () => {
  const response = await postOrder("/orders", makeV1Body());

  assert.equal(response.status, 201);
  assert.equal(response.body.id, "order-v1");
  assert.deepEqual(calls, ["V1"]);
});

test("HTTP-D02: V2 POST /orders", async () => {
  const response = await postOrder("/orders", makeV2Body());

  assert.equal(response.status, 201);
  assert.equal(response.body.id, "order-v2");
  assert.deepEqual(calls, ["V2"]);
});

test("HTTP-D03: POST /orders/v2 khong con ton tai", async () => {
  const response = await postOrder("/orders/v2", makeV2Body());

  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("HTTP-D04: Thieu Authorization", async () => {
  const response = await postOrder("/orders", makeV1Body(), {
    authorization: null,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test("HTTP-D05: schemaVersion = 3", async () => {
  const response = await postOrder("/orders", {
    ...makeV2Body(),
    schemaVersion: 3,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(calls, []);
});

test("HTTP-D06: V2 thieu expectedTotal", async () => {
  const body = makeV2Body() as Record<string, unknown>;
  delete body.expectedTotal;

  const response = await postOrder("/orders", body);

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(calls, []);
});

test("HTTP-D07: Idempotency-Key khong hop le", async () => {
  const response = await postOrder("/orders", makeV1Body(), {
    requestKey: "invalid-key",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.deepEqual(calls, []);
});
