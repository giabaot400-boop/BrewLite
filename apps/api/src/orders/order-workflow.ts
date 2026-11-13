import { ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "../generated/prisma/client.js";

const edges: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ["PAYMENT_FAILED", "PAID", "CANCELLED"],
  PAYMENT_FAILED: ["PENDING", "CANCELLED"],
  PAID: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!edges[from]?.includes(to)) {
    throw new ConflictException({ error: { code: "INVALID_ORDER_TRANSITION", message: "Không thể chuyển trạng thái đơn hàng." } });
  }
}

export function canonicalizePayment(orderId: string, method: PaymentMethod) {
  const canonical = JSON.stringify({ version: 1, orderId, method });
  return { canonical, requestHash: createHash("sha256").update(canonical, "utf8").digest("hex") };
}

export function evaluateMock(method: PaymentMethod, outcome: PaymentStatus): PaymentStatus {
  if (!["WALLET", "CARD"].includes(method) || !["SUCCEEDED", "FAILED"].includes(outcome)) {
    throw new Error("Invalid mock payment configuration.");
  }
  return outcome;
}
