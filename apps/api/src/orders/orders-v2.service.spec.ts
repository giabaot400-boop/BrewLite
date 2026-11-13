import { HttpException } from "@nestjs/common";
import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";

import type { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";
import type { CreateOrderV2Dto } from "./dto/create-order-v2.dto.js";
import { Prisma } from "../generated/prisma/client.js";

const USER_ID = "user-001";
const REQUEST_KEY = "550e8400-e29b-41d4-a716-446655440000";

test("UT-S3-D31: V2 checkout changed saves rejected ledger", async () => {
  const requestsCreated: Array<{ data: Record<string, unknown> }> = [];

  const tx = {
    $queryRaw: async () => [{ acquired: true }],

    orderRequest: {
      findUnique: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        requestsCreated.push(args);
        return args.data;
      },
    },

    product: {
      findUnique: async () => ({
        id: "coffee-milk",
        name: "Ca phe sua",
        price: 35000,
        toppings: [],
      }),
    },
  };

  const prisma = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  const dto: CreateOrderV2Dto = {
    schemaVersion: 2,
    items: [
      {
        productId: "coffee-milk",
        size: "S",
        toppingIds: [],
        qty: 1,
        expectedUnitPrice: 30000,
      },
    ],
    promotionCode: null,
    expectedTotal: 30000,
  };

  const result = await service.createOrderV2(USER_ID, REQUEST_KEY, dto);

  assert.equal(result.httpStatus, 409);
  assert.equal(result.body.error.code, "CHECKOUT_CHANGED");

  assert.equal(requestsCreated.length, 1);

  const ledger = requestsCreated[0].data;

  assert.equal(ledger.canonicalVersion, 2);
  assert.equal(ledger.state, "REJECTED");
  assert.equal(ledger.httpStatus, 409);
  assert.equal(ledger.orderId, null);
});
test("UT-S3-D32: V2 rejected request replays stored error", async () => {
  const storedBody = {
    error: {
      code: "CHECKOUT_CHANGED",
      message: "Gia san pham da thay doi",
    },
  };

  let pricingCalls = 0;
  let ledgerCreateCalls = 0;

  const dto: CreateOrderV2Dto = {
    schemaVersion: 2,
    items: [
      {
        productId: "coffee-milk",
        size: "S",
        toppingIds: [],
        qty: 1,
        expectedUnitPrice: 30000,
      },
    ],
    promotionCode: null,
    expectedTotal: 30000,
  };

  const { canonicalizeOrderV2 } = await import("./order-canonical-v2.js");
  const canonical = canonicalizeOrderV2(dto);

  const tx = {
    $queryRaw: async () => [{ acquired: true }],

    orderRequest: {
      findUnique: async () => ({
        userId: USER_ID,
        requestKey: REQUEST_KEY,
        requestHash: canonical.requestHash,
        canonicalVersion: 2,
        state: "REJECTED",
        httpStatus: 409,
        responseJson: storedBody,
        order: null,
      }),

      create: async () => {
        ledgerCreateCalls++;
        throw new Error("Replay must not create another ledger");
      },
    },

    product: {
      findUnique: async () => {
        pricingCalls++;
        throw new Error("Replay must not reprice");
      },
    },
  };

  const prisma = {
    $transaction: async (
      callback: (transaction: typeof tx) => Promise<unknown>,
    ) => callback(tx),
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  await assert.rejects(
    () => service.createOrderV2(USER_ID, REQUEST_KEY, dto),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 409);
      assert.deepEqual(error.getResponse(), storedBody);
      return true;
    },
  );

  assert.equal(pricingCalls, 0);
  assert.equal(ledgerCreateCalls, 0);
});
test("UT-S3-D33: V2 creates pending order and reserves stock", async () => {
  const createdOrders: any[] = [];
  const createdRequests: any[] = [];
  const createdReservations: any[] = [];
  const stockUpdates: any[] = [];

  const product = {
    id: "coffee-milk",
    name: "Cà phê sữa",
    price: 35000,
    stock: 10,
    reservedStock: 0,
    stockVersion: 0,
    toppings: [],
  };

  let savedOrder: any = null;

  const tx = {
    $queryRaw: async () => {
      return [
        {
          acquired: true,
          now: new Date("2026-11-09T10:00:00.000Z"),
        },
      ];
    },

    product: {
      findUnique: async () => product,

      findMany: async () => [
        {
          id: product.id,
          stock: product.stock,
          reservedStock: product.reservedStock,
          stockVersion: product.stockVersion,
        },
      ],

      updateMany: async (args: any) => {
        stockUpdates.push(args);

        assert.equal(args.where.id, product.id);
        assert.equal(args.where.stockVersion, product.stockVersion);

        product.reservedStock += args.data.reservedStock.increment;
        product.stockVersion += args.data.stockVersion.increment;

        return { count: 1 };
      },
    },

    orderRequest: {
      findUnique: async () => {
        const savedRequest = createdRequests[0];

        if (!savedRequest) {
          return null;
        }

        return {
          ...savedRequest,
          order: {
            id: savedRequest.orderId,
            userId: savedRequest.userId,
            requestKey: savedRequest.requestKey,
            requestHash: savedRequest.requestHash,
          },
        };
      },

      create: async (args: any) => {
        createdRequests.push(args.data);
        return args.data;
      },
    },

    order: {
      create: async (args: any) => {
        createdOrders.push(args.data);

        savedOrder = {
          id: "order-v2-001",
          status: args.data.status,
          total: args.data.total,
          checkoutPolicyVersion: args.data.checkoutPolicyVersion,
          items: args.data.items.create.map((item: any) => ({
            productId: item.productId,
            qty: item.qty,
          })),
          reservations: [],
        };

        return savedOrder;
      },

      findUnique: async () => savedOrder,
    },

    stockReservation: {
      create: async (args: any) => {
        createdReservations.push(args.data);
        return args.data;
      },
    },
  };

  const prisma = {
    $transaction: async (callback: any) => callback(tx),
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  const result = await service.createOrderV2(
    "user-001",
    "550e8400-e29b-41d4-a716-446655440000",
    {
      schemaVersion: 2,
      promotionCode: null,
      expectedTotal: 35000,
      items: [
        {
          productId: "coffee-milk",
          size: "S",
          toppingIds: [],
          qty: 1,
          expectedUnitPrice: 35000,
        },
      ],
    },
  );

  assert.equal(result.httpStatus, 201);
  assert.equal(result.body.status, "PENDING");
  assert.equal(result.body.total, 35000);

  assert.equal(createdOrders.length, 1);
  assert.equal(createdOrders[0].checkoutPolicyVersion, 2);
  assert.ok(createdOrders[0].paymentDeadline instanceof Date);

  assert.equal(
    createdOrders[0].paymentDeadline.toISOString(),
    "2026-11-09T10:15:00.000Z",
  );
  assert.equal(createdOrders[0].subtotal, 35000);
  assert.equal(createdOrders[0].discountTotal, 0);

  assert.equal(stockUpdates.length, 1);
  assert.equal(product.reservedStock, 1);
  assert.equal(product.stockVersion, 1);

  assert.equal(createdReservations.length, 1);
  assert.equal(createdReservations[0].orderId, "order-v2-001");
  assert.equal(createdReservations[0].productId, "coffee-milk");
  assert.equal(createdReservations[0].qty, 1);
  assert.equal(createdReservations[0].state, "ACTIVE");

  assert.equal(createdRequests.length, 1);
  assert.equal(createdRequests[0].state, "SUCCEEDED");
  assert.equal(createdRequests[0].canonicalVersion, 2);
  assert.equal(createdRequests[0].httpStatus, 201);
  assert.equal(createdRequests[0].orderId, "order-v2-001");
});
test("UT-S3-D34: V2 out of stock saves rejected ledger", async () => {
  const createdOrders: any[] = [];
  const createdRequests: any[] = [];
  const createdReservations: any[] = [];
  const stockUpdates: any[] = [];

  const product = {
    id: "coffee-milk",
    name: "Cà phê sữa",
    price: 35000,
    stock: 10,
    reservedStock: 8,
    stockVersion: 0,
    toppings: [],
  };

  let savedOrder: any = null;

  const tx = {
    $queryRaw: async () => [{ acquired: true }],

    product: {
      findUnique: async () => product,

      findMany: async () => [
        {
          id: product.id,
          stock: product.stock,
          reservedStock: product.reservedStock,
          stockVersion: product.stockVersion,
        },
      ],

      updateMany: async (args: any) => {
        stockUpdates.push(args);

        assert.equal(args.where.id, product.id);
        assert.equal(args.where.stockVersion, product.stockVersion);

        product.reservedStock += args.data.reservedStock.increment;
        product.stockVersion += args.data.stockVersion.increment;

        return { count: 1 };
      },
    },

    orderRequest: {
      findUnique: async () => null,

      create: async (args: any) => {
        createdRequests.push(args.data);
        return args.data;
      },
    },

    order: {
      create: async (args: any) => {
        createdOrders.push(args.data);

        savedOrder = {
          id: "order-v2-001",
          status: args.data.status,
          total: args.data.total,
          checkoutPolicyVersion: args.data.checkoutPolicyVersion,
          items: args.data.items.create.map((item: any) => ({
            productId: item.productId,
            qty: item.qty,
          })),
          reservations: [],
        };

        return savedOrder;
      },

      findUnique: async () => savedOrder,
    },

    stockReservation: {
      create: async (args: any) => {
        createdReservations.push(args.data);
        return args.data;
      },
    },
  };

  const prisma = {
    $transaction: async (callback: any) => callback(tx),
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  const result = await service.createOrderV2(
    "user-001",
    "550e8400-e29b-41d4-a716-446655440000",
    {
      schemaVersion: 2,
      promotionCode: null,
      expectedTotal: 105000,
      items: [
        {
          productId: "coffee-milk",
          size: "S",
          toppingIds: [],
          qty: 3,
          expectedUnitPrice: 35000,
        },
      ],
    },
  );

  assert.equal(result.httpStatus, 409);

  if ("error" in result.body) {
    assert.equal(result.body.error.code, "OUT_OF_STOCK");

    assert.equal(result.body.error.details?.reason, "INSUFFICIENT_STOCK");
  } else {
    assert.fail("Expected OUT_OF_STOCK error response");
  }

  assert.equal(createdOrders.length, 0);
  assert.equal(createdReservations.length, 0);
  assert.equal(stockUpdates.length, 0);

  assert.equal(createdRequests.length, 1);
  assert.equal(createdRequests[0].state, "REJECTED");
  assert.equal(createdRequests[0].canonicalVersion, 2);
  assert.equal(createdRequests[0].orderId, null);
  assert.equal(createdRequests[0].httpStatus, 409);
});
test("UT-S3-D35: V2 retries StockConflict and succeeds", async () => {
  let transactionCount = 0;
  let stockCheckCount = 0;
  let casCount = 0;

  const committedOrders: any[] = [];
  const committedRequests: any[] = [];
  const committedReservations: any[] = [];

  const product = {
    id: "coffee-milk",
    name: "Ca phe sua",
    price: 35000,
    stock: 10,
    reservedStock: 0,
    stockVersion: 0,
    toppings: [],
  };

  const prisma = {
    $transaction: async (callback: any) => {
      transactionCount++;

      // Mỗi transaction có dữ liệu ghi tạm riêng.
      const pendingOrders: any[] = [];
      const pendingRequests: any[] = [];
      const pendingReservations: any[] = [];

      let savedOrder: any = null;

      const tx = {
        $queryRaw: async () => {
          return [
            {
              acquired: true,
              now: new Date("2026-11-09T10:00:00.000Z"),
            },
          ];
        },

        product: {
          findUnique: async () => product,

          findMany: async () => {
            stockCheckCount++;

            return [
              {
                id: product.id,
                stock: product.stock,
                reservedStock: product.reservedStock,
                stockVersion: product.stockVersion,
              },
            ];
          },

          updateMany: async (args: any) => {
            casCount++;

            assert.equal(args.where.id, product.id);
            assert.equal(args.where.stockVersion, product.stockVersion);

            // Lượt CAS đầu tiên thất bại.
            if (casCount === 1) {
              return { count: 0 };
            }

            // CAS lần hai thành công.
            product.reservedStock += args.data.reservedStock.increment;
            product.stockVersion += args.data.stockVersion.increment;

            return { count: 1 };
          },
        },

        orderRequest: {
          findUnique: async () => {
            const savedRequest = pendingRequests[0];

            if (!savedRequest) {
              return null;
            }

            return {
              ...savedRequest,
              order: {
                id: savedRequest.orderId,
                userId: savedRequest.userId,
                requestKey: savedRequest.requestKey,
                requestHash: savedRequest.requestHash,
              },
            };
          },

          create: async (args: any) => {
            pendingRequests.push(args.data);
            return args.data;
          },
        },

        order: {
          create: async (args: any) => {
            pendingOrders.push(args.data);

            savedOrder = {
              id: "order-v2-retry",
              status: args.data.status,
              total: args.data.total,
              checkoutPolicyVersion: args.data.checkoutPolicyVersion,
              items: args.data.items.create.map((item: any) => ({
                productId: item.productId,
                qty: item.qty,
              })),
              reservations: [],
            };

            return savedOrder;
          },

          findUnique: async () => savedOrder,
        },

        stockReservation: {
          create: async (args: any) => {
            pendingReservations.push(args.data);
            return args.data;
          },
        },
      };

      // Chỉ commit khi callback hoàn thành.
      // Nếu callback throw, dữ liệu ghi tạm bị bỏ.
      const result = await callback(tx);

      committedOrders.push(...pendingOrders);
      committedRequests.push(...pendingRequests);
      committedReservations.push(...pendingReservations);

      return result;
    },
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  const result = await service.createOrderV2(
    "user-001",
    "550e8400-e29b-41d4-a716-446655440000",
    {
      schemaVersion: 2,
      promotionCode: null,
      expectedTotal: 35000,
      items: [
        {
          productId: "coffee-milk",
          size: "S",
          toppingIds: [],
          qty: 1,
          expectedUnitPrice: 35000,
        },
      ],
    },
  );

  // Kết quả cuối cùng phải thành công.
  assert.equal(result.httpStatus, 201);

  // Lượt đầu rollback, lượt hai thành công.
  assert.equal(transactionCount, 2);
  assert.equal(stockCheckCount, 2);
  assert.equal(casCount, 2);

  // Chỉ dữ liệu của transaction thành công được commit.
  assert.equal(committedOrders.length, 1);
  assert.equal(committedRequests.length, 1);
  assert.equal(committedReservations.length, 1);

  assert.equal(committedRequests[0].state, "SUCCEEDED");
  assert.equal(committedRequests[0].httpStatus, 201);
  assert.equal(committedRequests[0].orderId, "order-v2-retry");

  assert.equal(committedReservations[0].state, "ACTIVE");
  assert.equal(committedReservations[0].qty, 1);

  assert.equal(product.reservedStock, 1);
  assert.equal(product.stockVersion, 1);
});
test("UT-S3-D36: V2 exhausts StockConflict retries", async () => {
  let transactionCount = 0;
  let stockCheckCount = 0;
  let casCount = 0;

  const committedOrders: any[] = [];
  const committedRequests: any[] = [];
  const committedReservations: any[] = [];

  const product = {
    id: "coffee-milk",
    name: "Ca phe sua",
    price: 35000,
    stock: 10,
    reservedStock: 0,
    stockVersion: 0,
    toppings: [],
  };

  const prisma = {
    $transaction: async (callback: any) => {
      transactionCount++;

      // Mỗi transaction có dữ liệu ghi tạm riêng.
      const pendingOrders: any[] = [];
      const pendingRequests: any[] = [];
      const pendingReservations: any[] = [];

      let savedOrder: any = null;

      const tx = {
        $queryRaw: async () => {
          return [
            {
              acquired: true,
              now: new Date("2026-11-09T10:00:00.000Z"),
            },
          ];
        },

        product: {
          findUnique: async () => product,

          findMany: async () => {
            stockCheckCount++;

            return [
              {
                id: product.id,
                stock: product.stock,
                reservedStock: product.reservedStock,
                stockVersion: product.stockVersion,
              },
            ];
          },

          updateMany: async (args: any) => {
            casCount++;

            assert.equal(args.where.id, product.id);
            assert.equal(args.where.stockVersion, product.stockVersion);

            // Cả 3 lần CAS đều thất bại.
            return { count: 0 };
          },
        },

        orderRequest: {
          findUnique: async () => null,

          create: async (args: any) => {
            pendingRequests.push(args.data);
            return args.data;
          },
        },

        order: {
          create: async (args: any) => {
            pendingOrders.push(args.data);

            savedOrder = {
              id: "order-v2-retry",
              status: args.data.status,
              total: args.data.total,
              checkoutPolicyVersion: args.data.checkoutPolicyVersion,
              items: args.data.items.create.map((item: any) => ({
                productId: item.productId,
                qty: item.qty,
              })),
              reservations: [],
            };

            return savedOrder;
          },

          findUnique: async () => savedOrder,
        },

        stockReservation: {
          create: async (args: any) => {
            pendingReservations.push(args.data);
            return args.data;
          },
        },
      };

      // Chỉ commit khi callback hoàn thành.
      // Nếu callback throw, dữ liệu ghi tạm bị bỏ.
      const result = await callback(tx);

      committedOrders.push(...pendingOrders);
      committedRequests.push(...pendingRequests);
      committedReservations.push(...pendingReservations);

      return result;
    },
  };

  const service = new OrdersService(prisma as unknown as PrismaService);

  const result = await assert.rejects(
    () =>
      service.createOrderV2(
        "user-001",
        "550e8400-e29b-41d4-a716-446655440000",
        {
          schemaVersion: 2,
          promotionCode: null,
          expectedTotal: 35000,
          items: [
            {
              productId: "coffee-milk",
              size: "S",
              toppingIds: [],
              qty: 1,
              expectedUnitPrice: 35000,
            },
          ],
        },
      ),
    (error: any) => {
      assert.equal(error.getStatus(), 503);

      const response = error.getResponse();

      assert.equal(response.error.code, "TRANSACTION_RETRY_EXHAUSTED");

      assert.equal(response.error.details.reason, "RETRY_EXHAUSTED");

      return true;
    },
  );

  // Kết quả cuối cùng phải thành công.

  // Lượt đầu rollback, lượt hai thành công.
  assert.equal(transactionCount, 3);
  assert.equal(stockCheckCount, 3);
  assert.equal(casCount, 3);

  assert.equal(committedOrders.length, 0);
  assert.equal(committedRequests.length, 0);
  assert.equal(committedReservations.length, 0);

  assert.equal(product.reservedStock, 0);
  assert.equal(product.stockVersion, 0);
});
test("UT-S3-D37: V2 stops retrying after 8-second deadline", async () => {
  const originalDateNow = Date.now;
  let transactionCount = 0;

  try {
    let fakeNow = 100000;

    Date.now = () => fakeNow;

    const prisma = {
      $transaction: async () => {
        transactionCount++;

        // Mô phỏng transaction đầu tiên thất bại
        // sau khi đã vượt quá giới hạn 8 giây.
        fakeNow += 8001;

        throw new Prisma.PrismaClientKnownRequestError(
          "Simulated transaction conflict",
          {
            code: "P2034",
            clientVersion: "7.10.1",
          },
        );
      },
    };

    const service = new OrdersService(prisma as unknown as PrismaService);

    await assert.rejects(
      () =>
        service.createOrderV2(
          "user-001",
          "550e8400-e29b-41d4-a716-446655440000",
          {
            schemaVersion: 2,
            promotionCode: null,
            expectedTotal: 35000,
            items: [
              {
                productId: "coffee-milk",
                size: "S",
                toppingIds: [],
                qty: 1,
                expectedUnitPrice: 35000,
              },
            ],
          },
        ),
      (error: any) => {
        assert.equal(error.getStatus(), 503);

        const response = error.getResponse();

        assert.equal(response.error.code, "TRANSACTION_RETRY_EXHAUSTED");

        assert.equal(response.error.details.reason, "RETRY_EXHAUSTED");

        return true;
      },
    );

    // Đã hết 8 giây nên không được bắt đầu transaction thứ hai.
    assert.equal(transactionCount, 1);
  } finally {
    // Khôi phục Date.now để không ảnh hưởng các test khác.
    Date.now = originalDateNow;
  }
});
