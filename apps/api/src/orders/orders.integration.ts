import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";
import { Prisma } from "../generated/prisma/client.js";
async function main() {
  const prisma = new PrismaService();

  try {
    await prisma.$connect();

    const service = new OrdersService(prisma);
    const userId = "integration-test-user-d";
    const requestKey = randomUUID();

    const dto = {
      items: [
        {
          productId: "coffee-milk",
          size: "M" as const,
          toppingIds: ["cream"],
          qty: 2,
          expectedUnitPrice: 47000,
        },
      ],
    };

    // IT-D01: Tao don hang
    const first = await service.createOrder(userId, requestKey, dto);

    if (first.httpStatus !== 201 || first.body.total !== 94000) {
      throw new Error("IT-D01 FAIL");
    }

    console.log("IT-D01 PASS: Tao don hang thanh cong");

    // IT-D02: Kiem tra snapshot va ledger
    const order = await prisma.order.findUnique({
      where: { id: first.body.id },
      include: {
        items: {
          include: { toppings: true },
        },
      },
    });

    const ledger = await prisma.orderRequest.findUnique({
      where: {
        userId_requestKey: { userId, requestKey },
      },
    });

    if (
      !order ||
      order.total !== 94000 ||
      order.items.length !== 1 ||
      order.items[0].unitPrice !== 47000 ||
      order.items[0].qty !== 2 ||
      order.items[0].toppings.length !== 1 ||
      order.items[0].toppings[0].toppingId !== "cream" ||
      !ledger ||
      ledger.state !== "SUCCEEDED" ||
      ledger.orderId !== order.id ||
      ledger.httpStatus !== 201
    ) {
      throw new Error("IT-D02 FAIL");
    }

    console.log("IT-D02 PASS: Snapshot va ledger chinh xac");

    // IT-D03: Replay cung key, cung payload
    const replay = await service.createOrder(userId, requestKey, dto);

    if (
      replay.httpStatus !== 200 ||
      replay.body.id !== first.body.id ||
      replay.body.total !== 94000
    ) {
      throw new Error("IT-D03 FAIL");
    }

    const orderCount = await prisma.order.count({
      where: { userId, requestKey },
    });

    if (orderCount !== 1) {
      throw new Error("IT-D03 FAIL: Tao don hang trung");
    }

    console.log("IT-D03 PASS: Replay khong tao don trung");

    // IT-D04: Cung key nhung payload khac
    const changedDto = {
      items: [
        {
          productId: "coffee-milk",
          size: "M" as const,
          toppingIds: ["cream"],
          qty: 3,
          expectedUnitPrice: 47000,
        },
      ],
    };

    await expectError(
      () => service.createOrder(userId, requestKey, changedDto),
      409,
      "IDEMPOTENCY_CONFLICT",
    );

    const countAfterConflict = await prisma.order.count({
      where: { userId, requestKey },
    });

    if (countAfterConflict !== 1) {
      throw new Error("IT-D04 FAIL: Tao don hang trung");
    }

    console.log("IT-D04 PASS: IDEMPOTENCY_CONFLICT");

    // IT-D05: Gia frontend khong khop
    const priceKey = randomUUID();

    const wrongPriceDto = {
      items: [
        {
          productId: "coffee-milk",
          size: "M" as const,
          toppingIds: ["cream"],
          qty: 2,
          expectedUnitPrice: 40000,
        },
      ],
    };

    await expectError(
      () => service.createOrder(userId, priceKey, wrongPriceDto),
      409,
      "PRICE_CHANGED",
    );

    await verifyRejected(prisma, userId, priceKey, 409);

    console.log("IT-D05 PASS: PRICE_CHANGED");

    // IT-D06: San pham khong ton tai
    const invalidKey = randomUUID();

    const invalidDto = {
      items: [
        {
          productId: "product-not-exist",
          size: "M" as const,
          toppingIds: [],
          qty: 1,
          expectedUnitPrice: 40000,
        },
      ],
    };

    await expectError(
      () => service.createOrder(userId, invalidKey, invalidDto),
      400,
      "VALIDATION_ERROR",
    );

    await verifyRejected(prisma, userId, invalidKey, 400);

    console.log("IT-D06 PASS: VALIDATION_ERROR");

    // IT-D07: Replay REJECTED khi đảo thứ tự món
    const reorderKey = randomUUID();

    const originalDto = {
      items: [
        {
          productId: "coffee-milk",
          size: "M" as const,
          toppingIds: ["cream"],
          qty: 2,
          expectedUnitPrice: 47000,
        },
        {
          productId: "product-not-exist",
          size: "M" as const,
          toppingIds: [],
          qty: 1,
          expectedUnitPrice: 40000,
        },
      ],
    };

    const replayDto = {
      items: [...originalDto.items].reverse(),
    };

    // Lần đầu: sản phẩm lỗi nằm tại items[1]
    await expectFieldError(
      () => service.createOrder(userId, reorderKey, originalDto),
      400,
      "VALIDATION_ERROR",
      "items[1]",
    );
    // IT-D08: Transaction rollback khi ledger that bai
    const rollbackKey = randomUUID();
    const rollbackHash = "it-d08-rollback-test";

    let rollbackErrorCaught = false;

    try {
      await prisma.$transaction(
        async (tx) => {
          // Tao Order trong transaction
          await tx.order.create({
            data: {
              userId,
              requestKey: rollbackKey,
              requestHash: rollbackHash,
              status: "PENDING",
              total: 94000,
              subtotal: 94000,
            },
          });

          // Gia lap loi xay ra truoc khi luu ledger
          throw new Error("IT_D08_FORCED_LEDGER_FAILURE");
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "IT_D08_FORCED_LEDGER_FAILURE"
      ) {
        rollbackErrorCaught = true;
      } else {
        throw error;
      }
    }

    if (!rollbackErrorCaught) {
      throw new Error("IT-D08 FAIL: Khong bat duoc loi gia lap");
    }
    // IT-D09: OrdersService rollback khi luu ledger that bai
    const ledgerFailureKey = randomUUID();

    const originalTransaction = prisma.$transaction.bind(prisma);

    const failingPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property === "$transaction") {
          return async (
            callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: Parameters<typeof prisma.$transaction>[1],
          ) => {
            return originalTransaction(async (tx) => {
              const failingTx = new Proxy(tx, {
                get(transaction, key) {
                  if (key === "orderRequest") {
                    return new Proxy(transaction.orderRequest, {
                      get(delegate, method) {
                        if (method === "create") {
                          return async () => {
                            throw new Error("IT_D09_LEDGER_FAILURE");
                          };
                        }

                        const value = Reflect.get(delegate, method);
                        return typeof value === "function"
                          ? value.bind(delegate)
                          : value;
                      },
                    });
                  }

                  return Reflect.get(transaction, key);
                },
              });

              return callback(failingTx);
            }, options);
          };
        }

        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const failingService = new OrdersService(failingPrisma);

    let failureCaught = false;

    try {
      await failingService.createOrder(userId, ledgerFailureKey, dto);
    } catch (error) {
      if (error instanceof Error && error.message === "IT_D09_LEDGER_FAILURE") {
        failureCaught = true;
      } else {
        throw error;
      }
    }

    if (!failureCaught) {
      throw new Error("IT-D09 FAIL: Ledger failure not detected");
    }

    const failedOrderCount = await prisma.order.count({
      where: { userId, requestKey: ledgerFailureKey },
    });

    const failedLedgerCount = await prisma.orderRequest.count({
      where: { userId, requestKey: ledgerFailureKey },
    });

    if (failedOrderCount !== 0 || failedLedgerCount !== 0) {
      throw new Error("IT-D09 FAIL: Transaction did not rollback");
    }

    console.log("IT-D09 PASS: OrdersService rollback on ledger failure");
    // IT-D10: Hai request dong thoi cung Idempotency-Key
    const concurrentKey = randomUUID();

    const concurrentResults = await Promise.allSettled([
      service.createOrder(userId, concurrentKey, dto),
      service.createOrder(userId, concurrentKey, dto),
    ]);

    const fulfilled = concurrentResults.filter(
      (result) => result.status === "fulfilled",
    );

    const rejected = concurrentResults.filter(
      (result) => result.status === "rejected",
    );

    const createdCount = fulfilled.filter(
      (result) => result.value.httpStatus === 201,
    ).length;

    if (createdCount !== 1) {
      throw new Error(
        `IT-D10 FAIL: Expected one HTTP 201, got ${createdCount}`,
      );
    }

    for (const result of fulfilled) {
      if (result.value.httpStatus !== 201 && result.value.httpStatus !== 200) {
        throw new Error("IT-D10 FAIL: Unexpected success status");
      }
    }

    for (const result of rejected) {
      const error = result.reason;

      if (!(error instanceof HttpException)) {
        throw error;
      }

      const response = error.getResponse() as {
        error?: { code?: string };
      };

      if (
        error.getStatus() !== 409 ||
        response.error?.code !== "ORDER_REQUEST_IN_PROGRESS"
      ) {
        throw error;
      }
    }

    const concurrentOrderCount = await prisma.order.count({
      where: { userId, requestKey: concurrentKey },
    });

    const concurrentLedgerCount = await prisma.orderRequest.count({
      where: { userId, requestKey: concurrentKey },
    });

    if (concurrentOrderCount !== 1 || concurrentLedgerCount !== 1) {
      throw new Error("IT-D10 FAIL: Duplicate Order or ledger detected");
    }

    console.log("IT-D10 PASS: Concurrent requests create one Order");

    // Kiem tra PostgreSQL sau khi transaction rollback
    const rollbackOrderCount = await prisma.order.count({
      where: { userId, requestKey: rollbackKey },
    });

    const rollbackLedgerCount = await prisma.orderRequest.count({
      where: { userId, requestKey: rollbackKey },
    });

    if (rollbackOrderCount !== 0 || rollbackLedgerCount !== 0) {
      throw new Error(
        "IT-D08 FAIL: Order hoac ledger van ton tai sau rollback",
      );
    }

    console.log("IT-D08 PASS: Transaction rollback");

    // Kiểm tra ledger REJECTED đã được lưu
    await verifyRejected(prisma, userId, reorderKey, 400);

    // Replay: sản phẩm lỗi chuyển sang items[0]
    await expectFieldError(
      () => service.createOrder(userId, reorderKey, replayDto),
      400,
      "VALIDATION_ERROR",
      "items[0]",
    );

    // Không được tạo Order khi replay
    const replayOrderCount = await prisma.order.count({
      where: { userId, requestKey: reorderKey },
    });

    const replayLedgerCount = await prisma.orderRequest.count({
      where: { userId, requestKey: reorderKey },
    });

    if (replayOrderCount !== 0 || replayLedgerCount !== 1) {
      throw new Error("IT-D07 FAIL: Replay tao du lieu trung");
    }

    console.log("IT-D07 PASS: Rejected replay remaps fieldErrors");
    // IT-D11: Retry bang transaction moi sau khi ledger da commit
    const retryKey = randomUUID();
    let transactionAttempts = 0;
    let firstSnapshotMissedLedger = false;

    const retryOriginalTransaction = prisma.$transaction.bind(prisma);

    const retryPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property === "$transaction") {
          return async (
            callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options?: Parameters<typeof prisma.$transaction>[1],
          ) => {
            transactionAttempts++;

            if (transactionAttempts === 1) {
              // Transaction dau tien bat dau va doc ledger.
              await retryOriginalTransaction(async (tx) => {
                const existing = await tx.orderRequest.findUnique({
                  where: {
                    userId_requestKey: {
                      userId,
                      requestKey: retryKey,
                    },
                  },
                });

                if (existing !== null) {
                  throw new Error("IT-D11 FAIL: Ledger already exists");
                }

                firstSnapshotMissedLedger = true;
              }, options);

              // Transaction khac tao Order va ledger that.
              const competing = await service.createOrder(
                userId,
                retryKey,
                dto,
              );

              if (competing.httpStatus !== 201) {
                throw new Error(
                  "IT-D11 FAIL: Competing request did not create Order",
                );
              }

              // Gia lap loi retryable sau khi ledger duoc commit.
              throw new Prisma.PrismaClientKnownRequestError(
                "IT-D11 simulated transaction conflict",
                {
                  code: "P2034",
                  clientVersion: "7.10.1",
                },
              );
            }

            // Lan thu hai chay transaction PostgreSQL moi.
            return retryOriginalTransaction(callback, options);
          };
        }

        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const retryService = new OrdersService(retryPrisma);

    const retryResult = await retryService.createOrder(userId, retryKey, dto);

    if (
      !firstSnapshotMissedLedger ||
      transactionAttempts !== 2 ||
      retryResult.httpStatus !== 200
    ) {
      throw new Error("IT-D11 FAIL: Retry did not replay committed ledger");
    }

    const retryOrderCount = await prisma.order.count({
      where: { userId, requestKey: retryKey },
    });

    const retryLedgerCount = await prisma.orderRequest.count({
      where: { userId, requestKey: retryKey },
    });

    const savedRetryLedger = await prisma.orderRequest.findUnique({
      where: {
        userId_requestKey: {
          userId,
          requestKey: retryKey,
        },
      },
    });

    if (
      retryOrderCount !== 1 ||
      retryLedgerCount !== 1 ||
      savedRetryLedger?.state !== "SUCCEEDED" ||
      retryResult.body.id !== savedRetryLedger.orderId
    ) {
      throw new Error("IT-D11 FAIL: Order or ledger state is incorrect");
    }

    console.log("IT-D11 PASS: Fresh transaction replays committed ledger");
    console.log("\nALL INTEGRATION TESTS PASSED (11/11)");
  } finally {
    await prisma.$disconnect();
  }
}
async function expectFieldError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
  expectedField: string,
) {
  let caught: unknown;

  try {
    await action();
  } catch (error) {
    caught = error;
  }

  if (!(caught instanceof HttpException)) {
    throw new Error(`Expected HTTP ${expectedStatus}`);
  }

  const response = caught.getResponse() as {
    error?: {
      code?: string;
      fieldErrors?: Record<string, string[]>;
    };
  };

  if (
    caught.getStatus() !== expectedStatus ||
    response.error?.code !== expectedCode
  ) {
    throw new Error(`Wrong error: expected ${expectedCode}`);
  }

  const fieldErrors = response.error.fieldErrors;
  const messages = fieldErrors?.[expectedField];

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !messages.every((message) => typeof message === "string")
  ) {
    throw new Error(`Invalid fieldErrors at ${expectedField}`);
  }

  const keys = Object.keys(fieldErrors ?? {});

  if (keys.length !== 1 || keys[0] !== expectedField) {
    throw new Error(`Wrong fieldErrors index: expected ${expectedField}`);
  }
}
async function expectError(
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
) {
  let caught: unknown;

  try {
    await action();
  } catch (error) {
    caught = error;
  }

  if (!(caught instanceof HttpException)) {
    throw new Error(`Expected HTTP ${expectedStatus} ${expectedCode}`);
  }

  const response = caught.getResponse() as {
    error?: { code?: string };
  };

  if (
    caught.getStatus() !== expectedStatus ||
    response.error?.code !== expectedCode
  ) {
    throw new Error(`Wrong error: expected ${expectedCode}`);
  }
}

async function verifyRejected(
  prisma: PrismaService,
  userId: string,
  requestKey: string,
  expectedStatus: number,
) {
  const orderCount = await prisma.order.count({
    where: { userId, requestKey },
  });

  const ledger = await prisma.orderRequest.findUnique({
    where: {
      userId_requestKey: { userId, requestKey },
    },
  });

  if (
    orderCount !== 0 ||
    !ledger ||
    ledger.state !== "REJECTED" ||
    ledger.httpStatus !== expectedStatus ||
    ledger.orderId !== null
  ) {
    throw new Error("Rejected ledger verification failed");
  }
}

main().catch((error) => {
  console.error("INTEGRATION TEST FAIL:", error);
  process.exitCode = 1;
});
