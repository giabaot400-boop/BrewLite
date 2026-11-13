import { CartStorageError } from "./cart-envelope.ts";
import { ORDER_OWNER_HEADER, encodeOrderOwner } from "../../lib/order-owner.ts";

export const CART_HTTP_TIMEOUT_MS = 15000;
export type CartHttpFailure = "NETWORK" | "INVALID_BODY" | "TIMEOUT" | "CANCELLED";
export type CartHttpObservation = { status: number | null; body: unknown; failure: CartHttpFailure | null };
export type CartHttpEnvironment = {
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
  now?: () => string;
  schedule?: (callback: () => void, delayMs: number) => () => void;
};
function scheduleTimeout(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer);
}

/** Internal HTTP runner. Public adapters validate/capture prepared records first. */
export async function postCartJson(environment: CartHttpEnvironment, input: {
  path: "/api/orders" | "/api/payments" | `/api/orders/${string}/cancel`;
  ownerId: string; body: string; requestKey?: string;
}, signal?: AbortSignal): Promise<CartHttpObservation> {
  let encodedOwner: string;
  try { encodedOwner = encodeOrderOwner(input.ownerId); } catch {
    throw new CartStorageError("INVALID_DATA", "Chủ của yêu cầu không hợp lệ. Chưa gửi yêu cầu.");
  }
  if (signal?.aborted) return { status: null, body: null, failure: "CANCELLED" };
  const controller = new AbortController();
  let status: number | null = null, failure: "TIMEOUT" | "CANCELLED" | null = null;
  let resolveInterruption: (value: CartHttpObservation) => void = () => {};
  const interrupted = new Promise<CartHttpObservation>(resolve => { resolveInterruption = resolve; });
  const interrupt = (reason: "TIMEOUT" | "CANCELLED") => {
    if (controller.signal.aborted) return;
    failure = reason;
    resolveInterruption({ status, body: null, failure: reason });
    controller.abort();
  };
  const onCancel = () => interrupt("CANCELLED");
  const cancelTimeout = (environment.schedule ?? scheduleTimeout)(() => interrupt("TIMEOUT"), CART_HTTP_TIMEOUT_MS);
  signal?.addEventListener("abort", onCancel, { once: true });
  try {
    if (signal?.aborted) onCancel();
    if (controller.signal.aborted) return await interrupted;
    const work = (async (): Promise<CartHttpObservation> => {
      let readingBody = false;
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json",
          "X-BrewLite-Request": "1", [ORDER_OWNER_HEADER]: encodedOwner };
        if (input.requestKey !== undefined) headers["Idempotency-Key"] = input.requestKey;
        const response = await environment.fetch(input.path, {
          method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
          headers, body: input.body, signal: controller.signal,
        });
        if (controller.signal.aborted) return { status, body: null, failure };
        status = response.status; readingBody = true;
        const body: unknown = await response.json();
        return controller.signal.aborted ? { status, body: null, failure } : { status, body, failure: null };
      } catch {
        return { status, body: null, failure: failure ?? (readingBody ? "INVALID_BODY" : "NETWORK") };
      }
    })();
    // The race also bounds fetch adapters which do not implement AbortSignal.
    return await Promise.race([work, interrupted]);
  } finally { cancelTimeout(); signal?.removeEventListener("abort", onCancel); }
}
