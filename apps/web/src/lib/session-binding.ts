/** Public correlation values only: neither header grants access to a session. */
export const SESSION_BINDING_HEADER = "X-BrewLite-Session-Binding";
export const EXPECTED_SESSION_HEADER = "X-BrewLite-Expected-Session";

export function isSessionBinding(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
