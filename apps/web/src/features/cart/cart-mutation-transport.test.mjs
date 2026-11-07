import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createCartStorage } from "./cart-storage.ts";
import { cartReducer } from "./cart-reducer.ts";
import { createCartMutationTransport } from "./cart-mutation-transport.ts";
import { createCartOrderTransport } from "./cart-order-transport.ts";
import { CART_HTTP_TIMEOUT_MS } from "./cart-http.ts";
import { createPaymentHandler } from "../../lib/server/payments/payment-handler.ts";
import { assertSameOriginPost } from "../../lib/server/auth/csrf.ts";
const KEY = "00000000-0000-4000-8000-000000000001", TIME = "2026-11-08T00:00:00.000Z";
const code = expected => error => error instanceof CartStorageError && error.code === expected;
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
class Clock {
  time = 0; jobs = new Set(); delays = [];
  schedule = (callback, delayMs) => { this.delays.push(delayMs); const job = { callback, at: this.time + delayMs }; this.jobs.add(job); return () => this.jobs.delete(job); };
  tick(ms) { this.time += ms; for (const job of [...this.jobs]) if (job.at <= this.time) { this.jobs.delete(job); job.callback(); } }
}
const recovery = (changes = {}) => ({ ownerId: "A", requestKey: KEY, body: { method: "CARD", orderId: " order%2F " },
  createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED", ...changes });
const cancel = (changes = {}) => ({ ownerId: "A", orderId: " order%2F ", ...changes });
const response = (status = 200, body = { id: "payment-k1", status: "FAILED" }) => ({ status, json: async () => body });
function setup(fetcher) {
  const calls = [], clock = new Clock(), env = { schedule: clock.schedule, now: () => TIME,
    fetch: (url, init) => { calls.push({ url, init }); return fetcher(url, init); } };
  return { calls, clock, env, transport: createCartMutationTransport(env), orders: createCartOrderTransport(env) };
}
function orderEnvelope() {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: {
    productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M", toppingIds: [], toppingNames: {}, previewUnitPrice: 50000,
  } }).cart, ownerId: "A" }; return value;
}
const order = () => ({ id: " order%2F ", version: 0, status: "PENDING", total: 50000,
  paymentDeadline: "2026-11-08T00:15:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: TIME });
function storagePort({ failWrite = false } = {}) {
  let held = false; const value = orderEnvelope(), memory = { raw: encodeCartEnvelopeV2(value), writes: 0 };
  const storage = createCartStorage({ locks: { async request(_name, _options, callback) { held = true;
    try { const result = callback(); assert.equal(result instanceof Promise, false); return result; } finally { held = false; } } },
    storage: { getItem() { assert.equal(held, true); return memory.raw; }, setItem(_key, raw) { assert.equal(held, true);
      if (failWrite) throw Error("quota"); memory.raw = raw; memory.writes++; } } });
  return { storage, memory, held: () => held, value };
}
async function preparePayment(port) {
  return port.storage.applyPaymentLifecycleV2({ type: "BEGIN_PAYMENT", ownerId: "A", requestKey: KEY,
    body: recovery().body, createdAt: TIME, order: order() }, () => true);
}

test("payment forwards the saved recovery body/key to a fixed BFF path without JWT or injected amount", async () => {
  const input = recovery(), f = setup(async () => response()); const before = JSON.stringify(input);
  const observed = await f.transport.sendPayment(input);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, "/api/payments"); assert.equal(f.calls[0].init.body, JSON.stringify(input.body));
  assert.deepEqual(f.calls[0].init.headers, { "Content-Type": "application/json", Accept: "application/json", "X-BrewLite-Request": "1",
    "X-BrewLite-Expected-Owner": "A", "Idempotency-Key": KEY });
  assert.equal(f.calls[0].init.credentials, "same-origin"); assert.equal(f.calls[0].init.cache, "no-store"); assert.equal(f.calls[0].init.redirect, "error");
  assert.deepEqual(observed.expectedRecovery, input); assert.equal(observed.requestKey, KEY); assert.equal(observed.ownerId, "A");
  assert.equal(observed.failure, null); assert.equal(observed.reply.status, 200); assert.equal(JSON.stringify(input), before);
});

test("cancel sends exactly {} without an idempotency key or mutation of its captured owner/order", async () => {
  const f = setup(async () => response(200, { id: " order%2F ", status: "CANCELLED" })), input = cancel();
  const result = await f.transport.cancelOrder(input);
  assert.equal(f.calls[0].url, "/api/orders/%20order%252F%20/cancel"); assert.equal(f.calls[0].init.body, "{}");
  assert.equal(f.calls[0].init.headers["Idempotency-Key"], undefined); assert.equal(result.ownerId, "A"); assert.equal(result.orderId, input.orderId);
});

test("cancel opaque IDs are encoded once, including literal percent, slash, Unicode and whitespace", async () => {
  for (const orderId of ["a%2Fb", "a/b", " é?# ", "%2e%2e", "a\\b"]) {
    const f = setup(async () => response()); await f.transport.cancelOrder(cancel({ ownerId: " owner é ", orderId }));
    assert.equal(f.calls[0].url, `/api/orders/${encodeURIComponent(orderId)}/cancel`);
    assert.equal(f.calls[0].init.headers["X-BrewLite-Expected-Owner"], encodeURIComponent(" owner é "));
  }
});

test("unprepared, resolved, corrupt or oversized payment records never start fetch or a timer", async () => {
  for (const changes of [{ recoveryStatus: "RESOLVED" }, { requestKey: "bad" }, { ownerId: "" }, { createdAt: "bad" },
    { accessToken: "do-not-send" }, { body: { orderId: "order", method: "CASH" } },
    { body: { orderId: "order", method: "CARD", amount: 1 } }, { body: { orderId: "☕".repeat(2000), method: "CARD" } }]) {
    const f = setup(async () => assert.fail("no HTTP")); await assert.rejects(f.transport.sendPayment(recovery(changes)), code("INVALID_DATA"));
    assert.equal(f.calls.length, 0); assert.equal(f.clock.delays.length, 0);
  }
});

test("malformed cancel IDs, extra fields and unencodable owners cannot start fetch or timers", async () => {
  for (const changes of [{ orderId: "" }, { orderId: "." }, { orderId: ".." }, { orderId: "\ud800" },
    { ownerId: "" }, { ownerId: "\ud800" }, { requestKey: KEY }]) {
    const f = setup(async () => assert.fail("no HTTP")); await assert.rejects(f.transport.cancelOrder(cancel(changes)), code("INVALID_DATA"));
    assert.equal(f.calls.length, 0); assert.equal(f.clock.delays.length, 0);
  }
});

for (const method of ["sendPayment", "cancelOrder"]) {
  const input = () => method === "sendPayment" ? recovery() : cancel();
  test(`${method}: mutating input during HTTP cannot alter outgoing identity/body or returned checkpoint`, async () => {
    const gate = deferred(), f = setup(() => gate.promise), original = input(), expected = structuredClone(original);
    const result = f.transport[method](original); original.ownerId = "B";
    if (method === "sendPayment") { original.requestKey = "changed"; original.body.method = "WALLET"; }
    else original.orderId = "changed";
    gate.resolve(response()); const observed = await result;
    assert.equal(observed.ownerId, expected.ownerId);
    if (method === "sendPayment") { assert.deepEqual(observed.expectedRecovery, expected); assert.equal(f.calls[0].init.body, JSON.stringify(expected.body)); }
    else assert.equal(observed.orderId, expected.orderId);
  });
  test(`${method}: one 15s deadline includes both fetch and JSON body and never restarts`, async () => {
    const headers = deferred(), body = deferred(), f = setup(() => headers.promise);
    const result = f.transport[method](input()); f.clock.tick(10000);
    headers.resolve({ status: 200, json: () => body.promise }); await flush(); f.clock.tick(5000);
    const observed = await result;
    assert.equal(CART_HTTP_TIMEOUT_MS, 15000); assert.equal(observed.failure, "TIMEOUT"); assert.equal(observed.reply.status, 200);
    assert.equal(observed.reply.body, null); assert.equal(f.calls[0].init.signal.aborted, true); assert.deepEqual(f.clock.delays, [15000]);
    assert.equal(f.clock.jobs.size, 0); body.reject(Error("late body")); await flush(); assert.equal(f.calls.length, 1);
  });
  test(`${method}: late fetch after timeout cannot start body work or trigger a second request`, async () => {
    const gate = deferred(), f = setup(() => gate.promise); let bodyReads = 0;
    const result = f.transport[method](input()); f.clock.tick(15000); assert.equal((await result).failure, "TIMEOUT");
    gate.resolve({ status: 200, json: async () => { bodyReads++; return {}; } }); await flush();
    assert.equal(bodyReads, 0); f.clock.tick(60000); assert.equal(f.calls.length, 1);
  });
  test(`${method}: pre-cancelled caller sends nothing; cancellation during body retains uncertainty`, async () => {
    const caller = new AbortController(); caller.abort(); const first = setup(async () => assert.fail("no HTTP"));
    assert.equal((await first.transport[method](input(), caller.signal)).failure, "CANCELLED");
    assert.equal(first.calls.length, 0); assert.equal(first.clock.delays.length, 0);
    const body = deferred(), active = new AbortController(), f = setup(async () => ({ status: 200, json: () => body.promise }));
    const result = f.transport[method](input(), active.signal); await flush(); active.abort();
    const observed = await result; assert.equal(observed.failure, "CANCELLED"); assert.equal(observed.reply.status, 200);
    assert.equal(observed.reply.body, null); assert.equal(f.calls[0].init.signal.aborted, true); assert.equal(f.clock.jobs.size, 0);
    body.resolve({}); await flush();
  });
  test(`${method}: network and JSON failures preserve known status without inventing a business outcome`, async () => {
    const offline = setup(async () => { throw Error("private network detail"); });
    const lost = await offline.transport[method](input()); assert.equal(lost.failure, "NETWORK"); assert.equal(lost.reply.status, null);
    const badJson = setup(async () => ({ status: 200, json: async () => { throw SyntaxError("bad"); } }));
    const invalid = await badJson.transport[method](input()); assert.equal(invalid.failure, "INVALID_BODY"); assert.equal(invalid.reply.status, 200);
    assert.equal(invalid.reply.body, null); assert.equal(offline.calls.length, 1); assert.equal(badJson.calls.length, 1);
  });
  test(`${method}: valid success, FAILED and HTTP errors remain raw for request-bound settlement`, async () => {
    for (const [status, body] of [[200, { id: "p", status: "FAILED" }], [200, { id: "order", status: "CANCELLED" }],
      [401, { error: { code: "SESSION_EXPIRED" } }], [403, { error: { code: "REQUEST_FORBIDDEN" } }],
      [409, { error: { code: "IDEMPOTENCY_CONFLICT" } }], [409, { error: { code: "PAYMENT_WINDOW_EXPIRED" } }],
      [503, { error: { code: "TRANSACTION_RETRY_EXHAUSTED" } }]]) {
      const f = setup(async () => response(status, body)), observed = await f.transport[method](input());
      assert.equal(observed.failure, null); assert.deepEqual(observed.reply, { status, body }); assert.equal(f.calls.length, 1);
    }
  });
  test(`${method}: completion releases the timer and caller abort listener`, async () => {
    const caller = new AbortController(), f = setup(async () => response()); await f.transport[method](input(), caller.signal);
    f.clock.tick(20000); caller.abort(); assert.equal(f.calls[0].init.signal.aborted, false); assert.equal(f.clock.jobs.size, 0);
  });
}

test("v2 order transport preserves saved promo spelling, expected total and key across retry", async () => {
  const value = orderEnvelope(), port = storagePort();
  const command = { type: "BEGIN_ORDER_V2", ownerId: "A", expectedCart: { ownerId: "A", revision: value.cart.revision },
    requestKey: KEY, createdAt: TIME, promotionCode: "DEMO10" };
  const saved = await port.storage.applyCheckoutLifecycleV2(command, () => true);
  const record = structuredClone(saved.request); record.payload.promotionCode = " demo10 ";
  const f = setup(async () => response(201, { id: "order", status: "PENDING", total: 45000 }));
  for (let i = 0; i < 2; i++) {
    const result = await f.orders.send(record); assert.equal(result.reply.requestKey, KEY); assert.equal(result.reply.ownerId, "A");
    assert.equal(result.reply.receivedAt, TIME);
  }
  assert.equal(f.calls[0].url, "/api/orders"); assert.equal(f.calls[0].init.body, JSON.stringify(record.payload));
  assert.equal(f.calls[1].init.body, f.calls[0].init.body); assert.equal(JSON.parse(f.calls[1].init.body).promotionCode, " demo10 ");
  assert.equal(JSON.parse(f.calls[1].init.body).schemaVersion, 2);
});

test("invalid v2 orders cannot be downgraded to v1 or sent before durable preparation", async () => {
  const port = storagePort(), saved = await port.storage.applyCheckoutLifecycleV2({ type: "BEGIN_ORDER_V2", ownerId: "A",
    expectedCart: { ownerId: "A", revision: port.value.cart.revision }, requestKey: KEY, createdAt: TIME, promotionCode: null }, () => true);
  for (const change of [p => { p.phase = "UNKNOWN"; }, p => { p.payload.schemaVersion = 3; },
    p => { delete p.payload.expectedTotal; }, p => { p.payload.expectedTotal = 0; }, p => { p.payload.items[0].qty = 2; }]) {
    const request = structuredClone(saved.request); change(request); const f = setup(async () => assert.fail("no HTTP"));
    await assert.rejects(f.orders.send(request), code("INVALID_DATA")); assert.equal(f.calls.length, 0); assert.equal(f.clock.delays.length, 0);
  }
});

test("payment preparation persists before transport; fetch and body run without a Web Lock", async () => {
  const port = storagePort(), prepared = await preparePayment(port);
  const f = setup(async () => { assert.equal(port.held(), false); assert.equal(port.memory.writes, 1);
    assert.equal(JSON.parse(port.memory.raw).paymentRecoveries.A[KEY].requestKey, KEY);
    return { status: 200, json: async () => { assert.equal(port.held(), false); return {}; } }; });
  await f.transport.sendPayment(prepared.request); assert.equal(port.memory.writes, 1);
});

test("failed durable preparation stops before any payment transport or timer", async () => {
  const port = storagePort({ failWrite: true }), f = setup(async () => assert.fail("no HTTP"));
  await assert.rejects((async () => { const saved = await preparePayment(port); return f.transport.sendPayment(saved.request); })(), code("STORAGE_UNAVAILABLE"));
  assert.equal(f.calls.length, 0); assert.equal(f.clock.jobs.size, 0); assert.equal(port.memory.writes, 0);
});

test("payment timeout plus reload permits only explicit replay of the same saved body/key", async () => {
  const port = storagePort(), saved = await preparePayment(port), gate = deferred(); let count = 0;
  const f = setup(() => ++count === 1 ? gate.promise : Promise.resolve(response()));
  const first = f.transport.sendPayment(saved.request); f.clock.tick(15000); const observed = await first;
  const unknown = await port.storage.applyPaymentLifecycleV2({ type: "SETTLE_PAYMENT", ownerId: observed.ownerId, requestKey: observed.requestKey,
    expectedRecovery: observed.expectedRecovery, expectedBinding: saved.binding, reply: observed.reply, order: null }, () => true);
  assert.equal(unknown.outcome, "UNKNOWN"); assert.equal(unknown.envelope.paymentRecoveries.A[KEY].recoveryStatus, "UNRESOLVED");
  await port.storage.readV2(); f.clock.tick(60000); assert.equal(f.calls.length, 1);
  const retry = await port.storage.applyPaymentLifecycleV2({ type: "RETRY_PAYMENT", ownerId: "A", requestKey: KEY }, () => true);
  await f.transport.sendPayment(retry.request); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].init.body, f.calls[1].init.body); assert.equal(f.calls[0].init.headers["Idempotency-Key"], f.calls[1].init.headers["Idempotency-Key"]);
  gate.reject(Error("late first attempt")); await flush();
});

test("transport owner A plus BFF cookie B blocks upstream POST and preserves A recovery", async () => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  const port = storagePort(), saved = await preparePayment(port), upstream = [];
  const bff = createPaymentHandler({ checkPost: assertSameOriginPost, readToken: async () => "token-b",
    backendUrls: () => ({ me: "http://backend/auth/me", payments: "http://backend/payments" }), fetch: async (url, init) => {
      upstream.push({ url, init }); return response(200, { user: { id: "B", email: "b@example.com" }, expiresAt: "2026-11-08T13:00:00.000Z" });
    } });
  const f = setup(async (path, init) => { const headers = new Headers(init.headers); headers.set("Origin", "http://localhost:3000");
    return bff(new Request("http://localhost:3000" + path, { ...init, headers })); });
  const observation = await f.transport.sendPayment(saved.request);
  assert.equal(observation.reply.status, 403); assert.equal(upstream.length, 1); assert.equal(upstream[0].init.method, "GET");
  const result = await port.storage.applyPaymentLifecycleV2({ type: "SETTLE_PAYMENT", ownerId: observation.ownerId, requestKey: observation.requestKey,
    expectedRecovery: observation.expectedRecovery, expectedBinding: saved.binding, reply: observation.reply, order: null }, () => true);
  assert.equal(result.outcome, "UNKNOWN"); assert.deepEqual(result.envelope.paymentRecoveries.A[KEY], saved.request);
});
