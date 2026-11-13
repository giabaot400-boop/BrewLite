import test from "node:test";
import assert from "node:assert/strict";
import { createCartOrderRestoreV2, savedCheckoutOrderIdV2 } from "./cart-order-restore-v2.ts";
import { createCheckoutFixture } from "./preview/checkout-fixture.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createCartStorage } from "./cart-storage.ts";
import { checkoutUiState } from "./cart-checkout-ui.ts";

const KEY = "00000000-0000-4000-8000-000000000099";
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const code = expected => error => error.code === expected;

async function fixture() {
  const f = createCheckoutFixture({ delayMs: 0 }), env = f.environment;
  const original = await env.storage.readV2();
  const created = await env.checkout.submit(env.checkout.review(original.cart));
  let raw = encodeCartEnvelopeV2(await env.storage.readV2()), snapshot = env.auth.getSnapshot(), version = 1, held = false;
  let order = created.order, beforeRead = null, writes = 0, verifyResult = { user: snapshot.user, binding: snapshot.binding };
  const calls = [];
  const storage = createCartStorage({ locks: { async request(_name, _options, work) {
    held = true; try { return work(); } finally { held = false; }
  } }, storage: { getItem() { assert.equal(held, true); return raw; }, setItem(_key, next) { assert.equal(held, true); writes++; raw = next; } } });
  const auth = { getSnapshot: () => snapshot, getSessionVersion: () => version };
  const restore = createCartOrderRestoreV2({ auth, storage,
    sessionClient: { async me() { assert.equal(held, false); calls.push("ME"); return verifyResult; } },
    async readOrder(input) {
      assert.equal(held, false); calls.push({ method: "GET", ...input });
      if (beforeRead) await beforeRead(input);
      return { session: input.session, order };
    } });
  return { restore, auth, calls, created, writes: () => writes, bytes: () => raw, saved: () => JSON.parse(raw),
    setSaved(value) { raw = encodeCartEnvelopeV2(value); }, setOrder(value) { order = value; },
    beforeRead(work) { beforeRead = work; },
    changeSession(value, nextVersion = 2) { snapshot = value; version = nextVersion; },
    verifyAs(value) { verifyResult = value; } };
}

test("new controller/page restores a bound PENDING from storage and GET without a key or POST", async () => {
  const f = await fixture(), before = f.bytes();
  const result = await f.restore();
  assert.equal(result.order.id, f.created.order.id); assert.equal(result.order.status, "PENDING");
  assert.deepEqual(f.calls.map(item => typeof item === "string" ? item : item.method), ["ME", "GET"]);
  assert.equal(f.bytes(), before); assert.equal(f.writes(), 0);
});

test("no saved target performs no authentication HTTP, GET, storage write or mutation", async () => {
  const f = await fixture(), value = createEmptyCartEnvelopeV2(); value.cart.ownerId = f.auth.getSnapshot().user.id;
  f.setSaved(value); const before = f.bytes();
  assert.equal(await f.restore(), null); assert.equal(f.calls.length, 0); assert.equal(f.bytes(), before);
});

for (const status of ["PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"]) {
  test(`restore validates current ${status} and applies only the existing matching binding`, async () => {
    const f = await fixture(), owner = f.auth.getSnapshot().user.id, value = f.saved();
    const paid = ["PAID", "PREPARING", "READY", "COMPLETED"].includes(status);
    f.setOrder({ ...f.created.order, version: 2, status, paidAt: paid ? f.created.order.serverTime : null,
      canPay: status === "PAYMENT_FAILED", canCancel: ["PAYMENT_FAILED", "PAID"].includes(status) });
    const result = await f.restore(); assert.equal(result.order.status, status);
    const saved = f.saved();
    assert.equal(saved.cart.items.length, paid ? 0 : value.cart.items.length);
    assert.equal(!!saved.checkoutBindings[owner], status === "PAYMENT_FAILED");
    assert.equal(saved.lastOrderResult.order.status, "PENDING", "creation acknowledgement remains historical");
  });
}

test("terminal GET never resolves an unidentified payment, even when it clears the matching paid cart", async () => {
  const f = await fixture(), value = f.saved(), owner = f.auth.getSnapshot().user.id;
  value.paymentRecoveries[owner] = { [KEY]: { ownerId: owner, requestKey: KEY,
    body: { orderId: f.created.order.id, method: "CARD" }, createdAt: f.created.order.serverTime,
    paymentId: null, recoveryStatus: "UNRESOLVED" } };
  f.setSaved(value); f.setOrder({ ...f.created.order, version: 1, status: "PAID", paidAt: f.created.order.serverTime, canPay: false });
  await f.restore();
  assert.equal(f.saved().cart.items.length, 0); assert.equal(f.saved().paymentRecoveries[owner][KEY].recoveryStatus, "UNRESOLVED");
  assert.equal(f.saved().paymentRecoveries[owner][KEY].paymentId, null);
});

test("a newer cart is never cleared by an old bound order", async () => {
  const f = await fixture(), value = f.saved(); value.cart.revision++; value.cart.items[0].qty++;
  f.setSaved(value); f.setOrder({ ...f.created.order, version: 1, status: "PAID", paidAt: f.created.order.serverTime, canPay: false });
  await f.restore(); assert.deepEqual(f.saved().cart, value.cart);
});

test("another owner's saved result and recovery are never selected", async () => {
  const f = await fixture(), value = f.saved();
  assert.equal(savedCheckoutOrderIdV2(value, "someone-else"), null);
  value.checkoutBindings = {}; value.lastOrderResult = null;
  value.paymentRecoveries.other = { [KEY]: { body: { orderId: "other-order" }, recoveryStatus: "UNRESOLVED" } };
  assert.equal(savedCheckoutOrderIdV2(value, f.auth.getSnapshot().user.id), null);
});

test("an uncertain new create does not restore an unrelated older order", async () => {
  const f = await fixture(), value = f.saved(), owner = f.auth.getSnapshot().user.id;
  value.checkoutBindings = {};
  value.pendingRequests[owner] = { requestKey: KEY };
  assert.equal(savedCheckoutOrderIdV2(value, owner), null);
  value.lastOrderResult.requestKey = KEY;
  assert.equal(savedCheckoutOrderIdV2(value, owner), f.created.order.id);
  const ui = checkoutUiState(value, owner, f.created.order);
  assert.equal(ui.canPay, false); assert.equal(ui.canCancel, false);
});

test("an unresolved recovery locates its original order after logout cleared the binding cart", async () => {
  const f = await fixture(), value = f.saved(), owner = f.auth.getSnapshot().user.id;
  value.checkoutBindings = {}; value.cart.items = [];
  value.paymentRecoveries[owner] = { [KEY]: { ownerId: owner, requestKey: KEY,
    body: { orderId: f.created.order.id, method: "WALLET" }, createdAt: f.created.order.serverTime,
    paymentId: null, recoveryStatus: "UNRESOLVED" } };
  value.lastOrderResult = null; f.setSaved(value);
  assert.equal((await f.restore()).order.id, f.created.order.id);
  assert.deepEqual(f.saved(), value);
});

test("fresh server owner/binding mismatch prevents GET and preserves storage", async () => {
  const f = await fixture(), before = f.bytes();
  f.verifyAs({ user: { id: "B" }, binding: "b".repeat(64) });
  await assert.rejects(f.restore(), code("OWNER_MISMATCH"));
  assert.deepEqual(f.calls, ["ME"]); assert.equal(f.bytes(), before);
});

for (const sameOwner of [false, true]) {
  test(`late GET after ${sameOwner ? "same-owner new login" : "account switch"} never publishes or changes storage`, async () => {
    const f = await fixture(), gate = deferred(), before = f.bytes();
    f.beforeRead(() => gate.promise); const reading = f.restore();
    await new Promise(resolve => setImmediate(resolve));
    f.changeSession({ ...f.auth.getSnapshot(), user: { id: sameOwner ? f.auth.getSnapshot().user.id : "B" }, binding: "b".repeat(64) });
    gate.resolve(); await assert.rejects(reading, code("OWNER_MISMATCH")); assert.equal(f.bytes(), before);
  });
}

for (const invalid of ["wrong-id", "older-version", "malformed"]) {
  test(`restore rejects ${invalid} without releasing or clearing anything`, async () => {
    const f = await fixture(), value = f.saved(), owner = f.auth.getSnapshot().user.id;
    if (invalid === "older-version") { value.checkoutBindings[owner].orderVersion = 3; f.setSaved(value); }
    f.setOrder(invalid === "wrong-id" ? { ...f.created.order, id: "other" }
      : invalid === "malformed" ? { ...f.created.order, paidAt: "bad-date" } : f.created.order);
    const before = f.bytes(); await assert.rejects(f.restore(), code("INVALID_DATA")); assert.equal(f.bytes(), before);
  });
}

test("GET failure keeps the saved order available for a later explicit read", async () => {
  const f = await fixture(), before = f.bytes(); f.beforeRead(() => { throw Error("network"); });
  await assert.rejects(f.restore(), /network/); assert.equal(f.bytes(), before);
  f.beforeRead(null); assert.equal((await f.restore()).order.id, f.created.order.id);
});

test("a different saved target appearing during GET invalidates the old response", async () => {
  const f = await fixture(); f.beforeRead(() => { const next = f.saved();
    next.checkoutBindings[f.auth.getSnapshot().user.id].orderId = "new-order"; f.setSaved(next); });
  await assert.rejects(f.restore(), code("OWNER_MISMATCH"));
  assert.equal(f.saved().checkoutBindings[f.auth.getSnapshot().user.id].orderId, "new-order"); assert.equal(f.writes(), 0);
});

test("aborted restore does not perform HTTP or settle a late response", async () => {
  const f = await fixture(), abort = new AbortController(), before = f.bytes(); abort.abort();
  await assert.rejects(f.restore(abort.signal), error => error.name === "AbortError"); assert.equal(f.calls.length, 0);
  const late = new AbortController(); f.beforeRead(() => late.abort());
  await assert.rejects(f.restore(late.signal), error => error.name === "AbortError"); assert.equal(f.bytes(), before);
});
