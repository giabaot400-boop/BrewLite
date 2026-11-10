import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

  const prisma = new PrismaService();
  const suffix = randomUUID();
  const userId = `e-v2-${suffix}`;
  const productId = `e-product-${suffix}`;
  let created = false;

  try {
    await prisma.$connect();

    await prisma.$transaction(async (tx) => {
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
          name: "E V2 test",
          description: "Isolated fixture",
          price: 35000,
          imageUrl: "/test.svg",
          stock: 3,
        },
      });
    });
    created = true;

    const service = new OrdersService(prisma);
    const requestKey = randomUUID();
    const dto = {
      schemaVersion: 2 as const,
      promotionCode: null,
      expectedTotal: 70000,
      items: [{
        productId,
        size: "S" as const,
        toppingIds: [],
        qty: 2,
        expectedUnitPrice: 35000,
      }],
    };

    const first = await service.createOrderV2(userId, requestKey, dto);
    assert.equal(first.httpStatus, 201);
    assert("id" in first.body);
    const orderId = first.body.id;

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    assert.equal(order.userId, userId);
    assert.equal(order.checkoutPolicyVersion, 2);
    assert.equal(order.status, "PENDING");
    assert.equal(order.subtotal, 70000);
    assert.equal(order.total, 70000);
    assert.equal(order.discountTotal, 0);
    assert.equal(order.loyaltyPointsExpected, 7);
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].qty, 2);
    assert(order.paymentDeadline);

    const ledger = await prisma.orderRequest.findUniqueOrThrow({
      where: { userId_requestKey: { userId, requestKey } },
    });
    assert.equal(ledger.state, "SUCCEEDED");
    assert.equal(ledger.canonicalVersion, 2);
    assert.equal(ledger.orderId, orderId);
    assert.equal(ledger.requestHash, order.requestHash);

    const reservation = await prisma.stockReservation.findFirstOrThrow({
      where: { orderId, productId },
    });
    assert.equal(reservation.state, "ACTIVE");
    assert.equal(reservation.qty, 2);

    const held = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    assert.equal(held.stock, 3);
    assert.equal(held.reservedStock, 2);
    console.log("PASS 1: V2 tạo đơn, snapshot, ledger và giữ kho.");

    const replay = await service.createOrderV2(userId, requestKey, dto);
    assert.equal(replay.httpStatus, 200);
    assert("id" in replay.body && replay.body.id === orderId);
    assert.equal(await prisma.order.count({ where: { userId } }), 1);
    assert.equal(
      await prisma.stockReservation.count({ where: { orderId } }), 1,
    );

    const afterReplay = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    assert.equal(afterReplay.reservedStock, held.reservedStock);
    assert.equal(afterReplay.stockVersion, held.stockVersion);
    console.log("PASS 2: Replay không tạo đơn hoặc giữ kho lần hai.");

    const rejectedKey = randomUUID();
    const rejected = await service.createOrderV2(userId, rejectedKey, dto);
    assert.equal(rejected.httpStatus, 409);
    assert(
      "error" in rejected.body &&
      rejected.body.error.code === "OUT_OF_STOCK",
    );

    const rejectedLedger = await prisma.orderRequest.findUniqueOrThrow({
      where: {
        userId_requestKey: { userId, requestKey: rejectedKey },
      },
    });
    assert.equal(rejectedLedger.state, "REJECTED");
    assert.equal(rejectedLedger.orderId, null);
    assert.equal(await prisma.order.count({ where: { userId } }), 1);

    const afterReject = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    assert.equal(afterReject.reservedStock, held.reservedStock);
    assert.equal(afterReject.stockVersion, held.stockVersion);
    console.log("PASS 3: Hết kho lưu REJECTED, không tạo thêm đơn/giữ kho.");
        // Dùng sản phẩm còn đủ kho để đi đến bước lưu ledger.
    const rollbackKey = randomUUID();
    const rollbackDto = {
      ...dto,
      expectedTotal: 35000,
      items: [{ ...dto.items[0], qty: 1 }],
    };

    let injected = false;
    const forcedError = new Error("E_FORCED_LEDGER_FAILURE");

    const failingPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property === "$transaction") {
          return (
            callback: (tx: unknown) => Promise<unknown>,
            options: Record<string, unknown>,
          ) => target.$transaction(async (tx) => {
            const wrappedTx = new Proxy(tx, {
              get(transaction, field) {
                if (field === "orderRequest") {
                  return new Proxy(transaction.orderRequest, {
                    get(delegate, operation) {
                      if (operation === "create") {
                        return async () => {
                          injected = true;
                          throw forcedError;
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
            return callback(wrappedTx);
          }, options);
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    await assert.rejects(
      () => new OrdersService(failingPrisma)
        .createOrderV2(userId, rollbackKey, rollbackDto),
      (error: unknown) => error === forcedError,
    );
    assert(injected, "Chưa đi đến bước lưu ledger.");

    assert.equal(
      await prisma.order.count({
        where: { userId, requestKey: rollbackKey },
      }),
      0,
    );
    assert.equal(
      await prisma.orderRequest.count({
        where: { userId, requestKey: rollbackKey },
      }),
      0,
    );
    assert.equal(
      await prisma.stockReservation.count({ where: { productId } }),
      1,
    );

    const afterRollback = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    assert.equal(afterRollback.stock, held.stock);
    assert.equal(afterRollback.reservedStock, held.reservedStock);
    assert.equal(afterRollback.stockVersion, held.stockVersion);
    console.log("PASS 4: Lỗi ledger rollback Order, reservation và stock.");

  } finally {

    try {
      if (created) {
        await prisma.$transaction(async (tx) => {
          await tx.stockReservation.deleteMany({
            where: { order: { userId } },
          });
          await tx.orderItemTopping.deleteMany({
            where: { orderItem: { order: { userId } } },
          });
          await tx.orderItem.deleteMany({ where: { order: { userId } } });
          await tx.orderRequest.deleteMany({ where: { userId } });
          await tx.order.deleteMany({ where: { userId } });
          await tx.product.delete({ where: { id: productId } });
          await tx.user.delete({ where: { id: userId } });
        });
        console.log("CLEANUP: Đã xóa fixture riêng.");
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});