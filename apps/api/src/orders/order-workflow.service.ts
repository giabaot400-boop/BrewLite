import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type Order, type PaymentAttempt, type PaymentMethod, type PaymentStatus } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { aggregateNeeds, consumeStock, releaseStock, returnStock, StockConflict } from "../database/stock.js";
import { awardPoints, reversePoints } from "./loyalty.js";
import { MockPaymentService } from "./mock-payment.service.js";
import { assertTransition, canonicalizePayment } from "./order-workflow.js";
import { OrdersReaderService } from "./orders-reader.service.js";
import { runWorkflowTransaction } from "./workflow-transaction.js";

const MAX_INT = 2147483647;
function conflict(code: string, message: string): never { throw new ConflictException({ error: { code, message } }); }
async function databaseTime(tx: Prisma.TransactionClient): Promise<Date> {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  if (!row || !(row.now instanceof Date) || !Number.isFinite(row.now.getTime())) throw new Error("Invalid database clock.");
  return row.now;
}

@Injectable()
export class OrderWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly reader: OrdersReaderService, private readonly mock: MockPaymentService) {}

  private async lockOrder(tx: Prisma.TransactionClient, id: string, userId?: string): Promise<Order | null> {
    const rows = userId === undefined
      ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`
      : await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM orders WHERE id = ${id} AND user_id = ${userId} FOR UPDATE`;
    if (rows.length !== 1) return null;
    const order = await tx.order.findUniqueOrThrow({ where: { id } });
    if (userId !== undefined && order.userId !== userId) throw new Error("Locked order owner changed.");
    return order;
  }

  private requirePolicy(order: Order): void {
    if (order.checkoutPolicyVersion !== 2 || !order.paymentDeadline || order.loyaltyPolicySnapshot === null || order.loyaltyPointsExpected === null) {
      conflict("LEGACY_ORDER_REQUIRES_REVIEW", "Đơn cũ chỉ hỗ trợ xem thông tin.");
    }
    const snapshot = order.loyaltyPolicySnapshot as Record<string, unknown>;
    if (order.total < 1 || snapshot.version !== 1 || snapshot.divisor !== 10000
      || order.loyaltyPointsExpected !== Math.floor(order.total / 10000)) throw new Error("Invalid order policy snapshot.");
  }

  private async requireReservations(tx: Prisma.TransactionClient, orderId: string, state: "ACTIVE" | "CONSUMED") {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, reservations: true } });
    const needs = aggregateNeeds(order.items);
    if (!needs.length || needs.length !== order.reservations.length || needs.some(need => {
      const reservation = order.reservations.find(row => row.productId === need.id);
      return !reservation || reservation.qty !== need.qty || reservation.state !== state
        || (state === "ACTIVE" ? reservation.resolvedAt !== null : reservation.resolvedAt === null);
    })) throw new Error("Incomplete order reservations.");
  }

  private async changeOrder(tx: Prisma.TransactionClient, order: Order, data: Prisma.OrderUpdateManyMutationInput) {
    if (order.version >= MAX_INT) throw new Error("Order version exceeds Int limit.");
    const changed = await tx.order.updateMany({ where: { id: order.id, userId: order.userId, status: order.status, version: order.version },
      data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new StockConflict();
  }

  private paymentView(payment: PaymentAttempt, now: Date) {
    return { id: payment.id, version: payment.version, orderId: payment.orderId, method: payment.method, amount: payment.amount,
      status: payment.status, failureCode: payment.failureCode, createdAt: payment.createdAt.toISOString(),
      resolvedAt: payment.resolvedAt.toISOString(), refundedAmount: payment.refundedAmount,
      refundedAt: payment.refundedAt?.toISOString() ?? null, serverTime: now.toISOString() };
  }

  async pay(userId: string, requestKey: string, body: { orderId: string; method: PaymentMethod }) {
    const { requestHash } = canonicalizePayment(body.orderId, body.method);
    // Namespace is deliberately separate from create-order keys. No external gateway side effects.
    const lockKey = createHash("sha256").update(JSON.stringify(["brewlite:payment-request:v1", userId, requestKey]), "utf8").digest().readBigInt64BE(0);
    let outcome: PaymentStatus | undefined;
    return runWorkflowTransaction(this.prisma, async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
      const existing = await tx.paymentAttempt.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
      if (existing) {
        if (existing.canonicalVersion !== 1 || existing.requestHash !== requestHash || existing.orderId !== body.orderId || existing.method !== body.method) {
          conflict("IDEMPOTENCY_CONFLICT", "Khóa thanh toán đã được dùng với nội dung khác.");
        }
        return this.paymentView(existing, await databaseTime(tx));
      }
      const order = await this.lockOrder(tx, body.orderId, userId);
      if (!order) throw new NotFoundException({ error: { code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy đơn hàng." } });
      this.requirePolicy(order);
      if (order.status !== "PENDING" && order.status !== "PAYMENT_FAILED") throw new ConflictException({ error: {
        code: "ORDER_NOT_PAYABLE", message: "Đơn không nhận lần thanh toán mới.", details: {
          reason: "NO_ATTEMPT_TERMINAL_ORDER", orderId: order.id, orderVersion: order.version, orderStatus: order.status,
        },
      } });
      const now = await databaseTime(tx);
      if (now >= order.paymentDeadline!) conflict("PAYMENT_WINDOW_EXPIRED", "Đã hết thời hạn thanh toán.");
      await this.requireReservations(tx, order.id, "ACTIVE");
      let from = order.status;
      if (from === "PAYMENT_FAILED") { assertTransition(from, "PENDING"); from = "PENDING"; }
      outcome ??= this.mock.evaluate(body.method);
      assertTransition(from, outcome === "SUCCEEDED" ? "PAID" : "PAYMENT_FAILED");
      const id = randomUUID();
      const attempt = await tx.paymentAttempt.create({ data: { id, userId, orderId: order.id, requestKey, requestHash,
        canonicalVersion: 1, gatewayKey: `mock:${id}`, method: body.method, amount: order.total, status: outcome,
        failureCode: outcome === "FAILED" ? "PAYMENT_DECLINED" : null, createdAt: now, resolvedAt: now } });
      if (outcome === "SUCCEEDED") {
        await consumeStock(tx, order.id, now);
        await awardPoints(tx, order.id, userId, order.loyaltyPointsExpected!, now);
      }
      await this.changeOrder(tx, order, { status: outcome === "SUCCEEDED" ? "PAID" : "PAYMENT_FAILED",
        ...(outcome === "SUCCEEDED" ? { paidAt: now } : {}) });
      return this.paymentView(attempt, now);
    });
  }

  private async cancelLocked(tx: Prisma.TransactionClient, order: Order, now: Date, expiredOnly: boolean): Promise<boolean> {
    if (expiredOnly && (order.checkoutPolicyVersion !== 2 || !["PENDING", "PAYMENT_FAILED"].includes(order.status)
      || !order.paymentDeadline || now < order.paymentDeadline)) return false;
    this.requirePolicy(order);
    if (order.status === "CANCELLED") return false;
    if (!["PENDING", "PAYMENT_FAILED", "PAID"].includes(order.status)) conflict("ORDER_NOT_CANCELLABLE", "Đơn đã được pha chế hoặc hoàn tất.");
    assertTransition(order.status, "CANCELLED");
    if (order.status === "PAID") {
      await this.requireReservations(tx, order.id, "CONSUMED");
      const successes = await tx.paymentAttempt.findMany({ where: { orderId: order.id, status: "SUCCEEDED" } });
      const payment = successes[0];
      const points = await tx.loyaltyEntry.findUnique({ where: { orderId: order.id } });
      if (successes.length !== 1 || !payment || payment.userId !== order.userId || payment.amount !== order.total
        || payment.refundedAmount !== 0 || payment.refundedAt !== null || payment.version >= MAX_INT
        || !points || points.userId !== order.userId || points.reversedAt !== null || points.points !== order.loyaltyPointsExpected) {
        throw new Error("Incomplete refund evidence.");
      }
      await returnStock(tx, order.id, now);
      await reversePoints(tx, order.id, order.userId, now);
      const refunded = await tx.paymentAttempt.updateMany({ where: { id: payment.id, userId: order.userId, version: payment.version,
        status: "SUCCEEDED", refundedAmount: 0, refundedAt: null },
      data: { refundedAmount: payment.amount, refundedAt: now, version: { increment: 1 } } });
      if (refunded.count !== 1) throw new Error("Payment changed during refund.");
    } else {
      await this.requireReservations(tx, order.id, "ACTIVE");
      await releaseStock(tx, order.id, now);
    }
    await this.changeOrder(tx, order, { status: "CANCELLED", cancelReason: order.status !== "PAID" && now >= order.paymentDeadline!
      ? "PAYMENT_WINDOW_EXPIRED" : "CUSTOMER_REQUEST" });
    return true;
  }

  async cancel(userId: string, orderId: string) {
    await runWorkflowTransaction(this.prisma, async tx => {
      const order = await this.lockOrder(tx, orderId, userId);
      if (!order) throw new NotFoundException({ error: { code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy đơn hàng." } });
      await this.cancelLocked(tx, order, await databaseTime(tx), false);
    });
    return this.reader.getOrderDetail(userId, orderId);
  }

  async expireOrder(orderId: string): Promise<boolean> {
    return runWorkflowTransaction(this.prisma, async tx => {
      const order = await this.lockOrder(tx, orderId);
      return order ? this.cancelLocked(tx, order, await databaseTime(tx), true) : false;
    });
  }

  async advanceDemoOrder(orderId: string, target: "PREPARING" | "READY" | "COMPLETED") {
    if (process.env.DEMO_WORKFLOW_ENABLED !== "true") conflict("DEMO_WORKFLOW_DISABLED", "Chưa bật công cụ demo nội bộ.");
    const userId = await runWorkflowTransaction(this.prisma, async tx => {
      const order = await this.lockOrder(tx, orderId);
      if (!order) throw new NotFoundException({ error: { code: "RESOURCE_NOT_FOUND", message: "Không tìm thấy đơn hàng." } });
      this.requirePolicy(order);
      if (!["PREPARING", "READY", "COMPLETED"].includes(target)) conflict("INVALID_ORDER_TRANSITION", "Trạng thái demo không hợp lệ.");
      assertTransition(order.status, target);
      await this.requireReservations(tx, order.id, "CONSUMED");
      const success = await tx.paymentAttempt.findFirst({ where: { orderId, userId: order.userId, status: "SUCCEEDED", refundedAt: null } });
      const points = await tx.loyaltyEntry.findUnique({ where: { orderId } });
      if (!success || success.amount !== order.total || !points || points.reversedAt !== null || points.userId !== order.userId) throw new Error("Incomplete paid order evidence.");
      await this.changeOrder(tx, order, { status: target });
      return order.userId;
    });
    return this.reader.getOrderDetail(userId, orderId);
  }
}
