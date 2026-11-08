import test from "node:test";
import assert from "node:assert/strict";
import { fixtureHistory, fixtureOrders } from "./order-fixtures.ts";
import { OrderApiError } from "./order-error.ts";
import { createHttpOrderReadClient, orderPath } from "./order-read-client.ts";

const B = "a".repeat(64);
const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rejects = (promise, code) => assert.rejects(promise, e => e instanceof OrderApiError && e.code === code);

test("GET chi tiết: đúng đường dẫn, cookie same-origin, no-store, không gửi header đổi trạng thái", async () => {
  const calls = [];
  const order = fixtureOrders(NOW)[0];
  const client = createHttpOrderReadClient(async (url, init) => { calls.push([url, init]); return json(order); });
  assert.deepEqual(await client.getOrder("ord-pending", B), order);
  const [url, init] = calls[0];
  assert.equal(url, "/api/orders/ord-pending");
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "same-origin");
  assert.equal(init.cache, "no-store");
  assert.equal(init.body, undefined);
  assert.equal(init.headers["X-BrewLite-Request"], undefined);
});

test("ID opaque: mã hóa khi đưa vào đường dẫn, không trim", () => {
  assert.equal(orderPath("a b/c"), "/api/orders/a%20b%2Fc");
  assert.equal(orderPath(" x "), "/api/orders/%20x%20");
});

test("GET lịch sử gọi /api/orders/me", async () => {
  let seen = "";
  const history = fixtureHistory(NOW);
  const client = createHttpOrderReadClient(async url => { seen = url; return json(history); });
  assert.deepEqual(await client.getHistory(B), history);
  assert.equal(seen, "/api/orders/me");
});

test("lỗi có envelope: giữ code/status/details; mã lạ thành UNKNOWN", async () => {
  const client = createHttpOrderReadClient(async () => json({ error: { code: "RESOURCE_NOT_FOUND", message: "x" } }, 404));
  await assert.rejects(client.getOrder("zzz", B), e => e.code === "RESOURCE_NOT_FOUND" && e.status === 404);
  const weird = createHttpOrderReadClient(async () => json({ error: { code: "SOMETHING_NEW", message: "x" } }, 409));
  await assert.rejects(weird.getOrder("a", B), e => e.code === "UNKNOWN" && e.status === 409);
});

test("lỗi không phải JSON (trang lỗi proxy) là UNKNOWN theo status, không văng lỗi parse", async () => {
  const client = createHttpOrderReadClient(async () => new Response("<html>502</html>", { status: 502 }));
  await assert.rejects(client.getOrder("a", B), e => e instanceof OrderApiError && e.status === 502 && e.code === "UNKNOWN");
});

test("200 nhưng body không phải JSON hoặc sai contract là INVALID_RESPONSE", async () => {
  await rejects(createHttpOrderReadClient(async () => new Response("not json", { status: 200 })).getOrder("a", B), "INVALID_RESPONSE");
  await rejects(createHttpOrderReadClient(async () => json({ id: "a" })).getOrder("a", B), "INVALID_RESPONSE");
  await rejects(createHttpOrderReadClient(async () => json({ items: [{ id: 1 }], serverTime: "x" })).getHistory(B), "INVALID_RESPONSE");
});

test("mất mạng là NETWORK_ERROR", async () => {
  await rejects(createHttpOrderReadClient(async () => { throw new TypeError("fetch failed"); }).getOrder("a", B), "NETWORK_ERROR");
});

test("deadline phủ cả lúc đọc body: header về rồi mà body treo vẫn CLIENT_TIMEOUT", async () => {
  const stalled = { ok: true, status: 200, json: () => new Promise(() => {}) };
  const client = createHttpOrderReadClient(async () => stalled, 30);
  await rejects(client.getOrder("a", B), "CLIENT_TIMEOUT");
});

test("fetch không hỗ trợ abort và treo vẫn CLIENT_TIMEOUT", async () => {
  const client = createHttpOrderReadClient(() => new Promise(() => {}), 30);
  await rejects(client.getHistory(B), "CLIENT_TIMEOUT");
});

test("id rỗng là 404 cục bộ, không gọi mạng", async () => {
  let called = false;
  const client = createHttpOrderReadClient(async () => { called = true; return json({}); });
  await rejects(client.getOrder("", B), "RESOURCE_NOT_FOUND");
  assert.equal(called, false);
});

test("mỗi lượt đọc gửi binding của phiên UI đang hiển thị", async () => {
  const seen = [];
  const client = createHttpOrderReadClient(async (url, init) => { seen.push(init.headers["X-BrewLite-Expected-Session"]); return json(url.endsWith("/me") ? fixtureHistory(NOW) : fixtureOrders(NOW)[0]); });
  await client.getHistory(B);
  await client.getOrder("ord-pending", B);
  assert.deepEqual(seen, [B, B]);
});

test("thiếu hoặc sai dạng binding: SESSION_INVALID cục bộ, không gọi mạng", async () => {
  let called = 0;
  const client = createHttpOrderReadClient(async () => { called++; return json({}); });
  for (const bad of [undefined, "", "abc", "A".repeat(64), "a".repeat(63)]) {
    await rejects(client.getHistory(bad), "SESSION_INVALID");
    await rejects(client.getOrder("ord-pending", bad), "SESSION_INVALID");
  }
  assert.equal(called, 0);
});

test("ID chứa % không bị đổi: round-trip a%2Fb và a%252Fb", () => {
  for (const id of ["a%2Fb", "a%252Fb", "100%", "a%zz"]) {
    assert.equal(decodeURIComponent(orderPath(id).slice("/api/orders/".length)), id);
  }
  assert.equal(orderPath("a%2Fb"), "/api/orders/a%252Fb");
});
