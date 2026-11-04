import test from "node:test";
import assert from "node:assert/strict";
import { createAuthSession, ConfirmedLogoutError } from "../auth/auth-session.ts";
import { AuthApiError } from "../auth/auth-error.ts";
import { createCartSessionBridge } from "./cart-session-bridge.ts";
import { createCartStorage } from "./cart-storage.ts";
import { createEmptyCartEnvelope, encodeCartEnvelope, decodeCartEnvelope } from "./cart-envelope.ts";
import { cartReducer } from "./cart-reducer.ts";
import { applyCartLifecycle } from "./cart-lifecycle.ts";

const credentials = { email: "a@example.com", password: "fixture-password" };
const session = (id = "a") => ({ user: { id, email: id + "@example.com" }, expiresAt: 123 });
const draft = { productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg",
  size: "S", toppingIds: [], toppingNames: {}, previewUnitPrice: 35000 };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture({ owner = "a", overrides = {}, pending = false } = {}) {
  let envelope = createEmptyCartEnvelope();
  envelope.cart = cartReducer({ cart: envelope.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
  envelope.cart.ownerId = owner;
  if (pending) envelope = applyCartLifecycle(envelope, { type: "BEGIN_ORDER", ownerId: owner,
    expectedCart: envelope.cart, requestKey: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-11-03T00:00:00.000Z" }).envelope;
  let bytes = encodeCartEnvelope(envelope), held = false, failWrite = false, failRead = false, httpCalls = 0;
  const storage = createCartStorage({
    storage: {
      getItem: () => { if (failRead) throw Error("denied"); return bytes; },
      setItem: (_key, value) => { if (failWrite) throw Error("quota"); bytes = value; },
    },
    locks: { request: async (_name, _options, callback) => {
      await Promise.resolve(); held = true;
      try { return callback(); } finally { held = false; }
    } },
  });
  const auth = createAuthSession({
    me: async () => session(), login: async () => session(), register: async () => session().user,
    ...overrides,
    logout: async () => {
      httpCalls++;
      assert.equal(held, false, "HTTP must start after Web Lock release");
      return overrides.logout ? overrides.logout() : "session";
    },
  });
  const bridge = createCartSessionBridge(storage, auth.getSnapshot);
  const off = auth.prepareSignOut(() => bridge.prepareLogout());
  return { auth, bridge, storage, off, raw: () => bytes, saved: () => decodeCartEnvelope(bytes),
    calls: () => httpCalls, failWrite: () => { failWrite = true; }, failRead: () => { failRead = true; } };
}

test("successful login adopts guest choices through the real auth coordinator without sending orders", async () => {
  const f = fixture({ owner: null });
  await f.auth.login(credentials);
  const result = await f.bridge.read(true);
  assert.equal(result.cart.ownerId, "a");
  assert.equal(result.cart.items[0].qty, 1);
  assert.equal(f.calls(), 0);
});
for (const scope of ["session", "local"]) {
  test(scope + " logout awaits durable cleanup and retains pending separately", async () => {
    const f = fixture({ pending: true, overrides: { logout: async () => scope } });
    await f.auth.refresh();
    let handled = false;
    f.auth.onSignedOut(seen => {
      assert.equal(seen, scope);
      assert.equal(f.saved().cart.items.length, 0);
      handled = true;
    });
    assert.equal(await f.auth.logout(), scope);
    assert.equal(f.auth.getSnapshot().status, "anonymous");
    assert.equal(f.saved().cart.ownerId, null);
    assert.ok(f.saved().pendingRequests.a);
    assert.equal(handled, true);
  });
}
test("logout network failure preserves auth and bytes and cancels the prepared edit block", async () => {
  const f = fixture({ overrides: { logout: async () => { throw new AuthApiError("NETWORK_ERROR", ""); } } });
  await f.auth.refresh();
  const identity = f.auth.getSnapshot(), before = f.raw();
  await assert.rejects(f.auth.logout(), error => error.code === "NETWORK_ERROR");
  assert.equal(f.auth.getSnapshot(), identity);
  assert.equal(f.raw(), before);
  await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
  assert.equal(f.saved().cart.items[0].qty, 2);
});
test("unreadable checkpoint prevents HTTP logout entirely", async () => {
  const f = fixture();
  await f.auth.refresh();
  const identity = f.auth.getSnapshot();
  f.failRead();
  await assert.rejects(f.auth.logout(), error => error.code === "STORAGE_UNAVAILABLE");
  assert.equal(f.calls(), 0);
  assert.equal(f.auth.getSnapshot(), identity);
});
test("confirmed logout plus quota failure reports local cleanup separately from server success", async () => {
  const f = fixture();
  await f.auth.refresh();
  const before = f.raw();
  f.failWrite();
  await assert.rejects(f.auth.logout(), error => error instanceof ConfirmedLogoutError
    && error.scope === "session" && error.reason === "cart");
  assert.equal(f.auth.getSnapshot().status, "anonymous");
  assert.equal(f.raw(), before);
  assert.equal((await f.bridge.read()).cart, null);
});
test("a cart edited in another tab during logout is retained after confirmed server logout", async () => {
  const response = deferred(), sent = deferred();
  const f = fixture({ overrides: { logout: () => { sent.resolve(); return response.promise; } } });
  await f.auth.refresh();
  const loggingOut = f.auth.logout();
  await sent.promise;
  await f.storage.mutateCart({ type: "ADD_ITEM", item: draft }, "a");
  const newer = f.raw();
  response.resolve("session");
  await assert.rejects(loggingOut, error => error instanceof ConfirmedLogoutError && error.reason === "cart");
  assert.equal(f.raw(), newer);
  assert.equal(f.auth.getSnapshot().status, "anonymous");
});
test("new login while logout HTTP is pending preserves the new auth and the new owner's cart", async () => {
  const response = deferred(), sent = deferred();
  const f = fixture({ overrides: {
    logout: () => { sent.resolve(); return response.promise; }, login: async () => session("b"),
  } });
  await f.auth.refresh();
  const loggingOut = f.auth.logout();
  await sent.promise;
  await f.auth.login(credentials);
  // Represents a second tab's independently guarded adoption.
  await f.storage.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "b", expectedCart: f.saved().cart });
  const newer = f.raw(), identity = f.auth.getSnapshot();
  response.resolve("session");
  await assert.rejects(loggingOut, error => error instanceof ConfirmedLogoutError && error.reason === "session-changed");
  assert.equal(f.raw(), newer);
  assert.equal(f.auth.getSnapshot(), identity);
  await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
});
test("login while preparing logout cancels it before HTTP and releases earlier preparations", async () => {
  const f = fixture({ overrides: { login: async () => session("b") } });
  await f.auth.refresh();
  f.auth.prepareSignOut(async () => {
    await f.auth.login(credentials);
    return { cancel() {}, complete: async () => assert.fail("must not complete") };
  });
  const before = f.raw();
  await assert.rejects(f.auth.logout());
  assert.equal(f.calls(), 0);
  assert.equal(f.raw(), before);
  assert.equal((await f.bridge.read(true)).cart.ownerId, "b");
});
test("/me discovering another account while logout is pending cannot replace its new snapshot", async () => {
  const response = deferred(), sent = deferred();
  let activeId = "a";
  const f = fixture({ overrides: {
    me: async () => session(activeId), logout: () => { sent.resolve(); return response.promise; },
  } });
  await f.auth.refresh();
  const before = f.raw(), loggingOut = f.auth.logout();
  await sent.promise;
  activeId = "b";
  await f.auth.refresh();
  const identity = f.auth.getSnapshot();
  response.resolve("local");
  await assert.rejects(loggingOut, error => error instanceof ConfirmedLogoutError
    && error.reason === "session-changed" && error.scope === "local");
  assert.equal(f.auth.getSnapshot(), identity);
  assert.equal(f.raw(), before);
});
test("a later failing preparer cancels the cart preparation and never calls HTTP", async () => {
  const f = fixture();
  await f.auth.refresh();
  const before = f.raw();
  f.auth.prepareSignOut(async () => { throw Error("preparation failed"); });
  await assert.rejects(f.auth.logout(), /preparation failed/);
  assert.equal(f.calls(), 0);
  assert.equal(f.raw(), before);
  await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
});
test("expired session hides owned cart without deleting it; same-owner login restores choices", async () => {
  const f = fixture({ overrides: { me: async () => { throw new AuthApiError("SESSION_EXPIRED", "", 401); } } });
  const before = f.raw();
  await f.auth.refresh();
  assert.equal(f.auth.getSnapshot().sessionExpired, true);
  assert.equal((await f.bridge.read()).cart, null);
  assert.equal(f.raw(), before);
  await f.auth.login(credentials);
  assert.equal((await f.bridge.read(true)).cart.items[0].qty, 1);
  assert.equal(f.raw(), before);
});
test("failed /me on an authenticated tab is not fresh proof to adopt another owner's cart", async () => {
  const f = fixture({ owner: "b", overrides: { me: async () => { throw new AuthApiError("NETWORK_ERROR", ""); } } });
  await f.auth.login(credentials);
  const identity = f.auth.getSnapshot(), before = f.raw();
  await f.auth.refresh();
  assert.equal(f.auth.getSnapshot(), identity);
  assert.equal((await f.bridge.read(false)).cart, null);
  assert.equal(f.raw(), before);
});
test("unregistering the pre-logout hook removes it and nullable info stays unknown", async () => {
  const f = fixture();
  f.off();
  f.failRead();
  f.auth.setLogoutInfoSource(() => null);
  assert.equal(f.auth.getLogoutInfo(), null);
  assert.equal(await f.auth.logout(), "session");
});

for (const scope of ["session", "local"]) {
  test("bound HTTP-style " + scope + " logout verifies the cookie, clears cart and retains pending", async () => {
    let meCalls = 0;
    const f = fixture({ pending: true, overrides: {
      me: async () => {
        if (++meCalls === 1) return { ...session(), binding: "a".repeat(64) };
        throw new AuthApiError("SESSION_INVALID", "", 401);
      },
      logout: async () => scope,
    } });
    await f.auth.refresh();
    const pending = f.saved().pendingRequests.a;
    assert.equal(await f.auth.logout(), scope);
    assert.equal(meCalls, 2);
    assert.equal(f.auth.getSnapshot().status, "anonymous");
    assert.equal(f.saved().cart.ownerId, null);
    assert.equal(f.saved().cart.items.length, 0);
    assert.deepEqual(f.saved().pendingRequests.a, pending);
  });
}
