import test from "node:test";
import assert from "node:assert/strict";
import { createLogoutHandler } from "./logout-handler.ts";
import { sessionBinding } from "./session-binding.ts";
import { EXPECTED_SESSION_HEADER } from "../../session-binding.ts";

const failure = (status, code) => Response.json({ error: { code, message: "fixture", fieldErrors: {} } }, { status });
const session = () => Response.json({ user: { id: "b", email: "b@example.com" }, expiresAt: 123 });
function fixture({ token = "token-a", backend, denied = null } = {}) {
  let reads = 0, cookie = token;
  const calls = [];
  const handle = createLogoutHandler({
    checkPost: () => denied, readToken: async () => { reads++; return cookie; },
    backend: async (action, captured) => {
      calls.push([action, captured]);
      return backend ? backend(action, captured) : new Response(null, { status: 204 });
    },
    forwardError: async response => response,
  });
  return { handle, calls, reads: () => reads, cookie: value => { cookie = value; } };
}
function request(binding = sessionBinding("token-a")) {
  return new Request("http://localhost/api/auth/logout", { method: "POST",
    headers: binding === null ? {} : { [EXPECTED_SESSION_HEADER]: binding } });
}
function safeResponse(response, status, scope = null) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("set-cookie"), null);
  if (status === 204) {
    assert.equal(response.headers.get("X-BrewLite-Logout-Scope"), scope);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
}

test("matching binding revokes exactly the captured cookie once without Set-Cookie", async () => {
  const f = fixture();
  safeResponse(await f.handle(request()), 204, "session");
  assert.deepEqual(f.calls, [["logout", "token-a"]]);
  assert.equal(f.reads(), 1);
});
for (const binding of [sessionBinding("token-a"), null, "malformed"]) {
  test("different live cookie is forbidden before POST (expected " + binding + ")", async () => {
    const f = fixture({ token: "token-b", backend: async () => session() });
    const response = await f.handle(request(binding));
    safeResponse(response, 403);
    assert.equal((await response.json()).error.code, "REQUEST_FORBIDDEN");
    assert.deepEqual(f.calls, [["me", "token-b"]]);
  });
}
test("another session for the same account is also rejected by exact token binding", async () => {
  const f = fixture({ token: "token-a-new-session", backend: async () => session() });
  safeResponse(await f.handle(request()), 403);
  assert.deepEqual(f.calls, [["me", "token-a-new-session"]]);
});
test("missing cookie confirms local scope without any upstream request", async () => {
  const f = fixture({ token: "" });
  safeResponse(await f.handle(request()), 204, "local");
  assert.deepEqual(f.calls, []);
});
for (const binding of [null, sessionBinding("broken")]) {
  test("Nest-confirmed invalid token permits local cleanup with no cookie deletion: " + binding, async () => {
    const f = fixture({ token: "broken", backend: async () => failure(401, "SESSION_INVALID") });
    safeResponse(await f.handle(request(binding)), 204, "local");
    assert.deepEqual(f.calls, [[binding ? "logout" : "me", "broken"]]);
  });
}
test("mismatched expired session cannot be revoked; matching expired session can", async () => {
  const f = fixture({ backend: async action => action === "me" ? failure(401, "SESSION_EXPIRED") : new Response(null, { status: 204 }) });
  safeResponse(await f.handle(request(sessionBinding("old-session"))), 403);
  safeResponse(await f.handle(request()), 204, "session");
  assert.deepEqual(f.calls, [["me", "token-a"], ["logout", "token-a"]]);
});
for (const status of [500, 502, 504]) {
  test("upstream " + status + " is never converted to confirmed logout", async () => {
    for (const binding of [null, sessionBinding("token-a")]) {
      const f = fixture({ backend: async () => failure(status, "UPSTREAM_UNAVAILABLE") });
      safeResponse(await f.handle(request(binding)), status);
    }
  });
}
test("POST rejection precedes reading the cookie or contacting Nest", async () => {
  const f = fixture({ denied: failure(403, "REQUEST_FORBIDDEN") });
  safeResponse(await f.handle(request()), 403);
  assert.equal(f.reads(), 0);
  assert.deepEqual(f.calls, []);
});
test("late logout uses token A even if a new login writes token B while waiting", async () => {
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const sent = new Promise(resolve => { arrived = resolve; });
  const f = fixture({ backend: async () => { arrived(); await gate; return new Response(null, { status: 204 }); } });
  const pending = f.handle(request());
  await sent;
  f.cookie("token-b"); release();
  safeResponse(await pending, 204, "session");
  assert.equal(f.reads(), 1);
  assert.deepEqual(f.calls, [["logout", "token-a"]]);
});
