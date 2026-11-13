import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { postCartJson } from "./cart-http.ts";
import { encodeOrderPathSegment } from "../../lib/order-path.ts";
import type { PaymentRecovery } from "./cart-envelope-v2";
import type { CartHttpEnvironment, CartHttpFailure } from "./cart-http";
import type { OrderReply } from "./cart-order-response";

export type PaymentTransportResult = {
  ownerId: string; requestKey: string; expectedRecovery: PaymentRecovery;
  reply: OrderReply; failure: CartHttpFailure | null;
};
export type CancelTransportResult = {
  ownerId: string; orderId: string; reply: OrderReply; failure: CartHttpFailure | null;
};
function captureRecovery(request: PaymentRecovery): PaymentRecovery {
  const captured = structuredClone(request);
  if (!captured || captured.recoveryStatus !== "UNRESOLVED" || !isCartEnvelopeV2({ ...createEmptyCartEnvelopeV2(),
    paymentRecoveries: { [captured.ownerId]: { [captured.requestKey]: captured } } })) {
    throw new CartStorageError("INVALID_DATA", "Lần thanh toán chưa được chuẩn bị hợp lệ. Chưa gửi yêu cầu.");
  }
  return captured;
}

/**
 * Caller awaits durable preparation, verifies current owner/session and then
 * explicitly calls send/retry. No storage, key generation, auth or automatic GET/POST.
 * The caller must guard the response again before updating storage or UI.
 */
export function createCartMutationTransport(environment: CartHttpEnvironment) {
  return {
    async sendPayment(request: PaymentRecovery, signal?: AbortSignal): Promise<PaymentTransportResult> {
      const captured = captureRecovery(request);
      const observation = await postCartJson(environment, { path: "/api/payments", ownerId: captured.ownerId,
        requestKey: captured.requestKey, body: JSON.stringify(captured.body) }, signal);
      return { ownerId: captured.ownerId, requestKey: captured.requestKey, expectedRecovery: captured,
        reply: { status: observation.status, body: observation.body }, failure: observation.failure };
    },
    async cancelOrder(request: { ownerId: string; orderId: string }, signal?: AbortSignal): Promise<CancelTransportResult> {
      const captured = structuredClone(request);
      const segment = encodeOrderPathSegment(captured?.orderId);
      if (!captured || Object.keys(captured).length !== 2 || !Object.hasOwn(captured, "ownerId") || !Object.hasOwn(captured, "orderId")
        || typeof captured.ownerId !== "string" || !captured.ownerId || segment === null) {
        throw new CartStorageError("INVALID_DATA", "Thiếu thông tin chủ hoặc mã đơn cần hủy.");
      }
      const observation = await postCartJson(environment, { path: `/api/orders/${segment}/cancel`, ownerId: captured.ownerId, body: "{}" }, signal);
      return { ...captured, reply: { status: observation.status, body: observation.body }, failure: observation.failure };
    },
  };
}
