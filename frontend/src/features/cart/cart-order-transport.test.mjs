import assert from "node:assert/strict";
import test from "node:test";
import { cartReducer } from "./cart-reducer.ts";
import { CartStorageError, createEmptyCartEnvelope } from "./cart-envelope.ts";
import { createCartStorage } from "./cart-storage.ts";
import { createCartOrderTransport, ORDER_HTTP_TIMEOUT_MS } from "./cart-order-transport.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const TIME = "2026-10-30T07:00:00.000Z";
const code = (expected) => (error) => error instanceof CartStorageError && error.code === expected;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const draft = () => ({ productId: "coffee-milk", productName: "Cà phê sữa", imageUrl: "/images/coffee-milk.svg",
  size: "M", toppingIds: ["cream"], toppingNames: { cream: "Kem" }, previewUnitPrice: 47000 });
function prepared() {
  const cart = { ...cartReducer({ cart: createEmptyCartEnvelope().cart, error: null },
    { type: "ADD_ITEM", item: draft() }).cart, ownerId: "user-a" };
  return { ownerId: "user-a", requestKey: KEY, cartRevision: cart.revision,
    cartSnapshot: cart, payload: { items: [{ productId: "coffee-milk", size: "M", toppingIds: ["cream"],
      qty: 1, expectedUnitPrice: 47000 }] }, createdAt: TIME, phase: "SUBMITTING" };
}
const success = () => ({ id: "order-a", status: "PENDING", total: 47000 });
function response(status = 201, body = success()) { return { status, json: async () => body }; }
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// The production timeout is still 15000 ms. Tests advance this injected clock
// deterministically, without sleeping or changing the configured deadline.
class Clock {
  time = 0;
  jobs = new Set();
  delays = [];
  clears = 0;
  now = () => new Date(Date.parse(TIME) + this.time).toISOString();
  schedule = (callback, delayMs) => {
    this.delays.push(delayMs);
    const job = { callback, at: this.time + delayMs }; this.jobs.add(job);
    return () => { this.clears++; this.jobs.delete(job); };
  };
  tick(ms) {
    this.time += ms;
    for (const job of [...this.jobs].sort((a, b) => a.at - b.at)) {
      if (job.at <= this.time) { this.jobs.delete(job); job.callback(); }
    }
  }
}
function setup(fetcher) {
  const clock = new Clock(); const calls = [];
  const transport = createCartOrderTransport({ now: clock.now, schedule: clock.schedule,
    fetch: (url, init) => { calls.push({ url, init }); return fetcher(url, init); } });
  return { transport, clock, calls };
}

function storagePort({ failWrite = false } = {}) {
  let held = false;
  const initial = createEmptyCartEnvelope(); initial.cart = prepared().cartSnapshot;
  const memory = { raw: JSON.stringify(initial), writes: 0 };
  const service = createCartStorage({
    locks: { async request(_name, _options, callback) {
      assert.equal(held, false); held = true;
      try {
        const result = callback(); assert.equal(result instanceof Promise, false, "lock work must be synchronous");
        return result;
      } finally { held = false; }
    } },
    storage: { getItem() { assert.equal(held, true); return memory.raw; },
      setItem(_key, raw) { assert.equal(held, true); if (failWrite) throw new Error("quota");
        memory.raw = raw; memory.writes++; } },
  });
  return { service, memory, isHeld: () => held, initial };
}
async function begin(service, cart) {
  return service.applyLifecycle({ type: "BEGIN_ORDER", ownerId: "user-a", requestKey: KEY, createdAt: TIME,
    expectedCart: { ownerId: cart.ownerId, revision: cart.revision } });
}

test("one explicit POST uses fixed BFF path, exact saved payload and required headers without JWT", async () => {
  const input = prepared(); const { transport, calls, clock } = setup(async () => response());
  const result = await transport.send(input);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/orders");
  const options = calls[0].init;
  assert.equal(options.method, "POST"); assert.equal(options.credentials, "same-origin");
  assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
  assert.deepEqual(options.headers, { "Content-Type": "application/json", Accept: "application/json",
    "X-BrewLite-Request": "1", "Idempotency-Key": KEY });
  assert.equal(options.body, JSON.stringify(input.payload));
  assert.deepEqual(result, { reply: { ownerId: "user-a", requestKey: KEY, receivedAt: TIME,
    status: 201, body: success() }, failure: null });
  assert.equal(clock.jobs.size, 0); assert.deepEqual(clock.delays, [15000]); assert.equal(clock.clears, 1);
});

test("invalid or unprepared snapshots and oversized UTF-8 payloads never start fetch or timers", async () => {
  const cases = [
    (p) => { p.phase = "UNKNOWN"; }, (p) => { p.requestKey = "not-v4"; },
    (p) => { p.ownerId = "user-b"; }, (p) => { p.payload.items[0].qty = 2; },
    (p) => { p.accessToken = "must-not-send"; },
    (p) => { p.payload.items[0].productId = "é".repeat(17000); p.cartSnapshot.items[0].productId = p.payload.items[0].productId; },
  ];
  for (const change of cases) {
    const input = prepared(); change(input);
    const { transport, calls, clock } = setup(async () => assert.fail("must not fetch"));
    await assert.rejects(transport.send(input), code("INVALID_DATA"));
    assert.equal(calls.length, 0); assert.equal(clock.delays.length, 0);
  }
});

test("input changes during HTTP cannot change the sent body, owner or key of the reply", async () => {
  const gate = deferred(); const input = prepared();
  const { transport, calls } = setup(() => gate.promise);
  const expectedBody = JSON.stringify(input.payload); const operation = transport.send(input);
  input.ownerId = "user-b"; input.requestKey = "changed"; input.payload.items[0].qty = 20;
  input.cartSnapshot.items[0].toppingNames.cream = "changed";
  gate.resolve(response()); const result = await operation;
  assert.equal(calls[0].init.body, expectedBody);
  assert.equal(result.reply.ownerId, "user-a"); assert.equal(result.reply.requestKey, KEY);
});

test("network rejection becomes uncertainty and performs no automatic retry", async () => {
  const { transport, calls, clock } = setup(async () => { throw new TypeError("network detail"); });
  const result = await transport.send(prepared());
  assert.equal(result.failure, "NETWORK"); assert.equal(result.reply.status, null); assert.equal(result.reply.body, null);
  assert.equal(calls.length, 1); assert.equal(clock.jobs.size, 0);
  clock.tick(60000); assert.equal(calls.length, 1);
});

test("invalid JSON preserves known HTTP status and cannot be treated as successful creation", async () => {
  const { transport, clock } = setup(async () => ({ status: 201, json: async () => { throw new SyntaxError("bad JSON"); } }));
  const result = await transport.send(prepared());
  assert.equal(result.failure, "INVALID_BODY"); assert.equal(result.reply.status, 201); assert.equal(result.reply.body, null);
  assert.equal(clock.jobs.size, 0);
  const port = storagePort(); await begin(port.service, port.initial.cart);
  const settled = await port.service.settleOrder(result.reply);
  assert.equal(settled.outcome.kind, "UNKNOWN"); assert.equal(settled.envelope.pendingRequests["user-a"].requestKey, KEY);
});

test("15-second timeout aborts a pending fetch and bounds even an adapter that ignores abort", async () => {
  assert.equal(ORDER_HTTP_TIMEOUT_MS, 15000);
  const gate = deferred(); const { transport, calls, clock } = setup(() => gate.promise);
  let completed = false; const operation = transport.send(prepared()).then((value) => { completed = true; return value; });
  clock.tick(14999); await flush(); assert.equal(completed, false);
  clock.tick(1); const result = await operation;
  assert.equal(result.failure, "TIMEOUT"); assert.equal(result.reply.status, null);
  assert.equal(calls[0].init.signal.aborted, true); assert.equal(calls.length, 1);
  assert.equal(clock.jobs.size, 0); assert.equal(clock.clears, 1);
  gate.reject(new Error("late fetch error")); await flush();
});

test("deadline remains active after headers and bounds a stalled response body", async () => {
  const body = deferred(); const { transport, calls, clock } = setup(async () => ({ status: 201, json: () => body.promise }));
  const operation = transport.send(prepared()); await flush();
  clock.tick(15000); const result = await operation;
  assert.equal(result.failure, "TIMEOUT"); assert.equal(result.reply.status, 201); assert.equal(result.reply.body, null);
  assert.equal(calls[0].init.signal.aborted, true); assert.equal(clock.jobs.size, 0);
  body.resolve(success()); await flush(); assert.equal(result.failure, "TIMEOUT");
});

test("fetch and body share one deadline rather than restarting the timer at response headers", async () => {
  const headers = deferred(); const body = deferred(); const { transport, clock } = setup(() => headers.promise);
  const operation = transport.send(prepared()); clock.tick(10000);
  headers.resolve({ status: 200, json: () => body.promise }); await flush();
  clock.tick(4999); let completed = false; operation.then(() => { completed = true; });
  await flush(); assert.equal(completed, false);
  clock.tick(1); const result = await operation;
  assert.equal(result.failure, "TIMEOUT"); assert.equal(result.reply.status, 200);
  assert.deepEqual(clock.delays, [15000]); body.reject(new Error("late body error")); await flush();
});

test("body completed before deadline clears the timer and later ticks cannot abort it", async () => {
  const body = deferred(); const { transport, calls, clock } = setup(async () => ({ status: 200, json: () => body.promise }));
  const operation = transport.send(prepared()); await flush(); clock.tick(14999);
  body.resolve(success()); const result = await operation;
  assert.equal(result.failure, null); assert.deepEqual(result.reply.body, success());
  assert.equal(clock.jobs.size, 0); clock.tick(10000); assert.equal(calls[0].init.signal.aborted, false);
});

test("an already-cancelled caller performs no fetch and schedules no deadline", async () => {
  const caller = new AbortController(); caller.abort();
  const { transport, calls, clock } = setup(async () => assert.fail("must not send"));
  const result = await transport.send(prepared(), caller.signal);
  assert.equal(result.failure, "CANCELLED"); assert.equal(calls.length, 0); assert.equal(clock.delays.length, 0);
  assert.equal(result.reply.requestKey, KEY);
});

test("caller cancellation during fetch or body aborts the request and releases its timer", async () => {
  for (const bodyStage of [false, true]) {
    const gate = deferred(); const caller = new AbortController();
    const { transport, calls, clock } = setup(() => bodyStage
      ? Promise.resolve({ status: 201, json: () => gate.promise }) : gate.promise);
    const operation = transport.send(prepared(), caller.signal); await flush(); caller.abort();
    const result = await operation;
    assert.equal(result.failure, "CANCELLED"); assert.equal(result.reply.status, bodyStage ? 201 : null);
    assert.equal(calls[0].init.signal.aborted, true); assert.equal(clock.jobs.size, 0);
    gate.reject(new Error("late cancellation rejection")); await flush();
  }
});

test("completed requests remove the caller listener on both success and network failure", async () => {
  for (const fail of [false, true]) {
    const caller = new AbortController();
    const { transport, calls } = setup(async () => { if (fail) throw new Error("network"); return response(); });
    const result = await transport.send(prepared(), caller.signal);
    caller.abort(); assert.equal(calls[0].init.signal.aborted, false);
    assert.equal(result.failure, fail ? "NETWORK" : null);
  }
});

test("HTTP business and session errors are returned once for A5 classification without replacing the key", async () => {
  for (const [status, code] of [[400, "VALIDATION_ERROR"], [409, "PRICE_CHANGED"], [401, "SESSION_EXPIRED"],
    [403, "REQUEST_FORBIDDEN"], [413, "PAYLOAD_TOO_LARGE"], [409, "ORDER_REQUEST_IN_PROGRESS"], [504, "UPSTREAM_TIMEOUT"]]) {
    const error = { error: { code, message: "Thông báo" } };
    const { transport, calls, clock } = setup(async () => response(status, error));
    const result = await transport.send(prepared());
    assert.equal(result.failure, null); assert.equal(result.reply.status, status);
    assert.deepEqual(result.reply.body, error); assert.equal(result.reply.requestKey, KEY);
    assert.equal(calls.length, 1); assert.equal(clock.jobs.size, 0);
  }
});

test("prepare and settle use short locks while fetch and response body run after lock release", async () => {
  const port = storagePort(); const saved = await begin(port.service, port.initial.cart);
  const { transport } = setup(async () => {
    assert.equal(port.isHeld(), false); assert.equal(port.memory.writes, 1);
    assert.equal(JSON.parse(port.memory.raw).pendingRequests["user-a"].requestKey, KEY);
    return { status: 201, json: async () => { assert.equal(port.isHeld(), false); return success(); } };
  });
  const observed = await transport.send(saved.request);
  const settled = await port.service.settleOrder(observed.reply);
  assert.equal(settled.outcome.kind, "CONFIRMED"); assert.equal(port.memory.writes, 2);
});

test("failed durable preparation stops the caller before any transport call", async () => {
  const port = storagePort({ failWrite: true });
  const { transport, calls, clock } = setup(async () => assert.fail("must not send"));
  await assert.rejects((async () => {
    const saved = await begin(port.service, port.initial.cart);
    return transport.send(saved.request);
  })(), code("STORAGE_UNAVAILABLE"));
  assert.equal(calls.length, 0); assert.equal(clock.jobs.size, 0); assert.equal(port.memory.writes, 0);
});

test("timeout settles UNKNOWN and only explicit retry sends the same saved key and payload again", async () => {
  const port = storagePort(); const saved = await begin(port.service, port.initial.cart);
  const firstGate = deferred(); let attempt = 0;
  const { transport, calls, clock } = setup(async () => ++attempt === 1 ? firstGate.promise : response(200));
  const first = transport.send(saved.request); clock.tick(15000);
  const unknown = await port.service.settleOrder((await first).reply);
  assert.equal(unknown.outcome.kind, "UNKNOWN"); assert.equal(calls.length, 1);
  clock.tick(60000); assert.equal(calls.length, 1, "no automatic retry after timeout");
  const retried = await port.service.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-a", requestKey: KEY,
    expectedCart: { ownerId: unknown.envelope.cart.ownerId, revision: unknown.envelope.cart.revision } });
  const confirmed = await port.service.settleOrder((await transport.send(retried.request)).reply);
  assert.equal(confirmed.outcome.kind, "CONFIRMED"); assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(calls[0].init.headers["Idempotency-Key"], calls[1].init.headers["Idempotency-Key"]);
  firstGate.reject(new Error("late first attempt")); await flush();
});

test("a late response after timeout does not start body work or replace the observed uncertainty", async () => {
  const gate = deferred(); let bodyCalls = 0;
  const { transport, clock } = setup(() => gate.promise);
  const operation = transport.send(prepared()); clock.tick(15000);
  const result = await operation;
  gate.resolve({ status: 201, json: async () => { bodyCalls++; return success(); } }); await flush();
  assert.equal(bodyCalls, 0); assert.equal(result.failure, "TIMEOUT"); assert.equal(result.reply.body, null);
});

test("native Response JSON decoding can pass directly into A5 without changing the payload", async () => {
  const { transport } = setup(async () => new Response(JSON.stringify(success()), {
    status: 201, headers: { "Content-Type": "application/json" },
  }));
  const result = await transport.send(prepared());
  assert.deepEqual(result.reply.body, success()); assert.equal(result.failure, null);
});
