import { createOwnerMutationHandler, MUTATION_BFF_TIMEOUT_MS } from "../owner-mutation-handler.ts";
import type { OwnerMutationEnvironment } from "../owner-mutation-handler";

export const ORDER_BFF_TIMEOUT_MS = MUTATION_BFF_TIMEOUT_MS;
export const ORDER_BODY_LIMIT_BYTES = 32 * 1024;
export type OrderHandlerEnvironment = Omit<OwnerMutationEnvironment, "backendUrls"> & {
  backendUrls: () => { me: string; orders: string };
};

export function createOrderHandler(environment: OrderHandlerEnvironment) {
  return createOwnerMutationHandler({ ...environment, backendUrls: () => {
    const { me, orders } = environment.backendUrls();
    return { me, mutation: orders };
  } }, { bodyLimitBytes: ORDER_BODY_LIMIT_BYTES, forwardIdempotencyKey: true });
}
