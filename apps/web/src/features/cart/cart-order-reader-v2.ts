import { createHttpOrderReadClient } from "../orders/order-read-client.ts";
import { isSessionBinding } from "../../lib/session-binding.ts";
import { encodeOrderPathSegment } from "../../lib/order-path.ts";
import { CartStorageError } from "./cart-envelope.ts";
import { requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import type { AuthSession } from "../auth/auth-session";
import type { CheckoutOrderReaderV2, CheckoutSessionV2 } from "./cart-checkout-client-v2";
import type { CartCurrentOrder } from "./cart-order-binding-v2";

type Environment = {
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion">;
  fetch?: typeof fetch;
};

function changed(): never {
  throw new CartStorageError("OWNER_MISMATCH", "Phiên đã thay đổi. Vui lòng xác minh lại trước khi đọc đơn.");
}

/** Reject cancellation promptly even when an injected fetch/body ignores AbortSignal. */
function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
    // Both handlers also consume a late rejection after cancellation.
    work.then(value => {
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    }, error => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    if (signal.aborted) onAbort();
  });
}

/**
 * A's read port over B's HTTP client/parser. Always HTTP, even if the order-page
 * fixture flag is set. No storage, migration, auth refresh, key allocation or POST.
 * Share one instance across the three coordinators for per-session version guards.
 */
export function createCartOrderReaderV2(environment: Environment): CheckoutOrderReaderV2 {
  const fetchImpl = environment.fetch ?? ((input, init) => fetch(input, init));
  let observedSession: string | null = null;
  const observed = new Map<string, { version: number; serverTime: number }>();

  function requireSession(session: CheckoutSessionV2) {
    const snapshot = environment.auth.getSnapshot();
    if (!session || typeof session.ownerId !== "string" || session.ownerId.length === 0
      || !isSessionBinding(session.binding) || !Number.isSafeInteger(session.sessionVersion) || session.sessionVersion < 0
      || snapshot.status !== "authenticated" || snapshot.user?.id !== session.ownerId
      || snapshot.binding !== session.binding || environment.auth.getSessionVersion() !== session.sessionVersion) changed();
  }

  return async ({ orderId, session: inputSession, signal }) => {
    requireSession(inputSession);
    // Capture primitives, not mutable aliases to the caller's checkpoint.
    const session = Object.freeze({ ownerId: inputSession.ownerId, binding: inputSession.binding,
      sessionVersion: inputSession.sessionVersion });
    signal?.throwIfAborted();
    if (encodeOrderPathSegment(orderId) === null) {
      throw new CartStorageError("INVALID_DATA", "Mã đơn không hợp lệ để đọc trạng thái.");
    }
    const sessionKey = JSON.stringify([session.ownerId, session.binding, session.sessionVersion]);
    if (observedSession !== sessionKey) { observed.clear(); observedSession = sessionKey; }

    const client = createHttpOrderReadClient((input, init) => fetchImpl(input, { ...init,
      signal: signal ? AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) : init?.signal }));
    try {
      // B sends Expected-Session; its BFF compares with the exact captured cookie,
      // then Nest authenticates that token. Client timeout remains 15s including JSON.
      const detail = await abortable(client.getOrder(orderId, session.binding), signal);
      requireSession(session);
      signal?.throwIfAborted();
      if (detail.id !== orderId || detail.latestPayment !== null && detail.latestPayment.orderId !== orderId) {
        throw new CartStorageError("INVALID_DATA", "Phản hồi không thuộc đúng đơn đang đọc.");
      }
      // Do not infer a recovery payment identity from latestPayment.
      const order: CartCurrentOrder = { id: detail.id, version: detail.version, status: detail.status,
        total: detail.total, paymentDeadline: detail.paymentDeadline, paidAt: detail.paidAt,
        canPay: detail.canPay, canCancel: detail.canCancel, serverTime: detail.serverTime };
      requireCurrentCartOrder(order);
      const previous = observed.get(orderId), serverTime = Date.parse(order.serverTime);
      if (previous && (order.version < previous.version
        || order.version === previous.version && serverTime < previous.serverTime)) {
        throw new CartStorageError("INVALID_DATA", "Phản hồi đơn đã cũ. Giữ trạng thái mới hơn và đọc lại khi cần.");
      }
      observed.set(orderId, { version: order.version, serverTime });
      return { session, order };
    } catch (error) {
      requireSession(session);
      signal?.throwIfAborted();
      throw error;
    }
  };
}
