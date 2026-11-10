import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "../src/generated/prisma/client.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { OrdersService } from "../src/orders/orders.service.js";

async function main() {
  const url = process.env.DATABASE_URL;
  assert(url, "Thiếu DATABASE_URL.");
  assert.equal(
    decodeURIComponent(new URL(url).pathname.slice(1)),
    "brewlite_s2_test",
    "Chỉ được chạy trên brewlite_s2_test.",
  );

  const clients = [new PrismaService(), new PrismaService()];
  const db = clients[0]!;
  const suffix = randomUUID();
  const userId = `e-v2-race-${suffix}`;
  const productId = `e-v2-product-${suffix}`;
  const keys = [randomUUID(), randomUUID()];
  const attempts = [0, 0];
  const observed: number[] = [];
  let created = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.all(clients.map((client) => client.$connect()));

    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: `${userId}@example.invalid`,
          passwordHash: "TEST_ONLY_NOT_A_LOGIN_HASH",
        },
      });
      await tx.product.create({
        data: {
          id: productId,
          name: "Orders V2 last product",
          description: "Isolated concurrency fixture",
          price: 10000,
          imageUrl: "/test.svg",
          stock: 1,
        },
      });
    });
    created = true;

    let ready = 0;
    let release!: () => void;
    let rejectGate!: (error: Error) => void;
    const gate = new Promise<void>((resolve, reject) => {
      release = resolve;
      rejectGate = reject;
    });

    function instrument(client: PrismaService, index: number) {
      let firstStockRead = true;

      return new Proxy(client, {
        get(target, property) {
          if (property === "$transaction") {
            return (
              callback: (
                tx: Prisma.TransactionClient,
              ) => Promise<unknown>,
              options?: {
                maxWait?: number;
                timeout?: number;
                isolationLevel?: Prisma.TransactionIsolationLevel;
              },
            ) => {
              attempts[index] = attempts[index]! + 1;

              return target.$transaction(async (tx) => {
                const wrapped = new Proxy(tx, {
                  get(transaction, field) {
                    if (field === "product") {
                      return new Proxy(transaction.product, {
                        get(delegate, operation) {
                          if (operation === "findMany") {
                            return async (
                              args: Prisma.ProductFindManyArgs,
                            ) => {
                              const rows = await delegate.findMany(args);

                              // Chỉ chặn lần đọc stock đầu tiên của mỗi request.
                              if (
                                firstStockRead &&
                                args.select?.stock === true
                              ) {
                                firstStockRead = false;
                                assert.equal(rows.length, 1);
                                observed.push(
                                  rows[0]!.stock - rows[0]!.reservedStock,
                                );
                                ready += 1;
                                if (ready === 2) {
                                  clearTimeout(timer);
                                  release();
                                }
                                await gate;
                              }
                              return rows;
                            };
                          }

                          const value = Reflect.get(delegate, operation);
                          return typeof value === "function"
                            ? value.bind(delegate)
                            : value;
                        },
                      });
                    }

                    const value = Reflect.get(transaction, field);
                    return typeof value === "function"
                      ? value.bind(transaction)
                      : value;
                  },
                });

                return callback(wrapped);
              }, options);
            };
          }

          const value = Reflect.get(target, property);
          return typeof value === "function"
            ? value.bind(target)
            : value;
        },
      });
    }

    const dto = {
      schemaVersion: 2 as const,
      promotionCode: null,
      expectedTotal: 10000,
      items: [{
        productId,
        size: "S" as const,
        toppingIds: [],
        qty: 1,
        expectedUnitPrice: 10000,
      }],
    };

    // Timeout này chỉ dành cho barrier của bài test.
    // Giữ nguyên timeout/retry của OrdersService.
    timer = setTimeout(() => {
      rejectGate(new Error("Hai request không tới barrier trong 1 giây."));
    }, 1000);

    const results = await Promise.allSettled(
      clients.map((client, index) =>
        new OrdersService(instrument(client, index))
          .createOrderV2(userId, keys[index]!, dto)
      ),
    );
    clearTimeout(timer);

    assert.equal(ready, 2);
    assert.deepEqual(observed, [1, 1]);
    console.log("PASS 1: Hai transaction cùng đọc tồn khả dụng bằng 1.");

    const responses = results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });

    assert.equal(
      responses.filter((response) => response.httpStatus === 201).length,
      1,
    );
    assert.equal(
      responses.filter((response) =>
        response.httpStatus === 409 &&
        "error" in response.body &&
        response.body.error.code === "OUT_OF_STOCK"
      ).length,
      1,
    );
    assert(
      attempts.some((count) => count > 1),
      "Chưa quan sát được workflow retry.",
    );
    console.log(
      `PASS 2: Một request tạo đơn; request còn lại retry rồi hết kho. Attempts: ${attempts.join(",")}`,
    );

    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });
    assert.equal(product.stock, 1);
    assert.equal(product.reservedStock, 1);
    assert.equal(product.stockVersion, 1);
    assert.equal(await db.order.count({ where: { userId } }), 1);
    assert.equal(
      await db.orderItem.count({ where: { productId } }),
      1,
    );

    const reservations = await db.stockReservation.findMany({
      where: { productId },
    });
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0]!.state, "ACTIVE");
    assert.equal(reservations[0]!.qty, 1);
    console.log("PASS 3: Chỉ một Order/item/reservation, không vượt tồn.");

    const ledgers = await db.orderRequest.findMany({
      where: { userId },
    });
    assert.equal(ledgers.length, 2);
    assert(ledgers.every((ledger) => ledger.canonicalVersion === 2));

    const succeeded = ledgers.filter((ledger) =>
      ledger.state === "SUCCEEDED"
    );
    const rejected = ledgers.filter((ledger) =>
      ledger.state === "REJECTED"
    );
    assert.equal(succeeded.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(succeeded[0]!.orderId, reservations[0]!.orderId);
    assert.equal(succeeded[0]!.httpStatus, 201);
    assert.equal(rejected[0]!.orderId, null);
    assert.equal(rejected[0]!.httpStatus, 409);
    console.log("PASS 4: Ledger SUCCEEDED/REJECTED khớp kết quả.");
  } finally {
    clearTimeout(timer);

    try {
      if (created) {
        await db.$transaction(async (tx) => {
          await tx.stockReservation.deleteMany({
            where: { order: { userId } },
          });
          await tx.orderItemTopping.deleteMany({
            where: { orderItem: { order: { userId } } },
          });
          await tx.orderItem.deleteMany({
            where: { order: { userId } },
          });
          await tx.orderRequest.deleteMany({ where: { userId } });
          await tx.order.deleteMany({ where: { userId } });
          await tx.product.delete({ where: { id: productId } });
          await tx.user.delete({ where: { id: userId } });
        });
        console.log("CLEANUP: Đã dọn fixture concurrency riêng.");
      }
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  }
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});