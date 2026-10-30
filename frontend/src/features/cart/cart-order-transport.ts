import { CartStorageError, isCartEnvelope } from "./cart-envelope.ts";
import type { PendingCartRequest } from "./cart-envelope";
import type { OrderSettlementCommand } from "./cart-order-settlement";

export const ORDER_HTTP_TIMEOUT_MS = 15000;

export type OrderTransportFailure = "NETWORK" | "INVALID_BODY" | "TIMEOUT" | "CANCELLED";
export type OrderTransportResult = {
  reply: OrderSettlementCommand;
  failure: OrderTransportFailure | null;
};

export type OrderTransportEnvironment = {
  // Inject fetch explicitly; this module does not create a session or auth adapter.
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
  now?: () => string;
  schedule?: (callback: () => void, delayMs: number) => () => void;
};

type Observation = { status: number | null; body: unknown; failure: OrderTransportFailure | null };

function scheduleTimeout(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
}

function capturePreparedRequest(request: PendingCartRequest): PendingCartRequest {
  const captured = structuredClone(request);
  if (!captured || captured.phase !== "SUBMITTING" || !isCartEnvelope({ schemaVersion: 1,
    cart: captured.cartSnapshot, pendingRequests: { [captured.ownerId]: captured }, lastOrderResult: null })) {
    throw new CartStorageError("INVALID_DATA", "Lần đặt chưa được chuẩn bị hợp lệ. Chưa gửi yêu cầu.");
  }
  return captured;
}

// Call only on an explicit user action, after awaiting storage.applyLifecycle
// BEGIN_ORDER/RETRY_ORDER and checking the authenticated owner in the UI adapter.
// It never writes storage, creates a key, retries POST or changes a session.
export function createCartOrderTransport(environment: OrderTransportEnvironment) {
  return {
    async send(request: PendingCartRequest, signal?: AbortSignal): Promise<OrderTransportResult> {
      const captured = capturePreparedRequest(request);
      const now = environment.now ?? (() => new Date().toISOString());
      const finish = (observation: Observation): OrderTransportResult => ({
        reply: { ownerId: captured.ownerId, requestKey: captured.requestKey,
          status: observation.status, body: observation.body, receivedAt: now() },
        failure: observation.failure,
      });
      if (signal?.aborted) return finish({ status: null, body: null, failure: "CANCELLED" });

      const controller = new AbortController();
      let status: number | null = null;
      let failure: "TIMEOUT" | "CANCELLED" | null = null;
      let resolveInterruption: (value: Observation) => void = () => {};
      const interrupted = new Promise<Observation>((resolve) => { resolveInterruption = resolve; });
      const interrupt = (reason: "TIMEOUT" | "CANCELLED") => {
        if (controller.signal.aborted) return;
        failure = reason;
        // Resolve first so abort-related rejection cannot replace the cause.
        resolveInterruption({ status, body: null, failure: reason });
        controller.abort();
      };
      const onCancel = () => interrupt("CANCELLED");
      const cancelTimeout = (environment.schedule ?? scheduleTimeout)(() => interrupt("TIMEOUT"), ORDER_HTTP_TIMEOUT_MS);
      signal?.addEventListener("abort", onCancel, { once: true });
      try {
        // A custom scheduler or caller may abort before work starts.
        if (signal?.aborted) onCancel();
        if (controller.signal.aborted) return finish(await interrupted);
        const work = (async (): Promise<Observation> => {
          let readingBody = false;
          try {
            const response = await environment.fetch("/api/orders", {
              method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
              headers: { "Content-Type": "application/json", Accept: "application/json",
                "X-BrewLite-Request": "1", "Idempotency-Key": captured.requestKey },
              body: JSON.stringify(captured.payload), signal: controller.signal,
            });
            // Ignore late fetch completion after the deadline; do not start body work.
            if (controller.signal.aborted) return { status, body: null, failure };
            status = response.status;
            readingBody = true;
            const body: unknown = await response.json();
            return controller.signal.aborted ? { status, body: null, failure } : { status, body, failure: null };
          } catch {
            return { status, body: null, failure: failure ?? (readingBody ? "INVALID_BODY" : "NETWORK") };
          }
        })();
        // Abort the real fetch/body and also bound adapters that ignore AbortSignal.
        return finish(await Promise.race([work, interrupted]));
      } finally {
        cancelTimeout();
        signal?.removeEventListener("abort", onCancel);
      }
    },
  };
}
