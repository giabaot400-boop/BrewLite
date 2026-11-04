import test from "node:test";
import assert from "node:assert/strict";
import { createCartStorage } from "./cart-storage.ts";
import { createEmptyCartEnvelope } from "./cart-envelope.ts";
import { cartReducer } from "./cart-reducer.ts";
import { createCartOrderTransport } from "./cart-order-transport.ts";
import { createOrderHandler } from "../../lib/server/orders/order-handler.ts";
import { assertSameOriginPost } from "../../lib/server/auth/csrf.ts";
import { ORDER_OWNER_HEADER } from "../../lib/order-owner.ts";

process.env.APP_ORIGIN = "http://localhost:3000";
const KEY = "00000000-0000-4000-8000-000000000001";
const TIME = "2026-11-03T15:00:00.000Z";
const draft = { productId: "coffee-milk", productName: "Coffee", imageUrl: "/coffee.svg",
  size: "S", toppingIds: [], toppingNames: {}, previewUnitPrice: 35000 };

async function setup(owner = "user-a") {
  const initial = createEmptyCartEnvelope();
  initial.cart = cartReducer({ cart: initial.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
  initial.cart.ownerId = owner;
  let raw = JSON.stringify(initial), held = false, cookieOwner = "user-b", posts = 0, cookieReads = 0;
  const sent = [];
  const storage = createCartStorage({
    storage: { getItem: () => raw, setItem: (_key, value) => { raw = value; } },
    locks: { request: async (_name, _options, callback) => {
      assert.equal(held, false); held = true;
      try { return callback(); } finally { held = false; }
    } },
  });
  const bff = createOrderHandler({
    checkPost: assertSameOriginPost,
    readToken: async () => { cookieReads++; return cookieOwner; },
    backendUrls: () => ({ me: "http://internal/auth/me", orders: "http://internal/orders" }),
    fetch: async (url, init) => {
      assert.equal(held, false, "No HTTP while a Web Lock is held");
      if (url.endsWith("/auth/me")) {
        const id = init.headers.Authorization.slice("Bearer ".length);
        return Response.json({ user: { id, email: "fixture@example.com" }, expiresAt: TIME });
      }
      posts++;
      assert.equal(init.headers.Authorization, "Bearer " + owner);
      return Response.json({ id: "order-a", status: "PENDING", total: 35000 }, { status: 201 });
    },
  });
  const transport = createCartOrderTransport({ now: () => TIME, fetch: async (url, init) => {
    assert.equal(held, false);
    sent.push(structuredClone({ headers: init.headers, body: init.body }));
    // Browser adds the real Origin. No current-user value is substituted here.
    const request = new Request("http://localhost:3000" + url,
      { ...init, headers: { ...init.headers, Origin: "http://localhost:3000" } });
    return bff(request);
  } });
  const prepared = await storage.applyLifecycle({ type: "BEGIN_ORDER", ownerId: owner,
    expectedCart: initial.cart, requestKey: KEY, createdAt: TIME });
  return { storage, transport, prepared, sent, cookie: value => { cookieOwner = value; },
    posts: () => posts, cookieReads: () => cookieReads };
}

test("pending A + cookie B: BFF blocks POST; settlement retains A owner/key/payload and cart", async () => {
  const f = await setup();
  const pending = structuredClone(f.prepared.request);
  const before = await f.storage.read();
  const result = await f.transport.send(f.prepared.request);
  assert.equal(result.reply.status, 403);
  assert.equal(result.reply.body.error.code, "REQUEST_FORBIDDEN");
  assert.equal(f.posts(), 0);
  assert.equal(f.cookieReads(), 1);
  assert.equal(f.sent[0].headers[ORDER_OWNER_HEADER], "user-a");
  const settled = await f.storage.settleOrder(result.reply);
  assert.deepEqual(settled.outcome, { kind: "UNKNOWN", code: "REQUEST_FORBIDDEN" });
  const saved = settled.envelope.pendingRequests["user-a"];
  assert.equal(saved.phase, "UNKNOWN");
  assert.deepEqual({ ...saved, phase: pending.phase }, pending);
  assert.equal(settled.envelope.pendingRequests["user-b"], undefined);
  assert.deepEqual(settled.envelope.cart, before.cart);
  assert.equal(settled.envelope.lastOrderResult, null);
});
test("returning to A does not autosend; explicit retry uses the identical owner/key/payload", async () => {
  const f = await setup();
  await f.storage.settleOrder((await f.transport.send(f.prepared.request)).reply);
  f.cookie("user-a");
  await Promise.resolve();
  assert.equal(f.posts(), 0);
  const envelope = await f.storage.read();
  const retry = await f.storage.applyLifecycle({ type: "RETRY_ORDER", ownerId: "user-a",
    requestKey: KEY, expectedCart: envelope.cart });
  assert.deepEqual(retry.request.payload, f.prepared.request.payload);
  const result = await f.transport.send(retry.request);
  const settled = await f.storage.settleOrder(result.reply);
  assert.equal(f.posts(), 1);
  assert.equal(settled.outcome.kind, "CONFIRMED");
  assert.deepEqual(f.sent[0], f.sent[1]);
  assert.equal(settled.envelope.lastOrderResult.ownerId, "user-a");
  assert.equal(settled.envelope.lastOrderResult.requestKey, KEY);
  assert.equal(settled.envelope.pendingRequests["user-a"], undefined);
  assert.equal(settled.envelope.cart.items.length, 0);
});
test("opaque expected owner is encoded only in header, never injected into body v1", async () => {
  const owner = "user|é,%:a", f = await setup(owner);
  f.cookie(owner);
  const result = await f.transport.send(f.prepared.request);
  assert.equal(result.reply.status, 201);
  assert.equal(f.posts(), 1);
  assert.equal(f.sent[0].headers[ORDER_OWNER_HEADER], encodeURIComponent(owner));
  assert.deepEqual(JSON.parse(f.sent[0].body), f.prepared.request.payload);
  assert.deepEqual(Object.keys(JSON.parse(f.sent[0].body)), ["items"]);
});
