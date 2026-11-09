import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCartOrderReaderV2 } from "./cart-order-reader-v2.ts";
import { createOrderReadHandler } from "../../lib/server/orders/order-read-handler.ts";
import { fixtureOrders } from "../orders/order-fixtures.ts";

const TIME = "2026-11-08T10:00:00.000Z";
const NOW = Date.parse(TIME), BINDING = "a".repeat(64), OTHER_BINDING = "b".repeat(64);
const session = (changes = {}) => ({ ownerId: "A", binding: BINDING, sessionVersion: 1, ...changes });
const snapshot = (changes = {}) => ({ status: "authenticated", user: { id: "A", email: "a@example.test" },
  binding: BINDING, sessionExpired: false, ...changes });
const detail = (changes = {}) => ({ ...structuredClone(fixtureOrders(NOW)[0]), ...changes });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const code = value => error => error.code === value;

function setup(fetcher = async () => Response.json(detail())) {
  let identity = snapshot(), version = 1;
  const calls = [];
  const reader = createCartOrderReaderV2({ auth: { getSnapshot: () => identity, getSessionVersion: () => version },
    fetch: async (url, init) => { calls.push({ url, init }); return fetcher(url, init); } });
  return { reader, calls, read: (options = {}) => reader({ orderId: "ord-pending", session: session(), ...options }),
    set(next, nextVersion = version) { identity = next; version = nextVersion; } };
}

test("reads via B HTTP client and projects exactly the current-order fields, never payment identity", async () => {
  const value = detail({ ...fixtureOrders(NOW)[2], id: "ord-pending",
    latestPayment: { ...fixtureOrders(NOW)[2].latestPayment, orderId: "ord-pending" } });
  const f = setup(async () => Response.json(value));
  const result = await f.read();
  assert.deepEqual(result.session, session());
  assert.deepEqual(Object.keys(result.order).sort(), ["id", "version", "status", "total", "paymentDeadline", "paidAt",
    "canPay", "canCancel", "serverTime"].sort());
  assert.equal(result.order.status, "PAID");
  assert.equal("latestPayment" in result.order, false);
  const { url, init } = f.calls[0];
  assert.equal(url, "/api/orders/ord-pending");
  assert.equal(init.method, "GET");
  assert.equal(init.cache, "no-store");
  assert.equal(init.credentials, "same-origin");
  assert.equal(init.headers["X-BrewLite-Expected-Session"], BINDING);
  assert.equal("Authorization" in init.headers, false);
  assert.equal(init.body, undefined);
});

for (const status of ["PENDING", "PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"]) {
  test(`projects a full validated ${status} OrderDetail`, async () => {
    const value = fixtureOrders(NOW).find(order => order.status === status);
    const f = setup(async () => Response.json(value));
    const result = await f.read({ orderId: value.id });
    assert.equal(result.order.status, status);
    assert.equal(result.order.version, value.version);
    assert.equal(result.order.total, value.total);
  });
}

test("legacy order stays read-only without manufacturing a payment deadline", async () => {
  const f = setup(async () => Response.json(fixtureOrders(NOW).find(order => order.id === "ord-legacy")));
  const { order } = await f.read({ orderId: "ord-legacy" });
  assert.equal(order.paymentDeadline, null);
  assert.equal(order.canPay, false);
  assert.equal(order.canCancel, false);
});

test("opaque IDs and opaque owner are preserved, with percent encoding exactly once", async () => {
  for (const id of ["a%2Fb", "a%252Fb", "100%", " a/b "]) {
    const f = setup(async () => Response.json(detail({ id })));
    const ownerId = " A:%/owner ";
    f.set(snapshot({ user: { id: ownerId, email: "a@example.test" } }));
    const result = await f.read({ orderId: id, session: session({ ownerId }) });
    assert.equal(result.order.id, id);
    assert.equal(result.session.ownerId, ownerId);
    assert.equal(f.calls[0].url, `/api/orders/${encodeURIComponent(id)}`);
    assert.equal(decodeURIComponent(f.calls[0].url.slice("/api/orders/".length)), id);
  }
});

test("invalid path or checkpoint is rejected before any fetch", async () => {
  const f = setup();
  for (const orderId of ["", ".", "..", "\ud800", null, 123]) {
    await assert.rejects(f.read({ orderId }), code("INVALID_DATA"));
  }
  for (const checkpoint of [null, session({ ownerId: "" }), session({ ownerId: "B" }),
    session({ binding: "invalid" }), session({ binding: OTHER_BINDING }),
    session({ sessionVersion: -1 }), session({ sessionVersion: 1.5 }), session({ sessionVersion: 2 })]) {
    await assert.rejects(f.read({ session: checkpoint }), code("OWNER_MISMATCH"));
  }
  assert.equal(f.calls.length, 0);
});

for (const status of ["anonymous", "loading", "unknown"]) {
  test(`cached ${status} auth cannot read checkout orders`, async () => {
    const f = setup(); f.set(snapshot({ status, user: null, binding: undefined }));
    await assert.rejects(f.read(), code("OWNER_MISMATCH"));
    assert.equal(f.calls.length, 0);
  });
}

for (const change of ["other owner", "same owner new binding", "same owner new login", "A to B to A", "logout"]) {
  test(`drops an in-flight response after ${change}`, async () => {
    const waiting = deferred(), f = setup(() => waiting.promise);
    const task = f.read();
    if (change === "other owner") f.set(snapshot({ user: { id: "B", email: "b@example.test" }, binding: OTHER_BINDING }), 2);
    if (change === "same owner new binding") f.set(snapshot({ binding: OTHER_BINDING }), 2);
    if (change === "same owner new login") f.set(snapshot(), 2);
    if (change === "A to B to A") { f.set(snapshot({ user: { id: "B", email: "b@example.test" } }), 2); f.set(snapshot(), 3); }
    if (change === "logout") f.set(snapshot({ status: "anonymous", user: null, binding: undefined }), 2);
    waiting.resolve(Response.json(detail()));
    await assert.rejects(task, code("OWNER_MISMATCH"));
  });
}

test("same-session refresh does not invalidate a read; returned checkpoint has no caller alias", async () => {
  const waiting = deferred(), f = setup(() => waiting.promise), checkpoint = session();
  const task = f.read({ session: checkpoint });
  checkpoint.ownerId = "B"; checkpoint.binding = OTHER_BINDING; checkpoint.sessionVersion = 99;
  f.set(snapshot());
  waiting.resolve(Response.json(detail()));
  const result = await task;
  assert.deepEqual(result.session, session());
  assert.notEqual(result.session, checkpoint);
  assert.equal(f.calls[0].init.headers["X-BrewLite-Expected-Session"], BINDING);
});

test("full DTO is required even when the nine projection fields look valid", async () => {
  const value = detail(); delete value.items;
  await assert.rejects(setup(async () => Response.json(value)).read(), code("INVALID_RESPONSE"));
});

test("wrong order or embedded payment order cannot become a checkout observation", async () => {
  await assert.rejects(setup(async () => Response.json(detail({ id: "other-order" }))).read(), code("INVALID_DATA"));
  await assert.rejects(setup(async () => Response.json(detail({ latestPayment: {
    ...fixtureOrders(NOW)[2].latestPayment, orderId: "other-order" } }))).read(), code("INVALID_DATA"));
});

test("projection also rejects inconsistent current state that cannot authorize checkout", async () => {
  await assert.rejects(setup(async () => Response.json(detail({ status: "PAID", version: 1,
    paidAt: null, canPay: true }))).read(), code("INVALID_DATA"));
});

test("concurrent older response cannot lower the version already observed by this reader", async () => {
  const early = deferred(), late = deferred(); let n = 0;
  const f = setup(() => ++n === 1 ? early.promise : late.promise);
  const oldRead = f.read(), newRead = f.read();
  late.resolve(Response.json(detail({ version: 2 })));
  assert.equal((await newRead).order.version, 2);
  early.resolve(Response.json(detail({ version: 1 })));
  await assert.rejects(oldRead, code("INVALID_DATA"));
});

test("same-version older serverTime is rejected, while a newer serverTime refreshes flags", async () => {
  const values = [detail(), detail({ serverTime: "2026-11-08T09:59:59.000Z" }),
    detail({ serverTime: "2026-11-08T10:00:01.000Z", canPay: false })];
  const f = setup(async () => Response.json(values.shift()));
  await f.read();
  await assert.rejects(f.read(), code("INVALID_DATA"));
  assert.equal((await f.read()).order.canPay, false);
});

test("version memory is independent by order and resets for a newly verified session", async () => {
  const values = [detail({ version: 5 }), detail({ id: "other-order", version: 1 }), detail({ version: 0 })];
  const f = setup(async () => Response.json(values.shift()));
  await f.read();
  assert.equal((await f.read({ orderId: "other-order" })).order.version, 1);
  f.set(snapshot({ binding: OTHER_BINDING }), 2);
  const result = await f.read({ session: session({ binding: OTHER_BINDING, sessionVersion: 2 }) });
  assert.equal(result.order.version, 0);
});

test("caller cannot lower the version guard by modifying the returned projection", async () => {
  const values = [detail({ version: 3 }), detail({ version: 2 })];
  const f = setup(async () => Response.json(values.shift()));
  const result = await f.read(); result.order.version = 0;
  await assert.rejects(f.read(), code("INVALID_DATA"));
});

test("abort before reading does not fetch", async () => {
  const controller = new AbortController(), f = setup(); controller.abort();
  await assert.rejects(f.read({ signal: controller.signal }), error => error.name === "AbortError");
  assert.equal(f.calls.length, 0);
});

for (const phase of ["fetch", "body"]) {
  test(`abort during ${phase} rejects promptly and forwards cancellation without publishing a late result`, async () => {
    const waiting = deferred(), controller = new AbortController();
    let calls = 0;
    const f = setup(() => ++calls > 1 ? Response.json(detail())
      : phase === "fetch" ? waiting.promise : Promise.resolve({ ok: true, status: 200, json: () => waiting.promise }));
    const task = f.read({ signal: controller.signal });
    await flush(); controller.abort();
    await assert.rejects(task, error => error.name === "AbortError");
    assert.equal(f.calls[0].init.signal.aborted, true);
    waiting.resolve(phase === "fetch" ? Response.json(detail({ version: 9 })) : detail({ version: 9 }));
    await flush();
    // No cancelled version-9 observation was installed in the reader's guard.
    const result = await f.read();
    assert.equal(result.order.version, 0);
  });
}

test("fixture env does not replace the explicitly chosen HTTP reader", async () => {
  const previous = process.env.NEXT_PUBLIC_ORDERS_SOURCE;
  process.env.NEXT_PUBLIC_ORDERS_SOURCE = "mock";
  try {
    const f = setup(async () => Response.json(detail({ total: 12345 })));
    assert.equal((await f.read()).order.total, 12345);
    assert.equal(f.calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ORDERS_SOURCE;
    else process.env.NEXT_PUBLIC_ORDERS_SOURCE = previous;
  }
});

test("401, 403 and infrastructure errors stay errors; reader never retries or refreshes auth", async () => {
  for (const [status, expected] of [[401, "SESSION_EXPIRED"], [403, "REQUEST_FORBIDDEN"], [404, "RESOURCE_NOT_FOUND"], [503, "UPSTREAM_UNAVAILABLE"]]) {
    const f = setup(async () => Response.json({ error: { code: expected, message: "test" } }, { status }));
    await assert.rejects(f.read(), code(expected));
    assert.equal(f.calls.length, 1);
  }
  const offline = setup(async () => { throw new TypeError("offline"); });
  await assert.rejects(offline.read(), code("NETWORK_ERROR"));
  assert.equal(offline.calls.length, 1);
});

test("reader and BFF together: UI A + cookie B cannot fetch orders or expose B's data", async () => {
  const bindingOf = token => createHash("sha256").update(token).digest("hex");
  const bindingA = bindingOf("TOKEN_A"), bindingB = bindingOf("TOKEN_B");
  let cookie = "TOKEN_B", tokenReads = 0;
  const upstream = [];
  const handler = createOrderReadHandler({ readToken: async () => { tokenReads++; return cookie; }, bindingOf,
    ordersUrl: () => "http://backend/orders", fetch: async (url, init) => {
      upstream.push({ url, init }); return Response.json(detail());
    } });
  const f = setup((url, init) => handler(new Request(`http://localhost${url}`, init), { kind: "detail", id: "ord-pending" }));
  f.set(snapshot({ binding: bindingA }));
  await assert.rejects(f.read({ session: session({ binding: bindingA }) }), code("REQUEST_FORBIDDEN"));
  assert.equal(tokenReads, 1);
  assert.equal(upstream.length, 0);

  // Matching captured A cookie proceeds once, with that exact token. Binding is not authorization.
  cookie = "TOKEN_A";
  const result = await f.read({ session: session({ binding: bindingA }) });
  assert.equal(result.session.binding, bindingA);
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].init.headers.Authorization, "Bearer TOKEN_A");
  assert.equal(upstream[0].init.cache, "no-store");
  assert.notEqual(bindingA, bindingB);
});

test("official detail comes from the same validated GET and getter adds no HTTP", async () => {
  const f = setup(), empty = detail();
  assert.equal(f.reader.getDetail({ session: session(), order: empty }), null);
  const result = await f.read(), calls = f.calls.length;
  const official = f.reader.getDetail(result);
  assert.equal(official.subtotal, 100000); assert.equal(official.discountTotal, 10000);
  assert.equal(official.total, 90000); assert.equal(official.promotion.code, "DEMO10");
  assert.deepEqual(official.items, detail().items); assert.equal(f.calls.length, calls);
  official.total = 1; official.items[0].productName = "tampered";
  assert.equal(f.reader.getDetail(result).total, 90000);
  assert.equal(f.reader.getDetail(result).items[0].productName, "Cappuccino");
});

for (const field of ["id", "version", "status", "total", "paymentDeadline", "paidAt", "canPay", "canCancel", "serverTime"]) {
  test(`official detail is unavailable when displayed ${field} differs from the accepted snapshot`, async () => {
    const f = setup(), result = await f.read();
    const changes = { id: "another-order", version: 1, status: "PAYMENT_FAILED", total: 90001,
      paymentDeadline: null, paidAt: TIME, canPay: false, canCancel: false, serverTime: "2026-11-08T10:00:01.000Z" };
    assert.equal(f.reader.getDetail({ ...result, order: { ...result.order, [field]: changes[field] } }), null);
  });
}

for (const change of ["owner", "binding", "version", "logout", "unknown"]) {
  test(`official detail never leaks through a render after ${change} changes the session`, async () => {
    const f = setup(), result = await f.read();
    if (change === "owner") f.set(snapshot({ user: { id: "B" }, binding: OTHER_BINDING }), 2);
    if (change === "binding") f.set(snapshot({ binding: OTHER_BINDING }));
    if (change === "version") f.set(snapshot(), 2);
    if (change === "logout") f.set(snapshot({ status: "anonymous", user: null, binding: undefined }), 2);
    if (change === "unknown") f.set(snapshot({ status: "unknown", user: null, binding: undefined }), 2);
    assert.equal(f.reader.getDetail(result), null);
  });
}

test("newer GET hides the previous price snapshot instead of combining versions", async () => {
  let value = detail(); const f = setup(async () => Response.json(value));
  const first = await f.read();
  value = detail({ version: 1, status: "PAYMENT_FAILED", serverTime: "2026-11-08T10:00:01.000Z" });
  const second = await f.read();
  assert.equal(f.reader.getDetail(first), null); assert.equal(f.reader.getDetail(second).version, 1);
  value = detail(); await assert.rejects(f.read(), code("INVALID_DATA"));
  assert.equal(f.reader.getDetail(second).version, 1);
});

test("malformed pricing never supplies an official detail or a replacement zero total", async () => {
  const f = setup(async () => Response.json(detail({ subtotal: "100000" })));
  await assert.rejects(f.read(), code("INVALID_RESPONSE"));
  assert.equal(f.reader.getDetail({ session: session(), order: detail() }), null);
});
