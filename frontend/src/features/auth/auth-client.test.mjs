import test from "node:test";
import assert from "node:assert/strict";
import { createHttpAuthClient, createMockAuthClient } from "./auth-client.ts";

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers });

test("login gửi header bắt buộc, cookie same-origin, không trả token", async () => {
  let seen;
  const client = createHttpAuthClient(async (url, init) => {
    seen = { url, init };
    return json(200, { user: { id: "1", email: "a@b.co" }, expiresAt: 123 }, { "X-BrewLite-Session-Binding": "a".repeat(64) });
  });
  const session = await client.login({ email: "a@b.co", password: "x" });
  assert.equal(seen.url, "/api/auth/login");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
  assert.equal(seen.init.headers["X-BrewLite-Request"], "1");
  assert.equal(seen.init.credentials, "same-origin");
  assert.deepEqual(Object.keys(session).sort(), ["binding", "expiresAt", "user"]);
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

test("logout đọc đúng scope từ header", async () => {
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

test("timeout bao phủ cả đọc body: headers đến nhanh, body chậm -> CLIENT_TIMEOUT", async () => {
  const slowBody = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ user: { id: "1", email: "a@b.co" }, expiresAt: 1 })));
            controller.close();
          }, 200);
        },
      }),
      { status: 200 },
    );
  for (const call of ["login", "me", "register"]) {
    const client = createHttpAuthClient(async () => slowBody(), 20);
    const started = Date.now();
    await assert.rejects(client[call]({ email: "a@b.co", password: "x" }), (e) => e.code === "CLIENT_TIMEOUT", call);
    assert.ok(Date.now() - started < 150, `${call} phải dừng theo deadline, không chờ body`);
  }
});

test("timeout hoạt động cả khi adapter bỏ qua AbortSignal (body treo vĩnh viễn)", async () => {
  const hang = { ok: true, status: 200, headers: new Headers(), json: () => new Promise(() => {}) };
  const client = createHttpAuthClient(async () => hang, 20);
  await assert.rejects(client.login({ email: "a@b.co", password: "x" }), (e) => e.code === "CLIENT_TIMEOUT");
});

test("thân 2xx sai contract -> INVALID_RESPONSE, không coi là đăng nhập thành công", async () => {
  for (const body of [null, {}, { user: { id: 1, email: "a" }, expiresAt: 1 }, { user: { id: "1", email: "a" } }]) {
    const client = createHttpAuthClient(async () => new Response(JSON.stringify(body), { status: 200 }));
    await assert.rejects(client.login({ email: "a@b.co", password: "x" }), (e) => e.code === "INVALID_RESPONSE");
  }
  const notJson = createHttpAuthClient(async () => new Response("<html>", { status: 200 }));
  await assert.rejects(notJson.me(), (e) => e.code === "INVALID_RESPONSE");
});

test("logout chỉ xác nhận khi HTTP 204 và scope chính xác", async () => {
  const cases = [
    [200, "session"],
    [200, null],
    [204, null],
    [204, "global"],
    [204, "SESSION"],
    [204, ""],
  ];
  for (const [status, scope] of cases) {
    const headers = scope === null ? {} : { "X-BrewLite-Logout-Scope": scope };
    const client = createHttpAuthClient(async () => new Response(null, { status, headers }));
    await assert.rejects(client.logout(), (e) => e.code === "INVALID_RESPONSE", `${status}/${scope}`);
  }
});
