import test from "node:test";
import assert from "node:assert/strict";
import { createCartControllerV2, cartControllerViewV2, INITIAL_CART_SNAPSHOT_V2 } from "./cart-controller-v2.ts";
import { createAuthSession, ConfirmedLogoutError } from "../auth/auth-session.ts";
import { AuthApiError } from "../auth/auth-error.ts";
import { createCartStorage, CART_STORAGE_KEY, CART_LOCK_NAME } from "./cart-storage.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createEmptyCartEnvelope, encodeCartEnvelope } from "./cart-envelope.ts";
import { cartReducer, getCartLineKey } from "./cart-reducer.ts";
import { logoutDialogLines } from "../auth/components/logout-dialog-copy.ts";

const TIME = "2026-11-08T13:00:00.000Z", KEY = "00000000-0000-4000-8000-000000000001";
const BINDING = "a".repeat(64), BINDING_B = "b".repeat(64);
const draft = { productId: "coffee", productName: "Coffee", size: "M", imageUrl: "/coffee.svg",
  toppingIds: [], toppingNames: {}, previewUnitPrice: 50000 };
const code = expected => error => error.code === expected;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const session = (owner = "A", binding = BINDING) => ({ user: { id: owner, email: `${owner}@example.test` }, binding, expiresAt: TIME });
function envelope(ownerId = "A") {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart, ownerId };
  return value;
}
function records() {
  const value = envelope(), cartSnapshot = value.cart;
  value.pendingRequests = { A: { ownerId: "A", requestKey: KEY, cartSnapshot, cartRevision: cartSnapshot.revision,
    createdAt: TIME, phase: "SUBMITTING", payload: { items: [{ productId: "coffee", size: "M", toppingIds: [], qty: 1, expectedUnitPrice: 50000 }] } } };
  value.checkoutBindings = { A: { ownerId: "A", orderId: "order-A", cartSnapshot, cartRevision: cartSnapshot.revision, orderVersion: 0, boundAt: TIME } };
  value.paymentRecoveries = { A: { [KEY]: { ownerId: "A", requestKey: KEY, body: { orderId: "order-A", method: "CARD" },
    createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } } };
  return value;
}

async function setup(value = envelope(), ownerId = "A", loading = false) {
  const memory = { raw: typeof value === "string" || value === null ? value : encodeCartEnvelopeV2(value), reads: 0, writes: 0, failWrite: false };
  const calls = { me: 0, logout: 0, registrations: 0 };
  let held = false, tail = Promise.resolve(), gate = null, cookie = ownerId === null ? null : session(ownerId);
  const meQueue = [], logoutQueue = [];
  const storage = createCartStorage({ locks: { request(name, options, callback) {
    assert.equal(name, CART_LOCK_NAME);
    const waiting = gate; gate = null;
    const task = tail.then(async () => {
      if (waiting) await waiting.promise;
      options.signal.throwIfAborted(); held = true;
      try { return callback(); } finally { held = false; }
    });
    tail = task.catch(() => {}); return task;
  } }, storage: {
    getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true); memory.reads++; return memory.raw; },
    setItem(key, raw) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true);
      if (memory.failWrite) throw Error("quota"); memory.raw = raw; memory.writes++; },
  } });
  const auth = createAuthSession({
    async me() { assert.equal(held, false); calls.me++;
      if (meQueue.length) return meQueue.shift()();
      if (!cookie) throw new AuthApiError("AUTH_REQUIRED", ""); return cookie; },
    async login() { if (!cookie) throw Error("No login fixture"); return cookie; },
    async register() { throw Error("unused"); },
    async logout() { assert.equal(held, false); calls.logout++;
      if (logoutQueue.length) return logoutQueue.shift()(); cookie = null; return "session"; },
  });
  if (!loading) await auth.refresh();
  function tracked(register) { return (...args) => {
    calls.registrations++; const cleanup = register(...args); let active = true;
    return () => { if (active) { active = false; calls.registrations--; cleanup(); } };
  }; }
  const port = { ...auth, subscribe: tracked(auth.subscribe), prepareSignOut: tracked(auth.prepareSignOut),
    setLogoutInfoSource: tracked(auth.setLogoutInfoSource) };
  const controller = createCartControllerV2({ auth: port, storage });
  return { auth, port, controller, storage, memory, calls, meQueue, logoutQueue,
    view: () => controller.getView(), saved: () => JSON.parse(memory.raw),
    async start() { const stop = controller.start(); await flush(); return stop; },
    async login(owner, binding = owner === "A" ? BINDING : BINDING_B) { cookie = session(owner, binding); await auth.login({}); },
    setCookie(next) { cookie = next; },
    hold() { gate = deferred(); return gate; } };
}

test("construction and server snapshot do not read browser storage or register callbacks", async () => {
  const f = await setup();
  assert.equal(f.controller.getSnapshot(), INITIAL_CART_SNAPSHOT_V2);
  assert.equal(f.controller.getSnapshot(), f.controller.getSnapshot());
  assert.equal(f.memory.reads, 0); assert.equal(f.calls.registrations, 0);
  assert.equal(f.view().canMutate, false); assert.equal(f.view().state.cart, null);
});

test("mount/unmount and Strict Mode restart leave exactly one set of auth/logout registrations", async () => {
  const f = await setup(), stop = await f.start();
  assert.equal(f.calls.registrations, 3); assert.equal(f.view().state.status, "ready");
  stop(); assert.equal(f.calls.registrations, 0);
  const stop2 = await f.start(); stop(); assert.equal(f.calls.registrations, 3);
  stop2(); assert.equal(f.calls.registrations, 0);
});

test("guest hydration is read-only; adding one cup updates quantity through the v2 writer", async () => {
  const f = await setup(null, null), stop = await f.start();
  assert.equal(f.memory.raw, null); assert.equal(f.view().state.cart.items.length, 0);
  assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), true);
  assert.equal(f.view().state.cart.items[0].qty, 1); assert.equal(f.saved().schemaVersion, 2);
  assert.equal(f.calls.logout, 0); stop();
});

test("new verified login adopts guest choices once; same-session refresh leaves revision and bytes unchanged", async () => {
  const f = await setup(envelope(null), null), stop = await f.start();
  await f.login("A"); await flush();
  assert.equal(f.view().state.cart.ownerId, "A"); assert.equal(f.view().state.cart.items.length, 1);
  const before = f.memory.raw; await f.controller.reload();
  assert.equal(f.memory.raw, before); assert.equal(f.memory.writes, 1); stop();
});

test("account switch hides the previous cart immediately and only then adopts the new owner", async () => {
  const f = await setup(records()), stop = await f.start(), old = f.controller.getSnapshot();
  await f.login("B");
  const hidden = cartControllerViewV2(old, f.auth);
  assert.equal(hidden.state.cart, null); assert.equal(hidden.records, null); assert.equal(hidden.canMutate, false);
  await flush();
  assert.equal(f.view().state.cart.ownerId, "B"); assert.equal(f.view().state.cart.items.length, 0);
  assert.equal(f.view().records.pending, null); assert.deepEqual(f.view().records.recoveries, []);
  assert.ok(f.saved().pendingRequests.A); assert.ok(f.saved().paymentRecoveries.A[KEY]); stop();
});

test("same owner new login invalidates a captured provider view, including with the same binding", async () => {
  const f = await setup(), stop = await f.start(), old = f.controller.getSnapshot();
  await f.login("A");
  assert.equal(cartControllerViewV2(old, f.auth).records, null);
  await flush(); assert.equal(f.view().state.cart.ownerId, "A"); stop();
});

test("unverified/loading auth never exposes owned cart or allows a write", async () => {
  const f = await setup(envelope(), "A", true), stop = await f.start(), before = f.memory.raw;
  assert.equal(f.view().state.status, "restoring"); assert.equal(f.view().records, null);
  assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), false);
  assert.equal(f.memory.raw, before); assert.equal(f.memory.reads, 0);
  await f.auth.refresh(); await flush(); assert.equal(f.view().state.status, "ready"); stop();
});

test("refresh invalidates editing synchronously; an older /me cannot publish while a newer verification waits", async () => {
  const f = await setup(), stop = await f.start(), first = deferred(), second = deferred();
  f.meQueue.push(() => first.promise, () => second.promise);
  const a = f.controller.reload(), b = f.controller.reload();
  assert.equal(f.view().canMutate, false); assert.equal(f.auth.getLogoutInfo(), null);
  assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), false);
  first.resolve(session()); await a;
  assert.equal(f.view().state.status, "restoring"); assert.equal(f.view().state.cart, null);
  second.resolve(session("B", BINDING_B)); await b;
  assert.equal(f.view().state.cart.ownerId, "B"); assert.equal(f.view().state.cart.items.length, 0); stop();
});

test("refresh reads current stored bytes from another tab without synthesizing an order/payment request", async () => {
  const f = await setup(), stop = await f.start();
  await f.storage.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", () => true);
  assert.equal(f.view().state.cart.items[0].qty, 1);
  await f.controller.reload(); assert.equal(f.view().state.cart.items[0].qty, 2);
  assert.equal(f.calls.logout, 0); stop();
});

test("a newer read while saving stays busy and cannot undo or misreport a successful durable edit", async () => {
  const f = await setup(), stop = await f.start(), gate = f.hold();
  const saving = f.controller.mutate({ type: "ADD_ITEM", item: draft });
  assert.equal(f.view().state.isSaving, true); assert.equal(f.auth.getLogoutInfo(), null);
  const read = f.controller.read();
  assert.equal(f.view().state.isSaving, true); assert.equal(f.view().canMutate, false);
  gate.resolve(); assert.equal(await saving, true); await read;
  assert.equal(f.view().state.cart.items[0].qty, 2); assert.equal(f.view().state.isSaving, false);
  assert.equal(f.view().canMutate, true); stop();
});

test("logout cannot start while a cart edit is queued", async () => {
  const f = await setup(), stop = await f.start(), gate = f.hold();
  const saving = f.controller.mutate({ type: "ADD_ITEM", item: draft });
  await assert.rejects(f.auth.logout(), code("CART_CHANGED"));
  assert.equal(f.calls.logout, 0); gate.resolve(); await saving; stop();
});

test("account change while an edit waits for its lock prevents writing or publishing old-owner data", async () => {
  const f = await setup(), stop = await f.start(), gate = f.hold(), before = f.memory.raw;
  const saving = f.controller.mutate({ type: "ADD_ITEM", item: draft });
  await f.login("A", BINDING_B); gate.resolve();
  assert.equal(await saving, false); await flush();
  assert.equal(f.memory.raw, before); assert.equal(f.view().state.cart.items[0].qty, 1); stop();
});

for (const kind of ["pendingRequests", "checkoutBindings", "paymentRecoveries"]) {
  test(`${kind} locks product edits and supplies truthful logout information`, async () => {
    const source = records(), value = envelope(); value[kind] = source[kind];
    const f = await setup(value), stop = await f.start(), before = f.memory.raw;
    assert.equal(f.view().canMutate, false);
    assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), false);
    assert.equal(f.memory.raw, before);
    const info = f.auth.getLogoutInfo();
    assert.equal(info.hasPendingOrder, kind === "pendingRequests");
    assert.equal(info.hasCheckoutOrder, kind === "checkoutBindings");
    assert.equal(info.hasUnresolvedPayment, kind === "paymentRecoveries");
    const copy = logoutDialogLines(info).join(" ");
    assert.match(copy, kind === "pendingRequests" ? /Lần đặt gần nhất/ : kind === "checkoutBindings" ? /Đơn đã tạo/ : /Lần thanh toán chưa rõ/);
    stop();
  });
}

test("confirmed logout clears only active cart, retains all records and publishes the guest view", async () => {
  const f = await setup(records()), stop = await f.start(), before = f.saved();
  assert.equal(await f.auth.logout(), "session"); await flush();
  assert.equal(f.view().state.cart.ownerId, null); assert.equal(f.view().state.cart.items.length, 0);
  assert.equal(f.view().records.pending, null); assert.equal(f.view().records.binding, null);
  assert.deepEqual(f.view().records.recoveries, []);
  for (const key of ["pendingRequests", "checkoutBindings", "paymentRecoveries"]) assert.deepEqual(f.saved()[key], before[key]);
  stop();
});

test("logout feedback arriving after login B cannot erase B's new cart or A's recovery", async () => {
  const f = await setup(records()), stop = await f.start(), response = deferred();
  f.logoutQueue.push(() => response.promise);
  const loggingOut = f.auth.logout(); await flush();
  assert.equal(f.view().canMutate, false);
  await f.login("B"); response.resolve("session");
  await assert.rejects(loggingOut, error => error instanceof ConfirmedLogoutError && error.reason === "session-changed");
  await flush();
  assert.equal(f.view().state.cart.ownerId, "B"); assert.equal(f.auth.getSnapshot().user.id, "B");
  assert.ok(f.saved().paymentRecoveries.A[KEY]); stop();
});

test("ordinary logout failure releases busy state without claiming cleanup or dropping choices", async () => {
  const f = await setup(), stop = await f.start(), before = f.memory.raw;
  f.logoutQueue.push(async () => { throw new AuthApiError("NETWORK_ERROR", "offline"); });
  await assert.rejects(f.auth.logout(), code("NETWORK_ERROR")); await flush();
  assert.equal(f.memory.raw, before); assert.equal(f.view().state.isSaving, false);
  assert.equal(f.view().canMutate, true); stop();
});

test("quota failure hides unconfirmed totals and reload can recover without clearing stored data", async () => {
  const f = await setup(), stop = await f.start(), before = f.memory.raw;
  f.memory.failWrite = true;
  assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), false);
  assert.equal(f.view().state.status, "error"); assert.equal(f.view().state.cart, null); assert.equal(f.memory.raw, before);
  f.memory.failWrite = false; await f.controller.reload();
  assert.equal(f.view().state.cart.items[0].qty, 1); stop();
});

test("business rejection retains the validated cart and next valid edit clears its message", async () => {
  const value = envelope(); value.cart.items[0].qty = 20;
  const f = await setup(value), stop = await f.start(), lineKey = getCartLineKey(value.cart.items[0]);
  assert.equal(await f.controller.mutate({ type: "INCREMENT", lineKey }), false);
  assert.equal(f.view().state.status, "ready"); assert.equal(f.view().state.cart.items[0].qty, 20);
  assert.ok(f.view().state.message);
  assert.equal(await f.controller.mutate({ type: "DECREMENT", lineKey }), true);
  assert.equal(f.view().state.message, null); stop();
});

test("v1/corrupt storage is never implicitly migrated or reset by the prepared provider controller", async () => {
  for (const raw of [encodeCartEnvelope(createEmptyCartEnvelope()), "{", '{"schemaVersion":3}']) {
    const f = await setup(raw), stop = await f.start();
    assert.equal(f.view().state.status, "error"); assert.equal(f.view().state.cart, null);
    assert.equal(f.memory.raw, raw); assert.equal(f.memory.writes, 0); stop();
  }
});

test("late refresh after unmount cannot publish or leave auth/logout callbacks registered", async () => {
  const f = await setup(), stop = await f.start(), waiting = deferred();
  f.meQueue.push(() => waiting.promise);
  const task = f.controller.reload(); stop(); const frozen = f.controller.getSnapshot();
  waiting.resolve(session("B", BINDING_B)); await task; await flush();
  assert.equal(f.controller.getSnapshot(), frozen); assert.equal(f.calls.registrations, 0);
  assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), false);
});

test("repeated refresh reads do not generate writes for an unchanged owner/cart", async () => {
  const f = await setup(), stop = await f.start(), before = f.memory.raw;
  await Promise.all([f.controller.reload(), f.controller.reload(), f.controller.reload()]);
  assert.equal(f.memory.raw, before); assert.equal(f.memory.writes, 0); assert.equal(f.view().canMutate, true); stop();
});
