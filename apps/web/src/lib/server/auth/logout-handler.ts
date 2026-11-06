import { EXPECTED_SESSION_HEADER, isSessionBinding } from "../../session-binding.ts";
import { sessionBinding } from "./session-binding.ts";

type Environment = {
  checkPost: (request: Request) => Response | null;
  readToken: () => Promise<string | undefined>;
  backend: (action: "me" | "logout", token: string) => Promise<Response>;
  forwardError: (response: Response) => Promise<Response>;
};

function success(scope: "session" | "local") {
  // No Set-Cookie: an older response must not erase a newer login.
  return new Response(null, { status: 204,
    headers: { "X-BrewLite-Logout-Scope": scope, "Cache-Control": "no-store" } });
}

async function invalidSession(response: Response) {
  if (response.status !== 401) return false;
  const body = await response.clone().json().catch(() => null);
  return body?.error?.code === "SESSION_INVALID";
}

export function createLogoutHandler(environment: Environment) {
  return async (request: Request): Promise<Response> => {
    const denied = environment.checkPost(request);
    if (denied) return denied;
    const token = await environment.readToken();
    if (!token) return success("local");

    const expected = request.headers.get(EXPECTED_SESSION_HEADER);
    if (!isSessionBinding(expected) || expected !== sessionBinding(token)) {
      // A broken token can still take P05's local-only path. A valid or expired
      // different session must never be revoked on behalf of an old UI.
      const current = await environment.backend("me", token);
      if (await invalidSession(current)) return success("local");
      if (current.status !== 200 && current.status !== 401) return environment.forwardError(current);
      return Response.json({ error: { code: "REQUEST_FORBIDDEN",
        message: "Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra lại trước khi đăng xuất.", fieldErrors: {} } },
      { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    const upstream = await environment.backend("logout", token);
    if (upstream.status === 204) return success("session");
    if (await invalidSession(upstream)) return success("local");
    return environment.forwardError(upstream);
  };
}
