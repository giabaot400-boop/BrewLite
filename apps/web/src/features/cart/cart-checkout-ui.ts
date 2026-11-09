import { cartEditBlockForOwnerV2 } from "./cart-writer-v2.ts";
import { checkoutBindingForOwner } from "./cart-envelope-v2.ts";
import type { AuthSession } from "../auth/auth-session";
import type { CartEnvelopeV2, PendingCartRequestV2 } from "./cart-envelope-v2";
import type { CartCurrentOrder } from "./cart-order-binding-v2";
import type { createCartStorage } from "./cart-storage";
import type { createCartCheckoutClientV2 } from "./cart-checkout-client-v2";
import type { createCartPaymentClientV2 } from "./cart-payment-client-v2";
import type { createCartCancelClientV2 } from "./cart-cancel-client-v2";
import type { createCartOrderRestoreV2 } from "./cart-order-restore-v2";
import type { createCartOrderReaderV2 } from "./cart-order-reader-v2";

/** UI ports; production adapters/auth adoption remain a separate integration step. */
export type CheckoutUiEnvironment = {
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion" | "subscribe">;
  storage: Pick<ReturnType<typeof createCartStorage>, "readV2" | "mutateCartV2">;
  checkout: ReturnType<typeof createCartCheckoutClientV2>;
  payment: ReturnType<typeof createCartPaymentClientV2>;
  cancel: ReturnType<typeof createCartCancelClientV2>;
  restoreOrder: ReturnType<typeof createCartOrderRestoreV2>;
  getOrderDetail: ReturnType<typeof createCartOrderReaderV2>["getDetail"];
  subscribeCart: (listener: () => void) => () => void;
};

export function checkoutUiState(value: CartEnvelopeV2, ownerId: string, order: CartCurrentOrder | null) {
  const pending = Object.hasOwn(value.pendingRequests, ownerId) ? value.pendingRequests[ownerId] : null;
  const payments = Object.hasOwn(value.paymentRecoveries, ownerId) ? value.paymentRecoveries[ownerId] : {};
  const recovery = Object.values(payments).find(item => item.recoveryStatus === "UNRESOLVED") ?? null;
  const cart = value.cart.ownerId === ownerId ? value.cart : null;
  const block = cartEditBlockForOwnerV2(value, ownerId);
  const policy2 = order !== null && order.paymentDeadline !== null;
  return { cart, pending, recovery, binding: checkoutBindingForOwner(value, ownerId), block,
    canEdit: cart !== null && block === null,
    canCreate: cart !== null && cart.items.length > 0 && block === null,
    canPay: cart !== null && !pending && !recovery && policy2 && order.canPay
      && ["PENDING", "PAYMENT_FAILED"].includes(order.status)
      && Date.parse(order.serverTime) < Date.parse(order.paymentDeadline!),
    canCancel: !pending && policy2 && order.canCancel && ["PENDING", "PAYMENT_FAILED", "PAID"].includes(order.status),
  };
}

export function reviewedOrderTotal(payload: PendingCartRequestV2["payload"]): number {
  return "schemaVersion" in payload ? payload.expectedTotal
    : payload.items.reduce((total, line) => total + line.qty * line.expectedUnitPrice, 0);
}
