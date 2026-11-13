

import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";

const orderReadInclude = {
  items: {
    orderBy: { id: "asc" },
    include: {
      toppings: {
        orderBy: { toppingId: "asc" },
        select: {
          toppingId: true,
          name: true,
          price: true,
        },
      },
    },
  },

  paymentAttempts: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      version: true,
      orderId: true,
      method: true,
      amount: true,
      status: true,
      failureCode: true,
      createdAt: true,
      resolvedAt: true,
      refundedAmount: true,
      refundedAt: true,
    },
  },
  loyaltyEntry: {
    select: {
      points: true,
      reversedAt: true,
    },
  },
  reservations: {
    select: {
      productId: true,
      qty: true,
      state: true,
    },
  },
} satisfies Prisma.OrderInclude;

type OrderReadRow = Prisma.OrderGetPayload<{
  include: typeof orderReadInclude;
}>;

@Injectable()
export class OrdersReaderService {
  constructor(private readonly prisma: PrismaService) {}

  private hasValidReservations(
    order: OrderReadRow,
    expectedState: "ACTIVE" | "CONSUMED",
  ): boolean {
    const needs = new Map<string, number>();

    for (const item of order.items) {
      needs.set(
        item.productId,
        (needs.get(item.productId) ?? 0) + item.qty,
      );
    }

    if (needs.size !== order.reservations.length) return false;

    for (const reservation of order.reservations) {
      if (
        reservation.state !== expectedState ||
        needs.get(reservation.productId) !== reservation.qty
      ) {
        return false;
      }
    }

    return true;
  }

  private getCapabilities(order: OrderReadRow, now: Date) {
    const policy2 = order.checkoutPolicyVersion === 2;

    const activeReservations =
      policy2 && this.hasValidReservations(order, "ACTIVE");

    const canPay =
      policy2 &&
      (order.status === "PENDING" ||
        order.status === "PAYMENT_FAILED") &&
      order.paymentDeadline !== null &&
      order.paymentDeadline > now &&
      activeReservations;

    const canCancelBeforePayment =
      (order.status === "PENDING" ||
        order.status === "PAYMENT_FAILED") &&
      activeReservations;

    const latestPayment = order.paymentAttempts[0] ?? null;

    const canCancelAfterPayment =
      order.status === "PAID" &&
      latestPayment?.status === "SUCCEEDED" &&
      this.hasValidReservations(order, "CONSUMED") &&
      order.loyaltyEntry !== null &&
      order.loyaltyEntry.reversedAt === null &&
      order.loyaltyPointsExpected === order.loyaltyEntry.points;

    return {
      canPay,
      canCancel:
        policy2 &&
        (canCancelBeforePayment || canCancelAfterPayment),
    };
  }

  private toHistoryItem(order: OrderReadRow, now: Date) {
    const capabilities = this.getCapabilities(order, now);

    return {
      id: order.id,
      version: order.version,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      total: order.total,
      paymentDeadline: order.paymentDeadline?.toISOString() ?? null,
      ...capabilities,
      totalItemQuantity: order.items.reduce(
        (sum, item) => sum + item.qty,
        0,
      ),
    };
  }

  private toOrderDetail(order: OrderReadRow, now: Date) {
    const latest = order.paymentAttempts[0] ?? null;
    const capabilities = this.getCapabilities(order, now);
    const promotionSnapshot =
      order.promotionSnapshot !== null &&
      typeof order.promotionSnapshot === "object" &&
      !Array.isArray(order.promotionSnapshot)
        ? order.promotionSnapshot
        : null;
    const promotionCode =
      promotionSnapshot && typeof promotionSnapshot.code === "string"
        ? promotionSnapshot.code
        : null;

    return {
      id: order.id,
      version: order.version,
      status: order.status,
      createdAt: order.createdAt.toISOString(),

      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        size: item.size as "S" | "M" | "L",
        basePrice: item.basePrice,
        sizeExtraPrice: item.sizeExtraPrice,
        unitPrice: item.unitPrice,
        qty: item.qty,
        lineTotal: item.lineTotal,
        toppings: item.toppings.map((topping) => ({
          toppingId: topping.toppingId,
          name: topping.name,
          price: topping.price,
        })),
      })),

      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      total: order.total,

      promotion:
        promotionCode !== null
          ? {
              code: promotionCode,
              discountAmount: order.discountTotal,
            }
          : null,

      paymentDeadline: order.paymentDeadline?.toISOString() ?? null,
      paidAt: order.paidAt?.toISOString() ?? null,
      cancelReason: order.cancelReason as
        | "CUSTOMER_REQUEST"
        | "PAYMENT_WINDOW_EXPIRED"
        | null,

      latestPayment: latest
        ? {
            id: latest.id,
            version: latest.version,
            orderId: latest.orderId,
            method: latest.method,
            amount: latest.amount,
            status: latest.status,
            failureCode: latest.failureCode,
            createdAt: latest.createdAt.toISOString(),
            resolvedAt: latest.resolvedAt.toISOString(),
            refundedAmount: latest.refundedAmount,
            refundedAt: latest.refundedAt?.toISOString() ?? null,
          }
        : null,

      loyaltyPointsEarned: order.loyaltyEntry?.points ?? 0,
      loyaltyPointsReversed:
        order.loyaltyEntry?.reversedAt
          ? order.loyaltyEntry.points
          : 0,

      ...capabilities,
      serverTime: now.toISOString(),
    };
  }

  async getMyOrders(userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const orders = await tx.order.findMany({
          where: { userId },
          include: orderReadInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });

        const now = new Date();

        return {
          items: orders.map((order) => this.toHistoryItem(order, now)),
          serverTime: now.toISOString(),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 1000,
        timeout: 2000,
      },
    );
  }

  async getOrderDetail(userId: string, orderId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            userId,
          },
          include: orderReadInclude,
        });

        if (!order) {
          throw new NotFoundException({
            error: {
              code: "RESOURCE_NOT_FOUND",
              message: "Không tìm thấy đơn hàng.",
            },
          });
        }

        return this.toOrderDetail(order, new Date());
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 1000,
        timeout: 2000,
      },
    );
  }
}