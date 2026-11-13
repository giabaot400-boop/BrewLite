import { createOwnerMutationHandler } from "../owner-mutation-handler.ts";
import type { OwnerMutationEnvironment } from "../owner-mutation-handler";

export const PAYMENT_BODY_LIMIT_BYTES = 4096;
export type PaymentHandlerEnvironment = Omit<OwnerMutationEnvironment, "backendUrls"> & {
  backendUrls: () => { me: string; payments: string };
};

export function createPaymentHandler(environment: PaymentHandlerEnvironment) {
  return createOwnerMutationHandler({ ...environment, backendUrls: () => {
    const { me, payments } = environment.backendUrls();
    return { me, mutation: payments };
  } }, { bodyLimitBytes: PAYMENT_BODY_LIMIT_BYTES, forwardIdempotencyKey: true });
}
