import test from "node:test";
import assert from "node:assert/strict";
import { createCartSessionBridgeV2 } from "./cart-session-bridge-v2.ts";
import { createCartStorage, CART_LOCK_NAME, CART_STORAGE_KEY } from "./cart-storage.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createEmptyCartEnvelope, encodeCartEnvelope } from "./cart-envelope.ts";
import { cartReducer } from "./cart-reducer.ts";
import { createAuthSession, ConfirmedLogoutError } from "../auth/auth-session.ts";
import { AuthApiError } from "../auth/auth-error.ts";

const TIME = "2026-11-08T12:00:00.000Z", KEY = "00000000-0000-4000-8000-000000000001";
const BINDING = "a".repeat(64), OTHER_BINDING = "b".repeat(64);
const draft = { productId: "coffee", productName: "Coffee", size: "M", imageUrl: "/coffee.svg",
  toppingIds: [], toppingNames: {}, previewUnitPrice: 50000 };
const identity = (ownerId = "A", binding = BINDING) => ownerId === null
  ? { status: "anonymous", user: null, sessionExpired: false }
  : { status: "authenticated", user: { id: ownerId, email: `${ownerId}@example.test` }, binding, sessionExpired: false };
const code = expected => error => error.code === expected;
function envelope(ownerId = "A") {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart, ownerId };
  return value;
}
function records(value, ownerId = "A") {
  const cartSnapshot = envelope(ownerId).cart;
  value.pendingRequests = { ...value.pendingRequests, [ownerId]: { ownerId, requestKey: KEY,
    cartRevision: cartSnapshot.revision, cartSnapshot, createdAt: TIME, phase: "SUBMITTING",
    payload: { schemaVersion: 2, items: [{ productId: "coffee", size: "M", toppingIds: [], qty: 1, expectedUnitPrice: 50000 }],
      promotionCode: " demo10 ", expectedTotal: 45000 } } };
  value.checkoutBindings = { ...value.checkoutBindings, [ownerId]: { ownerId, orderId: `order-${ownerId}`,
    cartSnapshot, cartRevision: cartSnapshot.revision, orderVersion: 0, boundAt: TIME } };
  value.paymentRecoveries = { ...value.paymentRecoveries, [ownerId]: { [KEY]: { ownerId, requestKey: KEY,
    body: { orderId: `order-${ownerId}`, method: "CARD" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } } };
  value.lastOrderResult = { ownerId, requestKey: KEY, order: { id: `order-${ownerId}`, status: "PENDING", total: 45000 }, confirmedAt: TIME };
  return value;
}

function setup(value = envelope(), active = identity()) {
  let raw = value === null || typeof value === "string" ? value : encodeCartEnvelopeV2(value);
  let current = active, version = 1, writes = 0, reads = 0, count = 0, held = false, failWrite = false;
  let onLock = () => {}, onRead = () => {}, tail = Promise.resolve();
  const auth = { getSnapshot: () => current, getSessionVersion: () => version };
  const storage = createCartStorage({ locks: { request(name, options, callback) {
    assert.equal(name, CART_LOCK_NAME);
    const task = tail.then(() => {
      options.signal.throwIfAborted(); onLock(++count); held = true;
      try { return callback(); } finally { held = false; }
    });
    tail = task.catch(() => {}); return task;
  } }, storage: {
    getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true); reads++; onRead(); return raw; },
    setItem(key, next) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true);
      if (failWrite) throw Error("quota"); raw = next; writes++; },
  } });
  return { bridge: createCartSessionBridgeV2(storage, auth), storage, auth,
    bytes: () => raw, saved: () => JSON.parse(raw), writes: () => writes, reads: () => reads, held: () => held,
    set(next, nextVersion = version + 1) { current = next; version = nextVersion; },
    onLock(callback) { onLock = callback; }, onRead(callback) { onRead = callback; }, failWrite() { failWrite = true; } };
}

test("missing storage guest read never persists; first guest edit uses only schema 2", async () => {
  const f = setup(null, identity(null));
  const view = await f.bridge.read();
  assert.equal(view.cart.ownerId, null); assert.equal(view.canMutate, true); assert.equal(f.bytes(), null);
  const saved = await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
  assert.equal(saved.cart.items[0].qty, 1); assert.equal(f.saved().schemaVersion, 2); assert.equal(f.writes(), 1);
});

test("storage read alone never adopts another owner's cart or returns their records", async () => {
  const f = setup(records(envelope("B"), "B")), before = f.bytes();
  const view = await f.bridge.read();
  assert.equal(view.cart, null); assert.equal(view.pending, null); assert.equal(view.result, null);
  assert.equal(view.binding, null); assert.deepEqual(view.recoveries, []); assert.equal(view.canMutate, false);
  assert.equal(f.bytes(), before);
});

test("only the exact newly verified auth snapshot grants guest adoption", async () => {
  const f = setup(envelope(null)), before = f.saved().cart;
  await f.bridge.read({ ...f.auth.getSnapshot() });
  assert.equal(f.writes(), 0);
  const adopted = await f.bridge.read(f.auth.getSnapshot());
  assert.equal(adopted.cart.ownerId, "A"); assert.deepEqual(adopted.cart.items, before.items);
  assert.equal(adopted.cart.revision, before.revision + 1); assert.equal(f.writes(), 1);
});

test("verified account switch clears active choices but retains every recovery map unchanged", async () => {
  const value = records(records(envelope(), "A"), "B"), f = setup(value, identity("B"));
  const before = f.saved(), view = await f.bridge.read(f.auth.getSnapshot());
  assert.equal(view.cart.ownerId, "B"); assert.equal(view.cart.items.length, 0);
  assert.equal(view.pending.ownerId, "B"); assert.equal(view.binding.ownerId, "B");
  assert.equal(view.pending.phase, "UNKNOWN");
  assert.equal(view.recoveries[0].ownerId, "B"); assert.equal(view.canMutate, false);
  for (const name of ["pendingRequests", "checkoutBindings", "paymentRecoveries", "lastOrderResult"]) {
    assert.deepEqual(f.saved()[name], before[name]);
  }
});

test("same owner verification is read-only; SUBMITTING is restored UNKNOWN only in the view", async () => {
  const f = setup(records(envelope())), before = f.bytes();
  const view = await f.bridge.read(f.auth.getSnapshot());
  assert.equal(view.pending.phase, "UNKNOWN"); assert.equal(f.saved().pendingRequests.A.phase, "SUBMITTING");
  assert.equal(f.bytes(), before); assert.equal(f.writes(), 0); assert.equal(view.editBlock, "ORDER_PENDING");
});

for (const kind of ["pendingRequests", "checkoutBindings", "paymentRecoveries"]) {
  test(`${kind} blocks cart edits while preserving saved bytes`, async () => {
    const all = records(envelope()), value = envelope(); value[kind] = all[kind];
    const f = setup(value), before = f.bytes();
    assert.equal((await f.bridge.read()).canMutate, false);
    await assert.rejects(f.bridge.mutate({ type: "INCREMENT", lineKey: value.cart.items[0].productId }), code("PENDING_REQUEST"));
    assert.equal(f.bytes(), before); assert.equal(f.writes(), 0);
  });
}

test("resolved recovery alone permits edits and never changes its original body/key", async () => {
  const value = envelope(), saved = records(envelope()).paymentRecoveries;
  value.paymentRecoveries = { A: { [KEY]: { ...saved.A[KEY], recoveryStatus: "RESOLVED" } } };
  const f = setup(value), original = f.saved().paymentRecoveries;
  assert.equal((await f.bridge.read()).canMutate, true);
  assert.equal((await f.bridge.mutate({ type: "ADD_ITEM", item: draft })).cart.items[0].qty, 2);
  assert.deepEqual(f.saved().paymentRecoveries, original);
});

test("anonymous session expiry hides owner records without clearing any stored data", async () => {
  const f = setup(records(envelope()), identity(null)), before = f.bytes();
  const view = await f.bridge.read();
  assert.equal(view.cart, null); assert.equal(view.pending, null); assert.equal(view.result, null);
  assert.equal(view.binding, null); assert.deepEqual(view.recoveries, []); assert.equal(f.bytes(), before);
});

for (const status of ["loading", "unknown"]) {
  test(`${status} auth cannot read, adopt, edit or prepare logout`, async () => {
    const f = setup(envelope(), { status, user: null, sessionExpired: false }), before = f.bytes();
    await assert.rejects(f.bridge.read(f.auth.getSnapshot()), code("OWNER_MISMATCH"));
    await assert.rejects(f.bridge.mutate({ type: "ADD_ITEM", item: draft }), code("OWNER_MISMATCH"));
    await assert.rejects(f.bridge.prepareLogout(), code("OWNER_MISMATCH"));
    assert.equal(f.bytes(), before); assert.equal(f.reads(), 0);
  });
}

test("authenticated owner without a valid session binding cannot adopt or write", async () => {
  const f = setup(envelope(null), { ...identity(), binding: undefined }), before = f.bytes();
  await assert.rejects(f.bridge.read(f.auth.getSnapshot()), code("OWNER_MISMATCH"));
  await assert.rejects(f.bridge.mutate({ type: "ADD_ITEM", item: draft }), code("OWNER_MISMATCH"));
  assert.equal(f.bytes(), before);
});

for (const change of ["owner", "binding", "login generation"]) {
  test(`queued edits reject a changed ${change} inside the write lock`, async () => {
    const f = setup(), before = f.bytes();
    f.onLock(() => f.set(change === "owner" ? identity("B") : change === "binding" ? identity("A", OTHER_BINDING) : identity()));
    await assert.rejects(f.bridge.mutate({ type: "ADD_ITEM", item: draft }), code("OWNER_MISMATCH"));
    assert.equal(f.bytes(), before);
  });
}

test("same-session refresh keeps an edit valid but an auth change during storage read prevents write", async () => {
  const same = setup(); same.onLock(() => same.set(identity(), 1));
  assert.equal((await same.bridge.mutate({ type: "ADD_ITEM", item: draft })).cart.items[0].qty, 2);
  const changed = setup(), before = changed.bytes(); changed.onRead(() => changed.set(identity("B")));
  await assert.rejects(changed.bridge.mutate({ type: "ADD_ITEM", item: draft }), code("OWNER_MISMATCH"));
  assert.equal(changed.bytes(), before);
});

test("auth change while queued for adoption or reading cannot publish an old owner's data", async () => {
  const adopt = setup(envelope(null)), before = adopt.bytes();
  adopt.onLock(n => { if (n === 2) adopt.set(identity("B")); });
  await assert.rejects(adopt.bridge.read(adopt.auth.getSnapshot()), code("OWNER_MISMATCH"));
  assert.equal(adopt.bytes(), before);
  const read = setup(); read.onRead(() => read.set(identity("B")));
  await assert.rejects(read.bridge.read(), code("OWNER_MISMATCH"));
});

test("logout preparation releases its lock, blocks edits/adoption and can be cancelled without writes", async () => {
  const f = setup(), before = f.bytes(), prepared = await f.bridge.prepareLogout();
  assert.equal(f.held(), false); assert.equal((await f.bridge.read()).canMutate, false);
  await assert.rejects(f.bridge.mutate({ type: "ADD_ITEM", item: draft }), code("CART_CHANGED"));
  await assert.rejects(f.bridge.prepareLogout(), code("CART_CHANGED"));
  f.set(identity("B"));
  await assert.rejects(f.bridge.read(f.auth.getSnapshot()), code("CART_CHANGED"));
  prepared.cancel(); assert.equal(f.bytes(), before);
  await assert.rejects(prepared.complete("session"), code("INVALID_DATA"));
  f.set(identity()); await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
});

for (const scope of ["session", "local"]) {
  test(`confirmed ${scope} logout clears only cart and retains both owners' recoveries byte-for-byte`, async () => {
    const f = setup(records(records(envelope(), "A"), "B")), before = f.saved();
    const prepared = await f.bridge.prepareLogout();
    f.set(identity(null));
    const result = await prepared.complete(scope);
    assert.equal(result.cart.ownerId, null); assert.equal(result.cart.items.length, 0);
    assert.equal(result.cart.revision, before.cart.revision + 1);
    for (const key of ["pendingRequests", "checkoutBindings", "paymentRecoveries", "lastOrderResult"]) {
      assert.deepEqual(f.saved()[key], before[key]);
    }
    assert.equal(f.writes(), 1); await prepared.complete(scope); assert.equal(f.writes(), 1);
    await assert.rejects(prepared.complete(scope === "session" ? "local" : "session"), code("INVALID_DATA"));
  });
}

test("scope alone without the confirmed anonymous auth transition cannot clear a cart", async () => {
  const f = setup(), before = f.bytes(), prepared = await f.bridge.prepareLogout();
  await assert.rejects(prepared.complete("session"), code("OWNER_MISMATCH"));
  assert.equal(f.bytes(), before);
});

for (const next of [identity("B"), identity("A", OTHER_BINDING), identity(null)]) {
  test(`late logout rejects newer auth generation (${next.status}/${next.user?.id ?? "none"})`, async () => {
    const f = setup(), before = f.bytes(), prepared = await f.bridge.prepareLogout();
    f.set(identity(null)); f.set(next);
    await assert.rejects(prepared.complete("local"), code("OWNER_MISMATCH"));
    assert.equal(f.bytes(), before);
  });
}

test("auth change while cleanup is queued and a newer cart revision both prevent clearing", async () => {
  const queued = setup(), before = queued.bytes(), p = await queued.bridge.prepareLogout();
  queued.set(identity(null)); queued.onLock(() => queued.set(identity("B")));
  await assert.rejects(p.complete("session"), code("OWNER_MISMATCH")); assert.equal(queued.bytes(), before);
  const edited = setup(), p2 = await edited.bridge.prepareLogout();
  await edited.storage.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", () => true);
  const newer = edited.bytes(); edited.set(identity(null));
  await assert.rejects(p2.complete("session"), code("CART_CHANGED")); assert.equal(edited.bytes(), newer);
});

test("invalid scope or failed durable cleanup cannot report successful cart deletion", async () => {
  const f = setup(), before = f.bytes(), p = await f.bridge.prepareLogout();
  await assert.rejects(p.complete("unexpected"), code("INVALID_DATA"));
  f.set(identity(null)); f.failWrite();
  await assert.rejects(p.complete("session"), code("STORAGE_UNAVAILABLE")); assert.equal(f.bytes(), before);
});

test("guest local logout follows auth's unchanged generation and is safe for an empty cart", async () => {
  const f = setup(createEmptyCartEnvelopeV2(), identity(null)), before = f.bytes();
  const p = await f.bridge.prepareLogout();
  await p.complete("local"); assert.equal(f.bytes(), before); assert.equal(f.writes(), 0);
});

test("v1 and corrupt data are retained; bridge never migrates or resets them", async () => {
  for (const raw of [encodeCartEnvelope(createEmptyCartEnvelope()), "{", '{"schemaVersion":3}']) {
    const f = setup(raw), before = f.bytes();
    await assert.rejects(f.bridge.read());
    await assert.rejects(f.bridge.mutate({ type: "ADD_ITEM", item: draft }));
    await assert.rejects(f.bridge.prepareLogout());
    assert.equal(f.bytes(), before); assert.equal(f.writes(), 0);
  }
});

test("prototype-like opaque owner IDs remain own entries and never expose other owners", async () => {
  const ownerId = "__proto__", f = setup(records(envelope(ownerId), ownerId), identity(ownerId));
  const view = await f.bridge.read();
  assert.equal(view.pending.ownerId, ownerId); assert.equal(view.binding.ownerId, ownerId);
  assert.equal(view.recoveries[0].ownerId, ownerId);
  f.set(identity("toString"));
  const other = await f.bridge.read();
  assert.equal(other.pending, null); assert.equal(other.binding, null); assert.deepEqual(other.recoveries, []);
});

for (const scope of ["session", "local"]) {
  test(`real auth coordinator ${scope} logout invokes bridge cleanup after its own verification`, async () => {
    const f = setup(records(envelope())), calls = [];
    let loggedOut = false;
    const auth = createAuthSession({
      async me() { calls.push("me"); assert.equal(f.held(), false);
        if (loggedOut) throw new AuthApiError("AUTH_REQUIRED", "");
        return { user: identity().user, binding: BINDING, expiresAt: TIME }; },
      async logout(binding) { calls.push("logout"); assert.equal(binding, BINDING); assert.equal(f.held(), false);
        loggedOut = true; return scope; },
      async login() { throw Error("unused"); }, async register() { throw Error("unused"); },
    });
    await auth.refresh();
    const bridge = createCartSessionBridgeV2(f.storage, auth);
    auth.prepareSignOut(() => bridge.prepareLogout());
    assert.equal(await auth.logout(), scope);
    assert.equal(auth.getSnapshot().status, "anonymous"); assert.equal(f.saved().cart.items.length, 0);
    assert.ok(f.saved().paymentRecoveries.A[KEY]); assert.deepEqual(calls, ["me", "logout", "me"]);
  });
}

test("auth's late logout with a new cookie session cancels preparation and preserves bytes", async () => {
  const f = setup(records(envelope())), before = f.bytes(); let loggedOut = false;
  const auth = createAuthSession({
    async me() { const value = loggedOut ? identity("B", OTHER_BINDING) : identity();
      return { user: value.user, binding: value.binding, expiresAt: TIME }; },
    async logout() { loggedOut = true; return "session"; },
    async login() { throw Error("unused"); }, async register() { throw Error("unused"); },
  });
  await auth.refresh(); const bridge = createCartSessionBridgeV2(f.storage, auth);
  auth.prepareSignOut(() => bridge.prepareLogout());
  await assert.rejects(auth.logout(), error => error instanceof ConfirmedLogoutError && error.reason === "session-changed");
  assert.equal(auth.getSnapshot().user.id, "B"); assert.equal(f.bytes(), before);
});
