import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError, createEmptyCartEnvelope } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { checkoutPreviewV2 } from "./cart-checkout-v2.ts";
import { cartReducer } from "./cart-reducer.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const KEY2 = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-11-07T13:00:00.000Z";
const current = () => true;
const checkpoint = cart => ({ ownerId: cart.ownerId, revision: cart.revision });
const code = expected => error => error instanceof CartStorageError && error.code === expected;

function envelope(ownerId = "A", price = 50000) {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: {
    productId: "cappuccino", productName: "Cappuccino", imageUrl: "/images/cappuccino.svg", size: "M",
    toppingIds: [], toppingNames: {}, previewUnitPrice: price,
  } }).cart, ownerId };
  return value;
}

function begin(cart, overrides = {}) {
  return { type: "BEGIN_ORDER_V2", ownerId: cart.ownerId, expectedCart: checkpoint(cart),
    requestKey: KEY, createdAt: TIME, promotionCode: " demo10 ", ...overrides };
}

function pending(ownerId, v2 = true) {
  const cartSnapshot = envelope(ownerId).cart;
  const items = [{ expectedUnitPrice: 50000, qty: 1, toppingIds: [], size: "M", productId: "cappuccino" }];
  return { ownerId, requestKey: KEY, cartRevision: cartSnapshot.revision, cartSnapshot,
    payload: v2 ? { promotionCode: " demo10 ", expectedTotal: 45000, items, schemaVersion: 2 } : { items },
    phase: "UNKNOWN", createdAt: TIME };
}

class Locks {
  held = false; tail = Promise.resolve();
  request(name, options, action) {
    assert.equal(name, CART_LOCK_NAME); assert.equal(options.mode, "exclusive");
    const result = this.tail.then(() => {
      options.signal.throwIfAborted(); this.held = true;
      try { return action(); } finally { this.held = false; }
    });
    this.tail = result.catch(() => {}); return result;
  }
}

function setup(value = envelope()) {
  const locks = new Locks();
  const memory = { raw: typeof value === "string" ? value : encodeCartEnvelopeV2(value), writes: 0, failWrite: false };
  const storage = {
    getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true); return memory.raw; },
    setItem(key, raw) {
      assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      if (memory.failWrite) throw new Error("quota"); memory.raw = raw; memory.writes++;
    },
  };
  return { service: createCartStorage({ storage, locks }), memory, locks, storage };
}

test("DEMO10 preview respects minimum, integer rounding and discount cap", () => {
  for (const [price, discountTotal, total] of [[49999, 0, 49999], [50000, 5000, 45000],
    [50001, 5000, 45001], [250000, 20000, 230000], [2147483647, 20000, 2147463647]]) {
    const preview = checkoutPreviewV2(envelope("A", price).cart, "demo10");
    assert.equal(preview.discountTotal, discountTotal); assert.equal(preview.total, total);
    assert.equal(preview.promotionPreview, "DEMO10_ESTIMATE");
  }
});

test("new promo input normalizes ASCII only; absent and unknown codes do not claim a valid discount", () => {
  const cart = envelope().cart;
  for (const raw of [null, "", "   "]) {
    const preview = checkoutPreviewV2(cart, raw);
    assert.equal(preview.promotionCode, null); assert.equal(preview.discountTotal, 0); assert.equal(preview.promotionPreview, "NONE");
  }
  const other = checkoutPreviewV2(cart, " other-01 ");
  assert.equal(other.promotionCode, "OTHER-01"); assert.equal(other.total, 50000);
  assert.equal(other.promotionPreview, "UNVERIFIED_CODE");
  for (const raw of ["ı", "càphê", "a b", "A".repeat(33), 123, undefined]) {
    assert.throws(() => checkoutPreviewV2(cart, raw), code("INVALID_DATA"));
  }
});

test("preview is pure and also supports a guest/empty cart without generating a request", () => {
  const cart = envelope(null).cart, before = JSON.stringify(cart);
  checkoutPreviewV2(cart, " demo10 "); assert.equal(JSON.stringify(cart), before);
  assert.equal(checkoutPreviewV2(createEmptyCartEnvelopeV2().cart, null).total, 0);
  assert.throws(() => checkoutPreviewV2({ ...cart, revision: -1 }, null), code("INVALID_DATA"));
});

test("begin saves minimal v2 body/key/snapshot durably and returns after lock release", async () => {
  const value = envelope(); value.cart.items[0].qty = 2;
  const { service, memory, locks } = setup(value);
  const result = await service.applyCheckoutLifecycleV2(begin(value.cart), current);
  assert.equal(locks.held, false); assert.equal(memory.writes, 1);
  const stored = JSON.parse(memory.raw), request = result.request;
  assert.deepEqual(request.payload, { schemaVersion: 2, items: [{ productId: "cappuccino", size: "M", toppingIds: [], qty: 2, expectedUnitPrice: 50000 }],
    promotionCode: "DEMO10", expectedTotal: 90000 });
  assert.equal(request.requestKey, KEY); assert.equal(request.createdAt, TIME); assert.equal(request.phase, "SUBMITTING");
  assert.deepEqual(request.cartSnapshot, value.cart); assert.deepEqual(stored.cart, value.cart);
  assert.deepEqual(stored.checkoutBindings, {}); assert.deepEqual(stored.paymentRecoveries, {});
  assert.deepEqual(stored.pendingRequests.A, request);
  assert.notEqual(request, result.envelope.pendingRequests.A);
  request.payload.items[0].qty = 20;
  assert.equal(result.envelope.pendingRequests.A.payload.items[0].qty, 2);
  assert.equal(JSON.parse(memory.raw).pendingRequests.A.payload.items[0].qty, 2);
});

test("opaque owner/product/topping IDs stay unchanged while only new promo input is normalized", async () => {
  const owner = " A%2F "; const value = envelope(owner);
  const line = value.cart.items[0]; line.productId = " p%2F "; line.toppingIds = [" t "];
  line.toppingNames = { " t ": "Kem" };
  const { service } = setup(value);
  const { request } = await service.applyCheckoutLifecycleV2(begin(value.cart), current);
  assert.equal(request.ownerId, owner); assert.equal(request.payload.items[0].productId, " p%2F ");
  assert.deepEqual(request.payload.items[0].toppingIds, [" t "]);
});

test("another owner's pending/result survives beginning a new request", async () => {
  const value = envelope(); value.pendingRequests.B = pending("B");
  value.lastOrderResult = { ownerId: "B", requestKey: KEY, order: { id: "old", status: "PENDING", total: 50000 }, confirmedAt: TIME };
  const { service, memory } = setup(value);
  await service.applyCheckoutLifecycleV2(begin(value.cart), current);
  const stored = JSON.parse(memory.raw);
  assert.deepEqual(stored.pendingRequests.B, value.pendingRequests.B);
  assert.deepEqual(stored.lastOrderResult, value.lastOrderResult);
});

test("pending, binding or unresolved payment rejects a fresh order without replacing saved identity", async () => {
  for (const kind of ["pending", "binding", "payment"]) {
    const value = envelope();
    if (kind === "pending") value.pendingRequests.A = pending("A");
    if (kind === "binding") value.checkoutBindings.A = { ownerId: "A", orderId: "order-a", cartSnapshot: value.cart,
      cartRevision: value.cart.revision, orderVersion: 0, boundAt: TIME };
    if (kind === "payment") value.paymentRecoveries.A = { [KEY]: { ownerId: "A", requestKey: KEY,
      body: { orderId: "order-a", method: "CARD" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } };
    const { service, memory } = setup(value); const raw = memory.raw;
    await assert.rejects(service.applyCheckoutLifecycleV2(begin(value.cart, { requestKey: KEY2 }), current), code("PENDING_REQUEST"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("two confirmations under one lock save only one fresh request", async () => {
  const value = envelope(); const { service, storage, locks, memory } = setup(value);
  const second = createCartStorage({ storage, locks });
  const results = await Promise.allSettled([
    service.applyCheckoutLifecycleV2(begin(value.cart), current),
    second.applyCheckoutLifecycleV2(begin(value.cart, { requestKey: KEY2 }), current),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.find(r => r.status === "rejected").reason.code, "PENDING_REQUEST");
  assert.equal(memory.writes, 1); assert.equal(JSON.parse(memory.raw).pendingRequests.A.requestKey, KEY);
});

test("stale cart/owner, guest and empty cart do not prepare a request", async () => {
  for (const [value, overrides, expected] of [
    [envelope(), { expectedCart: { ownerId: "A", revision: 0 } }, "CART_CHANGED"],
    [envelope(), { ownerId: "B" }, "OWNER_MISMATCH"],
    [envelope(null), { ownerId: "A" }, "OWNER_MISMATCH"],
    [createEmptyCartEnvelopeV2(), { ownerId: "A" }, "OWNER_MISMATCH"],
  ]) {
    const { service, memory } = setup(value); const raw = memory.raw;
    await assert.rejects(service.applyCheckoutLifecycleV2(begin(value.cart, overrides), current), code(expected));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
  const value = createEmptyCartEnvelopeV2(); value.cart.ownerId = "A";
  await assert.rejects(setup(value).service.applyCheckoutLifecycleV2(begin(value.cart), current), code("EMPTY_CART"));
});

test("invalid key/time/code, zero total and oversized UTF-8 body never become sendable", async () => {
  for (const overrides of [{ requestKey: "not-a-key" }, { createdAt: "yesterday" }, { promotionCode: "code?" }]) {
    const value = envelope(); const { service, memory } = setup(value); const raw = memory.raw;
    await assert.rejects(service.applyCheckoutLifecycleV2(begin(value.cart, overrides), current), code("INVALID_DATA"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
  for (const value of [envelope("A", 0), envelope()]) {
    if (value.cart.items[0].previewUnitPrice !== 0) value.cart.items[0].productId = "☕".repeat(12000);
    const { service, memory } = setup(value); const raw = memory.raw;
    await assert.rejects(service.applyCheckoutLifecycleV2(begin(value.cart), current), code("INVALID_DATA"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("a fresh order cannot reuse the most recent confirmed key for this owner", async () => {
  const value = envelope(); value.lastOrderResult = { ownerId: "A", requestKey: KEY,
    order: { id: "old", status: "PENDING", total: 50000 }, confirmedAt: TIME };
  const { service, memory } = setup(value); const raw = memory.raw;
  await assert.rejects(service.applyCheckoutLifecycleV2(begin(value.cart), current), code("REQUEST_KEY_REUSED"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("reload/uncertainty and explicit retry preserve exactly the saved v2 body, key and timestamp", async () => {
  const value = envelope(); const original = pending("A"); value.pendingRequests.A = original;
  const { service, memory, locks } = setup(value);
  const read = await service.readV2();
  const retried = await service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: "A",
    expectedCart: checkpoint(read.cart), requestKey: KEY }, current);
  assert.equal(locks.held, false); assert.equal(retried.request.phase, "SUBMITTING");
  assert.equal(JSON.stringify(retried.request.payload), JSON.stringify(original.payload));
  assert.equal(retried.request.payload.promotionCode, " demo10 ");
  await service.applyCheckoutLifecycleV2({ type: "MARK_ORDER_UNKNOWN", ownerId: "A", requestKey: KEY }, current);
  const stored = JSON.parse(memory.raw).pendingRequests.A;
  assert.deepEqual({ ...stored, phase: original.phase }, original);
});

test("migrated v1 retry never gains schemaVersion, promo or a new expected total", async () => {
  const old = createEmptyCartEnvelope(); old.cart = envelope().cart; old.pendingRequests.A = pending("A", false);
  const { service } = setup(JSON.stringify(old)); await service.migrateToV2();
  const result = await service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: "A",
    expectedCart: checkpoint(old.cart), requestKey: KEY }, current);
  assert.equal(JSON.stringify(result.request.payload), JSON.stringify(old.pendingRequests.A.payload));
  assert.deepEqual(Object.keys(result.request.payload), ["items"]);
});

test("retry after logout and return uses saved snapshot despite an empty current cart", async () => {
  const value = envelope(); value.pendingRequests.A = pending("A"); const { service } = setup(value);
  const guest = await service.applyOwnerLifecycleV2({ type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: checkpoint(value.cart) }, current);
  const returned = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A", expectedCart: checkpoint(guest.cart) }, current);
  const result = await service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: "A", expectedCart: checkpoint(returned.cart), requestKey: KEY }, current);
  assert.deepEqual(result.envelope.cart.items, []); assert.deepEqual(result.request.cartSnapshot, value.cart);
  assert.deepEqual(result.request.payload, value.pendingRequests.A.payload);
});

test("retry does not rebuild an old body from a newer guest cart adopted by the same owner", async () => {
  const value = envelope(null, 99000); value.pendingRequests.A = pending("A"); const { service } = setup(value);
  const returned = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A", expectedCart: checkpoint(value.cart) }, current);
  const result = await service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: "A", expectedCart: checkpoint(returned.cart), requestKey: KEY }, current);
  assert.equal(result.envelope.cart.items[0].previewUnitPrice, 99000);
  assert.equal(result.request.payload.items[0].expectedUnitPrice, 50000);
  assert.equal(result.request.cartRevision, 1); assert.equal(result.envelope.cart.revision, 2);
});

test("retry cannot use another owner, missing key or stale checkpoint", async () => {
  const value = envelope(); value.pendingRequests.A = pending("A"); const { service, memory } = setup(value); const raw = memory.raw;
  for (const [overrides, expected] of [[{ ownerId: "B" }, "OWNER_MISMATCH"],
    [{ requestKey: KEY2 }, "PENDING_NOT_FOUND"], [{ expectedCart: { ownerId: "A", revision: 0 } }, "CART_CHANGED"]]) {
    await assert.rejects(service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: "A",
      expectedCart: checkpoint(value.cart), requestKey: KEY, ...overrides }, current), code(expected));
  }
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("old-key uncertainty is a no-op; matching uncertainty changes only its own phase", async () => {
  const value = envelope(); value.pendingRequests.A = { ...pending("A"), phase: "SUBMITTING" }; value.pendingRequests.B = pending("B");
  const { service, memory } = setup(value); const raw = memory.raw;
  const old = await service.applyCheckoutLifecycleV2({ type: "MARK_ORDER_UNKNOWN", ownerId: "A", requestKey: KEY2 }, current);
  assert.equal(old.request, null); assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  await service.applyCheckoutLifecycleV2({ type: "MARK_ORDER_UNKNOWN", ownerId: "A", requestKey: KEY }, current);
  const stored = JSON.parse(memory.raw);
  assert.equal(stored.pendingRequests.A.phase, "UNKNOWN"); assert.deepEqual(stored.pendingRequests.B, value.pendingRequests.B);
  assert.deepEqual(stored.cart, value.cart); assert.equal(memory.writes, 1);
  await service.applyCheckoutLifecycleV2({ type: "MARK_ORDER_UNKNOWN", ownerId: "A", requestKey: KEY }, current);
  assert.equal(memory.writes, 1);
});

test("quota errors and a changed session never return a sendable request or alter pending data", async () => {
  for (const guard of [() => false, async () => true]) {
    const value = envelope(); const { service, memory } = setup(value); const raw = memory.raw;
    await assert.rejects(service.applyCheckoutLifecycleV2(begin(value.cart), guard), code("OWNER_MISMATCH"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
  const value = envelope(); value.pendingRequests.A = pending("A");
  const { service, memory } = setup(value); const raw = memory.raw; memory.failWrite = true;
  await assert.rejects(service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: "A", expectedCart: checkpoint(value.cart), requestKey: KEY }, current), code("STORAGE_UNAVAILABLE"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  const fresh = setup(envelope()); fresh.memory.failWrite = true;
  await assert.rejects(fresh.service.applyCheckoutLifecycleV2(begin(envelope().cart), current), code("STORAGE_UNAVAILABLE"));
});

test("queued commands capture cart checkpoint/promo and recheck session before save", async () => {
  const value = envelope(); const { service, memory } = setup(value); const command = begin(value.cart);
  const saved = service.applyCheckoutLifecycleV2(command, current);
  command.expectedCart.revision = 9; command.promotionCode = "OTHER"; command.requestKey = KEY2;
  assert.equal((await saved).request.payload.promotionCode, "DEMO10");
  assert.equal(JSON.parse(memory.raw).pendingRequests.A.requestKey, KEY);
  const fresh = setup(envelope()); let calls = 0; const raw = fresh.memory.raw;
  await assert.rejects(fresh.service.applyCheckoutLifecycleV2(begin(envelope().cart), () => ++calls === 1), code("OWNER_MISMATCH"));
  assert.equal(fresh.memory.raw, raw); assert.equal(fresh.memory.writes, 0);
});

test("prototype-like owners get their own pending entry without inherited lookup", async () => {
  for (const owner of ["__proto__", "constructor", "toString"]) {
    const value = envelope(owner); const { service, memory } = setup(value);
    await service.applyCheckoutLifecycleV2(begin(value.cart), current);
    assert.equal(Object.hasOwn(JSON.parse(memory.raw).pendingRequests, owner), true);
    const retry = await service.applyCheckoutLifecycleV2({ type: "RETRY_ORDER", ownerId: owner, expectedCart: checkpoint(value.cart), requestKey: KEY }, current);
    assert.equal(retry.request.ownerId, owner);
  }
});

test("checkout preparation fails closed for corrupted storage or unavailable Web Locks", async () => {
  const corrupt = setup('{"schemaVersion":2}');
  await assert.rejects(corrupt.service.applyCheckoutLifecycleV2(begin(envelope().cart), current), code("INVALID_DATA"));
  assert.equal(corrupt.memory.writes, 0);
  const { storage, memory } = setup();
  const service = createCartStorage({ storage, locks: undefined });
  await assert.rejects(service.applyCheckoutLifecycleV2(begin(envelope().cart), current), code("LOCK_UNAVAILABLE"));
  assert.equal(memory.writes, 0);
});
