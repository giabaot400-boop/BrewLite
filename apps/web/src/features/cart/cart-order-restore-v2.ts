import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner } from "./cart-envelope-v2.ts";
import { requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import { isSessionBinding } from "../../lib/session-binding.ts";
import type { AuthClient } from "../auth/auth-client";
import type { AuthSession } from "../auth/auth-session";
import type { CheckoutOrderReaderV2, CheckoutSessionV2 } from "./cart-checkout-client-v2";
import type { CartEnvelopeV2 } from "./cart-envelope-v2";
import type { createCartStorage } from "./cart-storage";

/** A saved ID locates a GET; it never proves the order's current state or a payment outcome. */
export function savedCheckoutOrderIdV2(value: CartEnvelopeV2, ownerId: string): string | null {
  const binding = checkoutBindingForOwner(value, ownerId);
  if (binding) return binding.orderId;
  const pending = Object.hasOwn(value.pendingRequests, ownerId) ? value.pendingRequests[ownerId] : null;
  const result = value.lastOrderResult?.ownerId === ownerId ? value.lastOrderResult : null;
  // Do not replace an uncertain new request with an unrelated older order.
  if (pending) return result?.requestKey === pending.requestKey ? result.order.id : null;
  const payments = Object.hasOwn(value.paymentRecoveries, ownerId) ? value.paymentRecoveries[ownerId] : {};
  const recovery = Object.values(payments).find(item => item.recoveryStatus === "UNRESOLVED");
  return recovery?.body.orderId ?? result?.order.id ?? null;
}

type Environment = {
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion">;
  sessionClient: Pick<AuthClient, "me">;
  storage: Pick<ReturnType<typeof createCartStorage>, "readV2" | "applyOrderBindingV2">;
  readOrder: CheckoutOrderReaderV2;
};

/** Restore the current order after navigation/reload using GET only. No migration, key or POST. */
export function createCartOrderRestoreV2(environment: Environment) {
  function changed(): never {
    throw new CartStorageError("OWNER_MISMATCH", "Phiên hoặc đơn đang thao tác đã thay đổi. Vui lòng đọc lại.");
  }
  return async (signal?: AbortSignal) => {
    const identity = environment.auth.getSnapshot();
    const session: CheckoutSessionV2 = { ownerId: identity.user?.id ?? "", binding: identity.binding ?? "",
      sessionVersion: environment.auth.getSessionVersion() };
    function current() {
      const active = environment.auth.getSnapshot();
      return active.status === "authenticated" && active.user?.id === session.ownerId && active.binding === session.binding
        && environment.auth.getSessionVersion() === session.sessionVersion;
    }
    function guard() { signal?.throwIfAborted(); if (!current()) changed(); }
    if (identity.status !== "authenticated" || !session.ownerId || !isSessionBinding(session.binding)
      || !Number.isSafeInteger(session.sessionVersion) || session.sessionVersion < 0) changed();
    guard();
    const saved = await environment.storage.readV2(); guard();
    const orderId = savedCheckoutOrderIdV2(saved, session.ownerId);
    if (orderId === null) return null;
    const binding = checkoutBindingForOwner(saved, session.ownerId);
    const verified = await environment.sessionClient.me(); guard();
    if (verified.user.id !== session.ownerId || verified.binding !== session.binding) changed();
    const result = await environment.readOrder({ orderId, session, signal }); guard();
    if (result.session.ownerId !== session.ownerId || result.session.binding !== session.binding
      || result.session.sessionVersion !== session.sessionVersion) changed();
    requireCurrentCartOrder(result.order);
    if (result.order.id !== orderId || binding && result.order.version < binding.orderVersion) {
      throw new CartStorageError("INVALID_DATA", "Chưa đọc được trạng thái đủ mới của đúng đơn đã lưu.");
    }
    const latest = await environment.storage.readV2(); guard();
    if (savedCheckoutOrderIdV2(latest, session.ownerId) !== orderId) changed();
    if (binding) {
      const settlement = await environment.storage.applyOrderBindingV2({ type: "CURRENT_ORDER", ownerId: session.ownerId,
        expectedBinding: binding, order: result.order }, () => current() && !signal?.aborted);
      guard();
      if (settlement.outcome === "IGNORED") changed();
    }
    // A terminal GET may release a matching binding, never resolve an unknown payment key.
    return { session, order: structuredClone(result.order) };
  };
}
