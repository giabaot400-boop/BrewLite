import test from "node:test";
import assert from "node:assert/strict";
import { createHttpAuthClient, createMockAuthClient } from "./auth-client.ts";

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

test("login gửi header bắt buộc, cookie same-origin, không trả token", async () => {
  let seen;
  const client = createHttpAuthClient(async (url, init) => {
    seen = { url, init };
    return json(200, { user: { id: "1", email: "a@b.co" }, expiresAt: 123 });
  });
  const session = await client.login({ email: "a@b.co", password: "x" });
  assert.equal(seen.url, "/api/auth/login");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
  assert.equal(seen.init.headers["X-BrewLite-Request"], "1");
  assert.equal(seen.init.credentials, "same-origin");
  assert.deepEqual(Object.keys(session).sort(), ["expiresAt", "user"]);
});

test("map lỗi theo contract {error:{code,message,fieldErrors}}", async () => {
  const client = createHttpAuthClient(async () =>
    json(400, { error: { code: "VALIDATION_ERROR", message: "m", fieldErrors: { email: ["sai"] } } }),
  );
  await assert.rejects(client.register({ email: "x", password: "y" }), (e) => {
    assert.equal(e.code, "VALIDATION_ERROR");
    assert.equal(e.status, 400);
    assert.deepEqual(e.fieldErrors, { email: ["sai"] });
    return true;
  });
});

test("phản hồi không phải JSON vẫn thành lỗi có status", async () => {
  const client = createHttpAuthClient(async () => new Response("<html>", { status: 502 }));
  await assert.rejects(client.me(), (e) => e.code === "UNKNOWN" && e.status === 502);
});

test("lỗi mạng -> NETWORK_ERROR", async () => {
  const client = createHttpAuthClient(async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(client.me(), (e) => e.code === "NETWORK_ERROR");
});

test("quá thời gian -> CLIENT_TIMEOUT (abort)", async () => {
  const client = createHttpAuthClient(
    (_url, init) =>
      new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("a", "AbortError")))),
    30,
  );
  await assert.rejects(client.login({ email: "a@b.co", password: "x" }), (e) => e.code === "CLIENT_TIMEOUT");
});

test("logout đọc scope từ header; mặc định là session", async () => {
  const local = createHttpAuthClient(async () => new Response(null, { status: 204, headers: { "X-BrewLite-Logout-Scope": "local" } }));
  const session = createHttpAuthClient(async () => new Response(null, { status: 204, headers: { "X-BrewLite-Logout-Scope": "session" } }));
  assert.equal(await local.logout(), "local");
  assert.equal(await session.logout(), "session");
});

test("mock: đăng ký không cấp phiên, đăng nhập mới có phiên, đăng xuất xóa phiên", async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const client = createMockAuthClient({ delayMs: 0, storage });
  const pw = "correct-horse-battery";
  await client.register({ email: "A@b.co", password: pw });
  await assert.rejects(client.me(), (e) => e.code === "AUTH_REQUIRED");
  await assert.rejects(client.register({ email: "a@b.co", password: pw }), (e) => e.code === "EMAIL_ALREADY_EXISTS");
  await assert.rejects(client.login({ email: "a@b.co", password: "sai" }), (e) => e.code === "INVALID_CREDENTIALS");
  const s = await client.login({ email: "a@b.co", password: pw });
  assert.equal(s.user.email, "a@b.co");
  assert.equal((await client.me()).user.email, "a@b.co");
  assert.equal(await client.logout(), "session");
  assert.equal(await client.logout(), "local");
  await assert.rejects(client.me(), (e) => e.code === "AUTH_REQUIRED");
});
