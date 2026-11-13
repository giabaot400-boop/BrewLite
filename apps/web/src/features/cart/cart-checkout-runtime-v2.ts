import { createHttpAuthClient } from "../auth/auth-client.ts";
import { parseOrderDetail } from "../orders/order-parse.ts";
import { CartStorageError } from "./cart-envelope.ts";
import { createCartCheckoutClientV2 } from "./cart-checkout-client-v2.ts";
import { createCartPaymentClientV2 } from "./cart-payment-client-v2.ts";
import { createCartCancelClientV2 } from "./cart-cancel-client-v2.ts";
import { createCartOrderReaderV2 } from "./cart-order-reader-v2.ts";
import { createCartOrderRestoreV2 } from "./cart-order-restore-v2.ts";
import { createCartOrderTransport } from "./cart-order-transport.ts";
import { createCartMutationTransport } from "./cart-mutation-transport.ts";
import { requireCurrentCartOrder } from "./cart-order-binding-v2.ts";
import type { AuthSession } from "../auth/auth-session";
import type { CheckoutUiEnvironment } from "./cart-checkout-ui";
import type { CartCurrentOrder } from "./cart-order-binding-v2";
import type { OrderRejectionReasonsV2 } from "./cart-order-rejection-v2";
import { ORDER_REJECTION_REASONS_V2 } from "./cart-order-rejection-v2.ts";
import type { createCartStorage } from "./cart-storage";
import type { createCartControllerV2 } from "./cart-controller-v2";

type Environment = {
  auth: Pick<AuthSession, "getSnapshot" | "getSessionVersion" | "subscribe">;
  storage: ReturnType<typeof createCartStorage>;
  controller: Pick<ReturnType<typeof createCartControllerV2>, "getView" | "runCheckout" | "subscribe">;
  fetch?: typeof fetch;
  rejectionReasons?: OrderRejectionReasonsV2;
  now?: () => string;
  randomUUID?: () => string;
};

/** Full B parser first; this is only the cancel-response projection, not another DTO parser. */
function currentOrder(body: unknown): CartCurrentOrder {
  const detail = parseOrderDetail(body);
  if (detail.latestPayment !== null && detail.latestPayment.orderId !== detail.id) {
    throw new CartStorageError("INVALID_DATA", "Phản hồi thanh toán không thuộc đơn này.");
  }
  const { id, version, status, total, paymentDeadline, paidAt, canPay, canCancel, serverTime } = detail;
  const projected = { id, version, status, total, paymentDeadline, paidAt, canPay, canCancel, serverTime };
  requireCurrentCartOrder(projected);
  return projected;
}

/** Compose real HTTP ports without starting I/O, migrating storage or enabling a route. */
export function createCartCheckoutRuntimeV2(environment: Environment): CheckoutUiEnvironment {
  const { auth, storage, controller } = environment;
  const fetchImpl = environment.fetch ?? ((input, init) => fetch(input, init));
  // Explicit HTTP factories: public fixture flags must not authorize live checkout.
  const sessionClient = createHttpAuthClient(fetchImpl);
  const readOrder = createCartOrderReaderV2({ auth, fetch: fetchImpl });
  const shared = { auth, storage, sessionClient, readOrder };
  const http = { fetch: fetchImpl, now: environment.now };
  const checkout = createCartCheckoutClientV2({ ...shared, transport: createCartOrderTransport(http),
    rejectionReasons: environment.rejectionReasons === undefined ? ORDER_REJECTION_REASONS_V2 : environment.rejectionReasons,
    now: environment.now, randomUUID: environment.randomUUID });
  const transport = createCartMutationTransport(http);
  const payment = createCartPaymentClientV2({ ...shared, transport, now: environment.now, randomUUID: environment.randomUUID });
  const cancel = createCartCancelClientV2({ ...shared, transport, parseOrderDetail: currentOrder });
  const restoreOrder = createCartOrderRestoreV2(shared);
  function requireReady() {
    const view = controller.getView();
    if (view.state.status !== "ready" || view.state.isSaving || !view.records?.cart) {
      throw new CartStorageError("CART_CHANGED", "Đang xử lý hoặc kiểm tra lại giỏ. Vui lòng chờ rồi mở lại xác nhận.");
    }
    if (view.records.ownerId === null) throw new CartStorageError("OWNER_MISMATCH", "Cần đăng nhập trước khi thao tác đơn hàng.");
  }
  return {
    auth,
    storage: { readV2: storage.readV2, mutateCartV2: (...args) => controller.runCheckout(() => storage.mutateCartV2(...args)) },
    subscribeCart: controller.subscribe,
    getOrderDetail: readOrder.getDetail,
    restoreOrder: (...args) => controller.runCheckout(() => restoreOrder(...args)),
    checkout: { review: (...args) => { requireReady(); return checkout.review(...args); },
      submit: (...args) => controller.runCheckout(() => checkout.submit(...args)) },
    payment: { review: (...args) => controller.runCheckout(() => payment.review(...args)),
      reviewRecovery: (...args) => { requireReady(); return payment.reviewRecovery(...args); },
      submit: (...args) => controller.runCheckout(() => payment.submit(...args)) },
    cancel: { review: (...args) => controller.runCheckout(() => cancel.review(...args)),
      check: (...args) => controller.runCheckout(() => cancel.check(...args)),
      submit: (...args) => controller.runCheckout(() => cancel.submit(...args)) },
  };
}
