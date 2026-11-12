import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { parseCartPaymentReply, parseNoAttemptTerminalReply } from "./cart-payment-recovery-v2.ts";
import { requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import { isSessionBinding } from "../../lib/session-binding.ts";
import type { AuthClient } from "../auth/auth-client";
import type { AuthSession } from "../auth/auth-session";
import type { CheckoutOrderReaderV2, CheckoutSessionV2 } from "./cart-checkout-client-v2";
import type { PaymentRecovery } from "./cart-envelope-v2";
import type { CartCurrentOrder } from "./cart-order-binding-v2";
import type { CartPaymentResultV2 } from "./cart-payment-recovery-v2";
import type { OrderReply } from "./cart-order-response";
import type { createCartStorage } from "./cart-storage";
import type { createCartMutationTransport } from "./cart-mutation-transport";

type Body = PaymentRecovery["body"];
export type PaymentReviewV2 = Readonly<{
  kind: "NEW" | "RECOVERY"; ownerId: string; body: Readonly<Body>; order: Readonly<CartCurrentOrder> | null;
}>;
type CapturedReview = {
  session: CheckoutSessionV2; body: Body; order: CartCurrentOrder | null; recovery: PaymentRecovery | null;
};
type Environment = {
  storage: Pick<ReturnType<typeof createCartStorage>, "applyPaymentLifecycleV2">;
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion">;
  sessionClient: Pick<AuthClient, "me">;
  transport: Pick<ReturnType<typeof createCartMutationTransport>, "sendPayment">;
  /** Same owner-bound, full-DTO validating reader adapter as the create coordinator. */
  readOrder: CheckoutOrderReaderV2;
  randomUUID?: () => string;
  now?: () => string;
};
export type PaymentClientResultV2 =
  | { kind: "RESOLVED"; request: PaymentRecovery; settlement: CartPaymentResultV2 }
  | { kind: "UNKNOWN"; request: PaymentRecovery; order: CartCurrentOrder | null }
  | { kind: "IGNORED"; request: PaymentRecovery };

function changed(): never {
  throw new CartStorageError("OWNER_MISMATCH", "Phiên đã thay đổi. Vui lòng xác minh đúng tài khoản trước khi thanh toán.");
}
function requirePayable(order: CartCurrentOrder) {
  requireCurrentCartOrder(order);
  if (!["PENDING", "PAYMENT_FAILED"].includes(order.status) || !order.canPay || order.paymentDeadline === null
    || Date.parse(order.serverTime) >= Date.parse(order.paymentDeadline)) {
    throw new CartStorageError("INVALID_DATA", "Đơn chưa đủ điều kiện thanh toán. Vui lòng đọc lại trạng thái đơn.");
  }
}
function sameConfirmation(a: CartCurrentOrder, b: CartCurrentOrder) {
  return a.id === b.id && a.version === b.version && a.status === b.status && a.total === b.total
    && a.paymentDeadline === b.paymentDeadline && a.paidAt === b.paidAt && a.canPay === b.canPay
    && a.canCancel === b.canCancel && Date.parse(a.serverTime) <= Date.parse(b.serverTime);
}
// Pinning an ID is allowed to advance an unresolved record, but body/key/time never change.
function sameRecovery(a: PaymentRecovery, b: PaymentRecovery) {
  return a.ownerId === b.ownerId && a.requestKey === b.requestKey && a.createdAt === b.createdAt
    && JSON.stringify(a.body) === JSON.stringify(b.body) && b.recoveryStatus === "UNRESOLVED"
    && (a.paymentId === null || a.paymentId === b.paymentId);
}
function needsOrderRead(reply: OrderReply): boolean {
  const body = reply.body;
  if (reply.status !== 409 || !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1 || !("error" in body)) return false;
  const error = body.error;
  return !!error && typeof error === "object" && !Array.isArray(error) && "code" in error && "message" in error
    && Object.keys(error).every(key => ["code", "message", "details"].includes(key))
    && typeof error.code === "string" && typeof error.message === "string" && error.message.length > 0
    && ["ORDER_NOT_PAYABLE", "PAYMENT_WINDOW_EXPIRED", "LEGACY_ORDER_REQUIRES_REVIEW"].includes(error.code);
}

/** Explicit confirmation/replay only; never migrates, starts payment on login or replaces a saved key. */
export function createCartPaymentClientV2(environment: Environment) {
  const reviews = new WeakMap<PaymentReviewV2, CapturedReview>();
  const busy = new Set<string>();
  const now = environment.now ?? (() => new Date().toISOString());

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
  async function verify(session: CheckoutSessionV2, signal?: AbortSignal) {
    requireCurrent(session); signal?.throwIfAborted();
    const verified = await environment.sessionClient.me();
    requireCurrent(session); signal?.throwIfAborted();
    if (verified.user.id !== session.ownerId || verified.binding !== session.binding) changed();
  }
  async function read(orderId: string, session: CheckoutSessionV2, signal?: AbortSignal) {
    requireCurrent(session); signal?.throwIfAborted();
    const view = structuredClone(await environment.readOrder({ orderId, session, signal }));
    requireCurrent(session); signal?.throwIfAborted();
    if (!view?.session || view.session.ownerId !== session.ownerId || view.session.binding !== session.binding
      || view.session.sessionVersion !== session.sessionVersion) changed();
    requireCurrentCartOrder(view.order);
    if (view.order.id !== orderId) throw new CartStorageError("INVALID_DATA", "Phản hồi thuộc đơn khác.");
    return view.order;
  }
  function issue(captured: CapturedReview): PaymentReviewV2 {
    const review = Object.freeze({ kind: captured.recovery ? "RECOVERY" as const : "NEW" as const,
      ownerId: captured.session.ownerId, body: Object.freeze({ ...captured.body }),
      order: captured.order ? Object.freeze({ ...captured.order }) : null });
    reviews.set(review, captured);
    return review;
  }

  return {
    // GET only: show a fresh official amount before asking for payment confirmation.
    async review(orderId: string, method: Body["method"], signal?: AbortSignal): Promise<PaymentReviewV2> {
      const session = capture();
      if (typeof orderId !== "string" || !orderId || !["WALLET", "CARD"].includes(method)) {
        throw new CartStorageError("INVALID_DATA", "Chưa có mã đơn hoặc phương thức thanh toán hợp lệ.");
      }
      await verify(session, signal);
      const order = await read(orderId, session, signal);
      requirePayable(order);
      return issue({ session, body: { orderId, method }, order, recovery: null });
    },

    // No GET before replay: a saved attempt must be looked up before current-state/deadline checks.
    reviewRecovery(recovery: PaymentRecovery): PaymentReviewV2 {
      const session = capture(), saved = structuredClone(recovery);
      if (!saved || !isCartEnvelopeV2({ ...createEmptyCartEnvelopeV2(),
        paymentRecoveries: { [session.ownerId]: { [saved.requestKey]: saved } } }) || saved.recoveryStatus !== "UNRESOLVED") {
        throw new CartStorageError("INVALID_DATA", "Chưa có lần thanh toán hợp lệ cần phục hồi.");
      }
      if (saved.ownerId !== session.ownerId) changed();
      return issue({ session, body: structuredClone(saved.body), order: null, recovery: saved });
    },

    async submit(review: PaymentReviewV2, signal?: AbortSignal): Promise<PaymentClientResultV2> {
      const captured = reviews.get(review);
      if (!captured) throw new CartStorageError("INVALID_DATA", "Vui lòng mở lại xác nhận thanh toán.");
      const session = captured.session, guard = () => isCurrent(session);
      if (busy.has(session.ownerId)) throw new CartStorageError("PENDING_REQUEST", "Đang xử lý thanh toán của tài khoản này.");
      reviews.delete(review);
      requireCurrent(session); signal?.throwIfAborted();
      busy.add(session.ownerId);
      try {
        await verify(session, signal);
        let current: CartCurrentOrder | null = null;
        if (!captured.recovery) {
          current = await read(captured.body.orderId, session, signal);
          if (!captured.order || !sameConfirmation(captured.order, current)) {
            throw new CartStorageError("CART_CHANGED", "Trạng thái hoặc tổng đơn đã thay đổi. Vui lòng xem lại và xác nhận lại.");
          }
          requirePayable(current);
        }
        const saved = await environment.storage.applyPaymentLifecycleV2(captured.recovery ? {
          type: "RETRY_PAYMENT", ownerId: session.ownerId, requestKey: captured.recovery.requestKey,
        } : {
          type: "BEGIN_PAYMENT", ownerId: session.ownerId, requestKey: (environment.randomUUID ?? (() => crypto.randomUUID()))(),
          body: captured.body, createdAt: now(), order: current!,
        }, guard);
        requireCurrent(session); signal?.throwIfAborted();
        const request = saved.request;
        if (!request || request.ownerId !== session.ownerId || JSON.stringify(request.body) !== JSON.stringify(captured.body)
          || captured.recovery && !sameRecovery(captured.recovery, request)) {
          throw new CartStorageError("CART_CHANGED", "Lần thanh toán đã thay đổi. Giữ bản lưu để kiểm tra lại.");
        }
        // No lock is held while sending or reading the response body.
        const observation = await environment.transport.sendPayment(request, signal);
        requireCurrent(session);
        if (observation.failure || observation.ownerId !== request.ownerId || observation.requestKey !== request.requestKey
          || !sameRecovery(request, observation.expectedRecovery) || request.paymentId !== observation.expectedRecovery.paymentId) {
          return { kind: "UNKNOWN", request, order: null };
        }
        const reply = observation.reply, payment = parseCartPaymentReply(reply, request);
        if (!payment) {
          // These errors ask for current state, but do not identify/resolve the saved attempt.
          let order: CartCurrentOrder | null = null;
          if (needsOrderRead(reply)) {
            try { order = await read(request.body.orderId, session, signal); } catch {
              requireCurrent(session);
            }
          }
          requireCurrent(session);
          if (order && parseNoAttemptTerminalReply(reply, request)) {
            const settlement = await environment.storage.applyPaymentLifecycleV2({ type: "SETTLE_PAYMENT", ownerId: request.ownerId,
              requestKey: request.requestKey, expectedRecovery: request, expectedBinding: saved.binding, reply, order }, guard);
            requireCurrent(session);
            if (settlement.outcome === "RESOLVED") return { kind: "RESOLVED", request, settlement };
            if (settlement.outcome === "IGNORED") return { kind: "IGNORED", request };
          }
          return { kind: "UNKNOWN", request, order };
        }
        const command = { type: "SETTLE_PAYMENT" as const, ownerId: request.ownerId, requestKey: request.requestKey,
          expectedRecovery: request, expectedBinding: saved.binding, reply };
        // Persist the ID from this exact POST before GET. Never use GET.latestPayment.
        const pinned = await environment.storage.applyPaymentLifecycleV2({ ...command, order: null }, guard);
        requireCurrent(session);
        if (pinned.outcome === "IGNORED") return { kind: "IGNORED", request };
        let order: CartCurrentOrder;
        try { order = await read(request.body.orderId, session, signal); } catch (error) {
          requireCurrent(session);
          if (error instanceof CartStorageError && error.code === "OWNER_MISMATCH") throw error;
          return { kind: "UNKNOWN", request, order: null };
        }
        const settlement = await environment.storage.applyPaymentLifecycleV2({ ...command, order }, guard);
        requireCurrent(session);
        if (settlement.outcome === "IGNORED") return { kind: "IGNORED", request };
        return settlement.outcome === "RESOLVED" ? { kind: "RESOLVED", request, settlement }
          : { kind: "UNKNOWN", request, order: null };
      } finally {
        // Errors/abort never delete an unresolved record or turn uncertainty into FAILED.
        busy.delete(session.ownerId);
      }
    },
  };
}
