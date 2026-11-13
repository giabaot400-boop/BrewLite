import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner, isCartEnvelopeV2, paymentRecoveryForOwner } from "./cart-envelope-v2.ts";
import { applyCartOrderBindingV2, requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import type { CartEnvelopeV2, CheckoutBinding, PaymentRecovery } from "./cart-envelope-v2";
import type { CartCurrentOrder } from "./cart-order-binding-v2";
import type { OrderReply } from "./cart-order-response";

export type CartPaymentView = {
  id: string; version: number; orderId: string; method: "WALLET" | "CARD"; amount: number;
  status: "FAILED" | "SUCCEEDED"; failureCode: "PAYMENT_DECLINED" | null;
  createdAt: string; resolvedAt: string; refundedAmount: number; refundedAt: string | null; serverTime: string;
};
export type CartPaymentCommandV2 =
  | { type: "BEGIN_PAYMENT"; ownerId: string; requestKey: string; body: PaymentRecovery["body"];
      createdAt: string; order: CartCurrentOrder }
  | { type: "RETRY_PAYMENT"; ownerId: string; requestKey: string }
  | { type: "SETTLE_PAYMENT"; ownerId: string; requestKey: string; expectedRecovery: PaymentRecovery;
      expectedBinding: CheckoutBinding | null; reply: OrderReply; order: CartCurrentOrder | null };
export type CartPaymentResultV2 = {
  envelope: CartEnvelopeV2; outcome: "PREPARED" | "RETRY" | "UNKNOWN" | "RESOLVED" | "IGNORED";
  request: PaymentRecovery | null; binding: CheckoutBinding | null;
  payment: CartPaymentView | null; order: CartCurrentOrder | null;
  cartEffect: "UNCHANGED" | "CLEARED" | "UNRELATED";
  canConfirmNewAttempt: boolean;
};
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const money = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const paidStatuses: ReadonlySet<string> = new Set(["PAID", "PREPARING", "READY", "COMPLETED"]);
function timestamp(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const date = new Date(v); return Number.isFinite(date.getTime()) && date.toISOString() === v;
}
function result(envelope: CartEnvelopeV2, outcome: CartPaymentResultV2["outcome"],
  extra: Partial<Omit<CartPaymentResultV2, "envelope" | "outcome">> = {}): CartPaymentResultV2 {
  if (!isCartEnvelopeV2(envelope)) throw new CartStorageError("INVALID_DATA", "Không thể lưu lần thanh toán không hợp lệ.");
  return { envelope, outcome, request: null, binding: null, payment: null, order: null,
    cartEffect: "UNCHANGED", canConfirmNewAttempt: false, ...extra };
}
function withRecovery(value: CartEnvelopeV2, recovery: PaymentRecovery): CartEnvelopeV2 {
  return { ...value, paymentRecoveries: { ...value.paymentRecoveries, [recovery.ownerId]: {
    ...(Object.hasOwn(value.paymentRecoveries, recovery.ownerId) ? value.paymentRecoveries[recovery.ownerId] : {}),
    [recovery.requestKey]: recovery } } };
}
function requireActiveOwner(value: CartEnvelopeV2, ownerId: string): void {
  if (!text(ownerId) || value.cart.ownerId !== ownerId) {
    throw new CartStorageError("OWNER_MISMATCH", "Tài khoản của giỏ đã thay đổi. Vui lòng xác minh lại phiên.");
  }
}
function bindingFor(value: CartEnvelopeV2, ownerId: string, orderId: string): CheckoutBinding | null {
  const binding = checkoutBindingForOwner(value, ownerId);
  return binding?.orderId === orderId ? structuredClone(binding) : null;
}
function payable(order: CartCurrentOrder): boolean {
  return ["PENDING", "PAYMENT_FAILED"].includes(order.status) && order.canPay
    && order.paymentDeadline !== null && Date.parse(order.serverTime) < Date.parse(order.paymentDeadline);
}

/** Only a response from POST with the saved key/body is eligible; never pass GET.latestPayment here. */
export function parseCartPaymentReply(reply: OrderReply, recovery: PaymentRecovery): CartPaymentView | null {
  const p = reply.body;
  const keys = ["id", "version", "orderId", "method", "amount", "status", "failureCode", "createdAt", "resolvedAt", "refundedAmount", "refundedAt", "serverTime"];
  if (reply.status !== 200 && reply.status !== 201 || !record(p) || Object.keys(p).length !== keys.length
    || !keys.every(k => Object.hasOwn(p, k)) || !text(p.id) || p.orderId !== recovery.body.orderId
    || p.method !== recovery.body.method || !money(p.amount) || p.amount < 1
    || !timestamp(p.createdAt) || !timestamp(p.resolvedAt) || !timestamp(p.serverTime)
    || Date.parse(p.createdAt) > Date.parse(p.resolvedAt) || Date.parse(p.resolvedAt) > Date.parse(p.serverTime)
    || recovery.paymentId !== null && recovery.paymentId !== p.id) return null;
  if (p.status === "FAILED") {
    if (p.version !== 0 || p.failureCode !== "PAYMENT_DECLINED" || p.refundedAmount !== 0 || p.refundedAt !== null) return null;
  } else if (p.status === "SUCCEEDED") {
    if (p.failureCode !== null || !(p.version === 0 && p.refundedAmount === 0 && p.refundedAt === null
      || p.version === 1 && p.refundedAmount === p.amount && timestamp(p.refundedAt)
        && Date.parse(p.refundedAt) >= Date.parse(p.resolvedAt) && Date.parse(p.refundedAt) <= Date.parse(p.serverTime))) return null;
  } else return null;
  return structuredClone(p) as CartPaymentView;
}
/** Proof from replay of the exact saved key; GET by itself is never sufficient. */
export function parseNoAttemptTerminalReply(reply: OrderReply, recovery: PaymentRecovery) {
  const body = reply.body;
  if (reply.status !== 409 || recovery.paymentId !== null || recovery.recoveryStatus !== "UNRESOLVED"
    || !record(body) || Object.keys(body).length !== 1 || !record(body.error)) return null;
  const e = body.error, d = e.details;
  if (Object.keys(e).length !== 3 || e.code !== "ORDER_NOT_PAYABLE" || !text(e.message) || !record(d)
    || Object.keys(d).length !== 4 || d.reason !== "NO_ATTEMPT_TERMINAL_ORDER" || d.orderId !== recovery.body.orderId
    || !money(d.orderVersion) || !text(d.orderStatus) || ![...paidStatuses, "CANCELLED"].includes(d.orderStatus)) return null;
  return { orderId: d.orderId, orderVersion: d.orderVersion, orderStatus: d.orderStatus };
}

function matchesCheckpoint(expected: PaymentRecovery, actual: PaymentRecovery): boolean {
  return !!expected && expected.ownerId === actual.ownerId && expected.requestKey === actual.requestKey
    && expected.createdAt === actual.createdAt && expected.body?.orderId === actual.body.orderId && expected.body.method === actual.body.method
    && (expected.paymentId === null || expected.paymentId === actual.paymentId);
}
function currentMatches(payment: CartPaymentView, order: CartCurrentOrder | null, bound: CheckoutBinding | null): order is CartCurrentOrder {
  try { requireCurrentCartOrder(order as CartCurrentOrder); } catch { return false; }
  if (!order || order.id !== payment.orderId || order.total !== payment.amount || order.paymentDeadline === null
    || order.version < 1 || bound && order.version < bound.orderVersion
    || Date.parse(order.serverTime) < Date.parse(payment.serverTime)
    || payment.refundedAt !== null && order.status !== "CANCELLED") return false;
  if (payment.status === "SUCCEEDED") return paidStatuses.has(order.status) || order.status === "CANCELLED";
  return order.status === "PAYMENT_FAILED" || paidStatuses.has(order.status) || order.status === "CANCELLED";
}

/**
 * Pure storage lifecycle. Caller verifies owner/session and obtains fresh OrderDetail
 * before confirmation; after POST/replay it reads OrderDetail again sequentially.
 * These transitions perform no HTTP and never generate or replace a request key.
 */
export function applyCartPaymentV2(value: CartEnvelopeV2, command: CartPaymentCommandV2): CartPaymentResultV2 {
  result(value, "IGNORED");
  if (!text(command.ownerId)) throw new CartStorageError("INVALID_DATA", "Thiếu chủ của lần thanh toán.");
  if (command.type === "BEGIN_PAYMENT") {
    requireActiveOwner(value, command.ownerId);
    const ownRecoveries = Object.hasOwn(value.paymentRecoveries, command.ownerId) ? value.paymentRecoveries[command.ownerId] : {};
    if (Object.hasOwn(ownRecoveries, command.requestKey)) throw new CartStorageError("REQUEST_KEY_REUSED", "Lần thanh toán mới cần mã yêu cầu mới.");
    if (Object.values(ownRecoveries).some(item => item.recoveryStatus === "UNRESOLVED") || Object.hasOwn(value.pendingRequests, command.ownerId)) {
      throw new CartStorageError("PENDING_REQUEST", "Còn lần đặt hoặc thanh toán cần kiểm tra trước.");
    }
    requireCurrentCartOrder(command.order);
    if (!command.body || command.order.id !== command.body.orderId || !payable(command.order)) {
      throw new CartStorageError("INVALID_DATA", "Đơn chưa đủ điều kiện thanh toán. Vui lòng đọc lại trạng thái đơn.");
    }
    const bound = bindingFor(value, command.ownerId, command.order.id);
    if (bound && command.order.version < bound.orderVersion) throw new CartStorageError("CART_CHANGED", "Trạng thái đơn đã thay đổi. Vui lòng xác nhận lại.");
    const recovery: PaymentRecovery = { ownerId: command.ownerId, requestKey: command.requestKey, body: structuredClone(command.body),
      createdAt: command.createdAt, paymentId: null, recoveryStatus: "UNRESOLVED" };
    return result(withRecovery(value, recovery), "PREPARED", { request: structuredClone(recovery), binding: bound });
  }
  const recovery = paymentRecoveryForOwner(value, command.ownerId, command.requestKey);
  if (command.type === "RETRY_PAYMENT") {
    requireActiveOwner(value, command.ownerId);
    if (!recovery) throw new CartStorageError("PENDING_NOT_FOUND", "Không còn bản ghi thanh toán cần phục hồi.");
    if (recovery.recoveryStatus !== "UNRESOLVED") throw new CartStorageError("INVALID_DATA", "Lần thanh toán này đã được đối chiếu kết quả.");
    // Replay remains valid after deadline/PAID/cancellation; backend looks up the saved key first.
    return result(value, "RETRY", { request: structuredClone(recovery), binding: bindingFor(value, recovery.ownerId, recovery.body.orderId) });
  }
  if (command.type !== "SETTLE_PAYMENT") throw new CartStorageError("INVALID_DATA", "Thao tác thanh toán không được hỗ trợ.");
  if (!recovery || !matchesCheckpoint(command.expectedRecovery, recovery)) return result(value, "IGNORED");
  // Duplicate/late responses cannot publish an older Order view after reconciliation.
  if (recovery.recoveryStatus === "RESOLVED") return result(value, "IGNORED");
  const payment = parseCartPaymentReply(command.reply, recovery);
  if (!payment) {
    const marker = parseNoAttemptTerminalReply(command.reply, recovery);
    const order = command.order;
    if (!marker || !order) return result(value, "UNKNOWN");
    try { requireCurrentCartOrder(order); } catch { return result(value, "UNKNOWN"); }
    const bound = checkoutBindingForOwner(value, recovery.ownerId);
    if (order.id !== marker.orderId || order.version < marker.orderVersion || ![...paidStatuses, "CANCELLED"].includes(order.status)
      || bound?.orderId === order.id && order.version < bound.orderVersion
      || order.version === marker.orderVersion && order.status !== marker.orderStatus) return result(value, "UNKNOWN");
    // Resolve only this request. No invented PaymentAttempt, cart cleanup or binding replacement.
    return result(withRecovery(value, { ...recovery, recoveryStatus: "RESOLVED" }), "RESOLVED", {
      request: { ...recovery, recoveryStatus: "RESOLVED" }, order: structuredClone(order),
    });
  }
  // Pin the ID from this exact POST response even when the following GET fails.
  const pinned = recovery.paymentId === payment.id ? value : withRecovery(value, { ...recovery, paymentId: payment.id });
  const bound = checkoutBindingForOwner(value, recovery.ownerId);
  const matchingBound = bound?.orderId === recovery.body.orderId ? bound : null;
  if (!currentMatches(payment, command.order, matchingBound)) return result(pinned, "UNKNOWN");
  const resolved = withRecovery(pinned, { ...recovery, paymentId: payment.id, recoveryStatus: "RESOLVED" });
  const settled = command.expectedBinding === null ? null : applyCartOrderBindingV2(resolved, {
    type: "CURRENT_ORDER", ownerId: recovery.ownerId, expectedBinding: command.expectedBinding, order: command.order });
  // The attempt can be identified even if its old checkout binding has ended.
  // In that case do not publish its captured Order view or offer a new attempt.
  const publishOrder = settled !== null && settled.outcome !== "IGNORED";
  return result(settled?.envelope ?? resolved, "RESOLVED", { payment, order: publishOrder ? structuredClone(command.order) : null,
    cartEffect: settled?.cartEffect ?? "UNCHANGED",
    canConfirmNewAttempt: publishOrder && payment.status === "FAILED" && payable(command.order) });
}
