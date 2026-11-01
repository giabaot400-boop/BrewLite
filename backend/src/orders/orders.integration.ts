import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";

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
    console.log("\nALL INTEGRATION TESTS PASSED (6/6)");
  } finally {
    await prisma.$disconnect();
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
