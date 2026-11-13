import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner, createEmptyCartEnvelopeV2, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { getCartLineKey } from "./cart-reducer.ts";
import type { CartEnvelopeV2, CheckoutBinding, PendingCartRequestV2 } from "./cart-envelope-v2";
import type { OrderReply } from "./cart-order-response";
import type { Cart } from "./types";

/** Storage projection of a validated GET OrderDetail, not a replacement API/DTO parser. */
export type CartCurrentOrder = {
  id: string;
  version: number;
  status: "PENDING" | "PAYMENT_FAILED" | "PAID" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  total: number;
  paymentDeadline: string | null;
  paidAt: string | null;
  canPay: boolean;
  canCancel: boolean;
  serverTime: string;
};

export type CartOrderBindingCommandV2 =
  | ({ type: "CREATE_REPLY"; ownerId: string; requestKey: string; receivedAt: string } & OrderReply)
  | { type: "BIND_CREATED_ORDER"; ownerId: string; requestKey: string; order: CartCurrentOrder; receivedAt: string }
  | { type: "CURRENT_ORDER"; ownerId: string; expectedBinding: CheckoutBinding; order: CartCurrentOrder };

export type CartOrderBindingResultV2 = {
  envelope: CartEnvelopeV2;
  outcome: "CREATED" | "UNKNOWN" | "BOUND" | "RELEASED" | "READ_ONLY" | "UNRELATED" | "IGNORED";
  cartEffect: "UNCHANGED" | "CLEARED" | "UNRELATED";
  orderId: string | null;
};

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const statuses: ReadonlySet<string> = new Set(["PENDING", "PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"]);
const paidStatuses: ReadonlySet<string> = new Set(["PAID", "PREPARING", "READY", "COMPLETED"]);

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function requireCurrentCartOrder(order: CartCurrentOrder): void {
  if (!order || !text(order.id) || !integer(order.version) || !statuses.has(order.status) || !integer(order.total)
    || !timestamp(order.serverTime) || !(order.paymentDeadline === null || timestamp(order.paymentDeadline))
    || !(order.paidAt === null || timestamp(order.paidAt)) || typeof order.canPay !== "boolean" || typeof order.canCancel !== "boolean"
    || order.paymentDeadline !== null && order.total < 1
    || order.paymentDeadline === null && (order.canPay || order.canCancel)
    || paidStatuses.has(order.status) && (order.paidAt === null || order.canPay || order.version < 1)
    || ["PENDING", "PAYMENT_FAILED"].includes(order.status) && order.paidAt !== null
    || ["PREPARING", "READY", "COMPLETED", "CANCELLED"].includes(order.status) && (order.canPay || order.canCancel)) {
    throw new CartStorageError("INVALID_DATA", "Chưa có trạng thái đơn hiện tại hợp lệ. Giữ dữ liệu để kiểm tra lại.");
  }
}

/** Full stored choices/preview, not just owner + revision. Object-key order is irrelevant. */
function sameCart(a: Cart, b: Cart): boolean {
  return a.ownerId === b.ownerId && a.revision === b.revision && a.items.length === b.items.length
    && a.items.every((line, index) => {
      const other = b.items[index];
      return getCartLineKey(line) === getCartLineKey(other) && line.productName === other.productName
        && line.imageUrl === other.imageUrl && line.qty === other.qty && line.previewUnitPrice === other.previewUnitPrice
        && line.toppingIds.every(id => line.toppingNames[id] === other.toppingNames[id]);
    });
}

function without<T>(values: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(values).filter(([entry]) => entry !== key));
}

function checked(envelope: CartEnvelopeV2, outcome: CartOrderBindingResultV2["outcome"],
  orderId: string | null = null, cartEffect: CartOrderBindingResultV2["cartEffect"] = "UNCHANGED"): CartOrderBindingResultV2 {
  if (!isCartEnvelopeV2(envelope)) {
    throw new CartStorageError("INVALID_DATA", "Không lưu được kết quả lần đặt. Giữ bản ghi để phục hồi.");
  }
  return { envelope, outcome, orderId, cartEffect };
}

function pendingFor(value: CartEnvelopeV2, ownerId: string, key: string): PendingCartRequestV2 | null {
  const pending = own(value.pendingRequests, ownerId) ? value.pendingRequests[ownerId] : null;
  return pending?.requestKey === key ? pending : null;
}

function current(value: CartEnvelopeV2, ownerId: string, expected: CheckoutBinding,
  order: CartCurrentOrder): CartOrderBindingResultV2 {
  const bound = checkoutBindingForOwner(value, ownerId);
  const validExpected = isCartEnvelopeV2({ ...createEmptyCartEnvelopeV2(), checkoutBindings: { [ownerId]: expected } });
  if (!bound || !validExpected || expected.ownerId !== ownerId || bound.orderId !== expected.orderId
    || bound.cartRevision !== expected.cartRevision || bound.boundAt !== expected.boundAt
    || !sameCart(bound.cartSnapshot, expected.cartSnapshot)
    || expected.orderVersion > bound.orderVersion || own(value.pendingRequests, ownerId)) return checked(value, "IGNORED");
  requireCurrentCartOrder(order);
  if (order.id !== bound.orderId || order.version < bound.orderVersion) return checked(value, "IGNORED");
  if (order.paymentDeadline === null) return checked(value, "READ_ONLY", order.id);

  if (paidStatuses.has(order.status) || order.status === "CANCELLED") {
    const matches = sameCart(value.cart, bound.cartSnapshot);
    let cart = value.cart;
    if (paidStatuses.has(order.status) && matches) {
      if (cart.revision === Number.MAX_SAFE_INTEGER) {
        throw new CartStorageError("REVISION_OVERFLOW", "Phiên bản giỏ vượt giới hạn. Giữ bản lưu để kiểm tra.");
      }
      cart = { ownerId: cart.ownerId, revision: cart.revision + 1, items: [] };
    }
    // End the binding; never infer/resolve an unknown payment attempt from latest Order state.
    return checked({ ...value, cart, checkoutBindings: without(value.checkoutBindings, ownerId) },
      "RELEASED", order.id, cart !== value.cart ? "CLEARED" : matches ? "UNCHANGED" : "UNRELATED");
  }
  if (order.version === bound.orderVersion) return checked(value, "BOUND", order.id);
  return checked({ ...value, checkoutBindings: { ...value.checkoutBindings,
    [ownerId]: { ...bound, orderVersion: order.version } } }, "BOUND", order.id);
}

/**
 * Pure success/current-state settlement. Owner/session verification and HTTP parsing
 * belong to the caller. An unclassified error stays UNKNOWN until its rejection
 * handler is implemented; no saved request is discarded on status/code alone.
 */
export function applyCartOrderBindingV2(value: CartEnvelopeV2, command: CartOrderBindingCommandV2): CartOrderBindingResultV2 {
  checked(value, "IGNORED");
  if (!text(command.ownerId)) throw new CartStorageError("INVALID_DATA", "Thiếu tài khoản cần đối chiếu.");
  if (command.type === "CURRENT_ORDER") return current(value, command.ownerId, command.expectedBinding, command.order);
  const pending = pendingFor(value, command.ownerId, command.requestKey);
  if (!pending) return checked(value, "IGNORED");

  if (command.type === "CREATE_REPLY") {
    const body = command.body;
    const total = "schemaVersion" in pending.payload ? pending.payload.expectedTotal
      : pending.payload.items.reduce((sum, item) => sum + item.qty * item.expectedUnitPrice, 0);
    if ((command.status !== 200 && command.status !== 201) || !record(body)
      || Object.keys(body).length !== 3 || !["id", "status", "total"].every(key => own(body, key))
      || !text(body.id) || body.status !== "PENDING" || !integer(body.total) || body.total !== total) {
      return pending.phase === "UNKNOWN" ? checked(value, "UNKNOWN") : checked({ ...value,
        pendingRequests: { ...value.pendingRequests, [pending.ownerId]: { ...pending, phase: "UNKNOWN" } } }, "UNKNOWN");
    }
    const existingBinding = checkoutBindingForOwner(value, pending.ownerId);
    if (existingBinding && existingBinding.orderId !== body.id) return checked(value, "IGNORED");
    return checked({ ...value,
      pendingRequests: { ...value.pendingRequests, [pending.ownerId]: { ...pending, phase: "UNKNOWN" } },
      lastOrderResult: { ownerId: pending.ownerId, requestKey: pending.requestKey,
        order: { id: body.id, status: "PENDING", total: body.total }, confirmedAt: command.receivedAt } }, "CREATED", body.id);
  }

  if (command.type !== "BIND_CREATED_ORDER") throw new CartStorageError("INVALID_DATA", "Thao tác kết quả đơn không được hỗ trợ.");
  requireCurrentCartOrder(command.order);
  if (!timestamp(command.receivedAt)) throw new CartStorageError("INVALID_DATA", "Thời điểm nhận đơn không hợp lệ.");
  const order = command.order, confirmed = value.lastOrderResult;
  if (!confirmed || confirmed.ownerId !== pending.ownerId || confirmed.requestKey !== pending.requestKey
    || order.id !== confirmed.order.id || order.total !== confirmed.order.total
    || checkoutBindingForOwner(value, pending.ownerId)) return checked(value, "IGNORED");
  const remaining = { ...value, pendingRequests: without(value.pendingRequests, pending.ownerId) };
  if (order.paymentDeadline === null) {
    // Only migrated v1 may refer to a policy-1 order; never manufacture a reservation/binding.
    return "schemaVersion" in pending.payload ? checked(value, "UNKNOWN") : checked(remaining, "READ_ONLY", order.id);
  }
  if (!sameCart(value.cart, pending.cartSnapshot)) return checked(remaining, "UNRELATED", order.id, "UNRELATED");
  const bound: CheckoutBinding = { ownerId: pending.ownerId, orderId: order.id,
    cartRevision: pending.cartRevision, cartSnapshot: structuredClone(pending.cartSnapshot),
    orderVersion: order.version, boundAt: command.receivedAt };
  const next = { ...remaining, checkoutBindings: { ...remaining.checkoutBindings, [pending.ownerId]: bound } };
  return current(next, pending.ownerId, bound, order);
}
