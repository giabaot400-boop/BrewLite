import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";
import { HttpException } from "@nestjs/common";

async function main() {
  const a = new PrismaService();
  const b = new PrismaService();

  const userId = "integration-test-user-d";
  const requestKey = randomUUID();

  const dto = {
    items: [
      {
        productId: "coffee-milk",
        size: "M" as const,
        toppingIds: ["cream"],
        qty: 2,
        expectedUnitPrice: 46000,
      },
    ],
  };

  let signalReady!: () => void;
  let releaseA!: () => void;

  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });

  const continueA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });

  let firstTransaction = true;
  let transactionAttempts = 0;

  // Chỉ chèn thao tác đọc snapshot trước callback gốc.
  // Không giả lập bất kỳ lỗi Prisma nào.
  const prismaA = new Proxy(a, {
    get(target, property) {
      if (property === "$transaction") {
        return (
          callback: Parameters<PrismaService["$transaction"]>[0],
          options?: {
            isolationLevel?: Prisma.TransactionIsolationLevel;
            maxWait?: number;
            timeout?: number;
          },
        ) => {
          transactionAttempts++;

          return target.$transaction(
            async (tx) => {
              if (firstTransaction) {
                firstTransaction = false;

                const before = await tx.orderRequest.findUnique({
                  where: {
                    userId_requestKey: {
                      userId,
                      requestKey,
                    },
                  },
                });

                console.log("A: Initial ledger =", before);

                signalReady();

                // Giữ transaction A đang mở.
                await continueA;
              }

              // Chạy callback thật của OrdersService
              // trên chính transaction này.
              return callback(tx);
            },
            {
              ...options,
              timeout: 10000,
            },
          );
        };
      }

      return Reflect.get(target, property, target);
    },
  }) as PrismaService;

  const serviceA = new OrdersService(prismaA);
  const serviceB = new OrdersService(b);

  try {
    await Promise.all([a.$connect(), b.$connect()]);

    // A bắt đầu tạo đơn nhưng bị giữ lại
    // sau khi đã thiết lập snapshot cũ.
    const aOutcomePromise = serviceA.createOrder(userId, requestKey, dto).then(
      (value) => ({
        ok: true as const,
        value,
      }),
      (error: unknown) => ({
        ok: false as const,
        error,
      }),
    );

    try {
      await ready;

      console.log("B: Creating committed order");

      let bStatus = 0;
      let bCode = "";

      try {
        await serviceB.createOrder(userId, requestKey, dto);
        throw new Error("Expected PRICE_CHANGED");
      } catch (error) {
        if (!(error instanceof HttpException)) {
          throw error;
        }

        bStatus = error.getStatus();

        const response = error.getResponse() as {
          error?: { code?: string };
        };

        bCode = response.error?.code ?? "";
      }

      console.log("B: HTTP =", bStatus);
      console.log("B: Error =", bCode);

      if (bStatus !== 409 || bCode !== "PRICE_CHANGED") {
        throw new Error("B did not commit REJECTED ledger");
      }
    } finally {
      // Luôn giải phóng A kể cả khi B thất bại.
      releaseA();
    }

    const outcomeA = await aOutcomePromise;

    console.log("A: Transaction attempts =", transactionAttempts);

    if (!outcomeA.ok) {
      const error = outcomeA.error;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.log("A: Prisma error =", error.code);
        console.log("A: Error metadata =", error.meta);
      } else {
        console.log("A: Error =", error);
      }
    } else {
      console.log("A: HTTP =", outcomeA.value.httpStatus);
    }

    const ledger = await b.orderRequest.findUnique({
      where: {
        userId_requestKey: { userId, requestKey },
      },
    });

    const orderCount = await b.order.count({
      where: { userId, requestKey },
    });

    console.log("Final ledger =", ledger?.state);
    console.log("Final order count =", orderCount);

    if (
      ledger?.state !== "REJECTED" ||
      ledger.httpStatus !== 409 ||
      orderCount !== 0
    ) {
      throw new Error("P07 FAIL: Database consistency violation");
    }

    console.log("P07: Database consistency PASS");

    let aStatus = 0;
    let aCode = "";

    if (!outcomeA.ok && outcomeA.error instanceof HttpException) {
      aStatus = outcomeA.error.getStatus();

      const response = outcomeA.error.getResponse() as {
        error?: { code?: string };
      };

      aCode = response.error?.code ?? "";
    }

    console.log("A: HTTP =", aStatus);
    console.log("A: Error =", aCode);

    if (
      aStatus !== 409 ||
      aCode !== "PRICE_CHANGED" ||
      transactionAttempts < 2
    ) {
      throw new Error("P07 FAIL: REJECTED retry/replay was not successful");
    }

    console.log("P07 REJECTED REAL RETRY PASS");
  } finally {
    releaseA();

    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}

main().catch((error) => {
  console.error("P07 TEST FAIL:", error);
  process.exitCode = 1;
});
