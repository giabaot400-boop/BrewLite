import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { tryLockOrderRequest } from "../database/order-request-lock.js";
import { OrdersService } from "./orders.service.js";
import { HttpException } from "@nestjs/common";

async function main() {
  const a = new PrismaService();
  const b = new PrismaService();

  const serviceB = new OrdersService(b);
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

  let transactionA:
    | Promise<{
        acquired: boolean;
        after: { state: string } | null;
      }>
    | undefined;
  try {
    await Promise.all([a.$connect(), b.$connect()]);

    transactionA = a.$transaction(
      async (tx) => {
        const before = await tx.orderRequest.findUnique({
          where: {
            userId_requestKey: { userId, requestKey },
          },
        });

        if (before !== null) {
          throw new Error("Ledger already exists");
        }

        console.log("A: Old snapshot established");
        signalReady();

        await continueA;

        const acquired = await tryLockOrderRequest(tx, userId, requestKey);

        const after = await tx.orderRequest.findUnique({
          where: {
            userId_requestKey: { userId, requestKey },
          },
        });

        console.log("A: Advisory lock =", acquired);
        console.log("A: Ledger visible =", after !== null);

        return { acquired, after };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 10000,
      },
    );

    await ready;

    // B tạo Order và ledger thật rồi commit.
    let rejectedStatus = 0;
    let rejectedCode = "";

    try {
      await serviceB.createOrder(userId, requestKey, dto);
      throw new Error("Expected PRICE_CHANGED but order succeeded");
    } catch (error) {
      if (!(error instanceof HttpException)) {
        throw error;
      }

      rejectedStatus = error.getStatus();

      const response = error.getResponse() as {
        error?: { code?: string };
      };

      rejectedCode = response.error?.code ?? "";
    }

    console.log("B: HTTP =", rejectedStatus);
    console.log("B: Error =", rejectedCode);

    if (rejectedStatus !== 409 || rejectedCode !== "PRICE_CHANGED") {
      throw new Error("B did not save PRICE_CHANGED");
    }

    releaseA();

    const result = await transactionA;

    const freshLedger = await b.orderRequest.findUnique({
      where: {
        userId_requestKey: { userId, requestKey },
      },
    });

    if (
      result.acquired !== true ||
      result.after !== null ||
      freshLedger?.state !== "REJECTED" ||
      freshLedger.httpStatus !== 409
    ) {
      throw new Error("P07 snapshot scenario failed");
    }

    console.log("P07 REJECTED snapshot scenario PASS");
  } finally {
    releaseA();

    if (transactionA) {
      await Promise.allSettled([transactionA]);
    }

    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}

main().catch((error) => {
  console.error("P07 TEST FAIL:", error);
  process.exitCode = 1;
});
