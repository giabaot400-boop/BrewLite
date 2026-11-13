import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { applyCartPaymentV2 } from "./cart-payment-recovery-v2.ts";
import { applyCartOrderBindingV2 } from "./cart-order-binding-v2.ts";
import { cartReducer } from "./cart-reducer.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";
const KEY = "00000000-0000-4000-8000-000000000001";
const KEY2 = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-11-07T13:00:00.000Z", LATER = "2026-11-07T13:00:01.000Z", READ = "2026-11-07T13:00:02.000Z";
const current = () => true;
const code = expected => error => error instanceof CartStorageError && error.code === expected;
function fixture(ownerId = "A") {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: {
    productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M", toppingIds: [], toppingNames: {}, previewUnitPrice: 50000,
  } }).cart, ownerId };
  value.checkoutBindings = { [ownerId]: { ownerId, orderId: "order-a", cartRevision: value.cart.revision,
    cartSnapshot: structuredClone(value.cart), orderVersion: 0, boundAt: TIME } };
  return value;
}
const order = (changes = {}) => ({ id: "order-a", version: 0, status: "PENDING", total: 50000,
  paymentDeadline: "2026-11-07T13:15:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: TIME, ...changes });
const begin = (changes = {}) => ({ type: "BEGIN_PAYMENT", ownerId: "A", requestKey: KEY, body: { orderId: "order-a", method: "WALLET" },
  createdAt: TIME, order: order(), ...changes });
function prepared(value = fixture(), command = begin()) { return applyCartPaymentV2(value, command).envelope; }
const payment = (changes = {}) => ({ id: "payment-k1", version: 0, orderId: "order-a", method: "WALLET", amount: 50000,
  status: "SUCCEEDED", failureCode: null, createdAt: TIME, resolvedAt: LATER, refundedAmount: 0, refundedAt: null, serverTime: LATER, ...changes });
const paid = (changes = {}) => order({ version: 1, status: "PAID", paidAt: LATER, canPay: false, serverTime: READ, ...changes });
const failed = (changes = {}) => payment({ status: "FAILED", failureCode: "PAYMENT_DECLINED", ...changes });
const failedOrder = (changes = {}) => order({ version: 1, status: "PAYMENT_FAILED", serverTime: READ, ...changes });
function settle(value, changes = {}) {
  return { type: "SETTLE_PAYMENT", ownerId: "A", requestKey: KEY, expectedRecovery: structuredClone(value.paymentRecoveries.A[KEY]),
    expectedBinding: structuredClone(value.checkoutBindings.A ?? null), reply: { status: 200, body: payment() }, order: paid(), ...changes };
}
class Locks {
  held = false; tail = Promise.resolve();
  request(name, options, action) {
    assert.equal(name, CART_LOCK_NAME); assert.equal(options.mode, "exclusive");
    const result = this.tail.then(() => { options.signal.throwIfAborted(); this.held = true;
      try { return action(); } finally { this.held = false; } });
    this.tail = result.catch(() => {}); return result;
  }
}
function setup(value = fixture()) {
  const locks = new Locks(), memory = { raw: typeof value === "string" ? value : encodeCartEnvelopeV2(value), writes: 0, failWrite: false };
  const storage = { getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true); return memory.raw; },
    setItem(key, raw) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      if (memory.failWrite) throw new Error("quota"); memory.raw = raw; memory.writes++; } };
  return { service: createCartStorage({ storage, locks }), memory, locks, storage };
}

test("WALLET/CARD confirmation durably saves exact minimal recovery before returning outside the lock", async () => {
  for (const method of ["WALLET", "CARD"]) {
    const value = fixture(), { service, memory, locks } = setup(value);
    const result = await service.applyPaymentLifecycleV2(begin({ body: { orderId: "order-a", method } }), current);
    assert.equal(result.outcome, "PREPARED"); assert.equal(memory.writes, 1); assert.equal(locks.held, false);
    const stored = JSON.parse(memory.raw).paymentRecoveries.A[KEY];
    assert.deepEqual(stored, { ownerId: "A", requestKey: KEY, body: { orderId: "order-a", method }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" });
    assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.binding, value.checkoutBindings.A);
    result.request.body.method = "changed";
    assert.equal(JSON.parse(memory.raw).paymentRecoveries.A[KEY].body.method, method);
    assert.equal(result.envelope.paymentRecoveries.A[KEY].body.method, method);
  }
});

test("opaque owner/order IDs and reversed body property order are preserved exactly on retry", () => {
  const ownerId = " A%2F ", orderId = " order%2F ", value = fixture(ownerId); value.checkoutBindings[ownerId].orderId = orderId;
  const envelope = prepared(value, begin({ ownerId, body: { method: "CARD", orderId }, order: order({ id: orderId }) }));
  const result = applyCartPaymentV2(envelope, { type: "RETRY_PAYMENT", ownerId, requestKey: KEY });
  assert.equal(result.request.ownerId, ownerId); assert.equal(result.request.body.orderId, orderId);
  assert.equal(JSON.stringify(result.request.body), JSON.stringify({ method: "CARD", orderId }));
});

test("a fresh payment needs current owner, a payable policy-2 order and a non-stale observed version", () => {
  for (const [changes, expected] of [[{ ownerId: "B" }, "OWNER_MISMATCH"],
    [{ order: order({ canPay: false }) }, "INVALID_DATA"], [{ order: order({ paymentDeadline: null, canPay: false, canCancel: false }) }, "INVALID_DATA"],
    [{ order: paid() }, "INVALID_DATA"], [{ order: order({ id: "other" }) }, "INVALID_DATA"],
    [{ order: order({ serverTime: "2026-11-07T13:15:00.000Z" }) }, "INVALID_DATA"]]) {
    assert.throws(() => applyCartPaymentV2(fixture(), begin(changes)), code(expected));
  }
  const value = fixture(); value.checkoutBindings.A.orderVersion = 3;
  assert.throws(() => applyCartPaymentV2(value, begin()), code("CART_CHANGED"));
});

test("invalid keys, timestamps, methods, body extras or oversized UTF-8 body never yield a sendable payment", async () => {
  for (const changes of [{ requestKey: "bad" }, { createdAt: "bad" }, { body: { orderId: "order-a", method: "CASH" } },
    { body: { orderId: "order-a", method: "CARD", amount: 1 } }, { body: { orderId: "☕".repeat(2000), method: "CARD" }, order: order({ id: "☕".repeat(2000) }) }]) {
    const { service, memory } = setup(); const raw = memory.raw;
    await assert.rejects(service.applyPaymentLifecycleV2(begin(changes), current), code("INVALID_DATA"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("one unresolved owner payment blocks a fresh key, method or order", async () => {
  const value = prepared(), { service, memory } = setup(value); const raw = memory.raw;
  for (const changes of [{ requestKey: KEY2 }, { requestKey: KEY2, body: { orderId: "order-a", method: "CARD" } },
    { requestKey: KEY2, body: { orderId: "other", method: "CARD" }, order: order({ id: "other" }) }]) {
    await assert.rejects(service.applyPaymentLifecycleV2(begin(changes), current), code("PENDING_REQUEST"));
  }
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("a not-yet-reconciled order creation also blocks fresh payment", () => {
  const value = fixture(); value.pendingRequests.A = { ownerId: "A", requestKey: KEY2, cartRevision: value.cart.revision,
    cartSnapshot: structuredClone(value.cart), payload: { items: [{ productId: "coffee", size: "M", toppingIds: [], qty: 1, expectedUnitPrice: 50000 }] }, phase: "UNKNOWN", createdAt: TIME };
  assert.throws(() => applyCartPaymentV2(value, begin()), code("PENDING_REQUEST"));
});

test("two tab confirmations save only one payment key under the shared lock", async () => {
  const { service, storage, locks, memory } = setup(), other = createCartStorage({ storage, locks });
  const results = await Promise.allSettled([service.applyPaymentLifecycleV2(begin(), current), other.applyPaymentLifecycleV2(begin({ requestKey: KEY2 }), current)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "PENDING_REQUEST"); assert.equal(memory.writes, 1);
});

test("reload and explicit retry keep original key/body/time without a new write or deadline recheck", async () => {
  const value = prepared(), { service, memory, locks } = setup(value), raw = memory.raw;
  const read = await service.readV2(); assert.deepEqual(read.paymentRecoveries.A[KEY], value.paymentRecoveries.A[KEY]);
  const result = await service.applyPaymentLifecycleV2({ type: "RETRY_PAYMENT", ownerId: "A", requestKey: KEY }, current);
  assert.deepEqual(result.request, value.paymentRecoveries.A[KEY]); assert.equal(memory.raw, raw); assert.equal(memory.writes, 0); assert.equal(locks.held, false);
});

test("retry after logout and return uses old payment despite a cleared current cart", async () => {
  const value = prepared(), { service } = setup(value), checkpoint = cart => ({ ownerId: cart.ownerId, revision: cart.revision });
  const guest = await service.applyOwnerLifecycleV2({ type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: checkpoint(value.cart) }, current);
  await assert.rejects(service.applyPaymentLifecycleV2({ type: "RETRY_PAYMENT", ownerId: "A", requestKey: KEY }, current), code("OWNER_MISMATCH"));
  const returned = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A", expectedCart: checkpoint(guest.cart) }, current);
  assert.deepEqual(returned.cart.items, []);
  const result = await service.applyPaymentLifecycleV2({ type: "RETRY_PAYMENT", ownerId: "A", requestKey: KEY }, current);
  assert.deepEqual(result.request.body, { orderId: "order-a", method: "WALLET" }); assert.equal(result.request.createdAt, TIME);
});

test("unknown owner/key cannot access a recovery or generate a replacement request", () => {
  const value = prepared();
  assert.throws(() => applyCartPaymentV2(value, { type: "RETRY_PAYMENT", ownerId: "B", requestKey: KEY }), code("OWNER_MISMATCH"));
  assert.throws(() => applyCartPaymentV2(value, { type: "RETRY_PAYMENT", ownerId: "A", requestKey: KEY2 }), code("PENDING_NOT_FOUND"));
});

test("network/auth/conflict/schema failures retain unresolved key/body and never report final FAILED", () => {
  for (const reply of [{ status: null, body: null }, { status: 401, body: { error: { code: "SESSION_EXPIRED" } } },
    { status: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } }, { status: 503, body: { error: { code: "TRANSACTION_RETRY_EXHAUSTED" } } },
    { status: 502, body: "html" }, { status: 200, body: {} }, { status: 200, body: { ...failed(), extra: true } }]) {
    const value = prepared(), result = applyCartPaymentV2(value, settle(value, { reply }));
    assert.equal(result.outcome, "UNKNOWN"); assert.equal(result.envelope, value); assert.equal(result.payment, null);
    assert.equal(result.canConfirmNewAttempt, false); assert.deepEqual(result.envelope.cart, value.cart);
  }
});

test("a valid payment response pins its ID but GET failure keeps recovery unresolved and cart intact", async () => {
  const value = prepared(), { service, memory } = setup(value);
  const result = await service.applyPaymentLifecycleV2(settle(value, { order: null }), current);
  assert.equal(result.outcome, "UNKNOWN"); assert.equal(result.payment, null); assert.equal(memory.writes, 1);
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.checkoutBindings, value.checkoutBindings);
  assert.deepEqual(result.envelope.paymentRecoveries.A[KEY], { ...value.paymentRecoveries.A[KEY], paymentId: "payment-k1" });
  await assert.rejects(service.applyPaymentLifecycleV2(begin({ requestKey: KEY2 }), current), code("PENDING_REQUEST"));
});

test("a pinned payment ID cannot be replaced by a different attempt on a subsequent replay", () => {
  let value = prepared(); value = applyCartPaymentV2(value, settle(value, { order: null })).envelope;
  const command = settle(value, { reply: { status: 200, body: payment({ id: "payment-k2" }) } });
  assert.equal(applyCartPaymentV2(value, command).envelope, value);
  assert.equal(value.paymentRecoveries.A[KEY].paymentId, "payment-k1");
});

test("payment reply validates owner-bound body identity, amount, final state, timestamps and refund metadata", () => {
  for (const change of [{ orderId: "other" }, { method: "CARD" }, { amount: "50000" }, { amount: 0 }, { amount: 2147483648 },
    { status: "PENDING" }, { failureCode: "PAYMENT_DECLINED" }, { version: 3 }, { refundedAmount: 1 },
    { createdAt: "bad" }, { resolvedAt: "2026-11-07T12:59:00.000Z" }, { serverTime: TIME },
    { version: 1, refundedAmount: 50000, refundedAt: TIME }]) {
    const value = prepared(), result = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: payment(change) } }));
    assert.equal(result.outcome, "UNKNOWN"); assert.equal(result.envelope, value); assert.equal(result.canConfirmNewAttempt, false);
  }
  const value = prepared();
  assert.equal(applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: failed({ failureCode: null }) } })).outcome, "UNKNOWN");
});

test("a stale/foreign/legacy or inconsistent current Order cannot resolve the payment", () => {
  for (const actual of [paid({ id: "other" }), paid({ total: 50001 }), paid({ version: 0 }), paid({ serverTime: TIME }),
    paid({ paymentDeadline: null, canCancel: false }), order({ version: 1, serverTime: READ }), failedOrder(), { id: "order-a" }]) {
    const value = prepared(), result = applyCartPaymentV2(value, settle(value, { order: actual }));
    assert.equal(result.outcome, "UNKNOWN"); assert.equal(result.envelope.paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED");
    assert.deepEqual(result.envelope.cart, value.cart);
  }
  const value = prepared(); value.checkoutBindings.A.orderVersion = 3;
  assert.equal(applyCartPaymentV2(value, settle(value)).outcome, "UNKNOWN");
});

test("valid success and current PAID resolve recovery and clear only matching cart in one write", async () => {
  const value = prepared(), { service, memory, locks } = setup(value);
  const result = await service.applyPaymentLifecycleV2(settle(value), current);
  assert.equal(result.outcome, "RESOLVED"); assert.equal(result.cartEffect, "CLEARED"); assert.equal(result.canConfirmNewAttempt, false);
  assert.equal(result.payment.id, "payment-k1"); assert.equal(result.order.status, "PAID"); assert.equal(memory.writes, 1); assert.equal(locks.held, false);
  assert.deepEqual(result.envelope.cart, { ownerId: "A", revision: value.cart.revision + 1, items: [] });
  assert.equal(result.envelope.paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED"); assert.deepEqual(result.envelope.checkoutBindings, {});
});

test("success recovery also accepts current PREPARING/READY/COMPLETED with no extra local clear", () => {
  for (const status of ["PREPARING", "READY", "COMPLETED"]) {
    const value = prepared(), result = applyCartPaymentV2(value, settle(value, { order: paid({ status, version: 3, canCancel: false }) }));
    assert.equal(result.outcome, "RESOLVED"); assert.equal(result.cartEffect, "CLEARED");
  }
});

test("FAILED plus current PAYMENT_FAILED retains full cart/binding and allows explicit new confirmation", () => {
  const value = prepared(), result = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: failed() }, order: failedOrder() }));
  assert.equal(result.outcome, "RESOLVED"); assert.equal(result.payment.status, "FAILED"); assert.equal(result.canConfirmNewAttempt, true);
  assert.deepEqual(result.envelope.cart, value.cart); assert.equal(result.envelope.checkoutBindings.A.orderVersion, 1);
  assert.equal(result.envelope.paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED");
  const next = applyCartPaymentV2(result.envelope, begin({ requestKey: KEY2, body: { orderId: "order-a", method: "CARD" }, order: failedOrder() }));
  assert.equal(next.request.requestKey, KEY2); assert.equal(next.request.body.orderId, "order-a"); assert.equal(next.request.body.method, "CARD");
  assert.equal(next.envelope.paymentRecoveries.A[KEY].paymentId, "payment-k1");
});

test("FAILED response with GET failure cannot enable a new key; a subsequent matching replay/read can resolve", () => {
  const value = prepared(), captured = settle(value, { reply: { status: 200, body: failed() }, order: null });
  const unknown = applyCartPaymentV2(value, captured);
  assert.equal(unknown.outcome, "UNKNOWN"); assert.equal(unknown.canConfirmNewAttempt, false);
  const restored = applyCartPaymentV2(unknown.envelope, { ...captured, order: failedOrder() });
  assert.equal(restored.outcome, "RESOLVED"); assert.equal(restored.canConfirmNewAttempt, true);
});

test("expired FAILED is resolved after current read but never enables a fresh attempt", () => {
  const value = prepared(), result = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: failed() },
    order: failedOrder({ serverTime: "2026-11-07T13:15:00.000Z", canPay: false }) }));
  assert.equal(result.outcome, "RESOLVED"); assert.equal(result.canConfirmNewAttempt, false); assert.deepEqual(result.envelope.cart, value.cart);
  assert.throws(() => applyCartPaymentV2(result.envelope, begin({ requestKey: KEY2, order: result.order })), code("INVALID_DATA"));
});

test("replay K1 FAILED never takes identity from latest K2 even when current Order is PAID", () => {
  const value = prepared();
  const actual = paid({ version: 2, latestPayment: payment({ id: "payment-k2", method: "CARD" }) });
  const result = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: failed() }, order: actual }));
  assert.equal(result.outcome, "RESOLVED"); assert.equal(result.payment.id, "payment-k1"); assert.equal(result.payment.status, "FAILED");
  assert.equal(result.order.status, "PAID"); assert.equal(result.envelope.paymentRecoveries.A[KEY].paymentId, "payment-k1");
  assert.equal(result.cartEffect, "CLEARED"); assert.equal(result.canConfirmNewAttempt, false);
});

test("success followed by newer CANCELLED resolves identity without clearing or rebuilding cart", () => {
  for (const refunded of [false, true]) {
    const value = prepared(), response = refunded ? payment({ version: 1, refundedAmount: 50000, refundedAt: LATER }) : payment();
    const result = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: response },
      order: order({ version: 2, status: "CANCELLED", paidAt: LATER, canPay: false, canCancel: false, serverTime: READ }) }));
    assert.equal(result.outcome, "RESOLVED"); assert.deepEqual(result.envelope.cart, value.cart); assert.equal(result.cartEffect, "UNCHANGED");
    assert.deepEqual(result.envelope.checkoutBindings, {});
  }
});

test("a refunded response cannot reconcile against an order still shown as PAID", () => {
  const value = prepared(), result = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: payment({ version: 1, refundedAmount: 50000, refundedAt: LATER }) } }));
  assert.equal(result.outcome, "UNKNOWN"); assert.deepEqual(result.envelope.cart, value.cart);
});

test("a newer cancellation applied first prevents a late paid result from clearing retained cart", () => {
  const value = prepared(), command = settle(value);
  const cancelled = applyCartPaymentV2(value, { ...command, order: order({ version: 2, status: "CANCELLED", paidAt: LATER, canPay: false, canCancel: false, serverTime: READ }) }).envelope;
  const late = applyCartPaymentV2(cancelled, command);
  assert.equal(late.outcome, "IGNORED"); assert.equal(late.order, null); assert.equal(late.envelope, cancelled);
  assert.deepEqual(late.envelope.cart, value.cart); assert.deepEqual(late.envelope.checkoutBindings, {});
});

test("different owner/revision/snapshot or a replaced binding cannot clear the newer cart", () => {
  for (const change of [v => { v.cart.ownerId = "B"; }, v => { v.cart.revision++; },
    v => { v.cart.items[0].qty++; }, v => { v.checkoutBindings.A.boundAt = LATER; }]) {
    const value = prepared(), command = settle(value); change(value); const before = structuredClone(value.cart);
    const result = applyCartPaymentV2(value, command);
    assert.equal(result.outcome, "RESOLVED"); assert.notEqual(result.cartEffect, "CLEARED"); assert.deepEqual(result.envelope.cart, before);
  }
});

test("policy-2 history payment without a local binding never creates one or clears an unrelated cart", () => {
  const value = fixture(); value.checkoutBindings = {};
  const saved = prepared(value), result = applyCartPaymentV2(saved, settle(saved));
  assert.equal(result.outcome, "RESOLVED"); assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.checkoutBindings, {});
  assert.equal(result.order, null); assert.equal(result.canConfirmNewAttempt, false);
});

test("a current cancellation read before payment settlement blocks publishing an older paid view", () => {
  const value = prepared(), command = settle(value);
  const cancelled = applyCartOrderBindingV2(value, { type: "CURRENT_ORDER", ownerId: "A",
    expectedBinding: command.expectedBinding, order: order({ version: 2, status: "CANCELLED", paidAt: LATER,
      canPay: false, canCancel: false, serverTime: READ }) }).envelope;
  const result = applyCartPaymentV2(cancelled, command);
  assert.equal(result.outcome, "RESOLVED"); assert.equal(result.order, null); assert.equal(result.canConfirmNewAttempt, false);
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.checkoutBindings, {});
  assert.equal(result.envelope.paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED");
});

test("old/wrong owner/key/body/checkpoint cannot settle a different saved recovery", () => {
  const value = prepared(), command = settle(value);
  for (const changes of [{ ownerId: "B" }, { requestKey: KEY2 }, { expectedRecovery: { ...command.expectedRecovery, createdAt: LATER } },
    { expectedRecovery: { ...command.expectedRecovery, body: { orderId: "order-a", method: "CARD" } } }]) {
    assert.equal(applyCartPaymentV2(value, { ...command, ...changes }).envelope, value);
  }
});

test("resolved keys remain recorded, cannot be reused and cannot be returned as unresolved retry", () => {
  const value = prepared(), resolved = applyCartPaymentV2(value, settle(value, { reply: { status: 200, body: failed() }, order: failedOrder() })).envelope;
  assert.throws(() => applyCartPaymentV2(resolved, begin({ order: failedOrder() })), code("REQUEST_KEY_REUSED"));
  assert.throws(() => applyCartPaymentV2(resolved, { type: "RETRY_PAYMENT", ownerId: "A", requestKey: KEY }), code("INVALID_DATA"));
});

test("another owner's unresolved recovery and historical results survive all payment transitions", () => {
  const value = fixture(); value.paymentRecoveries.B = { [KEY]: { ownerId: "B", requestKey: KEY, body: { orderId: "order-b", method: "CARD" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } };
  value.lastOrderResult = { ownerId: "B", requestKey: KEY, confirmedAt: TIME, order: { id: "order-b", status: "PENDING", total: 50000 } };
  const saved = prepared(value), result = applyCartPaymentV2(saved, settle(saved));
  assert.deepEqual(result.envelope.paymentRecoveries.B, value.paymentRecoveries.B); assert.deepEqual(result.envelope.lastOrderResult, value.lastOrderResult);
});

test("quota failure prevents both sending a fresh request and publishing a resolved/cleared result", async () => {
  for (const value of [fixture(), prepared()]) {
    const { service, memory } = setup(value); memory.failWrite = true; const raw = memory.raw;
    const command = value.paymentRecoveries.A ? settle(value) : begin();
    await assert.rejects(service.applyPaymentLifecycleV2(command, current), code("STORAGE_UNAVAILABLE"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("session changes before/after lock callback block every write and return no sendable request", async () => {
  for (const guard of [() => false, async () => true, (() => { let calls = 0; return () => ++calls === 1; })()]) {
    const { service, memory } = setup(), raw = memory.raw;
    await assert.rejects(service.applyPaymentLifecycleV2(begin(), guard), code("OWNER_MISMATCH"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
  const value = prepared(), { service, memory } = setup(value), raw = memory.raw;
  await assert.rejects(service.applyPaymentLifecycleV2(settle(value), () => false), code("OWNER_MISMATCH")); assert.equal(memory.raw, raw);
});

test("queued payment commands capture method, amount confirmation and key before caller edits them", async () => {
  const { service } = setup(), command = begin(), saved = service.applyPaymentLifecycleV2(command, current);
  command.body.method = "CARD"; command.requestKey = KEY2; command.order.total = 1;
  const result = await saved; assert.equal(result.request.requestKey, KEY); assert.equal(result.request.body.method, "WALLET");
});

test("two tabs reconciling one success resolve and clear exactly once", async () => {
  const value = prepared(), command = settle(value), { service, storage, locks, memory } = setup(value), other = createCartStorage({ storage, locks });
  const results = await Promise.all([service.applyPaymentLifecycleV2(command, current), other.applyPaymentLifecycleV2(command, current)]);
  assert.equal(results.filter(result => result.cartEffect === "CLEARED").length, 1); assert.equal(memory.writes, 1);
  assert.equal(JSON.parse(memory.raw).cart.revision, value.cart.revision + 1);
});

test("revision overflow rolls back recovery resolution and binding removal with the cart", async () => {
  const value = prepared(); value.cart.revision = Number.MAX_SAFE_INTEGER; value.checkoutBindings.A.cartRevision = value.cart.revision;
  value.checkoutBindings.A.cartSnapshot.revision = value.cart.revision;
  const { service, memory } = setup(value), raw = memory.raw;
  await assert.rejects(service.applyPaymentLifecycleV2(settle(value), current), code("REVISION_OVERFLOW")); assert.equal(memory.raw, raw);
});

test("prototype-like owner maps preserve their own payment entries through prepare and settlement", () => {
  for (const ownerId of ["__proto__", "constructor", "toString"]) {
    const value = prepared(fixture(ownerId), begin({ ownerId })), recovery = value.paymentRecoveries[ownerId][KEY];
    const result = applyCartPaymentV2(value, { type: "SETTLE_PAYMENT", ownerId, requestKey: KEY, expectedRecovery: structuredClone(recovery),
      expectedBinding: structuredClone(value.checkoutBindings[ownerId]), reply: { status: 200, body: payment() }, order: paid() });
    assert.equal(result.outcome, "RESOLVED"); assert.equal(result.cartEffect, "CLEARED");
    assert.equal(Object.hasOwn(result.envelope.paymentRecoveries, ownerId), true);
  }
});

test("corrupt/v1 storage or missing Web Locks fail closed without generating a payment", async () => {
  for (const [raw, expected] of [['{"schemaVersion":2}', "INVALID_DATA"], ['{"schemaVersion":1}', "UNSUPPORTED_VERSION"]]) {
    const { service, memory } = setup(raw);
    await assert.rejects(service.applyPaymentLifecycleV2(begin(), current), code(expected)); assert.equal(memory.raw, raw);
  }
  const { storage, memory } = setup();
  await assert.rejects(createCartStorage({ storage, locks: undefined }).applyPaymentLifecycleV2(begin(), current), code("LOCK_UNAVAILABLE"));
  assert.equal(memory.writes, 0);
});


test("a failed payment without a matching binding resolves its key without publishing the old order or opening a new attempt", () => {
  for (const otherBinding of [false, true]) {
    const value = fixture();
    if (otherBinding) value.checkoutBindings.A.orderId = "new-order";
    else value.checkoutBindings = {};
    const saved = prepared(value), before = structuredClone(saved);
    const reply = { status: 200, body: failed() };
    const result = applyCartPaymentV2(saved, settle(saved, { expectedBinding: null, reply, order: failedOrder() }));
    assert.equal(result.outcome, "RESOLVED"); assert.equal(result.order, null); assert.equal(result.canConfirmNewAttempt, false);
    assert.equal(result.envelope.paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED");
    assert.equal(result.envelope.paymentRecoveries.A[KEY].paymentId, "payment-k1");
    assert.equal(result.envelope.paymentRecoveries.A[KEY].requestKey, before.paymentRecoveries.A[KEY].requestKey);
    assert.deepEqual(result.envelope.paymentRecoveries.A[KEY].body, before.paymentRecoveries.A[KEY].body);
    assert.deepEqual(result.envelope.cart, before.cart); assert.deepEqual(result.envelope.checkoutBindings, before.checkoutBindings);
  }
});

test("durable settlement with a null binding returns no order or new-attempt permission while preserving newer cart choices", async () => {
  const value = fixture(); value.checkoutBindings = {};
  const { service, memory } = setup(value);
  const prepared = await service.applyPaymentLifecycleV2(begin(), current);
  const command = settle(prepared.envelope, { expectedBinding: null, reply: { status: 200, body: failed() }, order: failedOrder() });
  const settled = await service.applyPaymentLifecycleV2(command, current), stored = JSON.parse(memory.raw);
  assert.equal(settled.outcome, "RESOLVED"); assert.equal(settled.order, null); assert.equal(settled.canConfirmNewAttempt, false);
  assert.equal(stored.paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED"); assert.equal(stored.paymentRecoveries.A[KEY].requestKey, KEY);
  assert.deepEqual(stored.paymentRecoveries.A[KEY].body, { orderId: "order-a", method: "WALLET" });
  assert.deepEqual(stored.cart, value.cart); assert.deepEqual(stored.checkoutBindings, {});
});
