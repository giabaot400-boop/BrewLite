import assert from "node:assert/strict";
import test from "node:test";
import { createCartCheckoutClientV2 } from "./cart-checkout-client-v2.ts";
import { createCartOrderTransport } from "./cart-order-transport.ts";
import { createCartStorage, CART_LOCK_NAME, CART_STORAGE_KEY } from "./cart-storage.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { applyCartCheckoutV2 } from "./cart-checkout-v2.ts";
import { cartReducer } from "./cart-reducer.ts";
import { createAuthSession } from "../auth/auth-session.ts";
import { AuthApiError } from "../auth/auth-error.ts";

const TIME = "2026-11-08T07:30:00.000Z";
const BINDING = "a".repeat(64), BINDING2 = "b".repeat(64);
const KEY = "00000000-0000-4000-8000-000000000001";
const KEY2 = "00000000-0000-4000-8000-000000000002";
const draft = { productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M",
  toppingIds: [], toppingNames: {}, previewUnitPrice: 50000 };
const snapshot = (id = "A", binding = BINDING) => ({ status: "authenticated",
  user: { id, email: `${id}@example.com` }, sessionExpired: false, binding });
const order = (changes = {}) => ({ id: "order-a", version: 0, status: "PENDING", total: 45000,
  paymentDeadline: "2026-11-08T07:45:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: TIME, ...changes });
const paid = () => order({ status: "PAID", version: 1, paidAt: TIME, canPay: false });
const cancelled = () => order({ status: "CANCELLED", version: 1, canPay: false, canCancel: false });
function fixture() {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart, ownerId: "A" };
  return value;
}
function withPending({ v1 = false, rawPromo = false, emptyCart = false } = {}) {
  let value = fixture();
  value = applyCartCheckoutV2(value, { type: "BEGIN_ORDER_V2", ownerId: "A", expectedCart: value.cart,
    requestKey: KEY, createdAt: TIME, promotionCode: "DEMO10" }).envelope;
  const pending = value.pendingRequests.A;
  if (v1) pending.payload = { items: pending.payload.items };
  if (rawPromo) pending.payload.promotionCode = " demo10 ";
  pending.phase = "UNKNOWN";
  if (emptyCart) value.cart = { ownerId: "A", revision: value.cart.revision + 1, items: [] };
  return value;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const code = expected => error => error.code === expected;

function setup(options = {}) {
  let raw = typeof options.value === "string" ? options.value : encodeCartEnvelopeV2(options.value ?? fixture());
  let held = false, tail = Promise.resolve(), writes = 0, keys = 0, generation = 1, identity = snapshot();
  let onWrite = () => {}, onLock = () => {}, failWrite = false;
  const calls = { me: 0, posts: [], reads: [] };
  const locks = { request(name, lockOptions, callback) {
    assert.equal(name, CART_LOCK_NAME);
    const work = tail.then(() => { lockOptions.signal.throwIfAborted(); onLock(); held = true;
      try { return callback(); } finally { held = false; } });
    tail = work.catch(() => {}); return work;
  } };
  const storage = createCartStorage({ locks, storage: {
    getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true); return raw; },
    setItem(key, value) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true);
      if (failWrite) throw Error("quota"); raw = value; onWrite(++writes); },
  } });
  const auth = options.auth ?? { getSnapshot: () => identity, getSessionVersion: () => generation };
  const sessionClient = options.sessionClient ?? { async me() {
    assert.equal(held, false); calls.me++;
    return options.me ? options.me() : { user: identity.user, binding: identity.binding, expiresAt: TIME };
  } };
  const transport = createCartOrderTransport({ now: () => TIME, fetch(url, init) {
    assert.equal(held, false);
    const pending = JSON.parse(raw).pendingRequests.A;
    assert.equal(pending.phase, "SUBMITTING");
    assert.equal(init.headers["Idempotency-Key"], pending.requestKey);
    assert.deepEqual(JSON.parse(init.body), pending.payload);
    calls.posts.push({ url, init });
    return options.fetcher ? options.fetcher(url, init) : Promise.resolve(Response.json({ id: "order-a", status: "PENDING",
      total: "schemaVersion" in pending.payload ? pending.payload.expectedTotal : 50000 }, { status: options.status ?? 201 }));
  } });
  const readOrder = async input => {
    assert.equal(held, false); calls.reads.push(input);
    assert.equal(JSON.parse(raw).lastOrderResult.order.id, input.orderId);
    assert.equal(JSON.parse(raw).pendingRequests.A.phase, "UNKNOWN");
    return options.reader ? options.reader(input) : { session: input.session, order: order() };
  };
  const client = createCartCheckoutClientV2({ storage, auth, sessionClient, transport, readOrder,
    rejectionReasons: options.reasons, now: () => TIME, randomUUID: () => { keys++; return keys === 1 ? KEY : KEY2; } });
  return { client, storage, calls, auth, sessionClient, keys: () => keys, writes: () => writes,
    raw: () => raw, value: () => JSON.parse(raw), replace: value => { raw = encodeCartEnvelopeV2(value); },
    switch: (id = "B", binding = BINDING2) => { identity = snapshot(id, binding); generation++; },
    refresh: () => { identity = { ...identity }; },
    onWrite: action => { onWrite = action; }, onLock: action => { onLock = action; }, failWrites: () => { failWrite = true; },
    review: (opts = { promotionCode: "DEMO10" }) => client.review(JSON.parse(raw).cart, opts) };
}

test("v2 review is detached/frozen and opening or abandoning it has no side effects", () => {
  const f = setup(), before = f.raw(), cart = f.value().cart;
  const review = f.client.review(cart, { promotionCode: " demo10 " }); f.review();
  cart.items[0].qty = 7;
  assert.equal(review.displayCart.items[0].qty, 1); assert.equal(review.payload.expectedTotal, 45000);
  assert.equal(review.payload.promotionCode, "DEMO10");
  assert.throws(() => { review.payload.items[0].toppingIds.push("milk"); }, TypeError);
  assert.throws(() => { review.displayCart.items[0].qty = 4; }, TypeError);
  assert.equal(f.keys(), 0); assert.equal(f.writes(), 0); assert.equal(f.calls.me, 0); assert.equal(f.raw(), before);
});

test("v2 create verifies, durably prepares, POSTs outside lock, saves ack then GETs and binds without clearing", async () => {
  const f = setup(), before = f.value().cart;
  const result = await f.client.submit(f.review());
  assert.equal(result.kind, "CURRENT_ORDER"); assert.equal(result.settlement.outcome, "BOUND");
  assert.deepEqual(f.value().cart, before); assert.equal(f.value().pendingRequests.A, undefined);
  assert.equal(f.value().checkoutBindings.A.orderId, "order-a");
  assert.equal(f.value().lastOrderResult.order.status, "PENDING");
  assert.equal(f.calls.posts.length, 1); assert.equal(f.calls.reads.length, 1); assert.equal(f.calls.me, 1);
  assert.equal(f.keys(), 1); assert.equal(f.writes(), 3);
  assert.equal(JSON.stringify(f.value()).includes(BINDING), false);
});

for (const state of [paid, cancelled]) {
  test(`current ${state().status} after historical PENDING replay applies only its matching cart`, async () => {
    const f = setup({ value: withPending(), status: 200, reader: input => ({ session: input.session, order: state() }) });
    const result = await f.client.submit(f.review({ pending: f.value().pendingRequests.A }));
    assert.equal(result.kind, "CURRENT_ORDER"); assert.equal(f.value().checkoutBindings.A, undefined);
    assert.equal(f.value().pendingRequests.A, undefined); assert.equal(f.keys(), 0);
    assert.equal(f.value().cart.items.length, state().status === "PAID" ? 0 : 1);
    assert.equal(f.value().lastOrderResult.order.status, "PENDING");
  });
}

test("foreign, forged and reused reviews cannot send", async () => {
  const f = setup(), other = setup(), review = f.review();
  await assert.rejects(other.client.submit(review), code("INVALID_DATA"));
  await assert.rejects(f.client.submit({ ...review }), code("INVALID_DATA"));
  await f.client.submit(review);
  await assert.rejects(f.client.submit(review), code("INVALID_DATA"));
  assert.equal(f.calls.posts.length, 1); assert.equal(other.calls.posts.length, 0);
});

test("simultaneous confirmations and two clients share one durable pending identity", async () => {
  const waiting = deferred(), f = setup({ fetcher: () => waiting.promise });
  const review1 = f.review(), review2 = f.review(), first = f.client.submit(review1);
  await flush();
  await assert.rejects(f.client.submit(review2), code("PENDING_REQUEST"));
  // Another controller has its own busy flag, so the locked storage guard must stop it.
  const second = createCartCheckoutClientV2({ storage: f.storage, auth: f.auth, sessionClient: f.sessionClient,
    transport: { send() { assert.fail("second POST"); } }, readOrder() { assert.fail("second GET"); },
    randomUUID: () => KEY2, now: () => TIME });
  await assert.rejects(second.submit(second.review(f.value().cart)), code("PENDING_REQUEST"));
  waiting.resolve(Response.json({ id: "order-a", status: "PENDING", total: 45000 }, { status: 201 }));
  await first; assert.equal(f.calls.posts.length, 1);
});

for (const target of ["B", "A"]) {
  test(`changed ${target === "A" ? "same-owner session" : "owner"} invalidates confirmation before key/write/HTTP`, async () => {
    const f = setup(), review = f.review(), before = f.raw(); f.switch(target);
    await assert.rejects(f.client.submit(review), code("OWNER_MISMATCH"));
    assert.equal(f.keys(), 0); assert.equal(f.calls.me, 0); assert.equal(f.raw(), before);
  });
}

test("same-session refresh keeps review valid; a fresh me failure cannot use cached auth", async () => {
  const okay = setup(), review = okay.review(); okay.refresh();
  assert.equal((await okay.client.submit(review)).kind, "CURRENT_ORDER");
  const failed = setup({ me() { throw new AuthApiError("NETWORK_ERROR", "offline"); } }), before = failed.raw();
  await assert.rejects(failed.client.submit(failed.review()), code("NETWORK_ERROR"));
  assert.equal(failed.raw(), before); assert.equal(failed.keys(), 0); assert.equal(failed.calls.posts.length, 0);
});

for (const changes of [{ user: { id: "B", email: "B@example.com" }, binding: BINDING },
  { user: { id: "A", email: "A@example.com" }, binding: BINDING2 }]) {
  test(`fresh me ${changes.user.id === "B" ? "owner" : "session binding"} mismatch never prepares or sends`, async () => {
    const f = setup({ me: () => changes }), before = f.raw();
    await assert.rejects(f.client.submit(f.review()), code("OWNER_MISMATCH"));
    assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0); assert.equal(f.keys(), 0);
  });
}

test("auth transition while me is in flight is rejected even if me returns old A", async () => {
  const waiting = deferred(), f = setup({ me: () => waiting.promise }), before = f.raw();
  const task = f.client.submit(f.review()); f.switch();
  waiting.resolve({ user: snapshot().user, binding: BINDING });
  await assert.rejects(task, code("OWNER_MISMATCH")); assert.equal(f.raw(), before); assert.equal(f.keys(), 0);
});

test("storage checkpoint detects cart edits and a queued auth transition before POST", async () => {
  const edited = setup(), review = edited.review();
  const newer = edited.value(); newer.cart = { ...newer.cart, revision: newer.cart.revision + 1,
    items: newer.cart.items.map(line => ({ ...line, qty: 2 })) }; edited.replace(newer);
  await assert.rejects(edited.client.submit(review), code("CART_CHANGED")); assert.equal(edited.calls.posts.length, 0);
  const queued = setup(), queuedReview = queued.review(), before = queued.raw(); queued.onLock(() => queued.switch());
  await assert.rejects(queued.client.submit(queuedReview), code("OWNER_MISMATCH")); assert.equal(queued.raw(), before);
});

test("quota failure never sends; session change immediately after durable write leaves recoverable pending", async () => {
  const quota = setup(), before = quota.raw(); quota.failWrites();
  await assert.rejects(quota.client.submit(quota.review()), code("STORAGE_UNAVAILABLE"));
  assert.equal(quota.calls.posts.length, 0); assert.equal(quota.raw(), before);
  const changed = setup(); changed.onWrite(() => changed.switch());
  await assert.rejects(changed.client.submit(changed.review()), code("OWNER_MISMATCH"));
  assert.equal(changed.calls.posts.length, 0); assert.equal(changed.value().pendingRequests.A.requestKey, KEY);
  assert.equal((await changed.storage.readV2()).pendingRequests.A.phase, "UNKNOWN");
});

test("a changed snapshot with unchanged revision is not sent under an earlier review", async () => {
  const f = setup(), review = f.review(), value = f.value(); value.cart.items[0].productName = "Different label"; f.replace(value);
  await assert.rejects(f.client.submit(review), code("CART_CHANGED"));
  assert.equal(f.calls.posts.length, 0); assert.equal(f.value().pendingRequests.A.phase, "UNKNOWN");
});

for (const options of [{ v1: true }, { rawPromo: true }, { emptyCart: true }]) {
  test(`retry preserves the original key/body/snapshot (${JSON.stringify(options)})`, async () => {
    const value = withPending(options), before = structuredClone(value.pendingRequests.A);
    const f = setup({ value, status: 200, reader: input => ({ session: input.session,
      order: order({ total: options.v1 ? 50000 : 45000, paymentDeadline: options.v1 ? null : order().paymentDeadline,
        canPay: !options.v1, canCancel: !options.v1 }) }) });
    const result = await f.client.submit(f.review({ pending: value.pendingRequests.A, promotionCode: "OTHER" }));
    assert.equal(result.kind, "CURRENT_ORDER"); assert.equal(f.keys(), 0);
    assert.deepEqual(JSON.parse(f.calls.posts[0].init.body), before.payload);
    assert.equal(f.calls.posts[0].init.headers["Idempotency-Key"], before.requestKey);
    assert.deepEqual(result.request.cartSnapshot, before.cartSnapshot);
    if (options.v1) assert.equal(result.settlement.outcome, "READ_ONLY");
    if (options.emptyCart) assert.equal(result.settlement.outcome, "UNRELATED");
  });
}

test("retry detects replacement of a pending body without silently sending its newer content", async () => {
  const f = setup({ value: withPending() }), review = f.review({ pending: f.value().pendingRequests.A });
  const value = f.value(); value.pendingRequests.A.payload.promotionCode = " demo10 "; f.replace(value);
  await assert.rejects(f.client.submit(review), code("CART_CHANGED")); assert.equal(f.calls.posts.length, 0);
});

test("network uncertainty retains identity and only another explicit confirmation replays POST", async () => {
  let disconnected = true;
  const f = setup({ fetcher: async () => { if (disconnected) throw Error("offline");
    return Response.json({ id: "order-a", status: "PENDING", total: 45000 }, { status: 200 }); } });
  const first = await f.client.submit(f.review()); assert.equal(first.kind, "UNKNOWN");
  const before = f.value().pendingRequests.A; assert.equal(before.phase, "UNKNOWN"); disconnected = false;
  await flush(); assert.equal(f.calls.posts.length, 1);
  const second = await f.client.submit(f.review({ pending: before })); assert.equal(second.kind, "CURRENT_ORDER");
  assert.equal(f.calls.posts.length, 2); assert.equal(f.keys(), 1);
  assert.equal(f.calls.posts[0].init.body, f.calls.posts[1].init.body);
  assert.equal(f.calls.posts[0].init.headers["Idempotency-Key"], f.calls.posts[1].init.headers["Idempotency-Key"]);
});

test("valid rejection closes only pending and waits for a new review/key, keeping cart and promo choice", async () => {
  const f = setup({ fetcher: async () => Response.json({ error: { code: "PROMOTION_NOT_APPLICABLE",
    message: "expired", details: { reason: "EXPIRED" } } }, { status: 409 }) }), cart = f.value().cart;
  const result = await f.client.submit(f.review()); assert.equal(result.kind, "REJECTED");
  assert.equal(result.settlement.outcome.kind, "PROMOTION_NOT_APPLICABLE");
  assert.equal(f.value().pendingRequests.A, undefined); assert.deepEqual(f.value().cart, cart);
  assert.equal(f.calls.reads.length, 0); assert.equal(f.calls.posts.length, 1);
  const review = f.review(); assert.equal(review.payload.promotionCode, "DEMO10"); assert.equal(f.keys(), 1);
});

for (const response of [() => Response.json({ error: { code: "OUT_OF_STOCK", message: "stock",
  details: { reason: "UNAGREED", resources: [{ kind: "PRODUCT", id: "coffee", requested: 1, available: 0 }] } } }, { status: 409 }),
  () => Response.json({ id: "order-a", status: "PENDING", total: 7 }, { status: 201 }),
  () => Response.json({ error: { code: "AUTH_REQUIRED", message: "login" } }, { status: 401 })]) {
  test(`untrusted response keeps UNKNOWN without GET or cart clear: ${response().status}`, async () => {
    const f = setup({ fetcher: async () => response() }), cart = f.value().cart;
    const result = await f.client.submit(f.review()); assert.equal(result.kind, "UNKNOWN");
    assert.equal(f.value().pendingRequests.A.requestKey, KEY); assert.deepEqual(f.value().cart, cart);
    assert.equal(f.calls.reads.length, 0);
  });
}

test("GET failure after durable acknowledgement retains pending; explicit replay can later bind PAID", async () => {
  let broken = true;
  const f = setup({ reader(input) { if (broken) throw Error("GET timeout"); return { session: input.session, order: paid() }; } });
  const first = await f.client.submit(f.review()); assert.equal(first.kind, "UNKNOWN"); assert.equal(first.createdOrderId, "order-a");
  assert.equal(f.value().cart.items.length, 1); assert.equal(f.value().pendingRequests.A.phase, "UNKNOWN");
  broken = false; const next = await f.client.submit(f.review({ pending: f.value().pendingRequests.A }));
  assert.equal(next.kind, "CURRENT_ORDER"); assert.equal(f.value().cart.items.length, 0);
  assert.equal(f.keys(), 1); assert.equal(f.calls.posts.length, 2);
});

for (const checkpoint of [{ ownerId: "B" }, { binding: BINDING2 }, { sessionVersion: 2 }]) {
  test(`GET adapter checkpoint mismatch (${Object.keys(checkpoint)[0]}) cannot publish or clear`, async () => {
    const f = setup({ reader: input => ({ session: { ...input.session, ...checkpoint }, order: paid() }) });
    await assert.rejects(f.client.submit(f.review()), code("OWNER_MISMATCH"));
    assert.equal(f.value().cart.items.length, 1); assert.equal(f.value().pendingRequests.A.phase, "UNKNOWN");
    assert.equal(f.value().checkoutBindings.A, undefined);
  });
}

for (const invalid of [order({ id: "other-order" }), paid(), order({ total: 1 })]) {
  test(`GET wrong order, malformed paid or amount cannot clear (${invalid.id}/${invalid.total})`, async () => {
    const bad = structuredClone(invalid); if (bad.status === "PAID") bad.paidAt = null;
    const f = setup({ reader: input => ({ session: input.session, order: bad }) });
    const result = await f.client.submit(f.review()); assert.notEqual(result.kind, "CURRENT_ORDER");
    assert.equal(f.value().cart.items.length, 1); assert.ok(f.value().pendingRequests.A);
  });
}

test("late POST and GET after account/session change cannot mutate or expose an old order", async () => {
  for (const stage of ["POST", "GET"]) {
    const waiting = deferred(); let input;
    const f = setup({ ...(stage === "POST" ? { fetcher: () => waiting.promise } : {
      reader: next => { input = next; return waiting.promise; } }) });
    const sending = f.client.submit(f.review()); await flush();
    f.switch(stage === "POST" ? "B" : "A"); const before = f.raw();
    waiting.resolve(stage === "POST" ? Response.json({ id: "order-a", status: "PENDING", total: 45000 }, { status: 201 })
      : { session: input.session, order: paid() });
    await assert.rejects(sending, code("OWNER_MISMATCH")); assert.equal(f.raw(), before);
    assert.equal(f.value().cart.items.length, 1);
  }
});

test("changed cart during GET is retained and a later binding completion cannot clear it", async () => {
  const waiting = deferred(); let input;
  const f = setup({ reader: next => { input = next; return waiting.promise; } });
  const sending = f.client.submit(f.review()); await flush();
  const value = f.value(); value.cart = { ownerId: "A", revision: value.cart.revision + 1, items: [] }; f.replace(value);
  const beforeCart = f.value().cart; waiting.resolve({ session: input.session, order: paid() });
  const result = await sending; assert.equal(result.kind, "CURRENT_ORDER"); assert.equal(result.settlement.cartEffect, "UNRELATED");
  assert.deepEqual(f.value().cart, beforeCart); assert.equal(f.value().checkoutBindings.A, undefined);
});

test("quota failure saving acknowledgement prevents GET and retains the same pending identity", async () => {
  let f;
  f = setup({ fetcher: async () => { f.failWrites(); return Response.json({ id: "order-a", status: "PENDING", total: 45000 }, { status: 201 }); } });
  await assert.rejects(f.client.submit(f.review()), code("STORAGE_UNAVAILABLE"));
  assert.equal(f.calls.reads.length, 0); assert.equal(f.value().pendingRequests.A.requestKey, KEY);
  assert.equal((await f.storage.readV2()).pendingRequests.A.phase, "UNKNOWN");
});

test("abort before confirmation has no effects; abort during POST leaves UNKNOWN without GET", async () => {
  const beforeAbort = new AbortController(), f = setup(), before = f.raw(); beforeAbort.abort();
  await assert.rejects(f.client.submit(f.review(), beforeAbort.signal), { name: "AbortError" });
  assert.equal(f.raw(), before); assert.equal(f.keys(), 0);
  const controller = new AbortController();
  const sending = setup({ fetcher: async () => { controller.abort(); return new Promise(() => {}); } });
  const result = await sending.client.submit(sending.review(), controller.signal);
  assert.equal(result.kind, "UNKNOWN"); assert.equal(sending.value().pendingRequests.A.phase, "UNKNOWN");
  assert.equal(sending.calls.reads.length, 0);
});

test("real auth coordinator same-owner refresh survives but same-owner login invalidates review", async () => {
  const api = { me: async () => ({ user: snapshot().user, binding: BINDING, expiresAt: TIME }),
    login: async () => ({ user: snapshot().user, binding: BINDING, expiresAt: TIME }) };
  const auth = createAuthSession(api); await auth.refresh();
  const f = setup({ auth, sessionClient: api }), review = f.review(); await auth.refresh();
  assert.equal((await f.client.submit(review)).kind, "CURRENT_ORDER");
  const second = setup({ auth, sessionClient: api }), stale = second.review(); await auth.login({});
  await assert.rejects(second.client.submit(stale), code("OWNER_MISMATCH")); assert.equal(second.calls.posts.length, 0);
});

test("v1 storage is never migrated implicitly and anonymous/missing-binding review is refused", async () => {
  const f = setup({ value: JSON.stringify({ schemaVersion: 1, cart: fixture().cart, pendingRequests: {}, lastOrderResult: null }) });
  const before = f.raw();
  await assert.rejects(f.client.submit(f.review()), code("UNSUPPORTED_VERSION"));
  assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0);
  for (const identity of [{ ...snapshot(), binding: undefined }, { status: "anonymous", user: null, sessionExpired: false }]) {
    const rejected = setup({ auth: { getSnapshot: () => identity, getSessionVersion: () => 1 } });
    assert.throws(() => rejected.review(), code("OWNER_MISMATCH"));
  }
});
