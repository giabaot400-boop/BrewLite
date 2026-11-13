import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner } from "./cart-envelope-v2.ts";
import { requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import { isSessionBinding } from "../../lib/session-binding.ts";
import { encodeOrderPathSegment } from "../../lib/order-path.ts";
import type { AuthClient } from "../auth/auth-client";
import type { AuthSession } from "../auth/auth-session";
import type { CheckoutSessionV2, CheckoutOrderReaderV2 } from "./cart-checkout-client-v2";
import type { CheckoutBinding } from "./cart-envelope-v2";
import type { CartCurrentOrder, CartOrderBindingResultV2 } from "./cart-order-binding-v2";
import type { createCartStorage } from "./cart-storage";
import type { createCartMutationTransport } from "./cart-mutation-transport";
import type { OrderReply } from "./cart-order-response";

export type CancelReviewV2 = Readonly<{ ownerId: string; order: Readonly<CartCurrentOrder> }>;
type CapturedReview = { session: CheckoutSessionV2; order: CartCurrentOrder; binding: CheckoutBinding | null };
type Environment = {
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion">;
  sessionClient: Pick<AuthClient, "me">;
  storage: Pick<ReturnType<typeof createCartStorage>, "readV2" | "applyOrderBindingV2">;
  transport: Pick<ReturnType<typeof createCartMutationTransport>, "cancelOrder">;
  /** Owner-bound reader with full DTO/session/version validation, shared with B/C. */
  readOrder: CheckoutOrderReaderV2;
  /** Use B's full OrderDetail parser before projection; a projection-only parser is insufficient. */
  parseOrderDetail: (body: unknown) => CartCurrentOrder;
};
export type CancelClientResultV2 =
  | { kind: "CANCELLED"; order: CartCurrentOrder; settlement: CartOrderBindingResultV2 | null }
  | { kind: "CURRENT_ORDER"; order: CartCurrentOrder }
  | { kind: "UNKNOWN" | "IGNORED"; orderId: string };

function changed(): never {
  throw new CartStorageError("OWNER_MISMATCH", "Phiên đã thay đổi. Vui lòng xác minh đúng tài khoản trước khi hủy đơn.");
}
function requireCancellable(order: CartCurrentOrder) {
  requireCurrentCartOrder(order);
  if (order.paymentDeadline === null || !order.canCancel || !["PENDING", "PAYMENT_FAILED", "PAID"].includes(order.status)) {
    throw new CartStorageError("INVALID_DATA", "Đơn hiện không cho phép hủy. Vui lòng đọc lại trạng thái đơn.");
  }
}
function sameReview(a: CartCurrentOrder, b: CartCurrentOrder) {
  return a.id === b.id && a.version === b.version && a.status === b.status && a.total === b.total
    && a.paymentDeadline === b.paymentDeadline && a.paidAt === b.paidAt
    && a.canCancel === b.canCancel && a.canPay === b.canPay;
}
function projection(order: CartCurrentOrder): CartCurrentOrder {
  const { id, version, status, total, paymentDeadline, paidAt, canPay, canCancel, serverTime } = order;
  return { id, version, status, total, paymentDeadline, paidAt, canPay, canCancel, serverTime };
}
function needsStateRead(reply: OrderReply) {
  const body = reply.body;
  if (reply.status !== 409 || !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1 || !("error" in body)) return false;
  const error = body.error;
  return !!error && typeof error === "object" && !Array.isArray(error) && "code" in error && "message" in error
    && typeof error.message === "string" && error.message.length > 0
    && Object.keys(error).every(key => ["code", "message", "details"].includes(key))
    && (error.code === "ORDER_NOT_CANCELLABLE" || error.code === "LEGACY_ORDER_REQUIRES_REVIEW");
}

/** No automatic resend, new storage fields, payment reconciliation or cart clearing. */
export function createCartCancelClientV2(environment: Environment) {
  const reviews = new WeakMap<CancelReviewV2, CapturedReview>();
  const busy = new Set<string>();
  function capture(): CheckoutSessionV2 {
    const snapshot = environment.auth.getSnapshot(), version = environment.auth.getSessionVersion();
    if (snapshot.status !== "authenticated" || !snapshot.user?.id || !isSessionBinding(snapshot.binding)
      || !Number.isSafeInteger(version) || version < 0) changed();
    return Object.freeze({ ownerId: snapshot.user.id, binding: snapshot.binding, sessionVersion: version });
  }
  function isCurrent(session: CheckoutSessionV2) {
    const snapshot = environment.auth.getSnapshot();
    return snapshot.status === "authenticated" && snapshot.user?.id === session.ownerId
      && snapshot.binding === session.binding && environment.auth.getSessionVersion() === session.sessionVersion;
  }
  function requireCurrent(session: CheckoutSessionV2) { if (!isCurrent(session)) changed(); }
  function target(orderId: string) {
    if (encodeOrderPathSegment(orderId) === null) throw new CartStorageError("INVALID_DATA", "Mã đơn không hợp lệ.");
  }
  async function verify(session: CheckoutSessionV2, signal?: AbortSignal) {
    requireCurrent(session); signal?.throwIfAborted();
    const verified = await environment.sessionClient.me();
    requireCurrent(session); signal?.throwIfAborted();
    if (verified.user.id !== session.ownerId || verified.binding !== session.binding) changed();
  }
  async function bindingFor(session: CheckoutSessionV2, orderId: string) {
    const envelope = await environment.storage.readV2();
    requireCurrent(session);
    const binding = checkoutBindingForOwner(envelope, session.ownerId);
    return binding?.orderId === orderId ? structuredClone(binding) : null;
  }
  function requireRead(order: CartCurrentOrder, orderId: string, floor?: { version: number; serverTime?: string } | null) {
    requireCurrentCartOrder(order);
    if (order.id !== orderId || floor && (order.version < floor.version
      || floor.serverTime && Date.parse(order.serverTime) < Date.parse(floor.serverTime))) {
      throw new CartStorageError("INVALID_DATA", "Chưa có trạng thái đơn đủ mới để đối chiếu.");
    }
  }
  async function read(orderId: string, session: CheckoutSessionV2,
    floor?: { version: number; serverTime?: string } | null, signal?: AbortSignal) {
    requireCurrent(session); signal?.throwIfAborted();
    const view = structuredClone(await environment.readOrder({ orderId, session, signal }));
    requireCurrent(session); signal?.throwIfAborted();
    if (!view?.session || view.session.ownerId !== session.ownerId || view.session.binding !== session.binding
      || view.session.sessionVersion !== session.sessionVersion) changed();
    requireRead(view.order, orderId, floor);
    return projection(view.order);
  }
  async function publish(order: CartCurrentOrder, session: CheckoutSessionV2,
    binding: CheckoutBinding | null): Promise<CancelClientResultV2> {
    requireCurrent(session);
    // PAID while checking cancellation must not trigger the paid-cart clear path.
    if (order.status !== "CANCELLED" || order.paymentDeadline === null) return { kind: "CURRENT_ORDER", order };
    const settlement = binding === null ? null : await environment.storage.applyOrderBindingV2({
      type: "CURRENT_ORDER", ownerId: session.ownerId, expectedBinding: binding, order,
    }, () => isCurrent(session));
    requireCurrent(session);
    return settlement?.outcome === "IGNORED" ? { kind: "IGNORED", orderId: order.id }
      : { kind: "CANCELLED", order, settlement };
  }

  return {
    async review(orderId: string, signal?: AbortSignal): Promise<CancelReviewV2> {
      const session = capture(); target(orderId);
      await verify(session, signal);
      const binding = await bindingFor(session, orderId);
      const order = await read(orderId, session, binding ? { version: binding.orderVersion } : null, signal);
      requireCancellable(order);
      const review = Object.freeze({ ownerId: session.ownerId, order: Object.freeze({ ...order }) });
      reviews.set(review, { session, order, binding });
      return review;
    },

    /** Explicit GET after uncertainty/reload. Never repeats a cancel POST. */
    async check(orderId: string, signal?: AbortSignal): Promise<CancelClientResultV2> {
      const session = capture(); target(orderId);
      await verify(session, signal);
      const binding = await bindingFor(session, orderId);
      const order = await read(orderId, session, binding ? { version: binding.orderVersion } : null, signal);
      return publish(order, session, binding);
    },

    async submit(review: CancelReviewV2, signal?: AbortSignal): Promise<CancelClientResultV2> {
      const captured = reviews.get(review);
      if (!captured) throw new CartStorageError("INVALID_DATA", "Vui lòng mở lại xác nhận hủy đơn.");
      const { session, order: original, binding } = captured;
      if (busy.has(session.ownerId)) throw new CartStorageError("PENDING_REQUEST", "Đang xử lý hủy đơn của tài khoản này.");
      reviews.delete(review);
      requireCurrent(session); signal?.throwIfAborted();
      busy.add(session.ownerId);
      try {
        await verify(session, signal);
        const before = await read(original.id, session, original, signal);
        if (before.status === "CANCELLED") return await publish(before, session, binding);
        if (!sameReview(original, before)) throw new CartStorageError("CART_CHANGED", "Đơn đã thay đổi. Vui lòng xem lại và xác nhận lại việc hủy.");
        requireCancellable(before);
        const observation = await environment.transport.cancelOrder({ ownerId: session.ownerId, orderId: before.id }, signal);
        requireCurrent(session);
        if (observation.failure || observation.ownerId !== session.ownerId || observation.orderId !== before.id) {
          return { kind: "UNKNOWN", orderId: before.id };
        }
        let floor: CartCurrentOrder = before;
        if (observation.reply.status === 200) {
          try {
            floor = structuredClone(environment.parseOrderDetail(observation.reply.body));
            requireRead(floor, before.id, before);
            if (floor.status !== "CANCELLED" || floor.version <= before.version || floor.total !== before.total) {
              return { kind: "UNKNOWN", orderId: before.id };
            }
            floor = projection(floor);
          } catch { return { kind: "UNKNOWN", orderId: before.id }; }
        } else if (!needsStateRead(observation.reply)) return { kind: "UNKNOWN", orderId: before.id };
        let order: CartCurrentOrder;
        try { order = await read(before.id, session, floor, signal); } catch (error) {
          requireCurrent(session);
          if (error instanceof CartStorageError && error.code === "OWNER_MISMATCH") throw error;
          return { kind: "UNKNOWN", orderId: before.id };
        }
        if (observation.reply.status === 200 && (order.status !== "CANCELLED" || order.total !== before.total)) {
          return { kind: "UNKNOWN", orderId: before.id };
        }
        return await publish(order, session, binding);
      } finally { busy.delete(session.ownerId); }
    },
  };
}
