import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { tryLockOrderRequest } from "../database/order-request-lock.js";
import { OrdersService } from "./orders.service.js";

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
        expectedUnitPrice: 47000,
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

  try {
    await Promise.all([a.$connect(), b.$connect()]);

    const transactionA = a.$transaction(
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
    const created = await serviceB.createOrder(userId, requestKey, dto);

    console.log("B: HTTP =", created.httpStatus);

    if (created.httpStatus !== 201) {
      throw new Error("B did not create the order");
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
      freshLedger?.state !== "SUCCEEDED"
    ) {
      throw new Error("P07 snapshot scenario failed");
    }

    console.log("P07 SUCCEEDED snapshot scenario PASS");
  } finally {
    releaseA();
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}

main().catch((error) => {
  console.error("P07 TEST FAIL:", error);
  process.exitCode = 1;
});
