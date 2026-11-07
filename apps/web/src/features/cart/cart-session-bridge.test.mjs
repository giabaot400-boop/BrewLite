import assert from "node:assert/strict";
import test from "node:test";
import { createCartSessionBridge } from "./cart-session-bridge.ts";
import { createCartStorage } from "./cart-storage.ts";
import { createEmptyCartEnvelope, encodeCartEnvelope, decodeCartEnvelope } from "./cart-envelope.ts";
import { applyCartLifecycle } from "./cart-lifecycle.ts";
import { cartReducer } from "./cart-reducer.ts";

const auth = id => id === null
  ? { status: "anonymous", user: null, sessionExpired: false }
  : { status: "authenticated", user: { id, email: id + "@example.com" }, sessionExpired: false };
const draft = { productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg",
  size: "S", toppingIds: [], toppingNames: {}, previewUnitPrice: 35000 };
const errorCode = code => error => error.code === code;
function initial(ownerId = null) {
  const envelope = createEmptyCartEnvelope();
  envelope.cart = cartReducer({ cart: envelope.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
  envelope.cart.ownerId = ownerId;
  return envelope;
}
function fixture(envelope = initial(), identity = auth(null)) {
  let raw = encodeCartEnvelope(envelope), snapshot = identity, writes = 0, calls = 0, held = false;
  let onRequest = () => {}, failWrite = false;
  const storage = {
    getItem: () => raw,
    setItem: (_key, value) => { if (failWrite) throw Error("quota"); raw = value; writes++; },
  };
  const locks = { request: async (_name, _options, callback) => {
    await Promise.resolve();
    onRequest(++calls);
    held = true;
    try { return callback(); } finally { held = false; }
  } };
  const port = createCartStorage({ storage, locks });
  return {
    port, bridge: createCartSessionBridge(port, () => snapshot),
    setIdentity: value => { snapshot = value; },
    onRequest: callback => { onRequest = callback; },
    failWrite: () => { failWrite = true; },
    bytes: () => raw, saved: () => decodeCartEnvelope(raw),
    writes: () => writes, held: () => held,
  };
}

test("guest read never persists or manufactures authentication", async () => {
  const f = fixture();
  assert.equal((await f.bridge.read()).cart.ownerId, null);
  assert.equal(f.writes(), 0);
});
test("verified owner can read and mutate own cart", async () => {
  const f = fixture(initial("a"), auth("a"));
  assert.equal((await f.bridge.read()).cart.ownerId, "a");
  assert.equal((await f.bridge.mutate({ type: "ADD_ITEM", item: draft })).cart.items[0].qty, 2);
});
test("storage refresh alone hides another owner's cart without adopting it", async () => {
  const f = fixture(initial("b"), auth("a")), before = f.bytes();
  assert.equal((await f.bridge.read()).cart, null);
  assert.equal(f.bytes(), before);
});
test("fresh verified login adopts guest choices", async () => {
  const f = fixture(initial(), auth("a"));
  const before = f.saved().cart;
  const result = await f.bridge.read(true);
  assert.deepEqual(result.cart.items, before.items);
  assert.equal(result.cart.ownerId, "a");
  assert.equal(result.cart.revision, before.revision + 1);
});
test("account switch clears choices while retaining the old pending request", async () => {
  let envelope = initial("a");
  envelope = applyCartLifecycle(envelope, { type: "BEGIN_ORDER", ownerId: "a",
    expectedCart: envelope.cart, requestKey: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-11-03T00:00:00.000Z" }).envelope;
  const f = fixture(envelope, auth("b"));
  const result = await f.bridge.read(true);
  assert.equal(result.cart.items.length, 0);
  assert.equal(result.pending, null);
  assert.ok(f.saved().pendingRequests.a);
});
test("same-owner verification does not bump revision or write", async () => {
  const f = fixture(initial("a"), auth("a")), before = f.bytes();
  await f.bridge.read(true);
  assert.equal(f.bytes(), before);
  assert.equal(f.writes(), 0);
});
for (const status of ["loading", "unknown"]) {
  test(status + " identity cannot adopt or mutate cart", async () => {
    const f = fixture(initial(), { status, user: null, sessionExpired: false }), before = f.bytes();
    await assert.rejects(() => f.bridge.read(true), errorCode("OWNER_MISMATCH"));
    await assert.rejects(() => f.bridge.mutate({ type: "ADD_ITEM", item: draft }), errorCode("OWNER_MISMATCH"));
    assert.equal(f.bytes(), before);
  });
}
test("identity changed during storage read cannot publish stale cart", async () => {
  const f = fixture(initial("a"), auth("a"));
  f.onRequest(() => f.setIdentity(auth("b")));
  await assert.rejects(() => f.bridge.read(), errorCode("OWNER_MISMATCH"));
  assert.equal(f.writes(), 0);
});
test("queued adoption checks auth identity inside the write lock", async () => {
  const f = fixture(initial(), auth("a")), before = f.bytes();
  f.onRequest(count => { if (count === 2) f.setIdentity(auth("b")); });
  await assert.rejects(() => f.bridge.read(true), errorCode("OWNER_MISMATCH"));
  assert.equal(f.bytes(), before);
});
test("queued mutation cannot write after the auth snapshot changes", async () => {
  const f = fixture(initial("a"), auth("a")), before = f.bytes();
  f.onRequest(() => f.setIdentity(auth("a")));
  await assert.rejects(() => f.bridge.mutate({ type: "ADD_ITEM", item: draft }), errorCode("OWNER_MISMATCH"));
  assert.equal(f.bytes(), before);
});
test("logout preparation releases lock, blocks edits and cancel preserves bytes", async () => {
  const f = fixture(initial("a"), auth("a")), before = f.bytes();
  const prepared = await f.bridge.prepareLogout();
  assert.equal(f.held(), false);
  await assert.rejects(() => f.bridge.mutate({ type: "ADD_ITEM", item: draft }), errorCode("CART_CHANGED"));
  prepared.cancel();
  assert.equal(f.bytes(), before);
  await assert.rejects(() => prepared.complete("session"), errorCode("INVALID_DATA"));
  await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
});
for (const scope of ["session", "local"]) {
  test("confirmed " + scope + " logout clears only checkpoint cart, keeps pending", async () => {
    let envelope = initial("a");
    envelope = applyCartLifecycle(envelope, { type: "BEGIN_ORDER", ownerId: "a",
      expectedCart: envelope.cart, requestKey: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-11-03T00:00:00.000Z" }).envelope;
    const f = fixture(envelope, auth("a"));
    const prepared = await f.bridge.prepareLogout();
    await prepared.complete(scope);
    assert.equal(f.saved().cart.ownerId, null);
    assert.equal(f.saved().cart.items.length, 0);
    assert.ok(f.saved().pendingRequests.a);
    assert.equal(f.writes(), 1);
    await prepared.complete(scope);
    assert.equal(f.writes(), 1);
  });
}
test("late logout cannot erase a cart changed in another tab", async () => {
  const f = fixture(initial("a"), auth("a"));
  const prepared = await f.bridge.prepareLogout();
  await f.port.mutateCart({ type: "ADD_ITEM", item: draft }, "a");
  const newer = f.bytes();
  await assert.rejects(() => prepared.complete("session"), errorCode("CART_CHANGED"));
  assert.equal(f.bytes(), newer);
});
test("invalid logout scope cannot clear cart", async () => {
  const f = fixture(initial("a"), auth("a")), before = f.bytes();
  const prepared = await f.bridge.prepareLogout();
  await assert.rejects(() => prepared.complete("unexpected"), errorCode("INVALID_DATA"));
  assert.equal(f.bytes(), before);
  prepared.cancel();
});
test("late logout cannot erase a different account's newly adopted cart", async () => {
  const f = fixture(initial("a"), auth("a"));
  const prepared = await f.bridge.prepareLogout();
  await f.port.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "b", expectedCart: f.saved().cart });
  const newer = f.bytes();
  await assert.rejects(() => prepared.complete("local"), errorCode("OWNER_MISMATCH"));
  assert.equal(f.bytes(), newer);
});
test("quota failure cannot report successful logout cart cleanup", async () => {
  const f = fixture(initial("a"), auth("a")), before = f.bytes();
  const prepared = await f.bridge.prepareLogout();
  f.failWrite();
  await assert.rejects(() => prepared.complete("session"), errorCode("STORAGE_UNAVAILABLE"));
  assert.equal(f.bytes(), before);
});
