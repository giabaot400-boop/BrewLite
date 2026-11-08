import assert from "node:assert/strict";
import test from "node:test";
import { createCartCancelClientV2 } from "./cart-cancel-client-v2.ts";
import { createCartMutationTransport } from "./cart-mutation-transport.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createCartStorage, CART_LOCK_NAME, CART_STORAGE_KEY } from "./cart-storage.ts";
import { cartReducer } from "./cart-reducer.ts";
import { AuthApiError } from "../auth/auth-error.ts";

const TIME = "2026-11-08T08:30:00.000Z", LATER = "2026-11-08T08:30:01.000Z", READ = "2026-11-08T08:30:02.000Z";
const BINDING = "a".repeat(64), BINDING2 = "b".repeat(64);
const KEY = "00000000-0000-4000-8000-000000000001";
const code = expected => error => error.code === expected;
const snapshot = (id = "A", binding = BINDING) => ({ status: "authenticated", user: { id, email: `${id}@example.com` },
  sessionExpired: false, binding });
const order = (changes = {}) => ({ id: "order-a", version: 0, status: "PENDING", total: 50000,
  paymentDeadline: "2026-11-08T08:45:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: TIME, ...changes });
const cancelled = (changes = {}) => order({ status: "CANCELLED", version: 1, canPay: false, canCancel: false, serverTime: LATER, ...changes });
const paid = (changes = {}) => order({ status: "PAID", version: 1, paidAt: TIME, canPay: false, ...changes });
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(orderId = "order-a") {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: {
    productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M",
    toppingIds: [], toppingNames: {}, previewUnitPrice: 50000,
  } }).cart, ownerId: "A" };
  value.checkoutBindings = { A: { ownerId: "A", orderId, cartRevision: value.cart.revision,
    cartSnapshot: structuredClone(value.cart), orderVersion: 0, boundAt: TIME } };
  return value;
}
// Fixtures exercise the injected parser boundary, not B's real full-DTO parser or backend refunds.
function detail(view) {
  return { ...view, createdAt: TIME, items: [{ productId: "coffee", productName: "Coffee", size: "M",
    basePrice: 50000, sizeExtraPrice: 0, unitPrice: 50000, qty: 1, lineTotal: 50000, toppings: [] }],
    subtotal: 50000, discountTotal: 0, promotion: null,
    cancelReason: view.status === "CANCELLED" ? "CUSTOMER_REQUEST" : null,
    latestPayment: null, loyaltyPointsEarned: 0, loyaltyPointsReversed: 0 };
}

function setup(options = {}) {
  let raw = typeof options.value === "string" ? options.value : encodeCartEnvelopeV2(options.value ?? fixture(options.id));
  let identity = snapshot(), generation = 1, held = false, tail = Promise.resolve(), writes = 0;
  let failWrite = false, onLock = () => {}, onWrite = () => {};
  const initial = options.initial ?? order({ id: options.id ?? "order-a" });
  const final = cancelled({ id: initial.id, version: initial.version + 1, paidAt: initial.paidAt });
  const calls = { me: 0, posts: [], reads: [], parses: 0 };
  const storage = createCartStorage({ locks: { request(name, opts, action) {
    assert.equal(name, CART_LOCK_NAME);
    const work = tail.then(() => { opts.signal.throwIfAborted(); onLock(); held = true;
      try { return action(); } finally { held = false; } });
    tail = work.catch(() => {}); return work;
  } }, storage: { getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true); return raw; },
    setItem(key, value) { assert.equal(key, CART_STORAGE_KEY); assert.equal(held, true);
      if (failWrite) throw Error("quota"); raw = value; onWrite(++writes); } } });
  const environment = {
    auth: { getSnapshot: () => identity, getSessionVersion: () => generation },
    sessionClient: { async me() { assert.equal(held, false); calls.me++;
      return options.me ? options.me(calls.me) : { user: identity.user, binding: identity.binding, expiresAt: READ }; } },
    storage,
    transport: createCartMutationTransport({ fetch(url, init) {
      assert.equal(held, false); assert.equal(init.body, "{}");
      assert.equal(Object.hasOwn(init.headers, "Idempotency-Key"), false);
      calls.posts.push({ url, init });
      return options.fetcher ? options.fetcher(url, init) : Promise.resolve(Response.json(detail(final), { status: 200 }));
    } }),
    async readOrder(input) {
      assert.equal(held, false); calls.reads.push(input);
      return options.reader ? options.reader(input, calls.reads.length)
        : { session: input.session, order: calls.posts.length ? { ...final, serverTime: READ } : initial };
    },
    parseOrderDetail(body) { assert.equal(held, false); calls.parses++;
      return options.parse ? options.parse(body) : structuredClone(body); },
  };
  const client = createCartCancelClientV2(environment);
  return { client, environment, storage, calls, initial, final, raw: () => raw, value: () => JSON.parse(raw), writes: () => writes,
    replace: value => { raw = encodeCartEnvelopeV2(value); }, failWrites: () => { failWrite = true; },
    onLock: hook => { onLock = hook; }, onWrite: hook => { onWrite = hook; },
    switch: (id = "B", binding = BINDING2) => { identity = snapshot(id, binding); generation++; },
    refresh: () => { identity = { ...identity }; }, review: () => client.review(initial.id) };
}

test("opening or abandoning cancel confirmation reads a frozen current order without mutation or POST", async () => {
  const source = order(), f = setup({ reader: input => ({ session: input.session, order: detail(source) }) }), before = f.raw();
  const review = await f.review(); source.total = 1;
  assert.equal(review.order.total, 50000); assert.equal(review.order.items, undefined);
  assert.throws(() => { review.order.id = "other"; }, TypeError);
  assert.equal(f.raw(), before); assert.equal(f.writes(), 0); assert.equal(f.calls.posts.length, 0);
  assert.equal(f.calls.me, 1); assert.equal(f.calls.reads.length, 1);
});

for (const state of [order(), order({ status: "PAYMENT_FAILED", version: 1 }), paid()]) {
  test(`${state.status}: explicit cancellation reads again, sends {}, validates reply then GETs and releases only binding`, async () => {
    const f = setup({ initial: state }), cart = f.value().cart;
    const result = await f.client.submit(await f.review());
    assert.equal(result.kind, "CANCELLED"); assert.equal(result.settlement.cartEffect, "UNCHANGED");
    assert.deepEqual(f.value().cart, cart); assert.equal(f.value().checkoutBindings.A, undefined);
    assert.equal(f.calls.posts.length, 1); assert.equal(f.calls.reads.length, 3); assert.equal(f.calls.parses, 1);
    assert.equal(f.writes(), 1); assert.equal(f.calls.posts[0].url, "/api/orders/order-a/cancel");
  });
}

test("past-deadline PENDING can still be cancelled when server canCancel is true", async () => {
  const initial = order({ paymentDeadline: "2026-11-08T08:29:00.000Z" }), f = setup({ initial });
  assert.equal((await f.client.submit(await f.review())).kind, "CANCELLED"); assert.equal(f.calls.posts.length, 1);
});

test("legacy and PREPARING-or-later order cannot open a mutation confirmation", async () => {
  for (const initial of [order({ paymentDeadline: null, canPay: false, canCancel: false }),
    paid({ status: "PREPARING", version: 2, canCancel: false }), cancelled()]) {
    const f = setup({ initial }), before = f.raw();
    await assert.rejects(f.review(), code("INVALID_DATA")); assert.equal(f.calls.posts.length, 0); assert.equal(f.raw(), before);
  }
});

test("forged, foreign or consumed confirmation cannot send another cancel", async () => {
  const f = setup(), other = setup(), review = await f.review();
  await assert.rejects(f.client.submit({ ...review }), code("INVALID_DATA"));
  await assert.rejects(other.client.submit(review), code("INVALID_DATA"));
  await f.client.submit(review);
  await assert.rejects(f.client.submit(review), code("INVALID_DATA")); assert.equal(f.calls.posts.length, 1);
});

test("simultaneous confirm clicks send only one POST and do not reuse a consumed review", async () => {
  const waiting = deferred(), f = setup({ fetcher: () => waiting.promise });
  const firstReview = await f.review(), secondReview = await f.review();
  const first = f.client.submit(firstReview); await flush();
  await assert.rejects(f.client.submit(secondReview), code("PENDING_REQUEST"));
  waiting.resolve(Response.json(detail(f.final), { status: 200 })); await first;
  await assert.rejects(f.client.submit(firstReview), code("INVALID_DATA")); assert.equal(f.calls.posts.length, 1);
});

test("fresh me failure or a changed cookie owner/binding cannot fall back to cached authentication", async () => {
  for (const reply of [() => { throw new AuthApiError("NETWORK_ERROR", "offline"); },
    () => ({ user: snapshot("B").user, binding: BINDING }), () => ({ user: snapshot().user, binding: BINDING2 })]) {
    const f = setup({ me: count => count === 1 ? { user: snapshot().user, binding: BINDING } : reply() });
    const review = await f.review(), before = f.raw();
    await assert.rejects(f.client.submit(review), error => ["NETWORK_ERROR", "OWNER_MISMATCH"].includes(error.code));
    assert.equal(f.calls.posts.length, 0); assert.equal(f.raw(), before);
  }
});

test("same-session refresh keeps confirmation but owner switch and same-owner login invalidate it", async () => {
  const stable = setup(), review = await stable.review(); stable.refresh();
  assert.equal((await stable.client.submit(review)).kind, "CANCELLED");
  for (const id of ["A", "B"]) {
    const f = setup(), stale = await f.review(), before = f.raw(); f.switch(id);
    await assert.rejects(f.client.submit(stale), code("OWNER_MISMATCH"));
    assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0);
  }
});

for (const next of [paid(), order({ version: 1 }), order({ total: 55000 }),
  order({ canCancel: false }), paid({ status: "PREPARING", version: 2, canCancel: false })]) {
  test(`changed order before POST requires a new confirmation: ${next.status}/${next.version}/${next.total}/${next.canCancel}`, async () => {
    const f = setup({ reader: (input, count) => ({ session: input.session, order: count === 1 ? order() : next }) });
    const review = await f.review(), before = f.raw();
    await assert.rejects(f.client.submit(review), code("CART_CHANGED")); assert.equal(f.calls.posts.length, 0); assert.equal(f.raw(), before);
  });
}

test("already CANCELLED on the pre-send read completes locally without another POST", async () => {
  const f = setup({ reader: (input, count) => ({ session: input.session, order: count === 1 ? order() : cancelled() }) });
  const cart = f.value().cart, result = await f.client.submit(await f.review());
  assert.equal(result.kind, "CANCELLED"); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.parses, 0);
  assert.deepEqual(f.value().cart, cart); assert.equal(f.value().checkoutBindings.A, undefined);
});

test("POST loss keeps binding, no automatic resend; explicit check can discover committed cancellation", async () => {
  let committed = false;
  const f = setup({ fetcher: async () => { committed = true; throw Error("lost response after commit"); },
    reader: input => ({ session: input.session, order: committed ? cancelled() : order() }) }), cart = f.value().cart;
  const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN");
  assert.ok(f.value().checkoutBindings.A); await flush(); assert.equal(f.calls.posts.length, 1);
  const checked = await f.client.check("order-a"); assert.equal(checked.kind, "CANCELLED");
  assert.deepEqual(f.value().cart, cart); assert.equal(f.value().checkoutBindings.A, undefined); assert.equal(f.calls.posts.length, 1);
});

test("uncommitted cancel can be checked and explicitly confirmed again with the same order and {}", async () => {
  let sends = 0;
  const f = setup({ fetcher: async () => { if (++sends === 1) throw Error("never reached server");
    return Response.json(detail(cancelled()), { status: 200 }); },
    reader: input => ({ session: input.session, order: sends >= 2 ? cancelled() : order() }) });
  assert.equal((await f.client.submit(await f.review())).kind, "UNKNOWN");
  assert.equal((await f.client.check("order-a")).kind, "CURRENT_ORDER"); assert.equal(f.calls.posts.length, 1);
  assert.equal((await f.client.submit(await f.review())).kind, "CANCELLED");
  assert.equal(f.calls.posts[0].url, f.calls.posts[1].url); assert.equal(f.calls.posts[0].init.body, f.calls.posts[1].init.body);
});

test("checking PAID after cancellation uncertainty never clears the cart or resolves payment recovery", async () => {
  const value = fixture(); value.paymentRecoveries = { A: { [KEY]: { ownerId: "A", requestKey: KEY,
    body: { orderId: "order-a", method: "WALLET" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } } };
  const f = setup({ value, reader: input => ({ session: input.session, order: paid() }) }), before = f.raw();
  const result = await f.client.check("order-a"); assert.equal(result.kind, "CURRENT_ORDER");
  assert.equal(result.order.status, "PAID"); assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0);
});

test("CANCELLED preserves both unresolved payments and all cart bytes; repeated check performs no extra write", async () => {
  const value = fixture(); value.paymentRecoveries = { A: { [KEY]: { ownerId: "A", requestKey: KEY,
    body: { orderId: "order-a", method: "CARD" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } } };
  const f = setup({ value, reader: input => ({ session: input.session, order: cancelled() }) });
  assert.equal((await f.client.check("order-a")).kind, "CANCELLED"); const before = f.raw();
  assert.equal((await f.client.check("order-a")).kind, "CANCELLED"); assert.equal(f.writes(), 1); assert.equal(f.raw(), before);
  assert.deepEqual(f.value().paymentRecoveries, value.paymentRecoveries); assert.deepEqual(f.value().cart, value.cart);
});

test("valid POST plus failed GET stays UNKNOWN and retains binding until explicit check", async () => {
  let fail = true;
  const f = setup({ reader: (input, count) => { if (count >= 3 && fail) throw Error("read timeout");
    return { session: input.session, order: count >= 3 ? cancelled() : order() }; } });
  const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN"); assert.ok(f.value().checkoutBindings.A);
  fail = false; assert.equal((await f.client.check("order-a")).kind, "CANCELLED"); assert.equal(f.calls.posts.length, 1);
});

test("full OrderDetail decoder rejection cannot be bypassed by an apparently valid projection", async () => {
  const f = setup({ parse() { throw Error("invalid refund/lines DTO"); } }), before = f.raw();
  const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN");
  assert.equal(f.calls.reads.length, 2); assert.equal(f.calls.parses, 1); assert.equal(f.raw(), before);
});

for (const body of [cancelled({ id: "wrong" }), cancelled({ total: 50001 }), cancelled({ version: 0 }), paid()]) {
  test(`untrusted cancel reply cannot release a binding: ${body.id}/${body.total}/${body.version}/${body.status}`, async () => {
    const f = setup({ fetcher: async () => Response.json(detail(body), { status: 200 }) }), before = f.raw();
    const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN");
    assert.equal(f.raw(), before); assert.equal(f.calls.reads.length, 2);
  });
}

test("409 status errors read current state, but PREPARING and legacy never mutate cart", async () => {
  for (const [errorCode, current] of [["ORDER_NOT_CANCELLABLE", paid({ status: "PREPARING", version: 2, canCancel: false })],
    ["LEGACY_ORDER_REQUIRES_REVIEW", order({ paymentDeadline: null, canPay: false, canCancel: false, serverTime: READ })]]) {
    const f = setup({ fetcher: async () => Response.json({ error: { code: errorCode, message: "read state" } }, { status: 409 }),
      reader: (input, count) => ({ session: input.session, order: count >= 3 ? current : order() }) }), before = f.raw();
    const result = await f.client.submit(await f.review()); assert.equal(result.kind, "CURRENT_ORDER");
    assert.equal(f.raw(), before); assert.equal(f.calls.parses, 0);
  }
});

test("401, malformed error and unexpected success status stay UNKNOWN without a post-response GET", async () => {
  for (const reply of [() => Response.json({ error: { code: "SESSION_EXPIRED", message: "login" } }, { status: 401 }),
    () => Response.json({ error: { code: "ORDER_NOT_CANCELLABLE" } }, { status: 409 }),
    () => Response.json(detail(cancelled()), { status: 201 })]) {
    const f = setup({ fetcher: async () => reply() }), before = f.raw();
    const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN");
    assert.equal(f.raw(), before); assert.equal(f.calls.reads.length, 2); assert.equal(f.calls.parses, 0);
  }
});

test("GET older than acknowledged cancellation, wrong total or PAID cannot replace current cancellation", async () => {
  for (const current of [cancelled({ version: 0 }), cancelled({ serverTime: TIME }), cancelled({ total: 7 }), paid({ version: 2, serverTime: READ })]) {
    const f = setup({ reader: (input, count) => ({ session: input.session, order: count >= 3 ? current : order() }) }), before = f.raw();
    const result = await f.client.submit(await f.review()); assert.equal(result.kind, "UNKNOWN"); assert.equal(f.raw(), before);
  }
});

test("owner/binding/generation mismatch on current Order cannot publish or change storage", async () => {
  for (const mismatch of [{ ownerId: "B" }, { binding: BINDING2 }, { sessionVersion: 2 }]) {
    const f = setup({ reader: (input, count) => ({ session: count >= 3 ? { ...input.session, ...mismatch } : input.session,
      order: count >= 3 ? cancelled() : order() }) }), before = f.raw();
    await assert.rejects(f.client.submit(await f.review()), code("OWNER_MISMATCH")); assert.equal(f.raw(), before);
  }
});

test("late POST and GET after account switch or same-owner login cannot release another binding", async () => {
  for (const stage of ["POST", "GET"]) {
    const waiting = deferred(); let input;
    const f = setup({ ...(stage === "POST" ? { fetcher: () => waiting.promise } : {
      reader: (next, count) => { if (count >= 3) { input = next; return waiting.promise; } return { session: next.session, order: order() }; },
    }) });
    const task = f.client.submit(await f.review()); await flush(); f.switch(stage === "POST" ? "B" : "A");
    const before = f.raw(); waiting.resolve(stage === "POST" ? Response.json(detail(cancelled()), { status: 200 })
      : { session: input.session, order: cancelled() });
    await assert.rejects(task, code("OWNER_MISMATCH")); assert.equal(f.raw(), before);
  }
});

test("replacement binding during HTTP is ignored; a newer cart is never cleared or reconstructed", async () => {
  const waiting = deferred(); let input;
  const f = setup({ reader: (next, count) => { if (count >= 3) { input = next; return waiting.promise; }
    return { session: next.session, order: order() }; } });
  const task = f.client.submit(await f.review()); await flush();
  const value = f.value(); value.cart = { ...value.cart, revision: value.cart.revision + 1, items: [] };
  value.checkoutBindings.A = { ...value.checkoutBindings.A, boundAt: LATER }; f.replace(value);
  const before = f.raw(); waiting.resolve({ session: input.session, order: cancelled() });
  assert.equal((await task).kind, "IGNORED"); assert.equal(f.raw(), before);
});

test("queued auth transition and quota errors prevent cancellation cleanup without rewriting pending/recovery", async () => {
  for (const failure of ["auth", "quota"]) {
    const f = setup(), review = await f.review(), before = f.raw();
    if (failure === "auth") f.onLock(() => f.switch()); else f.failWrites();
    await assert.rejects(f.client.submit(review), code(failure === "auth" ? "OWNER_MISMATCH" : "STORAGE_UNAVAILABLE"));
    assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 1);
  }
});

test("opaque IDs are encoded once; unsafe path targets are rejected before any HTTP", async () => {
  const f = setup({ id: " order%2F " }); await f.client.submit(await f.review());
  assert.equal(f.calls.posts[0].url, "/api/orders/%20order%252F%20/cancel");
  for (const id of ["", ".", "..", "\ud800"]) {
    const invalid = setup(); await assert.rejects(invalid.client.review(id), code("INVALID_DATA"));
    assert.equal(invalid.calls.me, 0); assert.equal(invalid.calls.posts.length, 0);
  }
});

test("v1 storage is not migrated and read failure cannot start cancellation", async () => {
  const value = fixture(), f = setup({ value: JSON.stringify({ schemaVersion: 1, cart: value.cart, pendingRequests: {}, lastOrderResult: null }) });
  const before = f.raw(); await assert.rejects(f.review(), code("UNSUPPORTED_VERSION"));
  assert.equal(f.raw(), before); assert.equal(f.calls.posts.length, 0); assert.equal(f.calls.reads.length, 0);
});

test("abort before submit has no effects; abort during POST does not prove cancellation or auto-retry", async () => {
  const f = setup(), review = await f.review(), controller = new AbortController(), before = f.raw(); controller.abort();
  await assert.rejects(f.client.submit(review, controller.signal), { name: "AbortError" }); assert.equal(f.raw(), before);
  const abort = new AbortController(), during = setup({ fetcher: async () => { abort.abort(); return new Promise(() => {}); } });
  const prior = during.raw(), result = await during.client.submit(await during.review(), abort.signal);
  assert.equal(result.kind, "UNKNOWN"); assert.equal(during.raw(), prior); assert.equal(during.calls.posts.length, 1);
  assert.equal(during.calls.reads.length, 2);
});
