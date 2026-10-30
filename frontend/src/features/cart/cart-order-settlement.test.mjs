import assert from "node:assert/strict";
import test from "node:test";
import { cartReducer, getCartLineKey, MAX_CART_MONEY, selectCartTotal } from "./cart-reducer.ts";
import { CartStorageError, createEmptyCartEnvelope, encodeCartEnvelope, resultForOwner } from "./cart-envelope.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const NEW_KEY = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-10-30T06:00:00.000Z";
const RECEIVED = "2026-10-30T06:00:01.000Z";
const code = (expected) => (error) => error instanceof CartStorageError && error.code === expected;
const draft = (extra = {}) => ({ productId: "coffee-milk", productName: "Cà phê sữa",
  imageUrl: "/images/coffee-milk.svg", size: "M", toppingIds: ["cream"], toppingNames: { cream: "Kem" },
  previewUnitPrice: 47000, ...extra });
const checkpoint = (cart) => ({ ownerId: cart.ownerId, revision: cart.revision });

function cart(ownerId = "user-a") {
  let state = { cart: createEmptyCartEnvelope().cart, error: null };
  for (const item of [draft(), draft(), draft({ productId: "tea", size: "S", toppingIds: [],
    toppingNames: {}, productName: "Trà", previewUnitPrice: 35000 })]) {
    state = cartReducer(state, { type: "ADD_ITEM", item });
  }
  return { ...state.cart, ownerId };
}

function pending(snapshot = cart(), requestKey = KEY) {
  return { ownerId: snapshot.ownerId, requestKey, cartRevision: snapshot.revision,
    cartSnapshot: structuredClone(snapshot), createdAt: TIME, phase: "SUBMITTING",
    payload: { items: snapshot.items.map((item) => ({ productId: item.productId, size: item.size,
      toppingIds: [...item.toppingIds], qty: item.qty, expectedUnitPrice: item.previewUnitPrice })) } };
}

function prepared() {
  const value = createEmptyCartEnvelope(); value.cart = cart();
  value.pendingRequests["user-a"] = pending(value.cart);
  return value;
}

function success(total = 129000) { return { id: "order-a", status: "PENDING", total }; }
function errorBody(code, extra = {}) { return { error: { code, message: "Thông báo", ...extra } }; }
function prices(value = prepared()) {
  const items = [...value.pendingRequests["user-a"].payload.items].reverse().map((item) => {
    const price = item.expectedUnitPrice + (item.productId === "coffee-milk" ? 2000 : 0);
    return { ...structuredClone(item), currentUnitPrice: price, currentLineTotal: price * item.qty };
  });
  return errorBody("PRICE_CHANGED", { details: { items,
    currentTotal: items.reduce((sum, item) => sum + item.currentLineTotal, 0) } });
}
function command(status = 201, body = success(), extra = {}) {
  return { ownerId: "user-a", requestKey: KEY, status, body, receivedAt: RECEIVED, ...extra };
}

// Simulated ports: storage reads/writes assert the lock; the real browser/backend
// integration remains separate. FIFO ordering allows controlled late callbacks.
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
      this.queue.push(job); this.drain();
    });
  }
  drain() {
    if (this.held || !this.queue.length) return;
    const job = this.queue.shift();
    job.signal?.removeEventListener("abort", job.abort); this.held = true;
    const finish = () => { this.held = false; this.drain(); };
    Promise.resolve().then(job.callback).then(
      (value) => { finish(); job.resolve(value); },
      (error) => { finish(); job.reject(error); },
    );
  }
}

function setup(value = prepared()) {
  const locks = new TestLocks();
  const memory = { raw: encodeCartEnvelope(value), writes: 0, failWrite: false, failRead: false };
  const storage = {
    getItem(key) {
      assert.equal(locks.held, true); assert.equal(key, CART_STORAGE_KEY);
      if (memory.failRead) throw new Error("blocked");
      return memory.raw;
    },
    setItem(key, raw) {
      assert.equal(locks.held, true); assert.equal(key, CART_STORAGE_KEY);
      if (memory.failWrite) throw new Error("quota");
      memory.writes++; memory.raw = raw;
    },
  };
  return { memory, locks, storage, service: createCartStorage({ storage, locks }) };
}

test("201 and 200 atomically save PENDING result, remove own pending and clear only its revision", async () => {
  for (const status of [201, 200]) {
    const value = prepared(); value.pendingRequests["user-b"] = pending(cart("user-b"), NEW_KEY);
    const { service, memory, locks } = setup(value);
    const saved = await service.settleOrder(command(status));
    assert.equal(saved.outcome.kind, "CONFIRMED"); assert.equal(saved.cartEffect, "CLEARED");
    assert.equal(memory.writes, 1); assert.equal(locks.held, false);
    const stored = JSON.parse(memory.raw);
    assert.deepEqual(stored.cart, { ownerId: "user-a", revision: value.cart.revision + 1, items: [] });
    assert.equal(Object.hasOwn(stored.pendingRequests, "user-a"), false);
    assert.equal(stored.pendingRequests["user-b"].requestKey, NEW_KEY);
    assert.deepEqual(stored.lastOrderResult, { ownerId: "user-a", requestKey: KEY, order: success(), confirmedAt: RECEIVED });
    assert.deepEqual(resultForOwner(await service.read(), "user-a").order, success());
  }
});

test("repeated callbacks after confirmation do not clear again or turn success into UNKNOWN", async () => {
  const { service, memory } = setup();
  await service.settleOrder(command()); const raw = memory.raw;
  for (const reply of [command(200), command(null, null), command(500, errorBody("INTERNAL_ERROR"))]) {
    assert.equal((await service.settleOrder(reply)).outcome.kind, "IGNORED");
  }
  assert.equal(memory.writes, 1); assert.equal(memory.raw, raw);
});

test("confirmation arriving after account switch never clears the new owner's cart", async () => {
  const value = prepared(); value.cart = cart("user-b");
  const { service } = setup(value);
  const saved = await service.settleOrder(command());
  assert.equal(saved.cartEffect, "UNRELATED"); assert.deepEqual(saved.envelope.cart, value.cart);
  assert.equal(resultForOwner(saved.envelope, "user-b"), null);
  assert.equal(resultForOwner(saved.envelope, "user-a").order.id, "order-a");
  assert.equal(Object.hasOwn(saved.envelope.pendingRequests, "user-a"), false);
});

test("confirmation never removes a newer cart of the same owner", async () => {
  const value = prepared(); value.cart = { ...cart(), revision: value.cart.revision + 4,
    items: [{ ...cart().items[0], productId: "new-choice" }] };
  const { service } = setup(value);
  const saved = await service.settleOrder(command());
  assert.equal(saved.outcome.kind, "CONFIRMED");
  assert.equal(saved.cartEffect, "UNRELATED"); assert.deepEqual(saved.envelope.cart, value.cart);
});

test("a free order with a valid zero official total can be confirmed", async () => {
  const value = prepared(); value.cart.items = value.cart.items.map((item) => ({ ...item, previewUnitPrice: 0 }));
  value.pendingRequests["user-a"] = pending(value.cart);
  const { service } = setup(value);
  assert.equal((await service.settleOrder(command(201, success(0)))).outcome.kind, "CONFIRMED");
});

test("malformed success bodies retain request identity and never save an order", async () => {
  for (const body of [null, {}, { ...success(), id: "" }, { ...success(), status: "PAID" },
    success(1), success(-1), success("129000"), { ...success(), total: 129000.5 },
    { ...success(), unexpected: true }]) {
    const value = prepared(); const { service, memory } = setup(value);
    const saved = await service.settleOrder(command(200, body));
    assert.equal(saved.outcome.kind, "UNKNOWN");
    assert.deepEqual(saved.envelope.cart, value.cart); assert.equal(saved.envelope.lastOrderResult, null);
    assert.deepEqual(saved.envelope.pendingRequests["user-a"], { ...value.pendingRequests["user-a"], phase: "UNKNOWN" });
    assert.equal(memory.writes, 1);
  }
});

test("auth, forbidden, oversized, conflict, in-progress and system errors all preserve pending", async () => {
  const errors = [[401, "AUTH_REQUIRED"], [401, "SESSION_EXPIRED"], [401, "SESSION_INVALID"],
    [403, "REQUEST_FORBIDDEN"], [413, "PAYLOAD_TOO_LARGE"], [409, "IDEMPOTENCY_CONFLICT"],
    [409, "ORDER_REQUEST_IN_PROGRESS"], [500, "INTERNAL_ERROR"], [502, "UPSTREAM_UNAVAILABLE"],
    [504, "UPSTREAM_TIMEOUT"]];
  for (const [status, code] of errors) {
    const value = prepared(); const { service } = setup(value);
    const saved = await service.settleOrder(command(status, errorBody(code)));
    assert.deepEqual(saved.outcome, { kind: "UNKNOWN", code });
    assert.deepEqual(saved.envelope.cart, value.cart);
    assert.deepEqual(saved.envelope.pendingRequests["user-a"], { ...value.pendingRequests["user-a"], phase: "UNKNOWN" });
  }
});

test("network failure, wrong status/code pairs and invalid error shapes remain UNKNOWN", async () => {
  for (const reply of [command(null, null), command(204, null), command(400, errorBody("PRICE_CHANGED")),
    command(500, errorBody("VALIDATION_ERROR")), command(409, errorBody("VALIDATION_ERROR")),
    command(400, { error: { code: "VALIDATION_ERROR" } }), command(400, "not-json"),
    command(400, errorBody("VALIDATION_ERROR", { extra: true }))]) {
    const { service } = setup();
    assert.equal((await service.settleOrder(reply)).outcome.kind, "UNKNOWN");
  }
});

test("definitive validation rejection preserves editable cart and original request field indexes", async () => {
  const value = prepared(); const { service, memory } = setup(value);
  const fields = { "items[1].toppingIds": ["Topping không hợp lệ"], items: ["Kiểm tra giỏ"] };
  const saved = await service.settleOrder(command(400, errorBody("VALIDATION_ERROR", { fieldErrors: fields })));
  assert.deepEqual(saved.outcome, { kind: "REJECTED", message: "Thông báo", fieldErrors: fields });
  assert.equal(saved.cartEffect, "UNCHANGED"); assert.deepEqual(saved.envelope.cart, value.cart);
  assert.equal(Object.hasOwn(saved.envelope.pendingRequests, "user-a"), false);
  assert.equal(saved.envelope.lastOrderResult, null); assert.equal(memory.writes, 1);
  assert.equal((await service.mutateCart({ type: "ADD_ITEM", item: draft() }, "user-a")).error, null);
});

test("validation rejection can restore an empty current cart of the same owner with a fresh revision", async () => {
  const value = prepared(); value.cart = { ownerId: "user-a", revision: value.cart.revision + 4, items: [] };
  const { service, memory } = setup(value);
  const saved = await service.settleOrder(command(400, errorBody("VALIDATION_ERROR")));
  assert.equal(saved.cartEffect, "RESTORED"); assert.equal(saved.envelope.cart.revision, value.cart.revision + 1);
  assert.deepEqual(saved.envelope.cart.items, value.pendingRequests["user-a"].cartSnapshot.items);
  assert.equal(memory.writes, 1); assert.equal(Object.hasOwn(saved, "request"), false);
});

test("definitive rejection never restores over a logged-out or unrelated nonempty cart", async () => {
  for (const current of [{ ownerId: null, revision: 10, items: [] }, cart("user-b"),
    { ...cart(), revision: 10, items: [{ ...cart().items[0], productId: "new-choice" }] }]) {
    const value = prepared(); value.cart = current; const { service } = setup(value);
    const saved = await service.settleOrder(command(400, errorBody("VALIDATION_ERROR")));
    assert.equal(saved.outcome.kind, "REJECTED"); assert.equal(saved.cartEffect, "UNRELATED");
    assert.deepEqual(saved.envelope.cart, current);
  }
});

test("malformed field errors or indexes outside the original request cannot end pending", async () => {
  for (const fieldErrors of [{ "items[2].qty": ["invalid"] }, { "items[-1].qty": ["invalid"] },
    { "items[0].qty": "not-an-array" }, { "items[0].qty": [] }, { "items[0].qty": [1] }]) {
    const { service } = setup();
    const saved = await service.settleOrder(command(400, errorBody("VALIDATION_ERROR", { fieldErrors })));
    assert.equal(saved.outcome.kind, "UNKNOWN"); assert.ok(saved.envelope.pendingRequests["user-a"]);
  }
});

test("complete PRICE_CHANGED reprices by configuration, keeps choices/qty and waits for a new confirmation", async () => {
  const value = prepared(); const { service, memory } = setup(value);
  const saved = await service.settleOrder(command(409, prices(value)));
  assert.equal(saved.outcome.kind, "PRICE_CHANGED"); assert.equal(saved.cartEffect, "REPRICED");
  assert.equal(selectCartTotal(saved.envelope.cart), 133000);
  assert.equal(saved.envelope.cart.revision, value.cart.revision + 1);
  assert.equal(saved.envelope.cart.items[0].previewUnitPrice, 49000);
  assert.equal(saved.envelope.cart.items[1].previewUnitPrice, 35000);
  for (let i = 0; i < value.cart.items.length; i++) {
    const { previewUnitPrice: previousPrice, ...before } = value.cart.items[i];
    const { previewUnitPrice: currentPrice, ...after } = saved.envelope.cart.items[i];
    assert.ok(Number.isInteger(previousPrice) && Number.isInteger(currentPrice));
    assert.deepEqual(after, before);
  }
  assert.equal(Object.hasOwn(saved.envelope.pendingRequests, "user-a"), false);
  assert.equal(Object.hasOwn(saved, "request"), false); assert.equal(memory.writes, 1);
  const next = await service.applyLifecycle({ type: "BEGIN_ORDER", ownerId: "user-a", requestKey: NEW_KEY,
    createdAt: RECEIVED, expectedCart: checkpoint(saved.envelope.cart) });
  assert.equal(next.request.requestKey, NEW_KEY); assert.equal(next.request.payload.items[0].expectedUnitPrice, 49000);
});

test("incomplete or inconsistent price details never partially reprice or discard pending", async () => {
  const changes = [
    (d) => { d.items.pop(); }, (d) => { d.items.push(structuredClone(d.items[0])); },
    (d) => { d.items[0] = structuredClone(d.items[1]); },
    (d) => { d.items[0].productId = "unknown"; }, (d) => { d.items[0].size = "XL"; },
    (d) => { d.items[0].toppingIds = ["cream", "cream"]; },
    (d) => { d.items[0].qty++; }, (d) => { d.items[0].expectedUnitPrice++; },
    (d) => { d.items[0].currentUnitPrice = -1; }, (d) => { d.items[0].currentUnitPrice = 1.5; },
    (d) => { d.items[0].currentLineTotal++; }, (d) => { d.currentTotal++; },
    (d) => { d.items[0].extra = true; }, (d) => { delete d.items[0].currentLineTotal; },
    (d) => { for (const i of d.items) { i.currentUnitPrice = i.expectedUnitPrice;
      i.currentLineTotal = i.currentUnitPrice * i.qty; } d.currentTotal = 129000; },
  ];
  for (const change of changes) {
    const value = prepared(); const body = prices(value); change(body.error.details);
    const { service } = setup(value); const saved = await service.settleOrder(command(409, body));
    assert.equal(saved.outcome.kind, "UNKNOWN"); assert.deepEqual(saved.envelope.cart, value.cart);
    assert.deepEqual(saved.envelope.pendingRequests["user-a"], { ...value.pendingRequests["user-a"], phase: "UNKNOWN" });
  }
});

test("repricing allows zero prices but rejects line or aggregate PostgreSQL Int overflow", async () => {
  const value = prepared(); const free = prices(value);
  for (const i of free.error.details.items) { i.currentUnitPrice = 0; i.currentLineTotal = 0; }
  free.error.details.currentTotal = 0;
  const { service } = setup(value);
  assert.equal(selectCartTotal((await service.settleOrder(command(409, free))).envelope.cart), 0);
  for (const aggregate of [false, true]) {
    const body = prices(value);
    for (const i of body.error.details.items) {
      i.currentUnitPrice = aggregate ? Math.floor(MAX_CART_MONEY / i.qty) : MAX_CART_MONEY;
      i.currentLineTotal = i.currentUnitPrice * i.qty;
    }
    body.error.details.currentTotal = body.error.details.items.reduce((sum, i) => sum + i.currentLineTotal, 0);
    assert.equal((await setup(value).service.settleOrder(command(409, body))).outcome.kind, "UNKNOWN");
  }
});

test("opaque IDs and reordered topping sets are matched without delimiter collisions", async () => {
  const value = prepared();
  const a = { ...value.cart.items[0], productId: "p|S", toppingIds: ["a", "b|c"],
    toppingNames: { a: "A", "b|c": "BC" } };
  const b = { ...a, toppingIds: ["a|b", "c"], toppingNames: { "a|b": "AB", c: "C" } };
  value.cart.items = [a, b]; value.pendingRequests["user-a"] = pending(value.cart);
  const body = prices(value);
  body.error.details.items.forEach((i, index) => {
    i.toppingIds.reverse(); i.currentUnitPrice += 1000 * (index + 1); i.currentLineTotal = i.qty * i.currentUnitPrice;
  });
  body.error.details.currentTotal = body.error.details.items.reduce((sum, i) => sum + i.currentLineTotal, 0);
  const saved = await setup(value).service.settleOrder(command(409, body));
  assert.equal(saved.outcome.kind, "PRICE_CHANGED");
  const expected = new Map(body.error.details.items.map((i) => [getCartLineKey(i), i.currentUnitPrice]));
  for (const item of saved.envelope.cart.items) assert.equal(item.previewUnitPrice, expected.get(getCartLineKey(item)));
});

test("price rejection restores only an empty same-owner cart, never a new or logged-out cart", async () => {
  for (const current of [{ ownerId: "user-a", revision: 10, items: [] },
    { ownerId: null, revision: 10, items: [] }, cart("user-b"),
    { ...cart(), revision: 10, items: [{ ...cart().items[0], productId: "new-choice" }] }]) {
    const value = prepared(); value.cart = current;
    const saved = await setup(value).service.settleOrder(command(409, prices(value)));
    assert.equal(saved.outcome.kind, "PRICE_CHANGED");
    if (current.ownerId === "user-a" && current.items.length === 0) {
      assert.equal(saved.cartEffect, "RESTORED"); assert.equal(saved.envelope.cart.revision, 11);
      assert.equal(selectCartTotal(saved.envelope.cart), 133000);
    } else { assert.equal(saved.cartEffect, "UNRELATED"); assert.deepEqual(saved.envelope.cart, current); }
  }
});

test("failed atomic writes preserve pending/cart/result and allow retry with the original key", async () => {
  for (const reply of [command(), command(400, errorBody("VALIDATION_ERROR")), command(409, prices())]) {
    const value = prepared(); const { service, memory } = setup(value); const raw = memory.raw;
    memory.failWrite = true;
    await assert.rejects(service.settleOrder(reply), code("STORAGE_UNAVAILABLE"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
    memory.failWrite = false;
    const retried = await service.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-a", requestKey: KEY,
      expectedCart: checkpoint(value.cart) });
    assert.deepEqual(retried.request, value.pendingRequests["user-a"]);
  }
});

test("invalid confirmation metadata and overflowing cart revision cannot partially settle", async () => {
  const port = setup(); const raw = port.memory.raw;
  await assert.rejects(port.service.settleOrder(command(201, success(), { receivedAt: "invalid" })), code("INVALID_DATA"));
  assert.equal(port.memory.raw, raw); assert.equal(port.memory.writes, 0);
  for (const reply of [command(), command(409, prices())]) {
    const value = prepared(); value.cart.revision = Number.MAX_SAFE_INTEGER;
    value.pendingRequests["user-a"] = pending(value.cart);
    const { service, memory } = setup(value); const original = memory.raw;
    await assert.rejects(service.settleOrder(reply), code("REVISION_OVERFLOW"));
    assert.equal(memory.raw, original); assert.equal(memory.writes, 0);
  }
});

test("old callbacks cannot affect a newer pending key or its future result", async () => {
  const value = prepared(); value.pendingRequests["user-a"].requestKey = NEW_KEY;
  const { service, memory } = setup(value); const raw = memory.raw;
  assert.equal((await service.settleOrder(command())).outcome.kind, "IGNORED");
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("concurrent success and network-uncertainty callbacks commit only one final result", async () => {
  const { service, storage, locks, memory } = setup();
  const second = createCartStorage({ storage, locks });
  const [confirmed, late] = await Promise.all([
    service.settleOrder(command()), second.settleOrder(command(null, null)),
  ]);
  assert.equal(confirmed.outcome.kind, "CONFIRMED"); assert.equal(late.outcome.kind, "IGNORED");
  assert.equal(memory.writes, 1); assert.equal(JSON.parse(memory.raw).lastOrderResult.order.id, "order-a");
});

test("settlement captures the reply before queued wait and rereads the latest owner under lock", async () => {
  const { service, locks, memory } = setup(); let release;
  const hold = locks.request(CART_LOCK_NAME, {}, () => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  const reply = command(); const operation = service.settleOrder(reply);
  reply.body.total = -1; reply.ownerId = "user-b";
  const latest = prepared(); latest.cart = cart("user-b"); memory.raw = encodeCartEnvelope(latest);
  release(); await hold;
  const saved = await operation;
  assert.equal(saved.outcome.kind, "CONFIRMED"); assert.deepEqual(saved.envelope.cart, latest.cart);
});

test("read errors and prototype-like owner IDs do not bypass settlement isolation", async () => {
  const port = setup(); const raw = port.memory.raw; port.memory.failRead = true;
  await assert.rejects(port.service.settleOrder(command()), code("STORAGE_UNAVAILABLE"));
  assert.equal(port.memory.raw, raw); assert.equal(port.memory.writes, 0);
  const value = prepared(); const snapshot = cart("__proto__"); value.cart = snapshot;
  value.pendingRequests = Object.fromEntries([["__proto__", pending(snapshot)]]);
  const saved = await setup(value).service.settleOrder(command(201, success(), { ownerId: "__proto__" }));
  assert.equal(saved.outcome.kind, "CONFIRMED"); assert.equal(saved.envelope.lastOrderResult.ownerId, "__proto__");
  assert.equal(Object.hasOwn(saved.envelope.pendingRequests, "__proto__"), false);
  assert.equal(Object.getPrototypeOf(saved.envelope.pendingRequests), Object.prototype);
});
