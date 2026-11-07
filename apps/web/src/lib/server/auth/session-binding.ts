import { createHash } from "node:crypto";

// Hash the exact captured cookie; never expose the bearer token to JavaScript.
// Nest still validates the token and AuthSession before granting/revoking access.
export function sessionBinding(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
