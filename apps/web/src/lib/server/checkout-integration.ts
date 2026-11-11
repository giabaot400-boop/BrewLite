import "server-only";

/** Local integration only; production rollout still requires the backend release gate. */
export function checkoutV2IntegrationEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.CHECKOUT_V2_INTEGRATION_ENABLED === "1";
}
