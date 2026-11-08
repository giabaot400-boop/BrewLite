import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createOrderReadHandler, isReadableOrderId } from "./order-read-handler.ts";

const bindingOf = (token) => createHash("sha256").update(token).digest("hex");
const GOOD = bindingOf("TOKEN");
const request = (signal, expected = GOOD) => new Request("http://localhost/api/orders/me", {
  method: "GET", signal, headers: expected === null ? {} : { "X-BrewLite-Expected-Session": expected },
});
const reply = (status, body, bodyFails = false) => ({
  status,
  json: bodyFails ? async () => { throw new SyntaxError("bad json"); } : async () => body,
});

function setup({ token = "TOKEN", noToken = false, upstream = reply(200, { items: [], serverTime: "2026-11-06T10:00:00.000Z" }), fetchImpl, schedule } = {}) {
  const calls = [];
  const handler = createOrderReadHandler({
    readToken: async () => (noToken ? undefined : token),
    bindingOf,
    ordersUrl: () => "http://backend:3001/orders",
    fetch: fetchImpl ?? (async (url, init) => { calls.push({ url, init }); return upstream; }),
    schedule,
  });
  return { handler, calls };
}

test("lịch sử: gọi backend /orders/me bằng Bearer, trả 200 no-store, không chuyển cookie", async () => {
  const { handler, calls } = setup();
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.equal(calls[0].url, "http://backend:3001/orders/me");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer TOKEN");
  assert.equal(calls[0].init.body, undefined);
});

test("chi tiết: ID được mã hóa trong URL upstream", async () => {
  const { handler, calls } = setup({ upstream: reply(200, { id: "a/b" }) });
  await handler(request(), { kind: "detail", id: "a/b c" });
  assert.equal(calls[0].url, "http://backend:3001/orders/a%2Fb%20c");
});

test("thiếu cookie phiên: 401 AUTH_REQUIRED, không gọi backend", async () => {
  const { handler, calls } = setup({ noToken: true });
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "AUTH_REQUIRED");
  assert.equal(calls.length, 0);
});

test("ID rỗng, quá dài hoặc có ký tự điều khiển: 404 và không gọi backend", async () => {
  for (const id of ["", "x".repeat(129), "a\nb", "a\u0000b"]) {
    const { handler, calls } = setup();
    const res = await handler(request(), { kind: "detail", id });
    assert.equal(res.status, 404, JSON.stringify(id));
    assert.equal(calls.length, 0);
  }
  assert.equal(isReadableOrderId(" a "), true); // không trim
});

test("lỗi đúng envelope được chuyển tiếp nguyên status và code", async () => {
  for (const status of [401, 403, 404, 409, 503]) {
    const { handler } = setup({ upstream: reply(status, { error: { code: "RESOURCE_NOT_FOUND", message: "m", details: { reason: "x" } } }) });
    const res = await handler(request(), { kind: "detail", id: "a" });
    assert.equal(res.status, status);
    const body = await res.json();
    assert.equal(body.error.code, "RESOURCE_NOT_FOUND");
    assert.deepEqual(body.error.details, { reason: "x" });
  }
});

test("401 từ backend không xóa cookie (không có Set-Cookie)", async () => {
  const { handler } = setup({ upstream: reply(401, { error: { code: "SESSION_EXPIRED", message: "m" } }) });
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Set-Cookie"), null);
});

test("backend lỗi không đúng envelope, 5xx hoặc body không phải JSON: 502 UPSTREAM_UNAVAILABLE", async () => {
  for (const upstream of [reply(500, { stack: "secret" }), reply(502, null), reply(200, null, true), reply(200, [1, 2]), reply(418, { error: { code: "X", message: "m" } })]) {
    const { handler } = setup({ upstream });
    const res = await handler(request(), { kind: "history" });
    assert.equal(res.status, 502);
    const text = JSON.stringify(await res.json());
    assert.match(text, /UPSTREAM_UNAVAILABLE/);
    assert.doesNotMatch(text, /secret/);
  }
});

test("backend 504 là 504 UPSTREAM_TIMEOUT", async () => {
  const { handler } = setup({ upstream: reply(504, {}) });
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 504);
});

test("fetch ném lỗi (mất kết nối): 502, không lộ nội dung lỗi", async () => {
  const { handler } = setup({ fetchImpl: async () => { throw new Error("ECONNREFUSED 10.0.0.5:3001"); } });
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 502);
  assert.doesNotMatch(JSON.stringify(await res.json()), /10\.0\.0\.5/);
});

test("hết 10 giây: 504 và hủy yêu cầu upstream, kể cả khi fetch bỏ qua abort", async () => {
  let fire;
  let signal;
  const { handler } = setup({
    schedule: cb => { fire = cb; return () => {}; },
    fetchImpl: (url, init) => { signal = init.signal; return new Promise(() => {}); },
  });
  const pending = handler(request(), { kind: "history" });
  await new Promise(r => setTimeout(r, 5));
  fire();
  const res = await pending;
  assert.equal(res.status, 504);
  assert.equal(signal.aborted, true);
});

test("hết hạn khi đang đọc body upstream vẫn 504", async () => {
  let fire;
  const { handler } = setup({
    schedule: cb => { fire = cb; return () => {}; },
    upstream: { status: 200, json: () => new Promise(() => {}) },
  });
  const pending = handler(request(), { kind: "history" });
  await new Promise(r => setTimeout(r, 5));
  fire();
  assert.equal((await pending).status, 504);
});

test("người dùng đóng trang giữa chừng: 502 và không gọi backend nếu chưa gọi", async () => {
  const controller = new AbortController();
  controller.abort();
  const { handler, calls } = setup();
  const res = await handler(request(controller.signal), { kind: "history" });
  assert.equal(res.status, 502);
  assert.equal(calls.length, 0);
});

test("UI giữ tài khoản A nhưng cookie đã là B: 403 và KHÔNG gọi backend", async () => {
  const { handler, calls } = setup({ token: "TOKEN_B" }); // request mang binding của A (TOKEN)
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, "REQUEST_FORBIDDEN");
  assert.equal(res.headers.get("Set-Cookie"), null);
  assert.equal(calls.length, 0);
  const detail = await handler(request(), { kind: "detail", id: "ord-1" });
  assert.equal(detail.status, 403);
  assert.equal(calls.length, 0);
});

test("thiếu hoặc sai dạng binding: 403, không gọi backend", async () => {
  for (const expected of [null, "", "abc", GOOD.toUpperCase(), GOOD.slice(1)]) {
    const { handler, calls } = setup();
    const res = await handler(request(undefined, expected), { kind: "history" });
    assert.equal(res.status, 403, String(expected));
    assert.equal(calls.length, 0);
  }
});

test("cùng một token dùng cho đối chiếu và gọi backend; readToken chỉ gọi một lần", async () => {
  let reads = 0;
  const calls = [];
  const handler = createOrderReadHandler({
    readToken: async () => (++reads === 1 ? "TOKEN" : "OTHER"),
    bindingOf,
    ordersUrl: () => "http://backend:3001/orders",
    fetch: async (url, init) => { calls.push(init); return reply(200, { items: [] }); },
  });
  const res = await handler(request(), { kind: "history" });
  assert.equal(res.status, 200);
  assert.equal(reads, 1);
  assert.equal(calls[0].headers.Authorization, "Bearer TOKEN");
});

test("thiếu cookie vẫn là 401 (không phải 403) dù có binding", async () => {
  const { handler } = setup({ noToken: true });
  assert.equal((await handler(request(), { kind: "history" })).status, 401);
});
