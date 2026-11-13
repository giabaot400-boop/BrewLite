import { createOwnerMutationHandler } from "../owner-mutation-handler.ts";
import { encodeOrderPathSegment } from "../../order-path.ts";
import type { OrderHandlerEnvironment } from "./order-handler";

export const CANCEL_BODY_LIMIT_BYTES = 4096;

export function createCancelHandler(environment: OrderHandlerEnvironment, orderId: string) {
  const segment = encodeOrderPathSegment(orderId);
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
