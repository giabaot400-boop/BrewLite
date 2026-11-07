import test from "node:test";
import assert from "node:assert/strict";
import { createOrderHandler, ORDER_BFF_TIMEOUT_MS, ORDER_BODY_LIMIT_BYTES } from "./order-handler.ts";
import { assertSameOriginPost } from "../auth/csrf.ts";
import { ORDER_OWNER_HEADER, encodeOrderOwner } from "../../order-owner.ts";

process.env.APP_ORIGIN = "http://localhost:3000";
const KEY = "00000000-0000-4000-8000-000000000001";
const URLS = { me: "http://internal:3002/auth/me", orders: "http://internal:3002/orders" };
const PAYLOAD = { items: [{ productId: "coffee-milk", size: "S", toppingIds: [], qty: 1, expectedUnitPrice: 35000 }] };
const ORDER = { id: "order-a", status: "PENDING", total: 35000 };
const session = (owner = "user-a") => ({ user: { id: owner, email: "fixture@example.com" }, expiresAt: "2026-11-03T18:00:00.000Z" });
const response = (status, body) => ({ status, json: async () => body });
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Clock {
  time = 0;
  jobs = new Set();
  delays = [];
  clears = 0;
  schedule = (callback, ms) => {
    this.delays.push(ms);
    const job = { callback, at: this.time + ms };
    this.jobs.add(job);
    return () => { this.jobs.delete(job); this.clears++; };
  };
  tick(ms) {
    this.time += ms;
    for (const job of [...this.jobs]) if (job.at <= this.time) {
      this.jobs.delete(job); job.callback();
    }
  }
}
function request({ owner = "user-a", body = JSON.stringify(PAYLOAD), headers: extras = {}, signal } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: "http://localhost:3000",
    "X-BrewLite-Request": "1", "Idempotency-Key": KEY, [ORDER_OWNER_HEADER]: encodeOrderOwner(owner) });
  for (const [key, value] of Object.entries(extras)) {
    if (value === null) headers.delete(key); else headers.set(key, value);
  }
  return new Request("http://localhost:3000/api/orders", { method: "POST", headers, body, signal, duplex: "half" });
}
function setup({ token = "token-a", me, order } = {}) {
  let cookie = token, reads = 0;
  const calls = [], clock = new Clock();
  const handle = createOrderHandler({
    checkPost: assertSameOriginPost, readToken: async () => { reads++; return cookie; },
    backendUrls: () => URLS, schedule: clock.schedule,
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === URLS.me) return me ? me(init) : response(200, session());
      assert.equal(url, URLS.orders);
      return order ? order(init) : response(201, ORDER);
    },
  });
  return { handle, calls, clock, reads: () => reads, cookie: value => { cookie = value; } };
}
async function assertCode(result, status, code) {
  assert.equal(result.status, status);
  assert.equal((await result.json()).error.code, code);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("set-cookie"), null);
}

test("matching owner forwards original JSON/key once using only the authenticated captured token", async () => {
  const f = setup();
  const raw = "  " + JSON.stringify(PAYLOAD) + "\n";
  const result = await f.handle(request({ body: raw, headers: { Authorization: "Bearer untrusted-browser-value" } }));
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), ORDER);
  assert.equal(f.reads(), 1);
  assert.deepEqual(f.calls.map(call => [call.url, call.init.method]), [[URLS.me, "GET"], [URLS.orders, "POST"]]);
  const first = f.calls[0].init, second = f.calls[1].init;
  assert.equal(first.headers.Authorization, "Bearer token-a");
  assert.equal(second.headers.Authorization, "Bearer token-a");
  assert.equal(first.signal, second.signal);
  assert.equal(second.headers["Idempotency-Key"], KEY);
  assert.equal(second.headers[ORDER_OWNER_HEADER], undefined);
  assert.equal(second.headers.Cookie, undefined);
  assert.equal(second.body, raw);
  assert.deepEqual(JSON.parse(second.body), PAYLOAD);
  for (const { init } of f.calls) {
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error");
  }
  assert.deepEqual(f.clock.delays, [ORDER_BFF_TIMEOUT_MS]);
  assert.equal(f.clock.jobs.size, 0);
  assert.equal(f.clock.clears, 1);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("set-cookie"), null);
});
test("pending owner A plus verified cookie B is forbidden without POST or cookie deletion", async () => {
  const f = setup({ token: "token-b", me: async () => response(200, session("user-b")) });
  await assertCode(await f.handle(request()), 403, "REQUEST_FORBIDDEN");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, URLS.me);
  assert.equal(f.reads(), 1);
});
test("cookie changing during /me cannot swap the token used by POST", async () => {
  const f = setup({ me: async () => { f.cookie("token-b"); return response(200, session()); } });
  assert.equal((await f.handle(request())).status, 201);
  assert.equal(f.reads(), 1);
  assert.equal(f.calls[1].init.headers.Authorization, "Bearer token-a");
});
test("owner remains opaque, including whitespace, punctuation and Unicode", async () => {
  const owner = " user|é,%:a ";
  const f = setup({ me: async () => response(200, session(owner)) });
  assert.equal((await f.handle(request({ owner }))).status, 201);
});
for (const [label, headers] of [
  ["missing Origin", { Origin: null }], ["wrong Origin", { Origin: "https://attacker.example" }],
  ["missing marker", { "X-BrewLite-Request": null }], ["wrong marker", { "X-BrewLite-Request": "0" }],
  ["non-JSON content", { "Content-Type": "text/plain" }],
]) {
  test("CSRF guard rejects " + label + " before reading cookie or contacting backend", async () => {
    const f = setup();
    await assertCode(await f.handle(request({ headers })), 403, "REQUEST_FORBIDDEN");
    assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0); assert.equal(f.clock.delays.length, 0);
  });
}
for (const value of [null, "", "%", "%FF", "%75ser-a", "user-a, user-b"]) {
  test("missing/malformed/noncanonical expected owner rejected: " + String(value), async () => {
    const f = setup();
    await assertCode(await f.handle(request({ headers: { [ORDER_OWNER_HEADER]: value } })), 403, "REQUEST_FORBIDDEN");
    assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
  });
}
test("missing cookie returns AUTH_REQUIRED without upstream calls", async () => {
  const f = setup({ token: "" });
  await assertCode(await f.handle(request()), 401, "AUTH_REQUIRED");
  assert.equal(f.reads(), 1); assert.equal(f.calls.length, 0);
});
for (const code of ["AUTH_REQUIRED", "SESSION_INVALID", "SESSION_EXPIRED"]) {
  test("/me refuses " + code + ": no POST and no cookie side effect", async () => {
    const f = setup({ me: async () => response(401, { error: { code, message: "Fixture" } }) });
    await assertCode(await f.handle(request()), 401, code);
    assert.equal(f.calls.length, 1);
  });
}
for (const [label, me] of [
  ["server failure", async () => response(500, { error: { code: "INTERNAL_ERROR" } })],
  ["unexpected status", async () => response(201, session())],
  ["invalid JSON", async () => ({ status: 200, json: async () => { throw Error("bad JSON"); } })],
  ["missing owner", async () => response(200, { user: { email: "a@example.com" }, expiresAt: 1 })],
  ["missing expiry", async () => response(200, { user: session().user })],
  ["unrecognized auth error", async () => response(401, { error: { code: "UNAUTHORIZED" } })],
  ["network error", async () => { throw Error("offline"); }],
]) {
  test("/me " + label + " cannot authorize forwarding", async () => {
    const f = setup({ me });
    await assertCode(await f.handle(request()), 502, "UPSTREAM_UNAVAILABLE");
    assert.equal(f.calls.length, 1);
  });
}
test("/me explicit upstream timeout is kept as 504", async () => {
  const f = setup({ me: async () => response(504, { error: { code: "UPSTREAM_TIMEOUT" } }) });
  await assertCode(await f.handle(request()), 504, "UPSTREAM_TIMEOUT");
  assert.equal(f.calls.length, 1);
});
test("declared oversized body rejected before auth", async () => {
  const f = setup();
  await assertCode(await f.handle(request({ headers: { "Content-Length": String(ORDER_BODY_LIMIT_BYTES + 1) } })), 413, "PAYLOAD_TOO_LARGE");
  assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
});
test("UTF-8 actual streamed bytes enforce 32 KiB despite missing or false length", async () => {
  for (const length of [null, "1"]) {
    const f = setup();
    const body = new ReadableStream({ start(controller) {
      const chunk = new TextEncoder().encode("é".repeat(8500));
      controller.enqueue(chunk); controller.enqueue(chunk); controller.close();
    } });
    await assertCode(await f.handle(request({ body, headers: { "Content-Length": length } })), 413, "PAYLOAD_TOO_LARGE");
    assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
  }
});
test("valid JSON exactly 32 KiB is not cut or rejected by the byte guard", async () => {
  const f = setup();
  const json = JSON.stringify(PAYLOAD), body = " ".repeat(ORDER_BODY_LIMIT_BYTES - json.length) + json;
  assert.equal((await f.handle(request({ body }))).status, 201);
  assert.equal(f.calls[1].init.body, body);
});
for (const body of ["{broken", "", new Uint8Array([0xFF])]) {
  test("invalid JSON/UTF-8 is rejected before auth: " + String(body), async () => {
    const f = setup();
    await assertCode(await f.handle(request({ body })), 400, "VALIDATION_ERROR");
    assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
  });
}
test("shared 10s deadline includes /me plus POST and response body, without a reset", async () => {
  const verified = deferred(), orderBody = deferred();
  const f = setup({ me: () => verified.promise,
    order: async () => ({ status: 201, json: () => orderBody.promise }) });
  const result = f.handle(request());
  await flush();
  f.clock.tick(6000);
  verified.resolve(response(200, session()));
  await flush();
  assert.equal(f.calls.length, 2);
  f.clock.tick(3999);
  let finished = false;
  result.then(() => { finished = true; });
  await flush(); assert.equal(finished, false);
  f.clock.tick(1);
  await assertCode(await result, 504, "UPSTREAM_TIMEOUT");
  assert.equal(f.calls[1].init.signal.aborted, true);
  assert.deepEqual(f.clock.delays, [10000]);
  assert.equal(f.clock.jobs.size, 0);
  orderBody.resolve(ORDER); await flush();
  assert.equal(f.calls.length, 2); // No automatic POST retry.
});
test("late /me success after timeout never starts POST, even if adapter ignores abort", async () => {
  const verified = deferred(), f = setup({ me: () => verified.promise });
  const result = f.handle(request());
  await flush(); f.clock.tick(10000);
  await assertCode(await result, 504, "UPSTREAM_TIMEOUT");
  verified.resolve(response(200, session())); await flush();
  assert.equal(f.calls.length, 1);
});
test("deadline covers reading /me response body", async () => {
  const body = deferred(), f = setup({ me: async () => ({ status: 200, json: () => body.promise }) });
  const result = f.handle(request());
  await flush(); f.clock.tick(10000);
  await assertCode(await result, 504, "UPSTREAM_TIMEOUT");
  body.resolve(session()); await flush();
  assert.equal(f.calls.length, 1);
});
test("a stalled incoming body cannot hold the handler beyond its deadline", async () => {
  const f = setup();
  const body = new ReadableStream({ start() {} });
  const result = f.handle(request({ body }));
  await flush(); f.clock.tick(10000);
  await assertCode(await result, 504, "UPSTREAM_TIMEOUT");
  assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
});
test("client abort before /me completes prevents POST and is not an expired-session error", async () => {
  const controller = new AbortController(), verified = deferred();
  const f = setup({ me: () => verified.promise });
  const result = f.handle(request({ signal: controller.signal }));
  await flush(); controller.abort();
  await assertCode(await result, 502, "UPSTREAM_UNAVAILABLE");
  verified.resolve(response(200, session())); await flush();
  assert.equal(f.calls.length, 1);
});
test("POST network failure returns 502 once without replay", async () => {
  const f = setup({ order: async () => { throw Error("offline"); } });
  await assertCode(await f.handle(request()), 502, "UPSTREAM_UNAVAILABLE");
  assert.equal(f.calls.length, 2);
});
for (const [status, body] of [
  [200, ORDER],
  [400, { error: { code: "VALIDATION_ERROR", message: "Fixture", fieldErrors: { "items[0].qty": ["Invalid"] } } }],
  [409, { error: { code: "PRICE_CHANGED", message: "Fixture", details: { items: [], currentTotal: 40000 } } }],
  [409, { error: { code: "IDEMPOTENCY_CONFLICT", message: "Fixture" } }],
  [401, { error: { code: "SESSION_INVALID", message: "Revoked after /me" } }],
]) {
  test("order response " + status + " preserves business body and never adds cookies", async () => {
    const f = setup({ order: async () => response(status, body) });
    const result = await f.handle(request());
    assert.equal(result.status, status); assert.deepEqual(await result.json(), body);
    assert.equal(result.headers.get("set-cookie"), null);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(f.calls.length, 2);
  });
}
test("key/DTO validation stays with Nest after authentication", async () => {
  const f = setup({ order: async init => {
    assert.equal(init.headers["Idempotency-Key"], "not-a-key");
    return response(400, { error: { code: "VALIDATION_ERROR", message: "Invalid key" } });
  } });
  assert.equal((await f.handle(request({ headers: { "Idempotency-Key": "not-a-key" } }))).status, 400);
  assert.equal(f.calls.length, 2);
});
