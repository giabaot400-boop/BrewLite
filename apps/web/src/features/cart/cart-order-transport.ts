import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { CART_HTTP_TIMEOUT_MS, postCartJson } from "./cart-http.ts";
import type { PendingCartRequestV2 } from "./cart-envelope-v2";
import type { OrderSettlementCommand } from "./cart-order-settlement";
import type { CartHttpEnvironment, CartHttpFailure } from "./cart-http";

export const ORDER_HTTP_TIMEOUT_MS = CART_HTTP_TIMEOUT_MS;
export type OrderTransportFailure = CartHttpFailure;
export type OrderTransportEnvironment = CartHttpEnvironment;
export type OrderTransportResult = { reply: OrderSettlementCommand; failure: OrderTransportFailure | null };

function capturePreparedRequest(request: PendingCartRequestV2): PendingCartRequestV2 {
  const captured = structuredClone(request);
  if (!captured || captured.phase !== "SUBMITTING" || !isCartEnvelopeV2({ ...createEmptyCartEnvelopeV2(),
    cart: captured.cartSnapshot, pendingRequests: { [captured.ownerId]: captured } })) {
    throw new CartStorageError("INVALID_DATA", "Lần đặt chưa được chuẩn bị hợp lệ. Chưa gửi yêu cầu.");
  }
  return captured;
}

// Only call after explicit confirmation, durable BEGIN/RETRY and UI session guard.
// Both v1 and v2 send exactly the saved body; this transport never settles a cart.
export function createCartOrderTransport(environment: OrderTransportEnvironment) {
  return {
    async send(request: PendingCartRequestV2, signal?: AbortSignal): Promise<OrderTransportResult> {
      const captured = capturePreparedRequest(request);
      const observation = await postCartJson(environment, { path: "/api/orders", ownerId: captured.ownerId,
        requestKey: captured.requestKey, body: JSON.stringify(captured.payload) }, signal);
      return { reply: { ownerId: captured.ownerId, requestKey: captured.requestKey,
        status: observation.status, body: observation.body, receivedAt: (environment.now ?? (() => new Date().toISOString()))() },
        failure: observation.failure };
    },
  };
}
