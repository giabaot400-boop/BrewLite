import test from "node:test";
import assert from "node:assert/strict";
import { createCartOrderClient } from "./cart-order-client.ts";
import { createCartSessionBridge } from "./cart-session-bridge.ts";
import { createCartOrderTransport } from "./cart-order-transport.ts";
import { createCartStorage } from "./cart-storage.ts";
import { createEmptyCartEnvelope } from "./cart-envelope.ts";
import { cartReducer } from "./cart-reducer.ts";

const TIME = "2026-11-03T15:00:00.000Z";
const auth = id => id ? { status: "authenticated", user: { id, email: id + "@example.com" }, sessionExpired: false }
  : { status: "anonymous", user: null, sessionExpired: false };
const draft = { productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "S",
  toppingIds: [], toppingNames: {}, previewUnitPrice: 35000 };
const success = { id: "order-a", status: "PENDING", total: 35000 };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup({ fetcher = async () => Response.json(success, { status: 201 }), identity = auth("a") } = {}) {
  const envelope = createEmptyCartEnvelope();
  envelope.cart = cartReducer({ cart: envelope.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
  envelope.cart.ownerId = "a";
  let raw = JSON.stringify(envelope), current = identity, keys = 0, held = false, failed = false, locks = 0;
  let onLock = () => {}, onWrite = () => {};
  const requests = [], phases = [];
  const storage = createCartStorage({
    storage: { getItem: () => raw, setItem: (_key, value) => {
      if (failed) throw Error("quota"); raw = value; onWrite();
    } },
    locks: { request: async (_name, _options, callback) => {
      await Promise.resolve(); onLock(++locks); held = true;
      try { return callback(); } finally { held = false; }
    } },
  });
  const getSnapshot = () => current;
  const bridge = createCartSessionBridge(storage, getSnapshot);
  const transport = createCartOrderTransport({ now: () => TIME, fetch: (url, init) => {
    assert.equal(held, false); requests.push({ url, init }); return fetcher(url, init);
  } });
  const client = createCartOrderClient({ storage, bridge, transport, getSnapshot,
    now: () => TIME, randomUUID: () => "00000000-0000-4000-8000-" + String(++keys).padStart(12, "0"),
    onPhase: (ownerId, phase) => phases.push({ ownerId, phase }) });
  return { storage, bridge, client, requests, phases, keys: () => keys,
    identity: value => { current = value; }, failWrites: value => { failed = value; },
    onLock: value => { onLock = value; }, onWrite: value => { onWrite = value; },
    raw: () => raw, replace: value => { raw = JSON.stringify(value); } };
}
const isCode = code => error => error.code === code;

test("opening/cancelling reviews does not generate keys, write storage or send HTTP", async () => {
  const f = setup(), before = f.raw(), cart = (await f.storage.read()).cart;
  f.client.review(cart); f.client.review(cart);
  assert.equal(f.keys(), 0); assert.equal(f.requests.length, 0); assert.equal(f.raw(), before);
});
test("review snapshots are frozen and detached from the displayed input", async () => {
  const f = setup(), cart = (await f.storage.read()).cart, review = f.client.review(cart);
  cart.items[0].qty = 7;
  assert.equal(review.displayCart.items[0].qty, 1);
  assert.throws(() => { review.displayCart.items[0].qty = 7; }, TypeError);
  assert.throws(() => { review.displayCart.items[0].toppingIds.push("cream"); }, TypeError);
  await f.client.submit(review);
  assert.equal(JSON.parse(f.requests[0].init.body).items[0].qty, 1);
});
test("confirmation persists pending, releases lock, sends once and settles success", async () => {
  let f;
  f = setup({ fetcher: async () => {
    const stored = JSON.parse(f.raw());
    assert.equal(stored.pendingRequests.a.phase, "SUBMITTING");
    return Response.json(success, { status: 201 });
  } });
  const result = await f.client.submit(f.client.review((await f.storage.read()).cart));
  assert.equal(f.keys(), 1); assert.equal(f.requests.length, 1);
  assert.equal(result.settlement.outcome.kind, "CONFIRMED");
  const saved = await f.storage.read();
  assert.equal(saved.cart.items.length, 0); assert.equal(saved.pendingRequests.a, undefined);
  assert.equal(saved.lastOrderResult.order.id, "order-a");
  assert.deepEqual(f.phases.map(value => value.phase), ["PREPARING", "SENDING", "SETTLING", "IDLE"]);
});
test("confirmation from a stale cart fails before HTTP and must be reviewed again", async () => {
  const f = setup(), cart = (await f.storage.read()).cart, review = f.client.review(cart);
  await f.storage.mutateCart({ type: "ADD_ITEM", item: draft }, "a");
  await assert.rejects(f.client.submit(review), isCode("CART_CHANGED"));
  assert.equal(f.requests.length, 0);
  assert.equal((await f.storage.read()).pendingRequests.a, undefined);
  await assert.rejects(f.client.submit(review), isCode("INVALID_DATA"));
});
test("same-owner double confirmation starts only one request", async () => {
  const reply = deferred(), f = setup({ fetcher: () => reply.promise });
  const cart = (await f.storage.read()).cart, first = f.client.review(cart), second = f.client.review(cart);
  const sending = f.client.submit(first);
  await flush();
  await assert.rejects(f.client.submit(second), isCode("PENDING_REQUEST"));
  reply.resolve(Response.json(success, { status: 201 })); await sending;
  assert.equal(f.keys(), 1); assert.equal(f.requests.length, 1);
});
for (const status of ["loading", "unknown", "anonymous"]) {
  test(status + " cannot open a sendable review", async () => {
    const f = setup({ identity: { status, user: null, sessionExpired: false } });
    assert.throws(() => f.client.review(JSON.parse(f.raw()).cart), isCode("OWNER_MISMATCH"));
    assert.equal(f.keys(), 0); assert.equal(f.requests.length, 0);
  });
}
test("account switch after opening review blocks confirmation before persistence", async () => {
  const f = setup(), review = f.client.review((await f.storage.read()).cart), before = f.raw();
  f.identity(auth("b"));
  await assert.rejects(f.client.submit(review), isCode("OWNER_MISMATCH"));
  assert.equal(f.raw(), before); assert.equal(f.requests.length, 0);
});
test("auth transition while queued for write is checked inside the lock", async () => {
  const f = setup(), review = f.client.review((await f.storage.read()).cart), before = f.raw();
  f.onLock(() => f.identity(auth("b")));
  await assert.rejects(f.client.submit(review), isCode("OWNER_MISMATCH"));
  assert.equal(f.raw(), before); assert.equal(f.requests.length, 0);
});
test("auth change after durable preparation keeps recoverable pending without sending", async () => {
  const f = setup(), review = f.client.review((await f.storage.read()).cart);
  f.onWrite(() => f.identity(auth("b")));
  await assert.rejects(f.client.submit(review), isCode("OWNER_MISMATCH"));
  assert.equal(f.requests.length, 0);
  const saved = await f.storage.read();
  assert.equal(saved.pendingRequests.a.ownerId, "a"); assert.equal(saved.pendingRequests.a.phase, "UNKNOWN");
});
test("logout being prepared blocks a new order before HTTP", async () => {
  const f = setup(), review = f.client.review((await f.storage.read()).cart);
  const logout = await f.bridge.prepareLogout();
  await assert.rejects(f.client.submit(review), isCode("CART_CHANGED"));
  assert.equal(f.requests.length, 0); logout.cancel();
});
test("quota failure preparing an order never sends HTTP", async () => {
  const f = setup(), review = f.client.review((await f.storage.read()).cart), before = f.raw();
  f.failWrites(true);
  await assert.rejects(f.client.submit(review), isCode("STORAGE_UNAVAILABLE"));
  assert.equal(f.requests.length, 0); assert.equal(f.raw(), before);
  assert.equal(f.phases.at(-1).phase, "IDLE");
});
test("unknown result retains pending and explicit retry uses the exact identity/payload", async () => {
  const f = setup({ fetcher: async () => Response.json({ error: { code: "UPSTREAM_TIMEOUT", message: "Timeout" } }, { status: 504 }) });
  await f.client.submit(f.client.review((await f.storage.read()).cart));
  const saved = await f.storage.read(), pending = structuredClone(saved.pendingRequests.a);
  f.client.review(saved.cart, saved.pendingRequests.a); // Mere recovery/review does not send.
  assert.equal(f.requests.length, 1);
  await f.client.submit(f.client.review(saved.cart, saved.pendingRequests.a));
  assert.equal(f.keys(), 1);
  assert.deepEqual(f.requests[0].init.headers, f.requests[1].init.headers);
  assert.equal(f.requests[0].init.body, f.requests[1].init.body);
  const after = (await f.storage.read()).pendingRequests.a;
  assert.deepEqual(after, pending);
});
test("retry after logout/account return works from the old snapshot despite empty cart", async () => {
  let n = 0;
  const f = setup({ fetcher: async () => ++n === 1
    ? Response.json({ error: { code: "UPSTREAM_TIMEOUT", message: "Timeout" } }, { status: 504 })
    : Response.json(success, { status: 201 }) });
  await f.client.submit(f.client.review((await f.storage.read()).cart));
  const logout = await f.bridge.prepareLogout(); await logout.complete("session");
  f.identity(auth(null));
  f.identity(auth("a")); await f.bridge.read(true);
  const saved = await f.storage.read(); assert.equal(saved.cart.items.length, 0);
  const review = f.client.review(saved.cart, saved.pendingRequests.a);
  assert.equal(review.displayCart.items[0].qty, 1);
  const result = await f.client.submit(review);
  assert.equal(result.settlement.outcome.kind, "CONFIRMED"); assert.equal(f.keys(), 1);
  assert.equal(f.requests[0].init.body, f.requests[1].init.body);
});
test("late success cannot clear another account's new cart", async () => {
  const reply = deferred(), f = setup({ fetcher: () => reply.promise });
  const sending = f.client.submit(f.client.review((await f.storage.read()).cart));
  await flush();
  f.identity(auth("b")); await f.bridge.read(true);
  await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
  const newer = (await f.storage.read()).cart;
  reply.resolve(Response.json(success, { status: 201 })); await sending;
  assert.deepEqual((await f.storage.read()).cart, newer);
  assert.equal((await f.bridge.read()).result, null);
});
test("validation rejection is settled without deleting cart and preserves row errors", async () => {
  const body = { error: { code: "VALIDATION_ERROR", message: "Invalid item", fieldErrors: { "items[0].size": ["Unavailable"] } } };
  const f = setup({ fetcher: async () => Response.json(body, { status: 400 }) });
  const before = (await f.storage.read()).cart;
  const result = await f.client.submit(f.client.review(before));
  assert.equal(result.settlement.outcome.kind, "REJECTED");
  assert.deepEqual(result.settlement.outcome.fieldErrors, body.error.fieldErrors);
  assert.deepEqual((await f.storage.read()).cart, before);
  assert.equal((await f.storage.read()).pendingRequests.a, undefined);
});
test("price change reprices but never auto-sends; next confirmed review gets a fresh key", async () => {
  let n = 0;
  const f = setup({ fetcher: async () => ++n === 1 ? Response.json({ error: { code: "PRICE_CHANGED", message: "Changed", details: {
    items: [{ productId: "coffee", size: "S", toppingIds: [], qty: 1, expectedUnitPrice: 35000, currentUnitPrice: 40000, currentLineTotal: 40000 }],
    currentTotal: 40000 } } }, { status: 409 }) : Response.json({ ...success, total: 40000 }, { status: 201 }) });
  const first = await f.client.submit(f.client.review((await f.storage.read()).cart));
  assert.equal(first.settlement.outcome.kind, "PRICE_CHANGED");
  const cart = (await f.storage.read()).cart;
  assert.equal(cart.items[0].previewUnitPrice, 40000); assert.equal(f.requests.length, 1);
  await f.client.submit(f.client.review(cart));
  assert.equal(f.keys(), 2);
  assert.notEqual(f.requests[0].init.headers["Idempotency-Key"], f.requests[1].init.headers["Idempotency-Key"]);
  assert.equal(JSON.parse(f.requests[1].init.body).items[0].expectedUnitPrice, 40000);
});
test("quota failure after a server success retains pending for replay with the old key", async () => {
  let f, n = 0;
  f = setup({ fetcher: async () => { if (++n === 1) f.failWrites(true);
    return Response.json(success, { status: n === 1 ? 201 : 200 }); } });
  await assert.rejects(f.client.submit(f.client.review((await f.storage.read()).cart)), isCode("STORAGE_UNAVAILABLE"));
  f.failWrites(false);
  const saved = await f.storage.read(); assert.equal(saved.pendingRequests.a.phase, "UNKNOWN");
  const result = await f.client.submit(f.client.review(saved.cart, saved.pendingRequests.a));
  assert.equal(result.settlement.outcome.kind, "CONFIRMED"); assert.equal(f.keys(), 1);
  assert.equal(f.requests[0].init.body, f.requests[1].init.body);
});
test("tampered storage with unchanged revision cannot send unreviewed payload", async () => {
  const f = setup(), review = f.client.review((await f.storage.read()).cart);
  const tampered = JSON.parse(f.raw()); tampered.cart.items[0].qty = 2; f.replace(tampered);
  await assert.rejects(f.client.submit(review), isCode("CART_CHANGED"));
  assert.equal(f.requests.length, 0);
  assert.equal((await f.storage.read()).pendingRequests.a.phase, "UNKNOWN");
});
test("another owner's operation can proceed while a prior owner's HTTP is pending", async () => {
  const a = deferred(), b = deferred();
  const f = setup({ fetcher: async (_url, init) => init.headers["X-BrewLite-Expected-Owner"] === "a" ? a.promise : b.promise });
  const first = f.client.submit(f.client.review((await f.storage.read()).cart));
  await flush();
  f.identity(auth("b")); await f.bridge.read(true); await f.bridge.mutate({ type: "ADD_ITEM", item: draft });
  const second = f.client.submit(f.client.review((await f.storage.read()).cart));
  await flush(); assert.equal(f.requests.length, 2);
  b.resolve(Response.json({ ...success, id: "order-b" }, { status: 201 })); await second;
  const cartB = (await f.storage.read()).cart;
  a.resolve(Response.json(success, { status: 201 })); await first;
  assert.deepEqual((await f.storage.read()).cart, cartB);
});
test("phase subscription can be removed without changing order persistence", async () => {
  const f = setup(), seen = [];
  const off = f.client.subscribePhase((ownerId, phase) => seen.push({ ownerId, phase }));
  off();
  await f.client.submit(f.client.review((await f.storage.read()).cart));
  assert.deepEqual(seen, []); assert.equal((await f.storage.read()).lastOrderResult.order.id, "order-a");
});
