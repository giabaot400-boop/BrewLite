import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentHandler, PAYMENT_BODY_LIMIT_BYTES } from "./payments/payment-handler.ts";
import { createCancelHandler, CANCEL_BODY_LIMIT_BYTES } from "./orders/cancel-handler.ts";
import { createOrderHandler } from "./orders/order-handler.ts";
import { MUTATION_BFF_TIMEOUT_MS } from "./owner-mutation-handler.ts";
import { assertSameOriginPost } from "./auth/csrf.ts";
import { ORDER_OWNER_HEADER, encodeOrderOwner } from "../order-owner.ts";
process.env.APP_ORIGIN = "http://localhost:3000";
const KEY = "00000000-0000-4000-8000-000000000001";
const URLS = { me: "http://internal:3002/auth/me", orders: "http://internal:3002/orders", payments: "http://internal:3002/payments" };
const session = (owner = "A") => ({ user: { id: owner, email: "fixture@example.com" }, expiresAt: "2026-11-08T13:00:00.000Z" });
const response = (status, body) => ({ status, json: async () => body });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
class Clock {
  time = 0; jobs = new Set(); delays = [];
  schedule = (callback, delay) => { this.delays.push(delay); const job = { callback, at: this.time + delay }; this.jobs.add(job);
    return () => { this.jobs.delete(job); }; };
  tick(ms) { this.time += ms; for (const job of [...this.jobs]) if (job.at <= this.time) { this.jobs.delete(job); job.callback(); } }
}
function request(kind, { owner = "A", body, headers: extras = {}, signal } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", Origin: "http://localhost:3000", "X-BrewLite-Request": "1",
    "Idempotency-Key": KEY, [ORDER_OWNER_HEADER]: encodeOrderOwner(owner) });
  for (const [key, value] of Object.entries(extras)) { if (value === null) headers.delete(key); else headers.set(key, value); }
  return new Request(`http://localhost:3000/api/${kind === "payment" ? "payments" : "orders/order-a/cancel"}`, {
    method: "POST", headers, body: body === undefined ? kind === "payment" ? '{ "method":"WALLET", "orderId":"order-a" }\n' : ' {}\n' : body,
    signal, duplex: "half",
  });
}
function setup(kind, { me, post, cookieRead, token = "token-a", orderId = "order-a" } = {}) {
  const calls = [], clock = new Clock(); let cookie = token, reads = 0;
  const env = { checkPost: assertSameOriginPost, readToken: async () => { reads++; return cookieRead ? cookieRead() : cookie; }, backendUrls: () => URLS,
    schedule: clock.schedule, fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === URLS.me) return me ? me(init) : response(200, session());
      return post ? post(init, url) : response(200, kind === "payment" ? { id: "payment-k1", status: "FAILED" } : { id: orderId, status: "CANCELLED" });
    } };
  return { handle: kind === "payment" ? createPaymentHandler(env) : createCancelHandler(env, orderId), calls, clock,
    reads: () => reads, cookie: value => { cookie = value; } };
}
async function assertCode(result, status, code) {
  assert.equal(result.status, status); assert.equal((await result.json()).error.code, code);
  assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(result.headers.get("set-cookie"), null);
}

test("payment/cancel byte limits and common deadline match Sprint 3", () => {
  assert.equal(PAYMENT_BODY_LIMIT_BYTES, 4096); assert.equal(CANCEL_BODY_LIMIT_BYTES, 4096); assert.equal(MUTATION_BFF_TIMEOUT_MS, 10000);
});
for (const kind of ["payment", "cancel"]) {
  test(`${kind}: captured token authenticates owner and forwards original body once with no browser credentials`, async () => {
    const f = setup(kind), req = request(kind, { headers: { Authorization: "Bearer browser-value", Cookie: "do-not-forward=1", "X-BrewLite-Expected-Session": "untrusted" } });
    const body = await req.clone().text(), result = await f.handle(req);
    assert.equal(result.status, 200); assert.equal(f.reads(), 1); assert.equal(f.calls.length, 2);
    const [verify, post] = f.calls;
    assert.equal(verify.url, URLS.me); assert.equal(verify.init.method, "GET"); assert.equal(post.init.method, "POST");
    assert.equal(post.url, kind === "payment" ? URLS.payments : `${URLS.orders}/order-a/cancel`);
    assert.equal(verify.init.headers.Authorization, "Bearer token-a"); assert.equal(post.init.headers.Authorization, "Bearer token-a");
    assert.equal(verify.init.signal, post.init.signal); assert.equal(post.init.body, body);
    assert.equal(post.init.headers["Idempotency-Key"], kind === "payment" ? KEY : undefined);
    for (const h of ["Cookie", ORDER_OWNER_HEADER, "X-BrewLite-Request", "X-BrewLite-Expected-Session"]) assert.equal(post.init.headers[h], undefined);
    for (const { init } of f.calls) { assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); }
    assert.deepEqual(f.clock.delays, [10000]); assert.equal(f.clock.jobs.size, 0);
    assert.equal(result.headers.get("cache-control"), "no-store"); assert.equal(result.headers.get("set-cookie"), null);
  });
  test(`${kind}: UI owner A with cookie B is blocked without mutation or cookie deletion`, async () => {
    const f = setup(kind, { token: "token-b", me: async () => response(200, session("B")) });
    await assertCode(await f.handle(request(kind)), 403, "REQUEST_FORBIDDEN"); assert.equal(f.calls.length, 1);
  });
  test(`${kind}: changing shared cookie during /me cannot replace the captured token`, async () => {
    const f = setup(kind, { me: async () => { f.cookie("token-b"); return response(200, session()); } });
    assert.equal((await f.handle(request(kind))).status, 200); assert.equal(f.reads(), 1);
    assert.equal(f.calls[1].init.headers.Authorization, "Bearer token-a");
  });
  for (const [label, headers] of [["missing Origin", { Origin: null }], ["foreign Origin", { Origin: "https://evil.example" }],
    ["missing marker", { "X-BrewLite-Request": null }], ["wrong marker", { "X-BrewLite-Request": "0" }],
    ["non JSON", { "Content-Type": "text/plain" }]]) {
    test(`${kind}: P04 rejects ${label} before body/cookie/upstream`, async () => {
      let pulls = 0; const body = new ReadableStream({ pull() { pulls++; } }, { highWaterMark: 0 });
      const f = setup(kind); await assertCode(await f.handle(request(kind, { headers, body })), 403, "REQUEST_FORBIDDEN");
      assert.equal(pulls, 0); assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0); assert.equal(f.clock.delays.length, 0);
    });
  }
  for (const owner of [null, "", "%", "%41", "A, B"]) {
    test(`${kind}: missing/noncanonical expected owner ${owner} cannot authorize mutation`, async () => {
      const f = setup(kind); await assertCode(await f.handle(request(kind, { headers: { [ORDER_OWNER_HEADER]: owner } })), 403, "REQUEST_FORBIDDEN");
      assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
    });
  }
  test(`${kind}: absent cookie and valid auth rejection never start mutation`, async () => {
    const missing = setup(kind, { token: "" }); await assertCode(await missing.handle(request(kind)), 401, "AUTH_REQUIRED"); assert.equal(missing.calls.length, 0);
    for (const code of ["AUTH_REQUIRED", "SESSION_INVALID", "SESSION_EXPIRED"]) {
      const f = setup(kind, { me: async () => response(401, { error: { code, message: "Fixture" } }) });
      await assertCode(await f.handle(request(kind)), 401, code); assert.equal(f.calls.length, 1);
    }
  });
  test(`${kind}: malformed /me schema or auth envelope never authorizes a mutation`, async () => {
    for (const [status, body] of [[200, { user: session().user, expiresAt: "bad" }], [200, { user: session().user, expiresAt: Infinity }],
      [200, { ...session(), user: { id: "A", email: "" } }], [200, { user: { id: "A" }, expiresAt: 1 }],
      [401, { error: { code: "SESSION_EXPIRED" } }], [401, { error: { code: "SESSION_INVALID", message: "Fixture", fieldErrors: 1 } }],
      [401, { error: { code: ["AUTH_REQUIRED"], message: "Fixture" } }],
      [500, { error: { code: "INTERNAL_ERROR" } }]]) {
      const f = setup(kind, { me: async () => response(status, body) }); await assertCode(await f.handle(request(kind)), 502, "UPSTREAM_UNAVAILABLE");
      assert.equal(f.calls.length, 1);
    }
  });
  test(`${kind}: missing, false and oversized declared lengths cannot bypass streamed UTF-8 4096-byte limit`, async () => {
    const declared = setup(kind);
    await assertCode(await declared.handle(request(kind, { headers: { "Content-Length": "4097" } })), 413, "PAYLOAD_TOO_LARGE");
    assert.equal(declared.reads(), 0);
    for (const length of [null, "1"]) {
      const f = setup(kind), body = new ReadableStream({ start(controller) {
        const bytes = new TextEncoder().encode(JSON.stringify("é".repeat(2100))); controller.enqueue(bytes.subarray(0, 3000)); controller.enqueue(bytes.subarray(3000)); controller.close();
      } });
      await assertCode(await f.handle(request(kind, { body, headers: { "Content-Length": length } })), 413, "PAYLOAD_TOO_LARGE");
      assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
    }
  });
  test(`${kind}: exactly 4096 bytes remain intact and DTO validation belongs to Nest`, async () => {
    const f = setup(kind), json = kind === "payment" ? '{"orderId":"order-a","method":"WALLET"}' : '{}';
    const body = " ".repeat(4096 - json.length) + json;
    assert.equal((await f.handle(request(kind, { body }))).status, 200); assert.equal(f.calls[1].init.body, body);
  });
  test(`${kind}: malformed JSON and UTF-8 stop before authentication`, async () => {
    for (const body of ["", "{bad", new Uint8Array([0xff])]) {
      const f = setup(kind); await assertCode(await f.handle(request(kind, { body })), 400, "VALIDATION_ERROR");
      assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
    }
  });
  test(`${kind}: one 10s deadline covers /me and reading mutation body with no reset or retry`, async () => {
    const verified = deferred(), body = deferred();
    const f = setup(kind, { me: () => verified.promise, post: async () => ({ status: 200, json: () => body.promise }) });
    const result = f.handle(request(kind)); await flush(); f.clock.tick(6000); verified.resolve(response(200, session())); await flush();
    assert.equal(f.calls.length, 2); f.clock.tick(4000); await assertCode(await result, 504, "UPSTREAM_TIMEOUT");
    assert.equal(f.calls[1].init.signal.aborted, true); assert.deepEqual(f.clock.delays, [10000]); assert.equal(f.clock.jobs.size, 0);
    body.resolve({ id: "late" }); await flush(); assert.equal(f.calls.length, 2);
  });
  test(`${kind}: late /me success after timeout or browser abort never starts mutation`, async () => {
    for (const abort of [false, true]) {
      const verified = deferred(), controller = new AbortController(), f = setup(kind, { me: () => verified.promise });
      const result = f.handle(request(kind, { signal: controller.signal })); await flush();
      if (abort) controller.abort(); else f.clock.tick(10000);
      await assertCode(await result, abort ? 502 : 504, abort ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_TIMEOUT");
      verified.resolve(response(200, session())); await flush(); assert.equal(f.calls.length, 1);
    }
  });
  test(`${kind}: deadline includes input, cookie reading and /me JSON even when adapters ignore abort`, async () => {
    const f = setup(kind), body = new ReadableStream({ start() {} });
    const result = f.handle(request(kind, { body })); await flush(); f.clock.tick(10000);
    await assertCode(await result, 504, "UPSTREAM_TIMEOUT"); assert.equal(f.calls.length, 0);
    const meBody = deferred(), g = setup(kind, { me: async () => ({ status: 200, json: () => meBody.promise }) });
    const pending = g.handle(request(kind)); await flush(); g.clock.tick(10000);
    await assertCode(await pending, 504, "UPSTREAM_TIMEOUT"); meBody.resolve(session()); await flush(); assert.equal(g.calls.length, 1);
    const cookie = deferred(), h = setup(kind, { cookieRead: () => cookie.promise });
    const waiting = h.handle(request(kind)); await flush(); h.clock.tick(10000);
    await assertCode(await waiting, 504, "UPSTREAM_TIMEOUT"); cookie.resolve("late-token"); await flush(); assert.equal(h.calls.length, 0);
  });
  test(`${kind}: POST network errors or invalid JSON remain uncertain and are never retried`, async () => {
    for (const post of [async () => { throw Error("network"); }, async () => ({ status: 200, json: async () => { throw Error("html"); } })]) {
      const f = setup(kind, { post }); await assertCode(await f.handle(request(kind)), 502, "UPSTREAM_UNAVAILABLE"); assert.equal(f.calls.length, 2);
    }
  });
  test(`${kind}: business success/FAILED/state errors preserve JSON/status without setting cookies`, async () => {
    for (const [status, body] of [[200, { id: "payment", status: "FAILED", failureCode: "PAYMENT_DECLINED" }],
      [200, { id: "order", status: "CANCELLED", version: 2 }], [400, { error: { code: "VALIDATION_ERROR", message: "Fixture" } }],
      [401, { error: { code: "SESSION_INVALID", message: "Fixture" } }],
      [409, { error: { code: "PAYMENT_WINDOW_EXPIRED", message: "Fixture", details: { reason: "Fixture" } } }],
      [409, { error: { code: "ORDER_NOT_CANCELLABLE", message: "Fixture" } }],
      [503, { error: { code: "TRANSACTION_RETRY_EXHAUSTED", message: "Fixture" } }]]) {
      const f = setup(kind, { post: async () => response(status, body) }), result = await f.handle(request(kind));
      assert.equal(result.status, status); assert.deepEqual(await result.json(), body);
      assert.equal(result.headers.get("set-cookie"), null); assert.equal(result.headers.get("cache-control"), "no-store");
    }
  });
}

test("payment: exact saved key and body are forwarded across explicit replays, never generated or normalized", async () => {
  const f = setup("payment"), body = '{ "method":"CARD", "orderId":" order%2F ", "unexpected":true }';
  for (let i = 0; i < 2; i++) assert.equal((await f.handle(request("payment", { body }))).status, 200);
  const posts = f.calls.filter(call => call.init.method === "POST"); assert.equal(posts.length, 2);
  assert.equal(posts[0].init.body, body); assert.equal(posts[1].init.body, body); assert.equal(posts[0].init.headers["Idempotency-Key"], KEY);
  assert.equal(posts[1].init.headers["Idempotency-Key"], KEY);
  const missing = setup("payment"); await missing.handle(request("payment", { headers: { "Idempotency-Key": null } }));
  assert.equal(missing.calls[1].init.headers["Idempotency-Key"], undefined);
});

test("cancel: sends original empty-object JSON without a client key, version or invented fields", async () => {
  const f = setup("cancel"), body = ' \n{}\t'; await f.handle(request("cancel", { body }));
  assert.equal(f.calls[1].init.body, body); assert.equal(f.calls[1].init.headers["Idempotency-Key"], undefined);
  const invalid = setup("cancel", { post: async init => {
    assert.deepEqual(JSON.parse(init.body), { status: "CANCELLED" });
    return response(400, { error: { code: "VALIDATION_ERROR", message: "DTO rejected extra field" } });
  } });
  assert.equal((await invalid.handle(request("cancel", { body: '{"status":"CANCELLED"}' }))).status, 400);
});
for (const orderId of ["a%2Fb", "a/b", " order é?# ", "%2e%2e", "a\\b"]) {
  test(`cancel: opaque ID ${JSON.stringify(orderId)} is encoded once, never decoded or trimmed again`, async () => {
    const f = setup("cancel", { orderId }); await f.handle(request("cancel"));
    assert.equal(f.calls[1].url, `${URLS.orders}/${encodeURIComponent(orderId)}/cancel`);
    assert.equal(new URL(f.calls[1].url).pathname, `/orders/${encodeURIComponent(orderId)}/cancel`);
  });
}
for (const orderId of ["", ".", "..", "\ud800"]) {
  test(`cancel: unaddressable ID ${JSON.stringify(orderId)} cannot change upstream target`, async () => {
    const f = setup("cancel", { orderId }); await assertCode(await f.handle(request("cancel")), 400, "VALIDATION_ERROR");
    assert.equal(f.reads(), 0); assert.equal(f.calls.length, 0);
  });
}
test("all mutation routes reject malformed /me expiry through the same shared guard", async () => {
  const calls = [], env = { checkPost: assertSameOriginPost, readToken: async () => "token", backendUrls: () => URLS,
    fetch: async (url, init) => { calls.push({ url, init }); return response(200, { ...session(), expiresAt: "not-a-date" }); } };
  await assertCode(await createOrderHandler(env)(request("payment")), 502, "UPSTREAM_UNAVAILABLE");
  assert.equal(calls.length, 1); assert.equal(calls[0].init.method, "GET");
});
