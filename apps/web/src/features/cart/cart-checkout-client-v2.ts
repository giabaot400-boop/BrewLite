import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { checkoutPreviewV2 } from "./cart-checkout-v2.ts";
import { requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import { isSessionBinding } from "../../lib/session-binding.ts";
import type { AuthClient } from "../auth/auth-client";
import type { AuthSession } from "../auth/auth-session";
import type { Cart, CartLine } from "./types";
import type { OrderPayloadV2, PendingCartRequestV2 } from "./cart-envelope-v2";
import type { CartCurrentOrder, CartOrderBindingResultV2 } from "./cart-order-binding-v2";
import type { CartRejectionResultV2, OrderRejectionReasonsV2 } from "./cart-order-rejection-v2";
import type { createCartStorage } from "./cart-storage";
import type { createCartOrderTransport } from "./cart-order-transport";

export type CheckoutSessionV2 = Readonly<{ ownerId: string; binding: string; sessionVersion: number }>;
export type CheckoutReviewV2 = Readonly<{
  kind: "NEW" | "RETRY"; ownerId: string; displayCart: Cart;
  payload: PendingCartRequestV2["payload"];
}>;
/** Local adapter contract, not a new wire DTO/header. No unvalidated GET body here. */
export type CheckoutOrderReadV2 = {
  session: CheckoutSessionV2;
  order: CartCurrentOrder;
};
export type CheckoutOrderReaderV2 = (input: {
  orderId: string; session: CheckoutSessionV2; signal?: AbortSignal;
}) => Promise<CheckoutOrderReadV2>;
type Storage = ReturnType<typeof createCartStorage>;
type Environment = {
  storage: Pick<Storage, "applyCheckoutLifecycleV2" | "applyOrderBindingV2" | "settleRejectionV2">;
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion">;
  sessionClient: Pick<AuthClient, "me">;
  transport: Pick<ReturnType<typeof createCartOrderTransport>, "send">;
  /**
   * Adapter must owner-bind its read on the server, validate full OrderDetail,
   * then project it. Verify the captured session before/after HTTP and reject
   * stale versions. Never echo these local checkpoint fields as proof of auth.
   * The current S2 reader is not sufficient; UI activation waits for DEP-05/06.
   */
  readOrder: CheckoutOrderReaderV2;
  rejectionReasons?: OrderRejectionReasonsV2;
  randomUUID?: () => string;
  now?: () => string;
};
type CapturedReview = {
  session: CheckoutSessionV2; cart: Cart; pending: PendingCartRequestV2 | null;
  payload: PendingCartRequestV2["payload"];
};
export type CheckoutResultV2 =
  | { kind: "CURRENT_ORDER"; request: PendingCartRequestV2; order: CartCurrentOrder; settlement: CartOrderBindingResultV2 }
  | { kind: "REJECTED"; request: PendingCartRequestV2; settlement: CartRejectionResultV2 }
  | { kind: "UNKNOWN"; request: PendingCartRequestV2; createdOrderId: string | null }
  | { kind: "IGNORED"; request: PendingCartRequestV2 };

function freezeCart(cart: Cart): Cart {
  const items: readonly CartLine[] = Object.freeze(cart.items.map(line => Object.freeze({ ...line,
    toppingIds: Object.freeze([...line.toppingIds]), toppingNames: Object.freeze({ ...line.toppingNames }) })));
  return Object.freeze({ ...cart, items });
}
function freezePayload(payload: PendingCartRequestV2["payload"]): PendingCartRequestV2["payload"] {
  const items = Object.freeze(payload.items.map(item => Object.freeze({ ...item, toppingIds: Object.freeze([...item.toppingIds]) })));
  return Object.freeze({ ...payload, items });
}
function requestSignature(request: PendingCartRequestV2) {
  const { phase: _phase, ...identity } = request;
  void _phase; // SUBMITTING -> UNKNOWN is a view recovery, not a new request.
  return JSON.stringify(identity);
}
function changed(): never {
  throw new CartStorageError("OWNER_MISMATCH", "Phiên đã thay đổi. Vui lòng đăng nhập đúng tài khoản và xác nhận lại.");
}

/** Explicit create/retry only. Does not migrate storage, adopt owners or start payment. */
export function createCartCheckoutClientV2(environment: Environment) {
  const reviews = new WeakMap<CheckoutReviewV2, CapturedReview>();
  const busy = new Set<string>();
  const reasons = structuredClone(environment.rejectionReasons);
  const now = environment.now ?? (() => new Date().toISOString());

  function captureSession(): CheckoutSessionV2 {
    const snapshot = environment.auth.getSnapshot(), version = environment.auth.getSessionVersion();
    if (snapshot.status !== "authenticated" || !snapshot.user?.id || !isSessionBinding(snapshot.binding)
      || !Number.isSafeInteger(version) || version < 0) changed();
    return Object.freeze({ ownerId: snapshot.user.id, binding: snapshot.binding, sessionVersion: version });
  }
  function isCurrent(session: CheckoutSessionV2): boolean {
    const snapshot = environment.auth.getSnapshot();
    return snapshot.status === "authenticated" && snapshot.user?.id === session.ownerId
      && snapshot.binding === session.binding && environment.auth.getSessionVersion() === session.sessionVersion;
  }
  function requireCurrent(session: CheckoutSessionV2) { if (!isCurrent(session)) changed(); }
  async function markUnknown(request: PendingCartRequestV2, session: CheckoutSessionV2) {
    if (!isCurrent(session)) return;
    try {
      await environment.storage.applyCheckoutLifecycleV2({ type: "MARK_ORDER_UNKNOWN",
        ownerId: request.ownerId, requestKey: request.requestKey }, () => isCurrent(session));
    } catch {
      // Failed writes keep SUBMITTING bytes; readV2 exposes them as UNKNOWN.
    }
  }

  return {
    // Opening/cancelling confirmation has no I/O and allocates no request key.
    review(cart: Cart, options: { promotionCode?: string | null; pending?: PendingCartRequestV2 | null } = {}): CheckoutReviewV2 {
      const session = captureSession(), pending = options.pending ? structuredClone(options.pending) : null;
      if (!isCartEnvelopeV2({ ...createEmptyCartEnvelopeV2(), cart,
        pendingRequests: pending ? { [session.ownerId]: pending } : {} })) {
        throw new CartStorageError("INVALID_DATA", "Giỏ hoặc lần đặt chưa có dữ liệu hợp lệ để xác nhận.");
      }
      if (cart.ownerId !== session.ownerId || pending && pending.ownerId !== session.ownerId) changed();
      const displayCart = freezeCart(structuredClone(pending?.cartSnapshot ?? cart));
      if (!displayCart.items.length) throw new CartStorageError("EMPTY_CART", "Giỏ chưa có món để đặt.");
      let payload: PendingCartRequestV2["payload"];
      if (pending) payload = pending.payload;
      else {
        const preview = checkoutPreviewV2(displayCart, options.promotionCode ?? null);
        payload = { schemaVersion: 2, items: displayCart.items.map(item => ({ productId: item.productId,
          size: item.size, toppingIds: [...item.toppingIds], qty: item.qty, expectedUnitPrice: item.previewUnitPrice })),
        promotionCode: preview.promotionCode, expectedTotal: preview.total } satisfies OrderPayloadV2;
      }
      payload = freezePayload(structuredClone(payload));
      const review = Object.freeze({ kind: pending ? "RETRY" as const : "NEW" as const,
        ownerId: session.ownerId, displayCart, payload });
      reviews.set(review, { session, cart: structuredClone(cart), pending, payload });
      return review;
    },

    async submit(review: CheckoutReviewV2, signal?: AbortSignal): Promise<CheckoutResultV2> {
      const captured = reviews.get(review);
      if (!captured) throw new CartStorageError("INVALID_DATA", "Vui lòng mở lại xác nhận tạo đơn.");
      if (busy.has(captured.session.ownerId)) throw new CartStorageError("PENDING_REQUEST", "Đang xử lý lần đặt của tài khoản này.");
      reviews.delete(review);
      const session = captured.session, guard = () => isCurrent(session);
      requireCurrent(session);
      signal?.throwIfAborted();
      busy.add(session.ownerId);
      let request: PendingCartRequestV2 | null = null;
      let createdOrderId: string | null = null;
      try {
        // A cached auth refresh that swallowed a network error is not verification.
        const verified = await environment.sessionClient.me();
        requireCurrent(session);
        if (verified.user.id !== session.ownerId || verified.binding !== session.binding) changed();
        signal?.throwIfAborted();
        const saved = await environment.storage.applyCheckoutLifecycleV2(captured.pending ? {
          type: "RETRY_ORDER", ownerId: session.ownerId, expectedCart: captured.cart, requestKey: captured.pending.requestKey,
        } : {
          type: "BEGIN_ORDER_V2", ownerId: session.ownerId, expectedCart: captured.cart,
          requestKey: (environment.randomUUID ?? (() => crypto.randomUUID()))(), createdAt: now(),
          promotionCode: (captured.payload as OrderPayloadV2).promotionCode,
        }, guard);
        request = saved.request;
        requireCurrent(session);
        if (!request || request.ownerId !== session.ownerId || JSON.stringify(request.payload) !== JSON.stringify(captured.payload)
          || (captured.pending ? requestSignature(request) !== requestSignature(captured.pending)
            : JSON.stringify(request.cartSnapshot) !== JSON.stringify(captured.cart))) {
          throw new CartStorageError("CART_CHANGED", "Giỏ hoặc lần đặt đã thay đổi. Vui lòng xem lại và xác nhận lại.");
        }
        signal?.throwIfAborted();
        // The durable preparation promise has released its Web Lock before HTTP.
        const observation = await environment.transport.send(request, signal);
        requireCurrent(session);
        const reply = observation.reply;
        if (observation.failure || reply.ownerId !== request.ownerId || reply.requestKey !== request.requestKey) {
          await markUnknown(request, session);
          requireCurrent(session);
          return { kind: "UNKNOWN", request, createdOrderId: null };
        }
        if (reply.status !== 200 && reply.status !== 201) {
          const settlement = await environment.storage.settleRejectionV2(reply, guard, reasons);
          requireCurrent(session);
          if (settlement.outcome.kind === "IGNORED") return { kind: "IGNORED", request };
          return settlement.requiresConfirmation ? { kind: "REJECTED", request, settlement }
            : { kind: "UNKNOWN", request, createdOrderId: null };
        }
        const creation = await environment.storage.applyOrderBindingV2({ type: "CREATE_REPLY", ...reply }, guard);
        requireCurrent(session);
        if (creation.outcome === "IGNORED") return { kind: "IGNORED", request };
        if (creation.outcome !== "CREATED" || !creation.orderId) return { kind: "UNKNOWN", request, createdOrderId: null };
        createdOrderId = creation.orderId;
        signal?.throwIfAborted();
        let current: CheckoutOrderReadV2;
        try {
          current = structuredClone(await environment.readOrder({ orderId: createdOrderId, session, signal }));
          requireCurrent(session);
          if (!current?.session || current.session.ownerId !== session.ownerId || current.session.binding !== session.binding
            || current.session.sessionVersion !== session.sessionVersion) changed();
          requireCurrentCartOrder(current.order);
          if (current.order.id !== createdOrderId) throw new CartStorageError("INVALID_DATA", "Phản hồi thuộc đơn khác.");
        } catch (error) {
          requireCurrent(session);
          if (error instanceof CartStorageError && error.code === "OWNER_MISMATCH") throw error;
          return { kind: "UNKNOWN", request, createdOrderId };
        }
        signal?.throwIfAborted();
        const settlement = await environment.storage.applyOrderBindingV2({ type: "BIND_CREATED_ORDER",
          ownerId: session.ownerId, requestKey: request.requestKey, order: current.order, receivedAt: now() }, guard);
        requireCurrent(session);
        if (settlement.outcome === "IGNORED") return { kind: "IGNORED", request };
        if (settlement.outcome === "UNKNOWN") return { kind: "UNKNOWN", request, createdOrderId };
        return { kind: "CURRENT_ORDER", request, order: current.order, settlement };
      } catch (error) {
        if (request) await markUnknown(request, session);
        throw error;
      } finally {
        busy.delete(session.ownerId);
      }
    },
  };
}
