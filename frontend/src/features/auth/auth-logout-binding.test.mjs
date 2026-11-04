import test from "node:test";
import assert from "node:assert/strict";
import { createAuthSession, ConfirmedLogoutError } from "./auth-session.ts";
import { AuthApiError } from "./auth-error.ts";
import { createHttpAuthClient } from "./auth-client.ts";
import { SESSION_BINDING_HEADER, EXPECTED_SESSION_HEADER } from "../../lib/session-binding.ts";

const A = "a".repeat(64), B = "b".repeat(64);
const session = (id = "a", binding = A) => ({ user: { id, email: id + "@example.com" }, expiresAt: 123, binding });
const credentials = { email: "a@example.com", password: "fixture" };
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function fixture(overrides = {}, options) {
  let cleaned = 0, cancelled = 0;
  const auth = createAuthSession({ register: async () => session().user, login: async () => session(),
    me: async () => { throw new AuthApiError("SESSION_INVALID", "", 401); },
    logout: async () => "session", ...overrides }, options);
  auth.prepareSignOut(async () => ({ complete: async () => { cleaned++; }, cancel: () => { cancelled++; } }));
  return { auth, cleaned: () => cleaned, cancelled: () => cancelled };
}
const changed = error => error instanceof ConfirmedLogoutError && error.reason === "session-changed";

for (const code of ["AUTH_REQUIRED", "SESSION_INVALID", "SESSION_EXPIRED"]) {
  test("acknowledged logout + verified " + code + " cleans the captured cart", async () => {
    const f = fixture({ me: async () => { throw new AuthApiError(code, "", 401); } });
    await f.auth.login(credentials);
    assert.equal(await f.auth.logout(), "session");
    assert.equal(f.auth.getSnapshot().status, "anonymous");
    assert.equal(f.cleaned(), 1);
  });
}
for (const [id, binding] of [["b", B], ["a", B], ["a", A]]) {
  test("live session after old 204 is preserved without old cleanup: " + id + "/" + binding, async () => {
    const f = fixture({ me: async () => session(id, binding) });
    await f.auth.login(credentials);
    await assert.rejects(f.auth.logout(), changed);
    assert.equal(f.auth.getSnapshot().status, "authenticated");
    assert.equal(f.auth.getSnapshot().user.id, id);
    assert.equal(f.auth.getSnapshot().binding, binding);
    assert.equal(f.cleaned(), 0);
    assert.equal(f.cancelled(), 1);
  });
}
test("unverified cookie after confirmed 204 hides old authority and retains cart bytes", async () => {
  const f = fixture({ me: async () => { throw new AuthApiError("NETWORK_ERROR", ""); } });
  await f.auth.login(credentials);
  await assert.rejects(f.auth.logout(), changed);
  assert.equal(f.auth.getSnapshot().status, "unknown");
  assert.equal(f.auth.getSnapshot().user, null);
  assert.equal(f.cleaned(), 0);
});
test("logout sends the captured binding; post-204 verification uses the remaining 15s budget", async () => {
  let time = 0;
  const f = fixture({
    logout: async (binding, options) => { assert.equal(binding, A); assert.equal(options.timeoutMs, 15000); time = 9900; return "session"; },
    me: async options => { assert.equal(options.timeoutMs, 5100); throw new AuthApiError("SESSION_INVALID", "", 401); },
  }, { now: () => time });
  await f.auth.login(credentials);
  await f.auth.logout();
  assert.equal(f.cleaned(), 1);
});
test("exhausted total budget does not start a new /me or clear the cart", async () => {
  let time = 0;
  const f = fixture({ logout: async () => { time = 15000; return "session"; },
    me: async () => assert.fail("No extra HTTP beyond the shared budget") }, { now: () => time });
  await f.auth.login(credentials);
  await assert.rejects(f.auth.logout(), changed);
  assert.equal(f.cleaned(), 0);
});
test("new login during post-204 verification cannot be replaced by a late 401", async () => {
  const response = deferred(), sent = deferred();
  let next = session();
  const f = fixture({ login: async () => next,
    me: () => { sent.resolve(); return response.promise; } });
  await f.auth.login(credentials);
  const pending = f.auth.logout();
  await sent.promise;
  next = session("b", B); await f.auth.login(credentials);
  const identity = f.auth.getSnapshot();
  response.resolve(Promise.reject(new AuthApiError("SESSION_INVALID", "", 401)));
  await assert.rejects(pending, changed);
  assert.equal(f.auth.getSnapshot(), identity);
  assert.equal(f.cleaned(), 0);
});
test("same-owner verification with a different binding invalidates prior UI confirmations", async () => {
  let current = session();
  const f = fixture({ me: async () => current });
  await f.auth.refresh();
  const version = f.auth.getSessionVersion();
  await f.auth.refresh();
  assert.equal(f.auth.getSessionVersion(), version);
  current = session("a", B); await f.auth.refresh();
  assert.equal(f.auth.getSessionVersion(), version + 1);
});
test("HTTP client keeps a non-credential binding and sends it only as the expected-session header", async () => {
  const seen = [];
  const client = createHttpAuthClient(async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith("logout")) return new Response(null, { status: 204, headers: { "X-BrewLite-Logout-Scope": "session" } });
    return Response.json({ user: session().user, expiresAt: 123 }, { headers: { [SESSION_BINDING_HEADER]: A } });
  });
  const loggedIn = await client.login(credentials);
  assert.equal(loggedIn.binding, A);
  assert.equal((await client.me()).binding, A);
  await client.logout(loggedIn.binding);
  assert.equal(seen[2].init.headers[EXPECTED_SESSION_HEADER], A);
  assert.equal(seen[2].init.headers.Authorization, undefined);
  assert.equal(seen[2].init.body, "{}");
});
for (const binding of [null, "invalid", "a".repeat(63)]) {
  test("HTTP session without a valid binding fails closed: " + binding, async () => {
    const headers = binding ? { [SESSION_BINDING_HEADER]: binding } : {};
    const client = createHttpAuthClient(async () => Response.json({ user: session().user, expiresAt: 123 }, { headers }));
    await assert.rejects(client.me(), error => error.code === "INVALID_RESPONSE");
    await assert.rejects(client.login(credentials), error => error.code === "INVALID_RESPONSE");
  });
}
