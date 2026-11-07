import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { applyCartCheckoutV2 } from "./cart-checkout-v2.ts";
import { applyCartOrderBindingV2 } from "./cart-order-binding-v2.ts";
import { cartReducer } from "./cart-reducer.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const KEY2 = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-11-07T13:00:00.000Z";
const current = () => true;
const code = expected => error => error instanceof CartStorageError && error.code === expected;
function fixture(ownerId = "A", v2 = true) {
  let value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: {
    productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M",
    toppingIds: ["milk"], toppingNames: { milk: "Milk" }, previewUnitPrice: 50000,
  } }).cart, ownerId };
  value = applyCartCheckoutV2(value, { type: "BEGIN_ORDER_V2", ownerId,
    expectedCart: { ownerId, revision: value.cart.revision }, requestKey: KEY, createdAt: TIME, promotionCode: "DEMO10" }).envelope;
  if (!v2) {
    const pending = value.pendingRequests[ownerId];
    value.pendingRequests = { [ownerId]: { ...pending, payload: { items: pending.payload.items } } };
  }
  return value;
}
const order = (changes = {}) => ({ id: "order-a", version: 0, status: "PENDING", total: 45000,
  paymentDeadline: "2026-11-07T13:15:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: TIME, ...changes });
const ack = (changes = {}) => ({ type: "CREATE_REPLY", ownerId: "A", requestKey: KEY, receivedAt: TIME,
  status: 201, body: { id: "order-a", status: "PENDING", total: 45000 }, ...changes });
const bind = (changes = {}) => ({ type: "BIND_CREATED_ORDER", ownerId: "A", requestKey: KEY, receivedAt: TIME,
  order: order(), ...changes });
function confirmed(value = fixture(), command = ack()) { return applyCartOrderBindingV2(value, command).envelope; }
function bound(value = fixture()) { return applyCartOrderBindingV2(confirmed(value), bind()).envelope; }
function read(value, changes = {}, expectedBinding = value.checkoutBindings.A) {
  return { type: "CURRENT_ORDER", ownerId: "A", expectedBinding, order: order(changes) };
}
function paid(changes = {}) { return { version: 1, status: "PAID", paidAt: TIME, canPay: false, ...changes }; }
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
  const locks = new Locks();
  const memory = { raw: typeof value === "string" ? value : encodeCartEnvelopeV2(value), writes: 0, failWrite: false };
  const storage = { getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true); return memory.raw; },
    setItem(key, raw) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      if (memory.failWrite) throw new Error("quota"); memory.raw = raw; memory.writes++; } };
  return { service: createCartStorage({ storage, locks }), memory, locks, storage };
}

test("create acknowledgement keeps cart and immutable pending until a current Order read", async () => {
  const value = fixture(), before = JSON.stringify(value); const { service, memory, locks } = setup(value);
  const result = await service.applyOrderBindingV2(ack(), current);
  assert.equal(result.outcome, "CREATED"); assert.equal(result.cartEffect, "UNCHANGED");
  assert.equal(locks.held, false); assert.equal(memory.writes, 1);
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.checkoutBindings, {});
  assert.deepEqual(result.envelope.pendingRequests.A, { ...value.pendingRequests.A, phase: "UNKNOWN" });
  assert.deepEqual(result.envelope.lastOrderResult.order, { id: "order-a", status: "PENDING", total: 45000 });
  assert.equal(JSON.stringify(value), before);
});

test("replay 200 is historical PENDING; it never claims the order is unpaid now", () => {
  const value = fixture(); const result = applyCartOrderBindingV2(value, ack({ status: 200 }));
  assert.equal(result.outcome, "CREATED"); assert.deepEqual(result.envelope.cart, value.cart);
  assert.equal(result.envelope.pendingRequests.A.requestKey, KEY);
});

test("malformed success, mismatched amount and unclassified rejections preserve pending identity", () => {
  for (const reply of [{ body: null }, { body: { id: "order-a", status: "PAID", total: 45000 } },
    { body: { id: "order-a", status: "PENDING", total: 50000 } },
    { body: { id: "order-a", status: "PENDING", total: 45000, extra: true } },
    { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "invalid" } } },
    { status: 409, body: { error: { code: "CHECKOUT_CHANGED", message: "changed" } } },
    { status: 401 }, { status: 500 }, { status: undefined, body: undefined }]) {
    const value = fixture(); const result = applyCartOrderBindingV2(value, ack(reply));
    assert.equal(result.outcome, "UNKNOWN"); assert.deepEqual(result.envelope.cart, value.cart);
    assert.deepEqual(result.envelope.pendingRequests.A, { ...value.pendingRequests.A, phase: "UNKNOWN" });
    assert.equal(result.envelope.lastOrderResult, null);
    assert.equal(applyCartOrderBindingV2(result.envelope, ack(reply)).envelope, result.envelope);
  }
});

test("wrong owner/key and late creation acknowledgement cannot replace a newer pending", async () => {
  const { service, memory } = setup(); const raw = memory.raw;
  for (const changes of [{ ownerId: "B" }, { requestKey: KEY2 }]) {
    assert.equal((await service.applyOrderBindingV2(ack(changes), current)).outcome, "IGNORED");
  }
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("matching current PENDING binds original snapshot and removes pending atomically", async () => {
  const value = confirmed(); const { service, memory, locks } = setup(value);
  const result = await service.applyOrderBindingV2(bind(), current);
  assert.equal(result.outcome, "BOUND"); assert.equal(memory.writes, 1); assert.equal(locks.held, false);
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.pendingRequests, {});
  assert.deepEqual(result.envelope.checkoutBindings.A, { ownerId: "A", orderId: "order-a",
    cartRevision: value.cart.revision, cartSnapshot: value.cart, orderVersion: 0, boundAt: TIME });
});

test("current read cannot bind without the matching durable creation acknowledgement", async () => {
  for (const value of [fixture(), confirmed()]) {
    const { service, memory } = setup(value); const raw = memory.raw;
    const result = await service.applyOrderBindingV2(bind({ order: order({ id: "another" }) }), current);
    assert.equal(result.outcome, "IGNORED"); assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
  assert.equal(applyCartOrderBindingV2(fixture(), bind()).outcome, "IGNORED");
  assert.equal(applyCartOrderBindingV2(confirmed(), bind({ order: order({ total: 45001 }) })).outcome, "IGNORED");
});

test("failed or malformed current read leaves the acknowledged pending recoverable", async () => {
  for (const changes of [{ version: -1 }, { status: "MYSTERY" }, { serverTime: "bad" },
    { paidAt: TIME }, { canPay: "true" }, { paymentDeadline: null }]) {
    const value = confirmed(); const { service, memory } = setup(value); const raw = memory.raw;
    if (changes.paymentDeadline === null) {
      const result = await service.applyOrderBindingV2(bind({ order: order({ ...changes, canPay: false, canCancel: false }) }), current);
      assert.equal(result.outcome, "UNKNOWN");
    } else await assert.rejects(service.applyOrderBindingV2(bind({ order: order(changes) }), current), code("INVALID_DATA"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("legacy v1 creation remains read-only without manufacturing a binding or clearing cart", () => {
  const original = fixture("A", false);
  const value = confirmed(original, ack({ body: { id: "order-a", status: "PENDING", total: 50000 } }));
  const result = applyCartOrderBindingV2(value, bind({ order: order({ total: 50000, paymentDeadline: null, canPay: false, canCancel: false }) }));
  assert.equal(result.outcome, "READ_ONLY"); assert.deepEqual(result.envelope.cart, original.cart);
  assert.deepEqual(result.envelope.pendingRequests, {}); assert.deepEqual(result.envelope.checkoutBindings, {});
});

test("an order created by retry can bind only if original cart still matches", () => {
  for (const change of [value => { value.cart.revision++; }, value => { value.cart.items[0].qty++; },
    value => { value.cart.ownerId = "B"; }, value => { value.cart = { ownerId: "A", revision: 10, items: [] }; }]) {
    const value = confirmed(); change(value); const before = structuredClone(value.cart);
    const result = applyCartOrderBindingV2(value, bind());
    assert.equal(result.outcome, "UNRELATED"); assert.deepEqual(result.envelope.cart, before);
    assert.deepEqual(result.envelope.checkoutBindings, {}); assert.deepEqual(result.envelope.pendingRequests, {});
  }
});

test("current PAID/PREPARING/READY/COMPLETED clears only the bound cart once", () => {
  for (const status of ["PAID", "PREPARING", "READY", "COMPLETED"]) {
    const value = bound(), before = JSON.stringify(value);
    const command = read(value, paid({ status, canCancel: status === "PAID" }));
    const result = applyCartOrderBindingV2(value, command);
    assert.equal(result.outcome, "RELEASED"); assert.equal(result.cartEffect, "CLEARED");
    assert.deepEqual(result.envelope.cart, { ownerId: "A", revision: value.cart.revision + 1, items: [] });
    assert.deepEqual(result.envelope.checkoutBindings, {});
    assert.equal(applyCartOrderBindingV2(result.envelope, command).envelope, result.envelope);
    assert.equal(JSON.stringify(value), before);
    assert.equal(result.envelope.lastOrderResult.order.status, "PENDING");
  }
});

test("first current read may already be PAID and settles binding plus cart in one durable write", async () => {
  const value = confirmed(); const { service, memory } = setup(value);
  const result = await service.applyOrderBindingV2(bind({ order: order(paid()) }), current);
  assert.equal(result.cartEffect, "CLEARED"); assert.equal(memory.writes, 1);
  assert.deepEqual(result.envelope.pendingRequests, {}); assert.deepEqual(result.envelope.checkoutBindings, {});
});

test("current CANCELLED releases binding but never clears or reconstructs cart", () => {
  for (const emptied of [false, true]) {
    const value = bound(); if (emptied) value.cart = { ownerId: null, revision: 5, items: [] };
    const before = structuredClone(value.cart);
    const result = applyCartOrderBindingV2(value, read(value, { version: 2, status: "CANCELLED", canPay: false, canCancel: false }));
    assert.deepEqual(result.envelope.cart, before); assert.deepEqual(result.envelope.checkoutBindings, {});
    assert.notEqual(result.cartEffect, "CLEARED");
  }
});

test("a newer cancellation prevents late paid response from clearing the retained cart", () => {
  const value = bound(), command = read(value, paid());
  const cancelled = applyCartOrderBindingV2(value, read(value, { version: 2, status: "CANCELLED", canPay: false, canCancel: false })).envelope;
  assert.equal(applyCartOrderBindingV2(cancelled, command).envelope, cancelled);
  assert.deepEqual(cancelled.cart, value.cart);
});

test("owner, order ID, binding instance and observed version guard current reads", () => {
  const value = bound(); value.checkoutBindings.A.orderVersion = 3;
  for (const command of [read(value, paid({ version: 2 })), read(value, paid({ version: 4, id: "other" })),
    { ...read(value, paid({ version: 4 })), ownerId: "B" },
    read(value, paid({ version: 4 }), { ...value.checkoutBindings.A, boundAt: "2026-11-07T13:01:00.000Z" }),
    read(value, paid({ version: 4 }), { ...value.checkoutBindings.A, orderVersion: 5 }),
    read(value, paid({ version: 4 }), { cartSnapshot: null })]) {
    assert.equal(applyCartOrderBindingV2(value, command).envelope, value);
  }
});

test("full snapshot comparison protects even a different cart with same owner and revision", () => {
  for (const change of [cart => { cart.items[0].productName = "New"; }, cart => { cart.items[0].previewUnitPrice++; },
    cart => { cart.items[0].imageUrl = "/new.svg"; }, cart => { cart.items[0].toppingNames.milk = "New"; },
    cart => { cart.items[0].qty++; }, cart => { cart.items[0].size = "L"; }]) {
    const value = bound(); change(value.cart); const before = structuredClone(value.cart);
    const result = applyCartOrderBindingV2(value, read(value, paid()));
    assert.equal(result.cartEffect, "UNRELATED"); assert.deepEqual(result.envelope.cart, before);
  }
});

test("paid result for an old owner does not clear a guest/new owner's cart", () => {
  for (const ownerId of [null, "B"]) {
    const value = bound(); value.cart.ownerId = ownerId; value.cart.revision++;
    const before = structuredClone(value.cart);
    const result = applyCartOrderBindingV2(value, read(value, paid()));
    assert.equal(result.cartEffect, "UNRELATED"); assert.deepEqual(result.envelope.cart, before);
  }
});

test("PENDING and PAYMENT_FAILED retain cart/binding and monotonically advance observed version", async () => {
  const value = bound(); const { service, memory } = setup(value);
  const first = await service.applyOrderBindingV2(read(value, { version: 2, status: "PAYMENT_FAILED" }), current);
  assert.deepEqual(first.envelope.cart, value.cart); assert.equal(first.envelope.checkoutBindings.A.orderVersion, 2);
  const raw = memory.raw;
  await service.applyOrderBindingV2(read(value, { version: 1 }), current);
  await service.applyOrderBindingV2(read(value, { version: 2, status: "PAYMENT_FAILED" }), current);
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 1);
});

test("Order reads never resolve or delete an unknown payment key from latest state", () => {
  const value = bound(); value.paymentRecoveries.A = { [KEY2]: { ownerId: "A", requestKey: KEY2,
    body: { orderId: "order-a", method: "CARD" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } };
  const result = applyCartOrderBindingV2(value, read(value, paid()));
  assert.deepEqual(result.envelope.paymentRecoveries, value.paymentRecoveries);
});

test("settlement preserves another owner's pending, binding and payment recovery", () => {
  const value = bound(), other = bound(fixture());
  const snapshot = { ...other.cart, ownerId: "B" };
  value.pendingRequests.B = { ...fixture("B").pendingRequests.B };
  value.checkoutBindings.B = { ...other.checkoutBindings.A, ownerId: "B", cartSnapshot: snapshot };
  value.paymentRecoveries.B = { [KEY2]: { ownerId: "B", requestKey: KEY2,
    body: { orderId: "order-b", method: "WALLET" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } };
  const result = applyCartOrderBindingV2(value, read(value, paid()));
  assert.deepEqual(result.envelope.pendingRequests.B, value.pendingRequests.B);
  assert.deepEqual(result.envelope.checkoutBindings.B, value.checkoutBindings.B);
  assert.deepEqual(result.envelope.paymentRecoveries.B, value.paymentRecoveries.B);
});

test("a remaining own pending or another order binding cannot be overwritten by a late result", () => {
  const value = bound(); value.pendingRequests.A = fixture().pendingRequests.A;
  assert.equal(applyCartOrderBindingV2(value, read(value, paid())).envelope, value);
  value.checkoutBindings.A.orderId = "other";
  assert.equal(applyCartOrderBindingV2(value, ack()).envelope, value);
  assert.equal(applyCartOrderBindingV2(value, bind()).envelope, value);
});

test("invalid timestamps and revision overflow cannot partially remove pending/binding", async () => {
  const first = setup(confirmed()); const raw = first.memory.raw;
  await assert.rejects(first.service.applyOrderBindingV2(bind({ receivedAt: "bad" }), current), code("INVALID_DATA"));
  assert.equal(first.memory.raw, raw);
  const value = bound(); value.cart.revision = Number.MAX_SAFE_INTEGER;
  value.checkoutBindings.A.cartRevision = value.cart.revision;
  value.checkoutBindings.A.cartSnapshot.revision = value.cart.revision;
  const { service, memory } = setup(value); const before = memory.raw;
  await assert.rejects(service.applyOrderBindingV2(read(value, paid()), current), code("REVISION_OVERFLOW"));
  assert.equal(memory.raw, before); assert.equal(memory.writes, 0);
});

test("quota failures preserve acknowledged pending or the paid cart/binding without reporting success", async () => {
  for (const value of [confirmed(), bound()]) {
    const { service, memory } = setup(value); const raw = memory.raw; memory.failWrite = true;
    const command = value.checkoutBindings.A ? read(value, paid()) : bind();
    await assert.rejects(service.applyOrderBindingV2(command, current), code("STORAGE_UNAVAILABLE"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("session generation is checked before read and again before persistence", async () => {
  for (const guard of [() => false, async () => true, (() => { let calls = 0; return () => ++calls === 1; })()]) {
    const { service, memory } = setup(confirmed()); const raw = memory.raw;
    await assert.rejects(service.applyOrderBindingV2(bind(), guard), code("OWNER_MISMATCH"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("queued current reads capture their binding and response before caller changes them", async () => {
  const value = bound(); const { service } = setup(value); const command = read(value, paid());
  const result = service.applyOrderBindingV2(command, current);
  command.order.id = "other"; command.expectedBinding.orderId = "other";
  assert.equal((await result).cartEffect, "CLEARED");
});

test("two tabs applying the same paid read clear once without losing another edit", async () => {
  const value = bound(); const { service, storage, locks, memory } = setup(value);
  const second = createCartStorage({ storage, locks });
  const results = await Promise.all([service.applyOrderBindingV2(read(value, paid()), current),
    second.applyOrderBindingV2(read(value, paid()), current)]);
  assert.equal(results.filter(result => result.cartEffect === "CLEARED").length, 1);
  assert.equal(memory.writes, 1); assert.equal(JSON.parse(memory.raw).cart.revision, value.cart.revision + 1);
});

test("prototype-like owners are handled as ordinary own map entries across acknowledgement and binding", () => {
  for (const ownerId of ["__proto__", "constructor", "toString"]) {
    const value = confirmed(fixture(ownerId), ack({ ownerId }));
    const boundValue = applyCartOrderBindingV2(value, bind({ ownerId })).envelope;
    assert.equal(Object.hasOwn(boundValue.checkoutBindings, ownerId), true);
    const result = applyCartOrderBindingV2(boundValue, { type: "CURRENT_ORDER", ownerId,
      expectedBinding: boundValue.checkoutBindings[ownerId], order: order(paid()) });
    assert.equal(result.cartEffect, "CLEARED"); assert.equal(result.envelope.cart.ownerId, ownerId);
  }
});

test("corrupt/v1 storage and unavailable Web Locks fail closed", async () => {
  for (const [raw, expected] of [['{"schemaVersion":2}', "INVALID_DATA"], ['{"schemaVersion":1}', "UNSUPPORTED_VERSION"]]) {
    const { service, memory } = setup(raw);
    await assert.rejects(service.applyOrderBindingV2(ack(), current), code(expected)); assert.equal(memory.raw, raw);
  }
  const { storage, memory } = setup();
  await assert.rejects(createCartStorage({ storage, locks: undefined }).applyOrderBindingV2(ack(), current), code("LOCK_UNAVAILABLE"));
  assert.equal(memory.writes, 0);
});
