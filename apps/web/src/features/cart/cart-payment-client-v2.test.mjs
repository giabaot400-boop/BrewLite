import assert from "node:assert/strict";
import test from "node:test";
import { createCartPaymentClientV2 } from "./cart-payment-client-v2.ts";
import { createCartMutationTransport } from "./cart-mutation-transport.ts";
import { applyCartPaymentV2 } from "./cart-payment-recovery-v2.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createCartStorage, CART_LOCK_NAME, CART_STORAGE_KEY } from "./cart-storage.ts";
import { cartReducer } from "./cart-reducer.ts";
import { createAuthSession } from "../auth/auth-session.ts";
import { AuthApiError } from "../auth/auth-error.ts";

const TIME = "2026-11-08T08:00:00.000Z", LATER = "2026-11-08T08:00:01.000Z", READ = "2026-11-08T08:00:02.000Z";
const BINDING = "a".repeat(64), BINDING2 = "b".repeat(64);
const KEY = "00000000-0000-4000-8000-000000000001", KEY2 = "00000000-0000-4000-8000-000000000002";
const snapshot = (id = "A", binding = BINDING) => ({ status: "authenticated", user: { id, email: `${id}@example.com` },
  sessionExpired: false, binding });
const order = (changes = {}) => ({ id: "order-a", version: 0, status: "PENDING", total: 50000,
  paymentDeadline: "2026-11-08T08:15:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: TIME, ...changes });
const paid = (changes = {}) => order({ status: "PAID", version: 1, paidAt: LATER, canPay: false, serverTime: READ, ...changes });
const failedOrder = (changes = {}) => order({ status: "PAYMENT_FAILED", version: 1, serverTime: READ, ...changes });
const cancelled = (changes = {}) => order({ status: "CANCELLED", version: 1, canPay: false, canCancel: false, serverTime: READ, ...changes });
const payment = (changes = {}) => ({ id: "payment-k1", version: 0, orderId: "order-a", method: "WALLET", amount: 50000,
  status: "SUCCEEDED", failureCode: null, createdAt: TIME, resolvedAt: LATER, refundedAmount: 0, refundedAt: null,
  serverTime: LATER, ...changes });
const failed = (changes = {}) => payment({ status: "FAILED", failureCode: "PAYMENT_DECLINED", ...changes });
const errorResponse = (code, status = 409) => Response.json({ error: { code, message: "Review current state" } }, { status });
const code = expected => error => error.code === expected;
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: {
    productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M",
    toppingIds: [], toppingNames: {}, previewUnitPrice: 50000,
  } }).cart, ownerId: "A" };
  value.checkoutBindings = { A: { ownerId: "A", orderId: "order-a", cartRevision: value.cart.revision,
    cartSnapshot: structuredClone(value.cart), orderVersion: 0, boundAt: TIME } };
  return value;
}
function unresolved({ emptyCart = false, method = "WALLET", pinned = false } = {}) {
  const value = applyCartPaymentV2(fixture(), { type: "BEGIN_PAYMENT", ownerId: "A", requestKey: KEY,
    body: { orderId: "order-a", method }, createdAt: TIME, order: order() }).envelope;
  if (emptyCart) {
    value.cart = { ownerId: "A", revision: value.cart.revision + 1, items: [] };
    value.checkoutBindings = {};
  }
  if (pinned) value.paymentRecoveries.A[KEY].paymentId = "payment-k1";
  return value;
}

function setup(options = {}) {
  let raw = typeof options.value === "string" ? options.value : encodeCartEnvelopeV2(options.value ?? fixture());
  let identity = snapshot(), generation = 1, held = false, tail = Promise.resolve(), keys = 0, writes = 0;
  const firstKey = Object.hasOwn(JSON.parse(raw).paymentRecoveries?.A ?? {}, KEY) ? 2 : 1;
  let onLock = () => {}, onWrite = () => {}, failWrites = false;
  const calls = { me: 0, posts: [], reads: [], sequence: [] };
  const memory = { getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true); return raw; },
    setItem(key, value) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true);
      if (failWrites) throw Error("quota"); raw = value; onWrite(++writes); } };
  const locks = { request(name, opts, action) {
    assert.equal(name, CART_LOCK_NAME);
    const work = tail.then(() => { opts.signal.throwIfAborted(); onLock(); held = true;
      try { return action(); } finally { held = false; } });
    tail = work.catch(() => {}); return work;
  } };
  const storage = createCartStorage({ locks, storage: memory });
  const auth = options.auth ?? { getSnapshot: () => identity, getSessionVersion: () => generation };
  const sessionClient = options.sessionClient ?? { async me() {
    assert.equal(held, false); calls.me++;
    return options.me ? options.me(calls.me) : { user: identity.user, binding: identity.binding, expiresAt: READ };
  } };
  const readOrder = async input => {
    assert.equal(held, false); calls.reads.push(input); calls.sequence.push("GET");
    return options.reader ? options.reader(input, calls.reads.length) : { session: input.session,
      order: calls.posts.length ? paid() : order() };
  };
  const transport = createCartMutationTransport({ fetch(url, init) {
    assert.equal(held, false); assert.equal(url, "/api/payments");
    const record = JSON.parse(raw).paymentRecoveries.A[init.headers["Idempotency-Key"]];
    assert.equal(record.recoveryStatus, "UNRESOLVED"); assert.equal(init.body, JSON.stringify(record.body));
    calls.posts.push({ url, init }); calls.sequence.push("POST");
    return options.fetcher ? options.fetcher(url, init, calls.posts.length)
      : Promise.resolve(Response.json(payment({ method: record.body.method }), { status: 201 }));
  } });
  const environment = { storage, auth, sessionClient, readOrder, transport,
    now: () => TIME, randomUUID: () => "00000000-0000-4000-8000-" + String(firstKey + keys++).padStart(12, "0") };
  const client = createCartPaymentClientV2(environment);
  return { client, storage, environment, calls, auth, keys: () => keys, writes: () => writes,
    raw: () => raw, value: () => JSON.parse(raw), replace: value => { raw = encodeCartEnvelopeV2(value); },
    switch: (id = "B", binding = BINDING2) => { identity = snapshot(id, binding); generation++; },
    refresh: () => { identity = { ...identity }; },
    failWrites: () => { failWrites = true; }, onLock: hook => { onLock = hook; }, onWrite: hook => { onWrite = hook; },
    review: (method = "WALLET") => client.review("order-a", method),
    reviewRecovery: () => client.reviewRecovery(JSON.parse(raw).paymentRecoveries.A[KEY]),
  };
}

test("opening a new confirmation reads the official amount but creates no key, write or POST", async () => {
  const view = order(), f = setup({ reader: input => ({ session: input.session, order: view }) }), before = f.raw();
  const review = await f.review(); view.total = 1;
  assert.equal(review.order.total, 50000); assert.equal(review.kind, "NEW");
  assert.throws(() => { review.body.method = "CARD"; }, TypeError);
  assert.throws(() => { review.order.total = 2; }, TypeError);
  assert.equal(f.calls.reads.length, 1); assert.equal(f.calls.me, 1);
  assert.equal(f.keys(), 0); assert.equal(f.writes(), 0); assert.equal(f.calls.posts.length, 0); assert.equal(f.raw(), before);
});

for (const method of ["WALLET", "CARD"]) {
  test(`${method}: explicit confirmation prepares durably, pins exact POST identity before GET and clears only after reconciliation`, async () => {
    let f;
    f = setup({ reader(input, count) {
      if (count === 3) {
        const recovery = f.value().paymentRecoveries.A[KEY];
        assert.equal(recovery.paymentId, "payment-k1"); assert.equal(recovery.recoveryStatus, "UNRESOLVED");
        assert.equal(f.value().cart.items.length, 1);
      }
      return { session: input.session, order: count === 3 ? paid() : order() };
    } });
    const result = await f.client.submit(await f.review(method));
    assert.equal(result.kind, "RESOLVED"); assert.equal(result.settlement.payment.method, method);
    assert.equal(result.settlement.order.status, "PAID"); assert.equal(result.settlement.cartEffect, "CLEARED");
    assert.equal(result.settlement.canConfirmNewAttempt, false); assert.equal(f.keys(), 1); assert.equal(f.calls.posts.length, 1);
    assert.deepEqual(f.calls.sequence, ["GET", "GET", "POST", "GET"]);
    assert.equal(f.value().cart.items.length, 0); assert.equal(f.value().checkoutBindings.A, undefined);
    assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED");
    assert.equal(f.writes(), 3); assert.equal(f.raw().includes(BINDING), false);
  });
}

test("FAILED is a resolved business outcome; only a new explicit confirmation generates another key on the same order", async () => {
  const f = setup({ fetcher: async (_url, _init, count) => Response.json(count === 1 ? failed() : payment({ id: "payment-k2" }), { status: 200 }),
    reader: input => ({ session: input.session, order: f.calls.posts.length === 0 ? order()
      : f.calls.posts.length === 1 ? failedOrder() : paid({ version: 2 }) }) });
  const cart = f.value().cart, first = await f.client.submit(await f.review());
  assert.equal(first.kind, "RESOLVED"); assert.equal(first.settlement.payment.status, "FAILED");
  assert.equal(first.settlement.canConfirmNewAttempt, true); assert.deepEqual(f.value().cart, cart);
  await flush(); assert.equal(f.calls.posts.length, 1); assert.equal(f.keys(), 1);
  const second = await f.client.submit(await f.review()); assert.equal(second.kind, "RESOLVED");
  assert.equal(f.calls.posts[0].init.headers["Idempotency-Key"], KEY);
  assert.equal(f.calls.posts[1].init.headers["Idempotency-Key"], KEY2);
  assert.equal(f.calls.posts[0].init.body, f.calls.posts[1].init.body);
  assert.equal(f.value().paymentRecoveries.A[KEY].paymentId, "payment-k1");
  assert.equal(f.value().paymentRecoveries.A[KEY2].paymentId, "payment-k2");
});

test("foreign, forged and consumed confirmation objects cannot submit", async () => {
  const f = setup(), other = setup(), review = await f.review();
  await assert.rejects(other.client.submit(review), code("INVALID_DATA"));
  await assert.rejects(f.client.submit({ ...review }), code("INVALID_DATA"));
  await f.client.submit(review);
  await assert.rejects(f.client.submit(review), code("INVALID_DATA")); assert.equal(f.calls.posts.length, 1);
});

test("two simultaneous confirmations and two controllers cannot persist a second fresh key", async () => {
  let completed = false;
  const waiting = deferred(), f = setup({ fetcher: () => waiting.promise,
    reader: input => ({ session: input.session, order: completed ? paid() : order() }) });
  const firstReview = await f.review(), secondReview = await f.review();
  const other = createCartPaymentClientV2({ ...f.environment, randomUUID: () => KEY2 });
  const otherReview = await other.review("order-a", "CARD");
  const first = f.client.submit(firstReview); await flush();
  await assert.rejects(f.client.submit(secondReview), code("PENDING_REQUEST"));
  await assert.rejects(other.submit(otherReview), code("PENDING_REQUEST"));
  completed = true; waiting.resolve(Response.json(payment(), { status: 200 })); await first;
  assert.equal(f.calls.posts.length, 1); assert.equal(f.value().paymentRecoveries.A[KEY2], undefined);
});

for (const target of ["A", "B"]) {
  test(`confirmation is invalidated by ${target === "A" ? "same-owner login" : "account switch"} before any payment write`, async () => {
    const f = setup(), review = await f.review(), before = f.raw(); f.switch(target);
    await assert.rejects(f.client.submit(review), code("OWNER_MISMATCH"));
    assert.equal(f.raw(), before); assert.equal(f.keys(), 0); assert.equal(f.calls.posts.length, 0);
  });
}

test("same-session refresh keeps confirmation; failed fresh me never falls back to cached identity", async () => {
  const f = setup(), review = await f.review(); f.refresh(); assert.equal((await f.client.submit(review)).kind, "RESOLVED");
  const bad = setup({ me(count) { if (count > 1) throw new AuthApiError("NETWORK_ERROR", "offline");
    return { user: snapshot().user, binding: BINDING }; } });
  const badReview = await bad.review(), before = bad.raw();
  await assert.rejects(bad.client.submit(badReview), code("NETWORK_ERROR"));
  assert.equal(bad.raw(), before); assert.equal(bad.keys(), 0); assert.equal(bad.calls.posts.length, 0);
});

test("fresh me owner and binding mismatches cannot prepare payment or revoke the other account", async () => {
  for (const changed of [{ user: snapshot("B").user, binding: BINDING }, { user: snapshot().user, binding: BINDING2 }]) {
    const f = setup({ me: count => count === 1 ? { user: snapshot().user, binding: BINDING } : changed });
    const review = await f.review(), before = f.raw();
    await assert.rejects(f.client.submit(review), code("OWNER_MISMATCH"));
    assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0); assert.equal(f.keys(), 0);
  }
});

for (const changes of [{ version: 1 }, { total: 55000 }, { status: "PAYMENT_FAILED", version: 1 },
  { canPay: false }, { serverTime: "2026-11-08T08:15:00.000Z" }]) {
  test(`re-read before confirmation rejects changed state/price/eligibility: ${JSON.stringify(changes)}`, async () => {
    const f = setup({ reader: (input, count) => ({ session: input.session, order: order(count === 1 ? {} : changes) }) });
    const review = await f.review(), before = f.raw();
    await assert.rejects(f.client.submit(review), error => ["CART_CHANGED", "INVALID_DATA"].includes(error.code));
    assert.equal(f.raw(), before); assert.equal(f.keys(), 0); assert.equal(f.calls.posts.length, 0);
  });
}

test("legacy, expired, paid, wrong-order and invalid-method confirmations are refused", async () => {
  for (const view of [order({ paymentDeadline: null, canPay: false, canCancel: false }), paid(),
    order({ serverTime: "2026-11-08T08:15:00.000Z" }), order({ id: "other-order" })]) {
    const f = setup({ reader: input => ({ session: input.session, order: view }) });
    await assert.rejects(f.review(), code("INVALID_DATA")); assert.equal(f.keys(), 0); assert.equal(f.calls.posts.length, 0);
  }
  const f = setup(); await assert.rejects(f.client.review("order-a", "CASH"), code("INVALID_DATA"));
  assert.equal(f.calls.me, 0); assert.equal(f.calls.reads.length, 0);
});

test("queued session changes, quota failure and post-write account switch all stop the POST", async () => {
  for (const failure of ["queue", "quota", "after-write"]) {
    const f = setup(), review = await f.review(), before = f.raw();
    if (failure === "queue") f.onLock(() => f.switch());
    if (failure === "quota") f.failWrites();
    if (failure === "after-write") f.onWrite(() => f.switch());
    await assert.rejects(f.client.submit(review), code(failure === "quota" ? "STORAGE_UNAVAILABLE" : "OWNER_MISMATCH"));
    assert.equal(f.calls.posts.length, 0);
    if (failure !== "after-write") assert.equal(f.raw(), before);
    else assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED");
  }
});

test("recovery review does not read current state, generate keys, rewrite method or send automatically", async () => {
  const f = setup({ value: unresolved({ emptyCart: true, method: "CARD" }) }), before = f.raw();
  const review = f.reviewRecovery(); assert.equal(review.kind, "RECOVERY"); assert.equal(review.order, null);
  assert.equal(review.body.method, "CARD"); assert.equal(f.calls.me, 0); assert.equal(f.calls.reads.length, 0);
  await flush(); assert.equal(f.calls.posts.length, 0); assert.equal(f.keys(), 0); assert.equal(f.raw(), before);
  const result = await f.client.submit(review);
  assert.equal(result.kind, "RESOLVED"); assert.equal(f.calls.posts[0].init.headers["Idempotency-Key"], KEY);
  assert.deepEqual(f.calls.sequence, ["POST", "GET"]); assert.equal(f.value().cart.items.length, 0);
});

test("expired/cancelled current Order does not prevent replay; old FAILED attempt is not mistaken for a newer payment", async () => {
  const value = unresolved();
  const f = setup({ value, fetcher: async () => Response.json(failed(), { status: 200 }), reader: input => ({ session: input.session,
    order: { ...paid({ version: 4 }), latestPayment: payment({ id: "payment-k2" }) } }) });
  const result = await f.client.submit(f.reviewRecovery());
  assert.deepEqual(f.calls.sequence, ["POST", "GET"]); assert.equal(result.kind, "RESOLVED");
  assert.equal(result.settlement.payment.id, "payment-k1"); assert.equal(result.settlement.payment.status, "FAILED");
  assert.equal(result.settlement.canConfirmNewAttempt, false); assert.equal(f.value().cart.items.length, 0);
  const cancelledCase = setup({ value: unresolved(), reader: input => ({ session: input.session,
    order: cancelled({ serverTime: "2026-11-08T09:00:00.000Z" }) }) });
  const cancellation = await cancelledCase.client.submit(cancelledCase.reviewRecovery());
  assert.equal(cancellation.kind, "RESOLVED"); assert.equal(cancelledCase.value().cart.items.length, 1);
  assert.equal(cancelledCase.value().checkoutBindings.A, undefined);
});

test("network loss preserves recovery; reconnect/login does not send and explicit retry keeps exact key/body", async () => {
  let connected = false;
  const f = setup({ fetcher: async () => { if (!connected) throw Error("connection lost"); return Response.json(payment(), { status: 200 }); } });
  const first = await f.client.submit(await f.review()); assert.equal(first.kind, "UNKNOWN");
  const recovery = f.value().paymentRecoveries.A[KEY]; assert.equal(recovery.paymentId, null);
  assert.equal(recovery.recoveryStatus, "UNRESOLVED"); connected = true; f.refresh(); await flush();
  assert.equal(f.calls.posts.length, 1); assert.equal(f.keys(), 1);
  const result = await f.client.submit(f.reviewRecovery()); assert.equal(result.kind, "RESOLVED");
  assert.equal(f.calls.posts[0].init.body, f.calls.posts[1].init.body);
  assert.equal(f.calls.posts[0].init.headers["Idempotency-Key"], f.calls.posts[1].init.headers["Idempotency-Key"]);
  assert.equal(f.keys(), 1);
});

test("valid POST plus failed GET pins ID durably and blocks a fresh method/key until explicit replay reconciles", async () => {
  let readFails = true;
  const f = setup({ reader: (input, count) => {
    if (count >= 3 && readFails) throw Error("GET timeout");
    return { session: input.session, order: count >= 3 ? paid() : order() };
  } });
  const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN");
  assert.equal(f.value().paymentRecoveries.A[KEY].paymentId, "payment-k1");
  assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED"); assert.equal(f.value().cart.items.length, 1);
  readFails = false;
  const retry = await f.client.submit(f.reviewRecovery()); assert.equal(retry.kind, "RESOLVED"); assert.equal(f.keys(), 1);
});

test("fresh payment cannot bypass an unresolved attempt with another method or order", async () => {
  const f = setup({ value: unresolved() }), review = await f.review("CARD"), before = f.raw();
  await assert.rejects(f.client.submit(review), code("PENDING_REQUEST"));
  assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0);
});

test("mutated recovery body and a replaced pinned ID are not sent under the old review", async () => {
  for (const change of ["method", "paymentId"]) {
    const f = setup({ value: unresolved({ pinned: true }) }), review = f.reviewRecovery();
    const value = f.value(); value.paymentRecoveries.A[KEY][change === "method" ? "body" : "paymentId"] =
      change === "method" ? { orderId: "order-a", method: "CARD" } : "different-payment"; f.replace(value);
    await assert.rejects(f.client.submit(review), code("CART_CHANGED")); assert.equal(f.calls.posts.length, 0);
  }
});

test("pinned ID cannot be replaced by another attempt from a replay response", async () => {
  const f = setup({ value: unresolved({ pinned: true }), fetcher: async () => Response.json(payment({ id: "payment-k2" }), { status: 200 }) });
  const result = await f.client.submit(f.reviewRecovery()); assert.equal(result.kind, "UNKNOWN");
  assert.equal(f.value().paymentRecoveries.A[KEY].paymentId, "payment-k1"); assert.equal(f.calls.reads.length, 0);
});

for (const reply of [() => errorResponse("SESSION_EXPIRED", 401), () => errorResponse("IDEMPOTENCY_CONFLICT"),
  () => Response.json({ ...failed(), extra: true }, { status: 200 }), () => Response.json({ id: "payment-k1" }, { status: 201 })]) {
  test(`untrusted/unsuccessful reply ${reply().status} leaves UNRESOLVED without calling it FAILED`, async () => {
    const f = setup({ value: unresolved(), fetcher: async () => reply() }), before = f.raw();
    const result = await f.client.submit(f.reviewRecovery()); assert.equal(result.kind, "UNKNOWN");
    assert.equal(f.calls.reads.length, 0); assert.equal(f.raw(), before);
  });
}

test("known non-payable rejection reads current Order but never resolves or clears an unidentified attempt", async () => {
  for (const code of ["ORDER_NOT_PAYABLE", "PAYMENT_WINDOW_EXPIRED", "LEGACY_ORDER_REQUIRES_REVIEW"]) {
    const f = setup({ value: unresolved(), fetcher: async () => errorResponse(code),
      reader: input => ({ session: input.session, order: cancelled() }) }), before = f.raw();
    const result = await f.client.submit(f.reviewRecovery()); assert.equal(result.kind, "UNKNOWN");
    assert.equal(result.order.status, "CANCELLED"); assert.equal(f.raw(), before);
    assert.deepEqual(f.calls.sequence, ["POST", "GET"]);
  }
});

test("GET checkpoint mismatch cannot expose another session or clear cart", async () => {
  for (const changes of [{ ownerId: "B" }, { binding: BINDING2 }, { sessionVersion: 2 }]) {
    const f = setup({ value: unresolved(), reader: input => ({ session: { ...input.session, ...changes }, order: paid() }) });
    await assert.rejects(f.client.submit(f.reviewRecovery()), code("OWNER_MISMATCH"));
    assert.equal(f.value().paymentRecoveries.A[KEY].paymentId, "payment-k1");
    assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED"); assert.equal(f.value().cart.items.length, 1);
  }
});

test("older GET, wrong amount, wrong ID and inconsistent state never resolve the saved payment", async () => {
  for (const view of [paid({ serverTime: TIME }), paid({ total: 50001 }), paid({ id: "other-order" }), order()]) {
    const f = setup({ value: unresolved(), reader: input => ({ session: input.session, order: view }) });
    const result = await f.client.submit(f.reviewRecovery()); assert.equal(result.kind, "UNKNOWN");
    assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED"); assert.equal(f.value().cart.items.length, 1);
  }
});

test("late POST/GET after owner switch or same-owner login cannot mutate data or publish payment", async () => {
  for (const stage of ["POST", "GET"]) {
    const waiting = deferred(); let input;
    const f = setup({ value: unresolved(), ...(stage === "POST" ? { fetcher: () => waiting.promise }
      : { reader: next => { input = next; return waiting.promise; } }) });
    const task = f.client.submit(f.reviewRecovery()); await flush(); f.switch(stage === "POST" ? "B" : "A");
    const before = f.raw(); waiting.resolve(stage === "POST" ? Response.json(payment(), { status: 200 }) : { session: input.session, order: paid() });
    await assert.rejects(task, code("OWNER_MISMATCH")); assert.equal(f.raw(), before);
    assert.equal(f.value().cart.items.length, 1);
  }
});

test("replaced binding and newer cart during HTTP are preserved; old payment cannot offer a fresh retry", async () => {
  const waiting = deferred(), f = setup({ value: unresolved(), reader: input => waiting.promise.then(() => ({ session: input.session, order: paid() })) });
  const task = f.client.submit(f.reviewRecovery()); await flush();
  const value = f.value(); value.cart = { ...value.cart, revision: value.cart.revision + 1 };
  value.checkoutBindings.A = { ...value.checkoutBindings.A, boundAt: LATER, cartRevision: value.cart.revision,
    cartSnapshot: structuredClone(value.cart) }; f.replace(value);
  const cart = f.value().cart; waiting.resolve(); const result = await task;
  assert.equal(result.kind, "RESOLVED"); assert.equal(result.settlement.order, null);
  assert.equal(result.settlement.canConfirmNewAttempt, false); assert.deepEqual(f.value().cart, cart);
  assert.equal(f.value().checkoutBindings.A.boundAt, LATER);
});

test("quota failure pinning ID prevents GET; final-settlement failure retains a pinned unresolved request", async () => {
  const pinFailure = setup({ value: unresolved(), fetcher: async () => { pinFailure.failWrites(); return Response.json(payment(), { status: 200 }); } });
  const before = pinFailure.raw();
  await assert.rejects(pinFailure.client.submit(pinFailure.reviewRecovery()), code("STORAGE_UNAVAILABLE"));
  assert.equal(pinFailure.raw(), before); assert.equal(pinFailure.calls.reads.length, 0);
  const finalFailure = setup({ value: unresolved(), reader: input => { finalFailure.failWrites(); return { session: input.session, order: paid() }; } });
  await assert.rejects(finalFailure.client.submit(finalFailure.reviewRecovery()), code("STORAGE_UNAVAILABLE"));
  assert.equal(finalFailure.value().paymentRecoveries.A[KEY].paymentId, "payment-k1");
  assert.equal(finalFailure.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED");
  assert.equal(finalFailure.value().cart.items.length, 1);
});

test("abort before submit leaves no key/write; abort during POST preserves unresolved data and skips GET", async () => {
  const f = setup(), review = await f.review(), abort = new AbortController(), before = f.raw(); abort.abort();
  await assert.rejects(f.client.submit(review, abort.signal), { name: "AbortError" });
  assert.equal(f.raw(), before); assert.equal(f.keys(), 0);
  const controller = new AbortController();
  const during = setup({ value: unresolved(), fetcher: async () => { controller.abort(); return new Promise(() => {}); } });
  const result = await during.client.submit(during.reviewRecovery(), controller.signal);
  assert.equal(result.kind, "UNKNOWN"); assert.equal(during.calls.reads.length, 0);
  assert.equal(during.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED");
});

test("real auth coordinator distinguishes same-session refresh from same-owner login", async () => {
  const api = { me: async () => ({ user: snapshot().user, binding: BINDING, expiresAt: READ }),
    login: async () => ({ user: snapshot().user, binding: BINDING, expiresAt: READ }) };
  const auth = createAuthSession(api); await auth.refresh();
  const f = setup({ auth, sessionClient: api }), review = await f.review(); await auth.refresh();
  assert.equal((await f.client.submit(review)).kind, "RESOLVED");
  const second = setup({ auth, sessionClient: api }), stale = await second.review(); await auth.login({});
  await assert.rejects(second.client.submit(stale), code("OWNER_MISMATCH")); assert.equal(second.calls.posts.length, 0);
});

test("resolved or missing recovery cannot replay; v1 storage is never migrated implicitly", async () => {
  const resolved = unresolved(); resolved.paymentRecoveries.A[KEY].recoveryStatus = "RESOLVED";
  const f = setup({ value: resolved }); assert.throws(() => f.reviewRecovery(), code("INVALID_DATA"));
  const missing = setup({ value: unresolved() }), review = missing.reviewRecovery();
  const value = missing.value(); value.paymentRecoveries = {}; missing.replace(value);
  await assert.rejects(missing.client.submit(review), code("PENDING_NOT_FOUND")); assert.equal(missing.calls.posts.length, 0);
  const legacy = fixture(), old = setup({ value: JSON.stringify({ schemaVersion: 1,
    cart: legacy.cart, pendingRequests: {}, lastOrderResult: null }) }), before = old.raw();
  await assert.rejects(old.client.submit(await old.review()), code("UNSUPPORTED_VERSION"));
  assert.equal(old.raw(), before); assert.equal(old.calls.posts.length, 0);
});

const noAttempt = (changes = {}) => Response.json({ error: { code: "ORDER_NOT_PAYABLE", message: "No new attempt.",
  details: { reason: "NO_ATTEMPT_TERMINAL_ORDER", orderId: "order-a", orderVersion: 1, orderStatus: "CANCELLED", ...changes } } }, { status: 409 });
test("saved key with no attempt can resolve only from a terminal marker plus a fresh owner-verified GET", async () => {
  for (const status of ["CANCELLED", "PAID", "PREPARING", "READY", "COMPLETED"]) {
    const f = setup({ value: unresolved(), fetcher: async () => noAttempt({ orderStatus: status }),
      reader: input => ({ session: input.session, order: status === "CANCELLED" ? cancelled() : paid({ status, canCancel: status === "PAID" }) }) });
    const before = f.value(), result = await f.client.submit(f.reviewRecovery());
    assert.equal(result.kind, "RESOLVED"); assert.equal(result.settlement.payment, null);
    assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "RESOLVED");
    assert.equal(f.value().paymentRecoveries.A[KEY].paymentId, null);
    assert.deepEqual(f.value().cart, before.cart); assert.deepEqual(f.value().checkoutBindings, before.checkoutBindings);
    assert.deepEqual(f.calls.sequence, ["POST", "GET"]); assert.equal(f.keys(), 0);
  }
});
test("terminal no-attempt marker cannot resolve a pinned ID, stale GET, wrong order, changed session or read failure", async () => {
  for (const options of [
    { value: unresolved({ pinned: true }) },
    { reader: input => ({ session: input.session, order: cancelled({ version: 0 }) }) },
    { reader: input => ({ session: input.session, order: cancelled({ id: "other" }) }) },
    { reader: input => ({ session: { ...input.session, ownerId: "B" }, order: cancelled() }) },
    { reader: () => { throw Error("GET unavailable"); } },
    { reader: input => ({ session: input.session, order: failedOrder() }) },
    { fetcher: async () => noAttempt({ orderId: "other" }) },
    { fetcher: async () => noAttempt({ reason: "UNKNOWN" }) },
  ]) {
    const f = setup({ value: unresolved(), fetcher: async () => noAttempt(),
      reader: input => ({ session: input.session, order: cancelled() }), ...options });
    try { assert.equal((await f.client.submit(f.reviewRecovery())).kind, "UNKNOWN"); } catch (e) { assert.ok(["OWNER_MISMATCH", "INVALID_DATA"].includes(e.code)); }
    assert.equal(f.value().paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED");
  }
});
