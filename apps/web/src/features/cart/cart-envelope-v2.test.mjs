import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError, createEmptyCartEnvelope, encodeCartEnvelope } from "./cart-envelope.ts";
import { cartReducer } from "./cart-reducer.ts";
import { checkoutBindingForOwner, createEmptyCartEnvelopeV2, decodeCartEnvelopeV2,
  encodeCartEnvelopeV2, isCartEnvelopeV2, paymentRecoveryForOwner } from "./cart-envelope-v2.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const KEY2 = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-11-07T12:00:00.000Z";
const draft = { productId: "coffee-milk", productName: "Cà phê sữa", imageUrl: "/images/coffee-milk.svg",
  size: "M", toppingIds: ["cream", "pearl"], toppingNames: { cream: "Kem", pearl: "Trân châu" }, previewUnitPrice: 57000 };
const code = expected => error => error instanceof CartStorageError && error.code === expected;
const clone = value => JSON.parse(JSON.stringify(value));

function legacy(ownerId = "A") {
  const value = createEmptyCartEnvelope();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart, ownerId };
  return value;
}

function pending(ownerId = "A", v2 = false) {
  const cartSnapshot = legacy(ownerId).cart;
  const item = cartSnapshot.items[0];
  const items = [{ productId: item.productId, size: item.size, toppingIds: [...item.toppingIds].reverse(),
    qty: item.qty, expectedUnitPrice: item.previewUnitPrice }];
  return { ownerId, requestKey: KEY, payload: v2
    ? { schemaVersion: 2, items, promotionCode: " demo10 ", expectedTotal: 51300 } : { items },
  cartRevision: cartSnapshot.revision, cartSnapshot, createdAt: TIME, phase: "SUBMITTING" };
}

function confirmed(ownerId = "A") {
  return { ownerId, requestKey: KEY2, order: { id: "old-order", status: "PENDING", total: 57000 }, confirmedAt: TIME };
}

function binding(ownerId = "A") {
  const cartSnapshot = legacy(ownerId).cart;
  return { ownerId, orderId: "order-%2F", cartRevision: cartSnapshot.revision, cartSnapshot,
    orderVersion: 0, boundAt: TIME };
}

function recovery(ownerId = "A", requestKey = KEY, recoveryStatus = "UNRESOLVED") {
  return { ownerId, requestKey, body: { orderId: "order-%2F", method: "WALLET" },
    createdAt: TIME, paymentId: null, recoveryStatus };
}

function modern() {
  return { ...createEmptyCartEnvelopeV2(), cart: legacy("B").cart,
    pendingRequests: { A: pending("A", true) }, checkoutBindings: { A: binding("A") },
    paymentRecoveries: { A: { [KEY]: recovery(), [KEY2]: recovery("A", KEY2, "RESOLVED") } },
    lastOrderResult: confirmed() };
}

// In-memory FIFO ports, not browser Web Locks or an authenticated backend.
class Locks {
  held = false;
  tail = Promise.resolve();
  request(name, options, operation) {
    assert.equal(name, CART_LOCK_NAME);
    assert.equal(options.mode, "exclusive");
    const run = this.tail.then(() => {
      options.signal.throwIfAborted();
      this.held = true;
      try { return operation(); } finally { this.held = false; }
    });
    this.tail = run.catch(() => {});
    return run;
  }
}

function setup(raw = encodeCartEnvelope(legacy())) {
  const locks = new Locks();
  const memory = { raw, reads: 0, writes: 0, failRead: false, failWrite: false };
  const storage = {
    getItem(key) {
      assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      memory.reads++;
      if (memory.failRead) throw new Error("read denied");
      return memory.raw;
    },
    setItem(key, value) {
      assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      if (memory.failWrite) throw new Error("quota");
      memory.raw = value; memory.writes++;
    },
  };
  return { memory, locks, storage, service: createCartStorage({ locks, storage }) };
}

test("empty v2 has exactly six independent root fields; read/plan do not persist", async () => {
  const a = decodeCartEnvelopeV2(null), b = decodeCartEnvelopeV2(null);
  assert.deepEqual(Object.keys(a).sort(), ["cart", "checkoutBindings", "lastOrderResult", "paymentRecoveries", "pendingRequests", "schemaVersion"]);
  assert.notEqual(a.cart.items, b.cart.items); assert.notEqual(a.checkoutBindings, b.checkoutBindings);
  const { service, memory } = setup(null);
  assert.deepEqual(await service.migrateToV2(), a);
  assert.equal(memory.raw, null); assert.equal(memory.writes, 0);
});

test("v1 migration preserves cart, all owners, payload order, key and timestamps; no inferred binding", async () => {
  const old = legacy("B"); old.pendingRequests = { A: pending(), C: pending("C") }; old.lastOrderResult = confirmed();
  const raw = encodeCartEnvelope(old);
  const { service, memory } = setup(raw);
  const read = await service.migrateToV2();
  const stored = JSON.parse(memory.raw);
  assert.equal(memory.reads, 1); assert.equal(memory.writes, 1);
  assert.equal(stored.schemaVersion, 2);
  assert.deepEqual(stored.cart, old.cart);
  assert.deepEqual(stored.pendingRequests, old.pendingRequests);
  assert.deepEqual(stored.lastOrderResult, old.lastOrderResult);
  assert.deepEqual(stored.checkoutBindings, {}); assert.deepEqual(stored.paymentRecoveries, {});
  for (const owner of ["A", "C"]) {
    assert.equal(read.pendingRequests[owner].phase, "UNKNOWN");
    assert.equal(JSON.stringify(read.pendingRequests[owner].payload), JSON.stringify(old.pendingRequests[owner].payload));
    assert.equal(read.pendingRequests[owner].requestKey, KEY);
    assert.equal(read.pendingRequests[owner].createdAt, TIME);
    assert.equal(stored.pendingRequests[owner].phase, "SUBMITTING");
  }
});

test("existing v2 is validated/recovered without a write or body normalization", async () => {
  const value = modern(); const raw = encodeCartEnvelopeV2(value);
  const { service, memory } = setup(raw);
  const view = await service.migrateToV2();
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  assert.equal(view.pendingRequests.A.phase, "UNKNOWN");
  assert.equal(view.pendingRequests.A.payload.promotionCode, " demo10 ");
  assert.equal(JSON.stringify(view.pendingRequests.A.payload), JSON.stringify(value.pendingRequests.A.payload));
  assert.deepEqual(view.checkoutBindings, value.checkoutBindings);
  assert.deepEqual(view.paymentRecoveries, value.paymentRecoveries);
});

test("v2 retains v1 and v2 pending bodies without changing their identity", () => {
  const value = modern(); value.pendingRequests.C = pending("C");
  const read = decodeCartEnvelopeV2(encodeCartEnvelopeV2(value));
  assert.deepEqual(read.pendingRequests.C.payload, pending("C").payload);
  assert.equal(Object.hasOwn(read.pendingRequests.C.payload, "schemaVersion"), false);
  assert.equal(read.pendingRequests.A.payload.schemaVersion, 2);
});

test("invalid JSON, roots and versions preserve stored bytes; no reset/migration", async () => {
  for (const raw of ["", "{", "null", "[]", "{}", '{"schemaVersion":3}', '{"schemaVersion":"1"}', '{"schemaVersion":2}']) {
    const { service, memory } = setup(raw);
    await assert.rejects(service.migrateToV2(), CartStorageError);
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
  assert.throws(() => decodeCartEnvelopeV2(encodeCartEnvelope(legacy())), code("UNSUPPORTED_VERSION"));
});

test("bad v1 is rejected using baseline validation, not upgraded into a fresh cart", async () => {
  const value = legacy(); value.pendingRequests.A = pending(); value.pendingRequests.A.payload.items[0].qty = 2;
  const raw = JSON.stringify(value); const { service, memory } = setup(raw);
  await assert.rejects(service.migrateToV2(), code("INVALID_DATA"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("v2 exact keys reject auth/card/mutation fields instead of storing them", () => {
  for (const mutate of [
    v => { v.token = "secret"; }, v => { delete v.checkoutBindings; },
    v => { v.cart.jwt = "secret"; }, v => { v.pendingRequests.A.payload.amount = 1; },
    v => { v.checkoutBindings.A.status = "PAID"; },
    v => { v.paymentRecoveries.A[KEY].body.cardNumber = "123"; },
    v => { v.paymentRecoveries.A[KEY].body.outcome = "SUCCEEDED"; },
    v => { v.paymentRecoveries.A[KEY].binding = "session"; },
  ]) {
    const value = modern(); mutate(value);
    assert.equal(isCartEnvelopeV2(value), false);
    assert.throws(() => encodeCartEnvelopeV2(value), code("INVALID_DATA"));
  }
});

test("pending v2 validates body version, money, code and original snapshot without coercion", () => {
  for (const mutate of [
    v => { v.pendingRequests.A.payload.schemaVersion = 1; },
    v => { v.pendingRequests.A.payload.schemaVersion = "2"; },
    v => { delete v.pendingRequests.A.payload.expectedTotal; },
    v => { v.pendingRequests.A.payload.expectedTotal = 0; },
    v => { v.pendingRequests.A.payload.expectedTotal = "51300"; },
    v => { v.pendingRequests.A.payload.expectedTotal = 2147483648; },
    v => { v.pendingRequests.A.payload.promotionCode = 1; },
    v => { v.pendingRequests.A.payload.promotionCode = "ı"; },
    v => { v.pendingRequests.A.payload.promotionCode = "A".repeat(33); },
    v => { v.pendingRequests.A.payload.items[0].qty = 2; },
    v => { v.pendingRequests.A.payload.items[0].expectedUnitPrice--; },
    v => { v.pendingRequests.A.cartRevision++; },
    v => { v.pendingRequests.A.ownerId = "B"; },
  ]) { const value = modern(); mutate(value); assert.equal(isCartEnvelopeV2(value), false); }
  for (const promotionCode of [null, "", " ", "demo10", " DEMO10 "]) {
    const value = modern(); value.pendingRequests.A.payload.promotionCode = promotionCode;
    assert.equal(isCartEnvelopeV2(value), true);
    assert.equal(decodeCartEnvelopeV2(encodeCartEnvelopeV2(value)).pendingRequests.A.payload.promotionCode, promotionCode);
  }
});

test("bindings require same owner/revision snapshot and valid server version/time", () => {
  for (const mutate of [
    v => { v.checkoutBindings.A.ownerId = "B"; }, v => { v.checkoutBindings.A.cartSnapshot.ownerId = "B"; },
    v => { v.checkoutBindings.A.cartRevision++; }, v => { v.checkoutBindings.A.cartSnapshot.items = []; },
    v => { v.checkoutBindings.A.orderId = ""; }, v => { v.checkoutBindings.A.orderVersion = -1; },
    v => { v.checkoutBindings.A.orderVersion = 2147483648; }, v => { v.checkoutBindings.A.boundAt = "yesterday"; },
  ]) { const value = modern(); mutate(value); assert.equal(isCartEnvelopeV2(value), false); }
  assert.equal(isCartEnvelopeV2(modern()), true, "owner A records survive while active cart belongs to B");
});

test("payment recoveries validate owner/key/body, timestamps and status without guessing a payment ID", () => {
  for (const mutate of [
    v => { v.paymentRecoveries.A[KEY].ownerId = "B"; }, v => { v.paymentRecoveries.A[KEY].requestKey = KEY2; },
    v => { v.paymentRecoveries.A[KEY].body.orderId = ""; }, v => { v.paymentRecoveries.A[KEY].body.method = "CASH"; },
    v => { v.paymentRecoveries.A[KEY].createdAt = "2026-11-07T19:00:00.000+07:00"; },
    v => { v.paymentRecoveries.A[KEY].paymentId = ""; }, v => { v.paymentRecoveries.A[KEY].recoveryStatus = "FAILED"; },
    v => { v.paymentRecoveries.A.badKey = v.paymentRecoveries.A[KEY]; },
  ]) { const value = modern(); mutate(value); assert.equal(isCartEnvelopeV2(value), false); }
  const value = modern(); value.paymentRecoveries.A[KEY].paymentId = "payment-%2F";
  assert.equal(isCartEnvelopeV2(value), true);
});

test("at most one unresolved recovery per owner; resolved history and other owners may coexist", () => {
  const value = modern(); value.paymentRecoveries.A[KEY2].recoveryStatus = "UNRESOLVED";
  assert.equal(isCartEnvelopeV2(value), false);
  value.paymentRecoveries.A[KEY2].recoveryStatus = "RESOLVED";
  value.paymentRecoveries.B = { [KEY]: recovery("B") };
  assert.equal(isCartEnvelopeV2(value), true);
});

test("pending and payment body limits count UTF-8 bytes", () => {
  const value = modern();
  const id = "☕".repeat(1300);
  value.pendingRequests.A.cartSnapshot.items[0].productId = id;
  value.pendingRequests.A.payload.items[0].productId = id;
  value.pendingRequests.A.payload.promotionCode = " ".repeat(29000) + "DEMO10";
  assert.ok(JSON.stringify(value.pendingRequests.A.payload).length < 32768);
  assert.equal(isCartEnvelopeV2(value), false);
  const other = modern(); other.paymentRecoveries.A[KEY].body.orderId = "☕".repeat(1400);
  assert.ok(JSON.stringify(other.paymentRecoveries.A[KEY].body).length < 4096);
  assert.equal(isCartEnvelopeV2(other), false);
});

test("opaque and prototype-like owners remain own entries; selectors never use inherited properties", () => {
  const value = createEmptyCartEnvelopeV2();
  for (const owner of ["__proto__", "constructor", "toString", " A%2F "]) {
    Object.defineProperty(value.checkoutBindings, owner, { value: binding(owner), enumerable: true });
    Object.defineProperty(value.paymentRecoveries, owner, { value: { [KEY]: recovery(owner) }, enumerable: true });
    Object.defineProperty(value.pendingRequests, owner, { value: pending(owner, true), enumerable: true });
  }
  const read = decodeCartEnvelopeV2(encodeCartEnvelopeV2(value));
  for (const owner of Object.keys(value.checkoutBindings)) {
    assert.equal(checkoutBindingForOwner(read, owner).ownerId, owner);
    assert.equal(paymentRecoveryForOwner(read, owner, KEY).ownerId, owner);
    assert.equal(Object.hasOwn(read.pendingRequests, owner), true);
  }
  assert.equal(checkoutBindingForOwner(read, null), null);
  assert.equal(checkoutBindingForOwner(createEmptyCartEnvelopeV2(), "constructor"), null);
  assert.equal(paymentRecoveryForOwner(read, "B", KEY), null);
  assert.equal(paymentRecoveryForOwner(read, "__proto__", "constructor"), null);
});

test("migration read/quota failure keeps bytes and never returns a migrated success", async () => {
  for (const failure of ["failRead", "failWrite"]) {
    const { service, memory } = setup(); const raw = memory.raw; memory[failure] = true;
    await assert.rejects(service.migrateToV2(), code("STORAGE_UNAVAILABLE"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("missing/rejected Web Locks never writes a migration without protection", async () => {
  const { storage, memory } = setup();
  for (const locks of [undefined, { request: async () => { throw new Error("denied"); } }]) {
    await assert.rejects(createCartStorage({ storage, locks }).migrateToV2(), code("LOCK_UNAVAILABLE"));
  }
  assert.equal(memory.reads, 0); assert.equal(memory.writes, 0);
});

test("two clients migrating at once use the shared lock and write v2 only once", async () => {
  const { service, storage, locks, memory } = setup();
  const second = createCartStorage({ storage, locks });
  const [a, b] = await Promise.all([service.migrateToV2(), second.migrateToV2()]);
  assert.deepEqual(a, b); assert.equal(memory.writes, 1); assert.equal(memory.reads, 2);
});

test("migration reads latest bytes after a queued v1 edit", async () => {
  const { service, memory } = setup();
  await Promise.all([service.mutateCart({ type: "ADD_ITEM", item: draft }, "A"), service.migrateToV2()]);
  assert.equal(JSON.parse(memory.raw).cart.items[0].qty, 2);
  assert.equal(JSON.parse(memory.raw).schemaVersion, 2);
});

test("every old v1 writer rejects envelope 2 and preserves bindings/recoveries", async () => {
  const { service, memory } = setup(encodeCartEnvelopeV2(modern())); const raw = memory.raw;
  await assert.rejects(service.read(), code("UNSUPPORTED_VERSION"));
  await assert.rejects(service.mutateCart({ type: "ADD_ITEM", item: draft }, "B"), code("UNSUPPORTED_VERSION"));
  await assert.rejects(service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "B", expectedCart: { ownerId: "B", revision: 1 } }), code("UNSUPPORTED_VERSION"));
  await assert.rejects(service.settleOrder({}), code("UNSUPPORTED_VERSION"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("v1 writer queued after migration stops instead of overwriting schema 2", async () => {
  const { service, memory } = setup();
  const results = await Promise.allSettled([service.migrateToV2(), service.mutateCart({ type: "ADD_ITEM", item: draft }, "A")]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.code, "UNSUPPORTED_VERSION");
  assert.equal(JSON.parse(memory.raw).cart.items[0].qty, 1); assert.equal(memory.writes, 1);
});

test("encoding validates without mutating inputs, including a malformed cyclic payload", () => {
  const value = modern(), before = clone(value);
  encodeCartEnvelopeV2(value); assert.deepEqual(value, before);
  value.pendingRequests.A.payload.items.push(value.pendingRequests.A.payload);
  assert.equal(isCartEnvelopeV2(value), false);
  assert.throws(() => encodeCartEnvelopeV2(value), code("INVALID_DATA"));
});
