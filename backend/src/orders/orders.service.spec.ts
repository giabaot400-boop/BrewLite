import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";
import type { CreateOrderDto } from "./dto/create-order.dto.js";
import { canonicalizeOrder } from "./order-canonical.js";

const USER_ID = "user-001";
const REQUEST_KEY = "550e8400-e29b-41d4-a716-446655440000";

function createDto(expectedUnitPrice = 47000): CreateOrderDto {
  return {
    items: [
      {
        productId: "coffee-milk",
        size: "M",
        toppingIds: ["cream"],
        qty: 2,
        expectedUnitPrice,
      },
    ],
  };
}

function createProduct() {
  return {
    id: "coffee-milk",
    name: "Cà phê sữa",
    price: 35000,
    toppings: [
      {
        toppingId: "cream",
        topping: {
          id: "cream",
          name: "Kem",
          price: 7000,
        },
      },
    ],
  };
}

type MockOptions = {
  acquired?: boolean;
  product?: ReturnType<typeof createProduct> | null;
  existing?: Record<string, unknown> | null;
};

function createMock(options: MockOptions = {}) {
  const calls = {
    ordersCreated: [] as unknown[],
    requestsCreated: [] as unknown[],
  };

  const tx = {
    $queryRaw: async () => [{ acquired: options.acquired ?? true }],

    product: {
      findUnique: async () =>
        options.product === undefined ? createProduct() : options.product,
    },

    orderRequest: {
      findUnique: async () => options.existing ?? null,
      create: async (args: unknown) => {
        calls.requestsCreated.push(args);
        return args;
      },
    },

    order: {
      create: async (args: unknown) => {
        calls.ordersCreated.push(args);
        return {
          id: "order-001",
          total: 94000,
        };
      },
    },
  };

  const prisma = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  return { service, calls };
}

async function expectHttpError(
  action: () => Promise<unknown>,
  status: number,
  code: string,
) {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), status);

    const response = error.getResponse() as {
      error?: { code?: string };
    };

    assert.equal(response.error?.code, code);
    return true;
  });
}

test("UT-S01: Create order successfully - HTTP 201", async () => {
  const { service, calls } = createMock();

  const result = await service.createOrder(USER_ID, REQUEST_KEY, createDto());

  assert.equal(result.httpStatus, 201);
  assert.equal(result.body.status, "PENDING");
  assert.equal(result.body.total, 94000);
  assert.equal(calls.ordersCreated.length, 1);
  assert.equal(calls.requestsCreated.length, 1);
});

test("UT-S02: Price changed - HTTP 409", async () => {
  const { service, calls } = createMock();

  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, createDto(45000)),
    409,
    "PRICE_CHANGED",
  );

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 1);
});

test("UT-S03: Product does not exist - HTTP 400", async () => {
  const { service, calls } = createMock({
    product: null,
  });

  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, createDto()),
    400,
    "VALIDATION_ERROR",
  );

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 1);
});

test("UT-S04: Same key and hash - replay HTTP 200", async () => {
  const dto = createDto();
  const requestHash = canonicalizeOrder(dto).requestHash;

  const { service, calls } = createMock({
    existing: {
      requestHash,
      state: "SUCCEEDED",
      httpStatus: 201,
      responseJson: {
        id: "existing-order",
        status: "PENDING",
        total: 94000,
      },
    },
  });

  const result = await service.createOrder(USER_ID, REQUEST_KEY, dto);

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.id, "existing-order");
  assert.equal(calls.ordersCreated.length, 0);
});

test("UT-S05: Same key with different hash - HTTP 409", async () => {
  const { service, calls } = createMock({
    existing: {
      requestHash: "different-hash",
      state: "SUCCEEDED",
      responseJson: {
        id: "existing-order",
        status: "PENDING",
        total: 94000,
      },
    },
  });

  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, createDto()),
    409,
    "IDEMPOTENCY_CONFLICT",
  );

  assert.equal(calls.ordersCreated.length, 0);
});

test("UT-S06: Advisory lock unavailable - HTTP 409", async () => {
  const { service, calls } = createMock({
    acquired: false,
  });

  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, createDto()),
    409,
    "ORDER_REQUEST_IN_PROGRESS",
  );

  assert.equal(calls.ordersCreated.length, 0);
});
