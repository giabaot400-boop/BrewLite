import "server-only";

/** Explicit one-way storage rollout; keep default off until workflow verification and old tabs are closed. */
export function checkoutV2IntegrationEnabled(): boolean {
  return process.env.CHECKOUT_V2_ENABLED === "1"
    || (process.env.NODE_ENV === "development" && process.env.CHECKOUT_V2_INTEGRATION_ENABLED === "1");
}
