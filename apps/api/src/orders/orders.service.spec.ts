import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { HttpException } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";
import type { CreateOrderDto } from "./dto/create-order.dto.js";
import { canonicalizeOrder } from "./order-canonical.js";
import type { CreateOrderV2Dto } from "./dto/create-order-v2.dto.js";
import { canonicalizeOrderV2 } from "./order-canonical-v2.js";
import { StockConflict } from "../database/stock.js";

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
  storedCorruption?: string;
  stock?: number;

  // Số lần transaction giả lập gặp StockConflict.
  transactionConflictAttempts?: number;
};

function createMock(options: MockOptions = {}) {
  const calls = {
    ordersCreated: [] as unknown[],
    requestsCreated: [] as unknown[],
    stockUpdates: [] as unknown[],
    reservationsCreated: [] as unknown[],
  };

  let storedRequest: Record<string, unknown> | null = null;
  let storedOrder: Record<string, unknown> | null = null;

  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("");

      if (sql.includes("clock_timestamp()")) {
        return [{ now: new Date("2026-11-10T10:00:00.000Z") }];
      }

      return [{ acquired: options.acquired ?? true }];
    },

    product: {
      findUnique: async () =>
        options.product === undefined ? createProduct() : options.product,

      findMany: async () => [
        {
          id: "coffee-milk",
          stock: options.stock ?? 100,
          reservedStock: 0,
          stockVersion: 0,
        },
      ],

      updateMany: async (args: { where: any; data: any }) => {
        calls.stockUpdates.push(args);
        return { count: 1 };
      },
    },

    orderRequest: {
      findUnique: async () =>
        storedRequest === null
          ? (options.existing ?? null)
          : { ...storedRequest, order: storedOrder },
      create: async (args: { data: Record<string, unknown> }) => {
        calls.requestsCreated.push(args);
        storedRequest = { ...args.data };
        for (const field of ["userId", "requestKey", "requestHash"]) {
          if (options.storedCorruption === `ledger.${field}`) {
            storedRequest[field] = "unexpected-value";
          }
        }
        return storedRequest;
      },
    },

    order: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.ordersCreated.push(args);

        storedOrder = {
          ...args.data,
          id: "order-001",
          total: 94000,
        };

        for (const field of ["userId", "requestKey", "requestHash"]) {
          if (options.storedCorruption === `order.${field}`) {
            storedOrder[field] = "unexpected-value";
          }
        }

        return storedOrder;
      },

      findUnique: async () => {
        if (!storedOrder) {
          return null;
        }

        const data = storedOrder as {
          items?: {
            create?: Array<{
              productId: string;
              qty: number;
            }>;
          };
        };

        return {
          ...storedOrder,

          items:
            data.items?.create?.map((item) => ({
              productId: item.productId,
              qty: item.qty,
            })) ?? [],

          reservations: [],
        };
      },
    },

    stockReservation: {
      create: async (args: { data: Record<string, unknown> }) => {
        calls.reservationsCreated.push(args.data);
        return args.data;
      },
    },
  };

  let transactionAttempts = 0;

  const prisma = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => {
      transactionAttempts++;

      if (transactionAttempts <= (options.transactionConflictAttempts ?? 0)) {
        throw new StockConflict();
      }

      return callback(tx);
    },
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  return {
    service,
    calls,
    get transactionAttempts() {
      return transactionAttempts;
    },
  };
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
test("UT-S11: V1 exhausts StockConflict retries - HTTP 503", async () => {
  // Giả lập 3 transaction liên tiếp gặp StockConflict.
  const mock = createMock({
    transactionConflictAttempts: 3,
  });

  // Sau 3 lần retry thất bại, V1 phải trả HTTP 503.
  await expectHttpError(
    () => mock.service.createOrder(USER_ID, REQUEST_KEY, createDto()),
    503,
    "TRANSACTION_RETRY_EXHAUSTED",
  );

  // Không được thực hiện transaction lần thứ tư.
  assert.equal(mock.transactionAttempts, 3);

  // Không được tạo đơn hàng hoặc ghi ledger.
  assert.equal(mock.calls.ordersCreated.length, 0);
  assert.equal(mock.calls.requestsCreated.length, 0);

  // Không được cập nhật hoặc giữ tồn kho.
  assert.equal(mock.calls.stockUpdates.length, 0);
  assert.equal(mock.calls.reservationsCreated.length, 0);
});
test("UT-S12: V1 rejects zero-total order and saves rejected ledger", async () => {
  // Tạo sản phẩm có giá bằng 0.
  const product = {
    ...createProduct(),
    price: 0,
  };

  const { service, calls } = createMock({ product });

  // Không chọn topping, sử dụng size S.
  const dto: CreateOrderDto = {
    items: [
      {
        productId: "coffee-milk",
        size: "S",
        toppingIds: [],
        qty: 2,
        expectedUnitPrice: 0,
      },
    ],
  };

  // V1 phải từ chối đơn hàng có tổng tiền bằng 0.
  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, dto),
    400,
    "VALIDATION_ERROR",
  );

  // Không được tạo Order hoặc giữ tồn kho.
  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.stockUpdates.length, 0);
  assert.equal(calls.reservationsCreated.length, 0);

  // Phải lưu đúng một ledger REJECTED.
  assert.equal(calls.requestsCreated.length, 1);

  const ledger = calls.requestsCreated[0] as {
    data: {
      canonicalVersion: number;
      state: string;
      httpStatus: number;
      orderId: string | null;
    };
  };

  assert.equal(ledger.data.canonicalVersion, 1);
  assert.equal(ledger.data.state, "REJECTED");
  assert.equal(ledger.data.httpStatus, 400);
  assert.equal(ledger.data.orderId, null);

  // Gửi lại cùng request: phải replay lỗi đã lưu.
  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, dto),
    400,
    "VALIDATION_ERROR",
  );

  // Replay không được ghi thêm ledger hoặc tạo Order.
  assert.equal(calls.requestsCreated.length, 1);
  assert.equal(calls.ordersCreated.length, 0);
});
test("UT-S01: Create order successfully - HTTP 201", async () => {
  const { service, calls } = createMock();

  const result = await service.createOrder(USER_ID, REQUEST_KEY, createDto());

  assert.equal(result.httpStatus, 201);
  assert.equal(result.body.status, "PENDING");
  assert.equal(result.body.total, 94000);
  assert.equal(calls.ordersCreated.length, 1);
  assert.equal(calls.requestsCreated.length, 1);
  // Kiểm tra V1 đã thực hiện cập nhật giữ kho.
  assert.equal(calls.stockUpdates.length, 1);

  // Kiểm tra V1 đã tạo một bản ghi StockReservation.
  assert.equal(calls.reservationsCreated.length, 1);

  // Kiểm tra số lượng sản phẩm được giữ đúng bằng số lượng đặt.
  const reservation = calls.reservationsCreated[0] as {
    orderId: string;
    productId: string;
    qty: number;
    state: string;
  };

  assert.equal(reservation.orderId, "order-001");
  assert.equal(reservation.productId, "coffee-milk");
  assert.equal(reservation.qty, 2);
  assert.equal(reservation.state, "ACTIVE");
});
test("UT-S09: V1 out of stock saves rejected ledger", async () => {
  const { service, calls } = createMock({ stock: 1 });

  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, createDto()),
    409,
    "OUT_OF_STOCK",
  );

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.stockUpdates.length, 0);
  assert.equal(calls.reservationsCreated.length, 0);

  assert.equal(calls.requestsCreated.length, 1);

  const ledger = calls.requestsCreated[0] as {
    data: {
      canonicalVersion: number;
      state: string;
      httpStatus: number;
      orderId: string | null;
    };
  };

  assert.equal(ledger.data.canonicalVersion, 1);
  assert.equal(ledger.data.state, "REJECTED");
  assert.equal(ledger.data.httpStatus, 409);
  assert.equal(ledger.data.orderId, null);
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

  await assert.rejects(
    () => service.createOrder(USER_ID, REQUEST_KEY, createDto()),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 400);

      const response = error.getResponse() as {
        error: {
          code: string;
          fieldErrors: Record<string, string[]>;
        };
      };

      assert.equal(response.error.code, "VALIDATION_ERROR");

      const messages = response.error.fieldErrors["items[0]"];

      assert.ok(Array.isArray(messages));
      assert.deepEqual(messages, ["Sản phẩm không tồn tại."]);

      return true;
    },
  );

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 1);
  const savedRequest = calls.requestsCreated[0] as {
    data: {
      state: string;
      httpStatus: number;
      responseJson: {
        error: {
          fieldErrors: Record<string, string[]>;
        };
      };
    };
  };

  assert.equal(savedRequest.data.state, "REJECTED");
  assert.equal(savedRequest.data.httpStatus, 400);

  assert.deepEqual(
    savedRequest.data.responseJson.error.fieldErrors["items[0]"],
    ["Sản phẩm không tồn tại."],
  );
});

test("UT-S04: Same key and hash - replay HTTP 200", async () => {
  const dto = createDto();
  const requestHash = canonicalizeOrder(dto).requestHash;

  const { service, calls } = createMock({
    existing: {
      canonicalVersion: 1,
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
  // Replay không được cập nhật tồn kho.
  assert.equal(calls.stockUpdates.length, 0);

  // Replay không được tạo StockReservation mới.
  assert.equal(calls.reservationsCreated.length, 0);

  // Replay không được ghi thêm ledger.
  assert.equal(calls.requestsCreated.length, 0);
});
test("UT-S10: V1 create then replay reserves stock only once", async () => {
  const { service, calls } = createMock();
  const dto = createDto();

  // Lần 1: Tạo đơn hàng mới.
  const first = await service.createOrder(USER_ID, REQUEST_KEY, dto);

  assert.equal(first.httpStatus, 201);
  assert.equal(calls.ordersCreated.length, 1);
  assert.equal(calls.requestsCreated.length, 1);
  assert.equal(calls.stockUpdates.length, 1);
  assert.equal(calls.reservationsCreated.length, 1);

  // Lần 2: Gửi lại cùng user, key và nội dung.
  const second = await service.createOrder(USER_ID, REQUEST_KEY, dto);

  // Phải trả về kết quả đã lưu.
  assert.equal(second.httpStatus, 200);
  assert.deepEqual(second.body, first.body);

  // Không được tạo đơn hoặc giữ kho thêm lần nữa.
  assert.equal(calls.ordersCreated.length, 1);
  assert.equal(calls.requestsCreated.length, 1);
  assert.equal(calls.stockUpdates.length, 1);
  assert.equal(calls.reservationsCreated.length, 1);
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
test("UT-S07: Rejected replay remaps fieldErrors after item reorder", async () => {
  const originalDto: CreateOrderDto = {
    items: [
      {
        productId: "coffee-milk",
        size: "M",
        toppingIds: ["cream"],
        qty: 2,
        expectedUnitPrice: 47000,
      },
      {
        productId: "invalid-product",
        size: "S",
        toppingIds: [],
        qty: 1,
        expectedUnitPrice: 35000,
      },
    ],
  };

  const replayDto: CreateOrderDto = {
    items: [...originalDto.items].reverse(),
  };

  const originalCanonical = canonicalizeOrder(originalDto);
  const replayCanonical = canonicalizeOrder(replayDto);

  // Đảo thứ tự món không làm thay đổi requestHash
  assert.equal(originalCanonical.requestHash, replayCanonical.requestHash);

  // Xác định vị trí canonical của sản phẩm lỗi
  const canonicalIndex = originalCanonical.items.findIndex(
    (item) => item.productId === "invalid-product",
  );

  assert.ok(canonicalIndex >= 0);

  // Giả lập ledger REJECTED đã lưu lỗi theo canonical index
  const { service, calls } = createMock({
    existing: {
      canonicalVersion: 1,
      requestHash: originalCanonical.requestHash,
      state: "REJECTED",
      httpStatus: 400,
      responseJson: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Đơn hàng chứa sản phẩm không hợp lệ.",
          fieldErrors: {
            [`items[${canonicalIndex}]`]: ["Sản phẩm không tồn tại."],
          },
        },
      },
    },
  });

  await assert.rejects(
    () => service.createOrder(USER_ID, REQUEST_KEY, replayDto),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 400);

      const response = error.getResponse() as {
        error: {
          code: string;
          fieldErrors: Record<string, string[]>;
        };
      };

      assert.equal(response.error.code, "VALIDATION_ERROR");

      // Trong replay, sản phẩm lỗi nằm ở items[0]
      assert.deepEqual(response.error.fieldErrors["items[0]"], [
        "Sản phẩm không tồn tại.",
      ]);

      assert.equal(response.error.fieldErrors["items[1]"], undefined);

      return true;
    },
  );

  // Replay không được tạo thêm Order hoặc ledger
  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 0);
});

for (const side of ["order", "ledger"]) {
  for (const field of ["userId", "requestKey", "requestHash"]) {
    test(`ORDER-08: persisted ${side}.${field} mismatch aborts before commit`, async () => {
      const { service, calls } = createMock({
        storedCorruption: `${side}.${field}`,
      });
      await assert.rejects(
        () => service.createOrder(USER_ID, REQUEST_KEY, createDto()),
        { message: "ORDER_REQUEST_INVARIANT_VIOLATION" },
      );
      assert.equal(calls.ordersCreated.length, 1);
      assert.equal(calls.requestsCreated.length, 1);
    });
  }
}
test("UT-S08: V1 must reject V2 ledger with same hash", async () => {
  const dto = createDto();
  const requestHash = canonicalizeOrder(dto).requestHash;

  const { service, calls } = createMock({
    existing: {
      canonicalVersion: 2,
      requestHash,
      state: "SUCCEEDED",
      httpStatus: 201,
      responseJson: {
        id: "existing-v2-order",
        status: "PENDING",
        total: 94000,
      },
    },
  });

  await expectHttpError(
    () => service.createOrder(USER_ID, REQUEST_KEY, dto),
    409,
    "IDEMPOTENCY_CONFLICT",
  );

  assert.equal(calls.ordersCreated.length, 0);
});
test("UT-S3-D28: V2 rejects V1 ledger even with same hash", async () => {
  const dto: CreateOrderV2Dto = {
    schemaVersion: 2,
    items: [
      {
        productId: "coffee-milk",
        size: "M",
        toppingIds: ["cream"],
        qty: 2,
        expectedUnitPrice: 47000,
      },
    ],
    promotionCode: null,
    expectedTotal: 94000,
  };

  const requestHash = canonicalizeOrderV2(dto).requestHash;

  const { service, calls } = createMock({
    existing: {
      canonicalVersion: 1,
      requestHash,
      state: "SUCCEEDED",
      httpStatus: 201,
      responseJson: {
        id: "existing-v1-order",
        status: "PENDING",
        total: 94000,
      },
    },
  });

  await expectHttpError(
    () => service.createOrderV2(USER_ID, REQUEST_KEY, dto),
    409,
    "IDEMPOTENCY_CONFLICT",
  );

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 0);
});
test("UT-S3-D29: V2 successful replay returns HTTP 200", async () => {
  const dto: CreateOrderV2Dto = {
    schemaVersion: 2,
    items: [
      {
        productId: "coffee-milk",
        size: "M",
        toppingIds: ["cream"],
        qty: 2,
        expectedUnitPrice: 47000,
      },
    ],
    promotionCode: null,
    expectedTotal: 94000,
  };

  const requestHash = canonicalizeOrderV2(dto).requestHash;

  const { service, calls } = createMock({
    existing: {
      canonicalVersion: 2,
      requestHash,
      state: "SUCCEEDED",
      httpStatus: 201,
      responseJson: {
        id: "existing-v2-order",
        status: "PENDING",
        total: 94000,
      },
    },
  });

  const result = await service.createOrderV2(USER_ID, REQUEST_KEY, dto);

  assert.equal(result.httpStatus, 200);
  assert.equal(result.body.id, "existing-v2-order");
  assert.equal(result.body.total, 94000);

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 0);
});
test("UT-S3-D30: V2 rejected replay preserves stored error", async () => {
  const dto: CreateOrderV2Dto = {
    schemaVersion: 2,
    items: [
      {
        productId: "coffee-milk",
        size: "M",
        toppingIds: ["cream"],
        qty: 2,
        expectedUnitPrice: 47000,
      },
    ],
    promotionCode: null,
    expectedTotal: 94000,
  };

  const requestHash = canonicalizeOrderV2(dto).requestHash;

  const { service, calls } = createMock({
    existing: {
      canonicalVersion: 2,
      requestHash,
      state: "REJECTED",
      httpStatus: 409,
      responseJson: {
        error: {
          code: "PRICE_CHANGED",
          message: "Giá sản phẩm đã thay đổi.",
        },
      },
    },
  });

  await expectHttpError(
    () => service.createOrderV2(USER_ID, REQUEST_KEY, dto),
    409,
    "PRICE_CHANGED",
  );

  assert.equal(calls.ordersCreated.length, 0);
  assert.equal(calls.requestsCreated.length, 0);
});
