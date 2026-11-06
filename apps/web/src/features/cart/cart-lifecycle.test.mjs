import assert from "node:assert/strict";
import test from "node:test";
import { cartReducer } from "./cart-reducer.ts";
import { CartStorageError, createEmptyCartEnvelope, decodeCartEnvelope,
  encodeCartEnvelope, pendingForOwner, resultForOwner } from "./cart-envelope.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const OTHER_KEY = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-10-30T03:00:00.000Z";
const draft = (productId = "coffee-milk") => ({ productId, productName: "Cà phê sữa",
  imageUrl: "/images/coffee-milk.svg", size: "M", toppingIds: ["cream"],
  toppingNames: { cream: "Kem" }, previewUnitPrice: 47000 });
const checkpoint = (cart) => ({ ownerId: cart.ownerId, revision: cart.revision });
const code = (expected) => (error) => error instanceof CartStorageError && error.code === expected;

function envelope(ownerId = "user-a") {
  const value = createEmptyCartEnvelope();
  value.cart = { ...cartReducer({ cart: value.cart, error: null },
    { type: "ADD_ITEM", item: draft() }).cart, ownerId };
  return value;
}

function pending(ownerId = "user-a", requestKey = KEY) {
  const cartSnapshot = envelope(ownerId).cart;
  return { ownerId, requestKey, cartSnapshot, cartRevision: cartSnapshot.revision,
    payload: { items: [{ productId: "coffee-milk", size: "M", toppingIds: ["cream"],
      qty: 1, expectedUnitPrice: 47000 }] }, createdAt: TIME, phase: "UNKNOWN" };
}

function begin(cart, extra = {}) {
  return { type: "BEGIN_ORDER", ownerId: cart.ownerId, expectedCart: checkpoint(cart),
    requestKey: KEY, createdAt: TIME, ...extra };
}

// FIFO port simulation. No browser/Web Locks or authenticated backend is mounted.
class TestLocks {
  held = false;
  queue = [];
  request(name, options, callback) {
    assert.equal(name, CART_LOCK_NAME);
    return new Promise((resolve, reject) => {
      const job = { callback, resolve, reject, signal: options.signal };
      job.abort = () => {
        this.queue = this.queue.filter((entry) => entry !== job);
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

function setup(value = envelope()) {
  const locks = new TestLocks();
  const memory = { raw: typeof value === "string" ? value : encodeCartEnvelope(value),
    writes: 0, failWrite: false };
  const storage = {
    getItem(key) {
      assert.equal(locks.held, true); assert.equal(key, CART_STORAGE_KEY);
      return memory.raw;
    },
    setItem(key, raw) {
      assert.equal(locks.held, true); assert.equal(key, CART_STORAGE_KEY);
      if (memory.failWrite) throw new DOMException("Full", "QuotaExceededError");
      memory.writes++; memory.raw = raw;
    },
  };
  return { memory, locks, storage, service: createCartStorage({ storage, locks }) };
}

test("first verified login adopts guest choices and preserves other owners' records", async () => {
  const value = envelope(null);
  value.pendingRequests["old-user"] = pending("old-user");
  value.lastOrderResult = { ownerId: "old-user", requestKey: OTHER_KEY,
    order: { id: "old-order", status: "PENDING", total: 47000 }, confirmedAt: TIME };
  const { service, memory } = setup(value);
  const saved = await service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "user-a",
    expectedCart: checkpoint(value.cart) });
  assert.deepEqual(saved.envelope.cart.items, value.cart.items);
  assert.equal(saved.envelope.cart.ownerId, "user-a");
  assert.equal(saved.envelope.cart.revision, value.cart.revision + 1);
  assert.deepEqual(saved.envelope.pendingRequests, value.pendingRequests);
  assert.deepEqual(saved.envelope.lastOrderResult, value.lastOrderResult);
  assert.equal(saved.request, null);
  assert.equal(resultForOwner(saved.envelope, "user-a"), null);
  assert.equal(memory.writes, 1);
});

test("same-owner verification and session expiry keep cart bytes and revision", async () => {
  const value = envelope();
  value.pendingRequests["user-a"] = { ...pending(), phase: "SUBMITTING" };
  const { service, memory } = setup(value);
  const raw = memory.raw;
  await service.read(); // Session expiry itself has no local cart mutation.
  const saved = await service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "user-a",
    expectedCart: checkpoint(value.cart) });
  assert.deepEqual(saved.envelope.cart, value.cart);
  assert.equal(saved.request, null, "login must not return an instruction to send");
  assert.equal(memory.raw, raw);
  assert.equal(memory.writes, 0);
});

test("switching accounts clears old cart and hides but retains old pending/result", async () => {
  const value = envelope(); value.pendingRequests["user-a"] = pending();
  value.lastOrderResult = { ownerId: "user-a", requestKey: OTHER_KEY,
    order: { id: "order-a", status: "PENDING", total: 47000 }, confirmedAt: TIME };
  const { service, memory } = setup(value);
  const saved = await service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "user-b",
    expectedCart: checkpoint(value.cart) });
  assert.deepEqual(saved.envelope.cart, { ownerId: "user-b", revision: 2, items: [] });
  assert.deepEqual(saved.envelope.pendingRequests, value.pendingRequests);
  assert.equal(pendingForOwner(saved.envelope, "user-b"), null);
  assert.equal(resultForOwner(saved.envelope, "user-b"), null);
  assert.equal(memory.writes, 1);
});

test("both confirmed logout scopes clear cart with one write and retain pending", async () => {
  for (const scope of ["session", "local"]) {
    const value = envelope(); value.pendingRequests["user-a"] = pending();
    const { service, memory } = setup(value);
    const saved = await service.applyLifecycle({ type: "LOGOUT_CONFIRMED", scope,
      expectedCart: checkpoint(value.cart) });
    assert.deepEqual(saved.envelope.cart, { ownerId: null, revision: 2, items: [] });
    assert.deepEqual(saved.envelope.pendingRequests, value.pendingRequests);
    assert.equal(saved.request, null);
    assert.equal(memory.writes, 1);
  }
});

test("unknown logout scope, stale owner or revision cannot clear a newer cart", async () => {
  const value = envelope(); const { service, memory } = setup(value); const raw = memory.raw;
  await assert.rejects(service.applyLifecycle({ type: "LOGOUT_CONFIRMED", scope: "failed",
    expectedCart: checkpoint(value.cart) }), code("INVALID_DATA"));
  for (const type of ["LOGOUT_CONFIRMED", "ADOPT_OWNER"]) {
    const base = { type, scope: "session", ownerId: "user-b" };
    await assert.rejects(service.applyLifecycle({ ...base, expectedCart: { ownerId: "old-user", revision: 1 } }), code("OWNER_MISMATCH"));
    await assert.rejects(service.applyLifecycle({ ...base, expectedCart: { ownerId: "user-a", revision: 0 } }), code("CART_CHANGED"));
  }
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("begin persists a minimal immutable request before returning after lock release", async () => {
  const value = envelope(); const { service, memory, locks } = setup(value);
  const saved = await service.applyLifecycle(begin(value.cart));
  assert.equal(locks.held, false, "HTTP caller can continue only after release");
  assert.equal(memory.writes, 1);
  const stored = JSON.parse(memory.raw).pendingRequests["user-a"];
  assert.equal(stored.phase, "SUBMITTING");
  assert.deepEqual(stored.payload, pending().payload);
  assert.deepEqual(stored.cartSnapshot, value.cart);
  assert.deepEqual(saved.envelope.cart, value.cart);
  assert.deepEqual(saved.request, stored);
  saved.request.payload.items[0].qty = 20;
  saved.request.cartSnapshot.items[0].toppingNames.cream = "changed";
  assert.equal(saved.envelope.pendingRequests["user-a"].payload.items[0].qty, 1);
  assert.equal(JSON.parse(memory.raw).pendingRequests["user-a"].payload.items[0].qty, 1);
});

test("existing own pending rejects a fresh key and keeps all cart edits blocked", async () => {
  const value = envelope(); value.pendingRequests["user-a"] = pending();
  const { service, memory } = setup(value); const raw = memory.raw;
  await assert.rejects(service.applyLifecycle(begin(value.cart, { requestKey: OTHER_KEY })), code("PENDING_REQUEST"));
  await assert.rejects(service.mutateCart({ type: "ADD_ITEM", item: draft() }, "user-a"), code("PENDING_REQUEST"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("two clients confirming simultaneously persist only one key and snapshot", async () => {
  const value = envelope(); const { service, storage, locks, memory } = setup(value);
  const second = createCartStorage({ storage, locks });
  const results = await Promise.allSettled([
    service.applyLifecycle(begin(value.cart)),
    second.applyLifecycle(begin(value.cart, { requestKey: OTHER_KEY })),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.code, "PENDING_REQUEST");
  assert.equal(memory.writes, 1);
  assert.equal(JSON.parse(memory.raw).pendingRequests["user-a"].requestKey, KEY);
});

test("a cart edited since the displayed confirmation must be reviewed again", async () => {
  const value = envelope(); const { service, memory } = setup(value);
  await service.mutateCart({ type: "ADD_ITEM", item: draft() }, "user-a");
  const raw = memory.raw;
  await assert.rejects(service.applyLifecycle(begin(value.cart)), code("CART_CHANGED"));
  assert.equal(memory.raw, raw);
  const current = await service.read();
  const saved = await service.applyLifecycle(begin(current.cart));
  assert.equal(saved.request.payload.items[0].qty, 2);
});

test("new orders need the current verified owner and a nonempty cart", async () => {
  for (const [value, ownerId, expectedCode] of [
    [envelope(null), "user-a", "OWNER_MISMATCH"],
    [envelope(), "user-b", "OWNER_MISMATCH"],
    [{ ...envelope(), cart: { ownerId: "user-a", revision: 1, items: [] } }, "user-a", "EMPTY_CART"],
  ]) {
    const { service, memory } = setup(value);
    await assert.rejects(service.applyLifecycle(begin(value.cart, { ownerId })), code(expectedCode));
    assert.equal(memory.writes, 0);
  }
});

test("invalid key, timestamp or UTF-8 body never saves a sendable request", async () => {
  for (const extra of [{ requestKey: "not-v4" }, { createdAt: "invalid-time" }]) {
    const value = envelope(); const { service, memory } = setup(value);
    await assert.rejects(service.applyLifecycle(begin(value.cart, extra)), code("INVALID_DATA"));
    assert.equal(memory.writes, 0);
  }
  const value = envelope(); value.cart.items[0].productId = "é".repeat(17000);
  const { service, memory } = setup(value); const raw = memory.raw;
  await assert.rejects(service.applyLifecycle(begin(value.cart)), code("INVALID_DATA"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("a new order cannot reuse the most recent confirmed key for that owner", async () => {
  const value = envelope(); value.lastOrderResult = { ownerId: "user-a", requestKey: KEY,
    order: { id: "order-a", status: "PENDING", total: 47000 }, confirmedAt: TIME };
  const { service, memory } = setup(value);
  await assert.rejects(service.applyLifecycle(begin(value.cart)), code("REQUEST_KEY_REUSED"));
  assert.equal(memory.writes, 0);
});

test("quota errors preserve bytes and never return a successful lifecycle result", async () => {
  const pendingValue = envelope(); pendingValue.pendingRequests["user-a"] = pending();
  const cases = [
    [envelope(), begin(envelope().cart)],
    [envelope(null), { type: "ADOPT_OWNER", ownerId: "user-a", expectedCart: checkpoint(envelope(null).cart) }],
    [pendingValue, { type: "RETRY_ORDER", ownerId: "user-a", requestKey: KEY, expectedCart: checkpoint(pendingValue.cart) }],
    [pendingValue, { type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: checkpoint(pendingValue.cart) }],
  ];
  for (const [value, command] of cases) {
    const { service, memory } = setup(value); const raw = memory.raw; memory.failWrite = true;
    await assert.rejects(service.applyLifecycle(command), code("STORAGE_UNAVAILABLE"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("reload and network uncertainty retain exactly the same request identity and payload", async () => {
  const value = envelope(); const { service, memory } = setup(value);
  const saved = await service.applyLifecycle(begin(value.cart));
  const raw = memory.raw;
  const loaded = await service.read();
  assert.deepEqual(loaded.pendingRequests["user-a"], { ...saved.request, phase: "UNKNOWN" });
  assert.equal(memory.raw, raw, "recovery read does not rewrite");
  const marked = await service.applyLifecycle({ type: "MARK_ORDER_UNKNOWN", ownerId: "user-a", requestKey: KEY });
  assert.deepEqual(marked.envelope.pendingRequests["user-a"], { ...saved.request, phase: "UNKNOWN" });
  assert.equal(JSON.parse(memory.raw).pendingRequests["user-a"].phase, "UNKNOWN");
  assert.equal(marked.request, null);
});

test("retry after logout, account switch and return uses old snapshot despite empty cart", async () => {
  const value = envelope(); const { service } = setup(value);
  const original = (await service.applyLifecycle(begin(value.cart))).request;
  let current = await service.read();
  await service.applyLifecycle({ type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: checkpoint(current.cart) });
  current = await service.read();
  await service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "user-b", expectedCart: checkpoint(current.cart) });
  current = await service.read();
  await service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "user-a", expectedCart: checkpoint(current.cart) });
  current = await service.read();
  assert.equal(current.cart.items.length, 0);
  const saved = await service.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-a", requestKey: KEY,
    expectedCart: checkpoint(current.cart) });
  assert.deepEqual(saved.request, original);
  assert.deepEqual(saved.envelope.cart, current.cart);
});

test("retry never replaces original payload with a newer guest cart adopted by the same owner", async () => {
  const value = envelope(null); value.cart.items[0].productId = "new-choice";
  value.pendingRequests["user-a"] = pending();
  const { service } = setup(value);
  const adopted = await service.applyLifecycle({ type: "ADOPT_OWNER", ownerId: "user-a", expectedCart: checkpoint(value.cart) });
  const saved = await service.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-a", requestKey: KEY,
    expectedCart: checkpoint(adopted.envelope.cart) });
  assert.equal(saved.request.payload.items[0].productId, "coffee-milk");
  assert.equal(saved.envelope.cart.items[0].productId, "new-choice");
  assert.notEqual(saved.request.cartRevision, saved.envelope.cart.revision);
});

test("retry cannot use another owner or a missing/stale key", async () => {
  const value = envelope(); value.pendingRequests["user-a"] = pending();
  const { service, memory } = setup(value); const raw = memory.raw;
  await assert.rejects(service.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-b", requestKey: KEY,
    expectedCart: checkpoint(value.cart) }), code("OWNER_MISMATCH"));
  await assert.rejects(service.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-a", requestKey: OTHER_KEY,
    expectedCart: checkpoint(value.cart) }), code("PENDING_NOT_FOUND"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("late uncertainty updates only its matching pending and never the active owner's cart", async () => {
  const value = envelope("user-b"); value.pendingRequests["user-a"] = pending();
  const { service, memory } = setup(value); const raw = memory.raw;
  await service.applyLifecycle({ type: "MARK_ORDER_UNKNOWN", ownerId: "user-a", requestKey: OTHER_KEY });
  await service.applyLifecycle({ type: "MARK_ORDER_UNKNOWN", ownerId: "missing", requestKey: KEY });
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  const saved = await service.applyLifecycle({ type: "MARK_ORDER_UNKNOWN", ownerId: "user-a", requestKey: KEY });
  assert.deepEqual(saved.envelope.cart, value.cart);
  assert.deepEqual(saved.envelope.pendingRequests["user-a"], value.pendingRequests["user-a"]);
  assert.equal(saved.request, null);
});

test("prototype-like owner IDs remain ordinary own entries when beginning and retrying", async () => {
  for (const ownerId of ["__proto__", "toString"]) {
    const value = envelope(ownerId); const { service } = setup(value);
    await service.applyLifecycle(begin(value.cart));
    const saved = await service.applyLifecycle({ type: "RETRY_ORDER", ownerId, requestKey: KEY,
      expectedCart: checkpoint(value.cart) });
    assert.equal(Object.hasOwn(saved.envelope.pendingRequests, ownerId), true);
    assert.equal(saved.request.ownerId, ownerId);
    assert.equal(Object.getPrototypeOf(saved.envelope.pendingRequests), Object.prototype);
  }
});

test("queued commands capture their checkpoint and detect a change before the lock is acquired", async () => {
  const value = envelope(); const { service, locks, memory } = setup(value);
  let release;
  const hold = locks.request(CART_LOCK_NAME, {}, () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const command = begin(value.cart);
  const operation = service.applyLifecycle(command);
  command.expectedCart.revision = 99; command.requestKey = OTHER_KEY;
  release(); await hold;
  assert.equal((await operation).request.requestKey, KEY);

  const current = await service.read();
  const holdAgain = locks.request(CART_LOCK_NAME, {}, () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const logout = service.applyLifecycle({ type: "LOGOUT_CONFIRMED", scope: "session", expectedCart: checkpoint(current.cart) });
  const rejected = assert.rejects(logout, code("OWNER_MISMATCH"));
  memory.raw = encodeCartEnvelope(envelope("user-b"));
  release(); await holdAgain; await rejected;
  assert.equal(decodeCartEnvelope(memory.raw).cart.ownerId, "user-b");
});

test("owner transitions cannot reset or overflow revision; empty guest logout is a no-op", async () => {
  const value = envelope(); value.cart.revision = Number.MAX_SAFE_INTEGER;
  const { service, memory } = setup(value);
  for (const command of [
    { type: "ADOPT_OWNER", ownerId: "user-b", expectedCart: checkpoint(value.cart) },
    { type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: checkpoint(value.cart) },
  ]) await assert.rejects(service.applyLifecycle(command), code("REVISION_OVERFLOW"));
  assert.equal(memory.writes, 0);
  const empty = createEmptyCartEnvelope(); empty.cart.revision = Number.MAX_SAFE_INTEGER;
  const port = setup(empty);
  await port.service.applyLifecycle({ type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: checkpoint(empty.cart) });
  assert.equal(port.memory.writes, 0);
});

test("lifecycle operations keep corrupted storage and fail closed without Web Locks", async () => {
  const port = setup("{broken"); const raw = port.memory.raw;
  await assert.rejects(port.service.applyLifecycle(begin(envelope().cart)), code("INVALID_DATA"));
  assert.equal(port.memory.raw, raw); assert.equal(port.memory.writes, 0);
  const unsafe = createCartStorage({ storage: {
    getItem() { assert.fail("must not read without lock"); },
    setItem() { assert.fail("must not write without lock"); },
  }, locks: undefined });
  await assert.rejects(unsafe.applyLifecycle(begin(envelope().cart)), code("LOCK_UNAVAILABLE"));
});
