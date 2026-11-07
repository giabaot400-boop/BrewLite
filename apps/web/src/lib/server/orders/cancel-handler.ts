import { createOwnerMutationHandler } from "../owner-mutation-handler.ts";
import type { OrderHandlerEnvironment } from "./order-handler";

export const CANCEL_BODY_LIMIT_BYTES = 4096;

export function createCancelHandler(environment: OrderHandlerEnvironment, orderId: string) {
  let segment: string | null = null;
  try {
    // Next has already decoded params.id once. Preserve literal '%' and slashes.
    // Whole dot segments cannot be addressed safely: URL/fetch normalizes them.
    if (typeof orderId === "string" && orderId.length > 0 && orderId !== "." && orderId !== "..") {
      segment = encodeURIComponent(orderId);
    }
  } catch { /* Invalid Unicode must not produce a different upstream path. */ }
  return createOwnerMutationHandler({ ...environment, backendUrls: () => {
    const { me, orders } = environment.backendUrls();
    return { me, mutation: `${orders.replace(/\/$/, "")}/${segment}/cancel` };
  } }, {
    bodyLimitBytes: CANCEL_BODY_LIMIT_BYTES,
    forwardIdempotencyKey: false,
    validateTarget: () => segment === null ? Response.json({ error: {
      code: "VALIDATION_ERROR", message: "Mã đơn không thể dùng trong đường dẫn yêu cầu.", fieldErrors: {},
    } }, { status: 400, headers: { "Cache-Control": "no-store" } }) : null,
  });
}
