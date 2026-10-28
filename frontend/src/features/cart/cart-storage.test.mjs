import assert from "node:assert/strict";
import test from "node:test";
import { cartReducer, getCartLineKey, MAX_CART_MONEY } from "./cart-reducer.ts";
import { CartStorageError, createEmptyCartEnvelope, decodeCartEnvelope,
  encodeCartEnvelope, isCartEnvelope, pendingForOwner, resultForOwner } from "./cart-envelope.ts";
import { CART_LOCK_NAME, CART_LOCK_WAIT_MS, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const REQUEST_KEY = "00000000-0000-4000-8000-000000000001";
const TIME = "2026-10-28T06:00:00.000Z";

function draft(overrides = {}) {
  return { productId: "coffee-milk", productName: "Cà phê sữa", imageUrl: "/images/coffee-milk.svg",
    size: "M", toppingIds: ["cream"], toppingNames: { cream: "Kem" }, previewUnitPrice: 47000, ...overrides };
}

function envelope(ownerId = null) {
  const value = createEmptyCartEnvelope();
  value.cart = cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft() }).cart;
  value.cart.ownerId = ownerId;
  return value;
}

function pending(ownerId, phase = "UNKNOWN") {
  const snapshot = envelope(ownerId).cart;
  return { ownerId, requestKey: REQUEST_KEY,
    payload: { items: snapshot.items.map((item) => ({ productId: item.productId,
      size: item.size, toppingIds: [...item.toppingIds], qty: item.qty,
      expectedUnitPrice: item.previewUnitPrice })) },
    cartRevision: snapshot.revision, cartSnapshot: snapshot, createdAt: TIME, phase };
}

function confirmed(ownerId) {
  return { ownerId, requestKey: REQUEST_KEY, order: { id: "order-a", status: "PENDING", total: 47000 },
    confirmedAt: TIME };
}

function code(expected) {
  return (error) => error instanceof CartStorageError && error.code === expected;
}

// In-memory port simulation, not a browser implementation or integration test.
class QueuedLocks {
  held = false;
  queue = [];
  requests = [];

  request(name, options, callback) {
    this.requests.push({ name, options });
    return new Promise((resolve, reject) => {
      const job = { callback, resolve, reject, signal: options.signal };
      job.abort = () => {
        const index = this.queue.indexOf(job);
        if (index >= 0) this.queue.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (job.signal?.aborted) { job.abort(); return; }
      job.signal?.addEventListener("abort", job.abort, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }

  drain() {
    if (this.held || !this.queue.length) return;
    const job = this.queue.shift();
    job.signal?.removeEventListener("abort", job.abort);
    this.held = true;
    const finish = () => { this.held = false; this.drain(); };
    Promise.resolve().then(job.callback).then(
      (value) => { finish(); job.resolve(value); },
      (error) => { finish(); job.reject(error); },
    );
  }
}

function setup(value = null, locks = new QueuedLocks()) {
  const memory = { raw: value === null ? null : typeof value === "string" ? value : encodeCartEnvelope(value),
    reads: 0, writes: 0, failRead: false, failWrite: false };
  const storage = {
    getItem(key) {
      assert.equal(locks.held, true, "read occurs under lock");
      assert.equal(key, CART_STORAGE_KEY);
      memory.reads++;
      if (memory.failRead) throw new DOMException("Blocked", "SecurityError");
      return memory.raw;
    },
    setItem(key, raw) {
      assert.equal(locks.held, true, "write occurs under lock");
      assert.equal(key, CART_STORAGE_KEY);
      if (memory.failWrite) throw new DOMException("Full", "QuotaExceededError");
      memory.writes++;
      memory.raw = raw;
    },
  };
  return { memory, storage, locks, service: createCartStorage({ storage, locks }) };
}

test("missing storage creates independent empty envelopes without persisting", async () => {
  const first = decodeCartEnvelope(null);
  const second = decodeCartEnvelope(null);
  assert.notStrictEqual(first.cart.items, second.cart.items);
  const { service, memory } = setup();
  assert.deepEqual(await service.read(), first);
  assert.equal(memory.raw, null);
  assert.equal(memory.writes, 0);
});

test("round trip keeps display snapshots, numbers, owner and revision", () => {
  const value = envelope("user-a");
  assert.deepEqual(decodeCartEnvelope(encodeCartEnvelope(value)), value);
});

test("invalid JSON and unsupported schemas are rejected without a reset", async () => {
  for (const raw of ["", "{", "null", "[]", "{}", "{\"schemaVersion\":2}", "{\"schemaVersion\":\"1\"}"]) {
    const { service, memory } = setup(raw);
    await assert.rejects(service.read(), CartStorageError);
    await assert.rejects(service.mutateCart({ type: "ADD_ITEM", item: draft() }, null), CartStorageError);
    assert.equal(memory.raw, raw);
    assert.equal(memory.writes, 0);
  }
  assert.throws(() => decodeCartEnvelope('{"schemaVersion":2}'), code("UNSUPPORTED_VERSION"));
});

test("cart validator rejects wrong types, duplicate configurations and invalid bounds", () => {
  const cases = [
    (v) => { v.cart.ownerId = 123; },
    (v) => { v.cart.revision = -1; },
    (v) => { v.cart.revision = 0.5; },
    (v) => { v.cart.items[0].qty = 0; },
    (v) => { v.cart.items[0].qty = 21; },
    (v) => { v.cart.items[0].qty = "1"; },
    (v) => { v.cart.items[0].size = "XL"; },
    (v) => { v.cart.items[0].productId = ""; },
    (v) => { v.cart.items[0].previewUnitPrice = 0.5; },
    (v) => { v.cart.items[0].previewUnitPrice = -1; },
    (v) => { v.cart.items[0].toppingIds.push("cream"); },
    (v) => { v.cart.items[0].toppingNames = {}; },
    (v) => { v.cart.items.push(structuredClone(v.cart.items[0])); },
    (v) => { v.cart.items = Array.from({ length: 21 }, (_, i) => ({ ...v.cart.items[0], productId: `p${i}` })); },
    (v) => { v.cart.items[0].previewUnitPrice = MAX_CART_MONEY; v.cart.items[0].qty = 2; },
    (v) => { v.cart.items[0].previewUnitPrice = MAX_CART_MONEY;
      v.cart.items.push({ ...v.cart.items[0], productId: "other", previewUnitPrice: 1 }); },
    (v) => { v.cart.items[0].accessToken = "must-not-be-stored"; },
  ];
  for (const modify of cases) {
    const value = envelope(); modify(value);
    assert.equal(isCartEnvelope(value), false);
    assert.throws(() => encodeCartEnvelope(value), code("INVALID_DATA"));
  }
});

test("restored SUBMITTING becomes UNKNOWN without changing key, payload or stored bytes", async () => {
  const value = envelope("user-a");
  value.pendingRequests["user-a"] = pending("user-a", "SUBMITTING");
  const original = encodeCartEnvelope(value);
  const { service, memory } = setup(original);
  const loaded = await service.read();
  assert.equal(loaded.pendingRequests["user-a"].phase, "UNKNOWN");
  assert.equal(loaded.pendingRequests["user-a"].requestKey, REQUEST_KEY);
  assert.deepEqual(loaded.pendingRequests["user-a"].payload, value.pendingRequests["user-a"].payload);
  assert.equal(memory.raw, original);
  assert.equal(memory.writes, 0);
});

test("pending snapshot and request must agree on owner, revision, content and limits", () => {
  const cases = [
    (p) => { p.ownerId = "user-b"; },
    (p) => { p.requestKey = "not-a-v4-key"; },
    (p) => { p.cartSnapshot.ownerId = "user-b"; },
    (p) => { p.cartRevision++; },
    (p) => { p.phase = ["SUBMITTING"]; },
    (p) => { p.createdAt = "bad-date"; },
    (p) => { p.payload.userId = "spoof"; },
    (p) => { p.payload.items = []; },
    (p) => { p.payload.items[0].qty++; },
    (p) => { p.payload.items[0].expectedUnitPrice++; },
    (p) => { p.payload.items[0].toppingIds = []; },
    (p) => { p.payload.items[0].total = 1; },
    (p) => { p.payload.items.push(structuredClone(p.payload.items[0])); },
  ];
  for (const modify of cases) {
    const value = envelope("user-a");
    const item = pending("user-a"); modify(item);
    value.pendingRequests["user-a"] = item;
    assert.equal(isCartEnvelope(value), false);
  }
});

test("pending body limit uses UTF-8 bytes", () => {
  const value = envelope("user-a");
  const item = pending("user-a");
  const longId = "é".repeat(17000);
  item.payload.items[0].productId = longId;
  item.cartSnapshot.items[0].productId = longId;
  value.pendingRequests["user-a"] = item;
  assert.equal(isCartEnvelope(value), false);
});

test("pending/result selectors return data only for the supplied owner", () => {
  const value = envelope("user-b");
  value.pendingRequests["user-a"] = pending("user-a");
  value.lastOrderResult = confirmed("user-a");
  assert.equal(pendingForOwner(value, null), null);
  assert.equal(pendingForOwner(value, "user-b"), null);
  assert.equal(resultForOwner(value, "user-b"), null);
  assert.equal(resultForOwner(value, null), null);
  assert.equal(pendingForOwner(value, "user-a").requestKey, REQUEST_KEY);
  assert.equal(resultForOwner(value, "user-a").order.id, "order-a");
});

test("prototype-like opaque owner IDs stay ordinary own map entries", () => {
  const value = envelope();
  value.pendingRequests = Object.fromEntries([["__proto__", pending("__proto__")]]);
  const loaded = decodeCartEnvelope(encodeCartEnvelope(value));
  assert.equal(pendingForOwner(loaded, "__proto__").ownerId, "__proto__");
  assert.equal(pendingForOwner(loaded, "toString"), null);
  assert.equal(Object.getPrototypeOf(loaded.pendingRequests), Object.prototype);
});

test("confirmed record must remain a PENDING creation result with valid amount", () => {
  for (const modify of [
    (r) => { r.order.status = "PAID"; },
    (r) => { r.order.total = -1; },
    (r) => { r.order.total = MAX_CART_MONEY + 1; },
    (r) => { r.order.id = ""; },
    (r) => { r.confirmedAt = ""; },
    (r) => { r.accessToken = "must-not-be-stored"; },
  ]) {
    const value = envelope(); value.lastOrderResult = confirmed("user-a");
    modify(value.lastOrderResult);
    assert.equal(isCartEnvelope(value), false);
  }
});

test("cart mutation performs one durable write and preserves other owners' pending/result", async () => {
  const value = envelope();
  value.pendingRequests["user-a"] = pending("user-a");
  value.lastOrderResult = confirmed("user-a");
  const { service, memory, locks } = setup(value);
  const saved = await service.mutateCart({ type: "ADD_ITEM", item: draft() }, null);
  assert.equal(saved.error, null);
  assert.equal(saved.envelope.cart.items[0].qty, 2);
  assert.equal(saved.envelope.cart.revision, 2);
  assert.deepEqual(saved.envelope.pendingRequests, value.pendingRequests);
  assert.deepEqual(saved.envelope.lastOrderResult, value.lastOrderResult);
  assert.equal(memory.writes, 1);
  assert.deepEqual(decodeCartEnvelope(memory.raw), saved.envelope);
  assert.equal(locks.held, false, "caller continues after lock release");
  assert.equal(locks.requests[0].name, CART_LOCK_NAME);
  assert.equal(locks.requests[0].options.mode, "exclusive");
});

test("two clients read latest storage under one lock without losing either edit", async () => {
  const { storage, locks, memory, service } = setup(envelope());
  const second = createCartStorage({ storage, locks });
  await Promise.all([
    service.mutateCart({ type: "ADD_ITEM", item: draft() }, null),
    second.mutateCart({ type: "ADD_ITEM", item: draft() }, null),
  ]);
  const loaded = decodeCartEnvelope(memory.raw);
  assert.equal(loaded.cart.items[0].qty, 3);
  assert.equal(loaded.cart.revision, 3);
  assert.equal(memory.writes, 2);
});

test("owner changed before queued mutation is detected inside the lock", async () => {
  const { service, memory, locks } = setup(envelope("user-a"));
  let release;
  const holding = locks.request(CART_LOCK_NAME, {}, () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const mutation = service.mutateCart({ type: "ADD_ITEM", item: draft() }, "user-a");
  const rejection = assert.rejects(mutation, code("OWNER_MISMATCH"));
  memory.raw = encodeCartEnvelope(envelope("user-b"));
  release(); await holding; await rejection;
  assert.equal(memory.writes, 0);
  assert.equal(decodeCartEnvelope(memory.raw).cart.ownerId, "user-b");
});

test("queued action captures the draft before caller modifies it", async () => {
  const { service, locks } = setup();
  let release;
  const holding = locks.request(CART_LOCK_NAME, {}, () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const item = draft();
  const mutation = service.mutateCart({ type: "ADD_ITEM", item }, null);
  item.previewUnitPrice = 1;
  item.toppingNames.cream = "changed";
  release(); await holding;
  const saved = await mutation;
  assert.equal(saved.envelope.cart.items[0].previewUnitPrice, 47000);
  assert.equal(saved.envelope.cart.items[0].toppingNames.cream, "Kem");
});

test("own pending blocks all cart edits, including after current cart was cleared", async () => {
  for (const empty of [false, true]) {
    const value = envelope("user-a");
    const lineKey = getCartLineKey(value.cart.items[0]);
    value.pendingRequests["user-a"] = pending("user-a");
    if (empty) value.cart.items = [];
    const { service, memory } = setup(value);
    const original = memory.raw;
    for (const action of [{ type: "ADD_ITEM", item: draft() },
      ...["INCREMENT", "DECREMENT", "REMOVE_ITEM"].map((type) => ({ type, lineKey }))]) {
      await assert.rejects(service.mutateCart(action, "user-a"), code("PENDING_REQUEST"));
    }
    assert.equal(memory.writes, 0);
    assert.equal(memory.raw, original);
  }
});

test("business rejection and no-op never write a changed envelope", async () => {
  const value = envelope(); value.cart.items[0].qty = 20;
  const { service, memory } = setup(value);
  const original = memory.raw;
  const saved = await service.mutateCart({ type: "ADD_ITEM", item: draft() }, null);
  assert.equal(saved.error.code, "MAX_QUANTITY");
  await service.mutateCart({ type: "REMOVE_ITEM", lineKey: "missing" }, null);
  assert.equal(memory.raw, original);
  assert.equal(memory.writes, 0);
});

test("read and quota errors keep existing bytes and do not publish a successful mutation", async () => {
  const { service, memory } = setup(envelope());
  const original = memory.raw;
  memory.failRead = true;
  await assert.rejects(service.read(), code("STORAGE_UNAVAILABLE"));
  memory.failRead = false; memory.failWrite = true;
  await assert.rejects(service.mutateCart({ type: "ADD_ITEM", item: draft() }, null), code("STORAGE_UNAVAILABLE"));
  assert.equal(memory.raw, original);
  assert.equal(memory.writes, 0);
});

test("missing or rejected Web Locks never falls back to unprotected storage", async () => {
  let reads = 0;
  const storage = { getItem() { reads++; return null; }, setItem() { assert.fail("must not write"); } };
  for (const locks of [undefined, {}, { request() { throw new Error("blocked"); } }]) {
    const service = createCartStorage({ storage, locks });
    await assert.rejects(service.read(), code("LOCK_UNAVAILABLE"));
  }
  assert.equal(reads, 0);
});

test("queue wait expires after 2000 ms, aborts queued work and allows later retry", async () => {
  assert.equal(CART_LOCK_WAIT_MS, 2000);
  const { service, memory, locks } = setup(envelope());
  let release;
  const holding = locks.request(CART_LOCK_NAME, {}, () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const mutation = service.mutateCart({ type: "ADD_ITEM", item: draft() }, null);
  await assert.rejects(mutation, code("LOCK_TIMEOUT"));
  assert.equal(memory.reads, 0);
  assert.equal(memory.writes, 0);
  release(); await holding;
  const loaded = await service.read();
  assert.equal(loaded.cart.items[0].qty, 1);
  assert.equal(memory.writes, 0);
});

test("revision cannot overflow a safe integer", async () => {
  const value = envelope(); value.cart.revision = Number.MAX_SAFE_INTEGER;
  const { service, memory } = setup(value);
  await assert.rejects(service.mutateCart({ type: "ADD_ITEM", item: draft() }, null), code("REVISION_OVERFLOW"));
  assert.equal(memory.writes, 0);
});
