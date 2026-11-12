import test from "node:test";
import assert from "node:assert/strict";
import { createCartCheckoutRuntimeV2 } from "./cart-checkout-runtime-v2.ts";
import { createCartControllerV2 } from "./cart-controller-v2.ts";
import { createCartStorage, CART_LOCK_NAME } from "./cart-storage.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { cartReducer } from "./cart-reducer.ts";
import { createAuthSession } from "../auth/auth-session.ts";
import { AuthApiError } from "../auth/auth-error.ts";
import { fixtureOrders } from "../orders/order-fixtures.ts";

const TIME = "2026-11-08T13:00:00.000Z", NOW = Date.parse(TIME), BINDING = "a".repeat(64), BINDING_B = "b".repeat(64);
const ID = "order-A", KEY = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const draft = { productId: "cappuccino", productName: "Cappuccino", size: "M", imageUrl: "/cappuccino.svg",
  toppingIds: [], toppingNames: {}, previewUnitPrice: 50000 };
const code = expected => error => error.code === expected;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const session = (id = "A", binding = BINDING) => ({ user: { id, email: `${id}@example.test` }, binding, expiresAt: TIME });
function initial(ownerId = "A") {
  const value = createEmptyCartEnvelopeV2();
  const cart = cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
  value.cart = { ...cart, ownerId, items: cart.items.map(line => ({ ...line, qty: 2 })) }; return value;
}

// Real frontend clients/coordinators/controller + fake storage/network only. No Nest/PG assertion.
async function fixture({ ownerId = "A", start = true } = {}) {
  let raw = encodeCartEnvelopeV2(initial(ownerId)), held = false, writes = 0, keys = 0, current = null, tail = Promise.resolve();
  let memorySession = session(), serverSession = session();
  const calls = [], created = new Map(), payments = new Map();
  const mode = { orderError: null, payment: "SUCCEEDED", lostCreate: false, lostPayment: false, lostCancel: false,
    failNextOrderRead: false, minimalCancelReply: false, terminalWithoutAttempt: false, meGate: null, before: null };
  const storage = createCartStorage({ locks: { request(name, options, work) {
    assert.equal(name, CART_LOCK_NAME);
    const task = tail.then(() => { options.signal.throwIfAborted(); held = true;
      try { return work(); } finally { held = false; } });
    tail = task.catch(() => {}); return task;
  } }, storage: { getItem() { assert.equal(held, true); return raw; },
    setItem(_key, next) { assert.equal(held, true); raw = next; writes++; } } });
  const auth = createAuthSession({ async me() {
    if (memorySession === null) throw new AuthApiError("AUTH_REQUIRED", ""); return memorySession; },
    async login() { return memorySession; }, async logout() { memorySession = null; return "session"; },
    async register() { throw Error("unused"); } });
  await auth.refresh();
  async function fetchImpl(url, init = {}) {
    assert.equal(held, false, "No storage lock across HTTP");
    const call = { url: String(url), method: init.method ?? "GET", body: init.body,
      key: init.headers?.["Idempotency-Key"], headers: init.headers };
    calls.push(call);
    if (mode.before) { const hook = mode.before; mode.before = null; await hook(call); }
    if (url === "/api/auth/me") {
      if (mode.meGate) { const gate = mode.meGate; mode.meGate = null; await gate.promise; }
      return Response.json({ user: serverSession.user, expiresAt: TIME }, { headers: { "X-BrewLite-Session-Binding": serverSession.binding } });
    }
    if (call.method === "GET") {
      assert.equal(init.cache, "no-store");
      assert.equal(call.headers["X-BrewLite-Expected-Session"], BINDING);
      if (mode.failNextOrderRead) { mode.failNextOrderRead = false; throw Error("lost order read"); }
      assert.equal(url, `/api/orders/${encodeURIComponent(ID)}`); assert.ok(current);
      return Response.json(current);
    }
    assert.equal(call.headers["X-BrewLite-Request"], "1");
    assert.equal(call.headers["X-BrewLite-Expected-Owner"], "A");
    if (url === "/api/orders") {
      const pending = JSON.parse(raw).pendingRequests.A;
      assert.equal(pending.phase, "SUBMITTING"); assert.equal(pending.requestKey, call.key);
      assert.equal(call.body, JSON.stringify(pending.payload));
      if (mode.orderError) return Response.json({ error: mode.orderError(pending) }, { status: 409 });
      const replay = created.has(call.key);
      if (!replay) {
        current = { ...fixtureOrders(NOW)[0], id: ID, total: pending.payload.expectedTotal ?? 100000,
          discountTotal: pending.payload.expectedTotal === 90000 ? 10000 : 0,
          promotion: pending.payload.expectedTotal === 90000 ? { code: "DEMO10", discountAmount: 10000 } : null };
        created.set(call.key, { id: ID, status: "PENDING", total: current.total });
      }
      if (mode.lostCreate) { mode.lostCreate = false; throw Error("create response lost after commit"); }
      return Response.json(created.get(call.key), { status: replay ? 200 : 201 });
    }
    if (url === "/api/payments") {
      const recovery = JSON.parse(raw).paymentRecoveries.A[call.key];
      assert.equal(recovery.recoveryStatus, "UNRESOLVED"); assert.equal(call.body, JSON.stringify(recovery.body));
      const replay = payments.has(call.key);
      if (!replay && mode.terminalWithoutAttempt) {
        current = { ...current, version: current.version + 1, status: "CANCELLED", canPay: false, canCancel: false, cancelReason: "CUSTOMER_REQUEST" };
        return Response.json({ error: { code: "ORDER_NOT_PAYABLE", message: "Order is terminal." } }, { status: 409 });
      }
      if (!replay) {
        const payment = { id: `payment-${call.key}`, version: 0, orderId: ID, method: recovery.body.method,
          amount: current.total, status: mode.payment, failureCode: mode.payment === "FAILED" ? "PAYMENT_DECLINED" : null,
          createdAt: TIME, resolvedAt: TIME, refundedAmount: 0, refundedAt: null, serverTime: TIME };
        payments.set(call.key, payment);
        const { serverTime: _time, ...latestPayment } = payment; void _time;
        current = { ...current, latestPayment, status: mode.payment === "FAILED" ? "PAYMENT_FAILED" : "PAID",
          version: current.version + 1, paidAt: mode.payment === "SUCCEEDED" ? TIME : null,
          loyaltyPointsEarned: mode.payment === "SUCCEEDED" ? Math.floor(current.total / 10000) : 0,
          canPay: mode.payment === "FAILED" };
      }
      if (mode.lostPayment) { mode.lostPayment = false; throw Error("payment response lost after commit"); }
      if (mode.failAfterPayment) { mode.failAfterPayment = false; mode.failNextOrderRead = true; }
      return Response.json(payments.get(call.key), { status: replay ? 200 : 201 });
    }
    assert.equal(url, `/api/orders/${ID}/cancel`); assert.equal(call.key, undefined); assert.equal(call.body, "{}");
    current = { ...current, status: "CANCELLED", version: current.version + 1, canPay: false, canCancel: false, cancelReason: "CUSTOMER_REQUEST" };
    if (mode.lostCancel) { mode.lostCancel = false; throw Error("cancel response lost"); }
    if (mode.minimalCancelReply) return Response.json({ id: ID, status: "CANCELLED", total: current.total, version: current.version,
      paidAt: current.paidAt, canPay: false, canCancel: false, paymentDeadline: current.paymentDeadline, serverTime: TIME });
    return Response.json(current);
  }
  const controller = createCartControllerV2({ storage, auth });
  const runtime = createCartCheckoutRuntimeV2({ storage, auth, controller, fetch: fetchImpl, now: () => TIME,
    randomUUID: () => KEY(++keys) });
  let stop = () => {};
  if (start) { stop = controller.start(); await flush(); }
  return { runtime, controller, auth, storage, calls, mode, created, payments, stop,
    raw: () => raw, saved: () => JSON.parse(raw), writes: () => writes, keys: () => keys,
    current: () => current, setCurrent(next) { current = next; }, setServerSession(next) { serverSession = next; },
    async switchOwner(id) { memorySession = session(id, BINDING_B); await auth.login({}); },
    reviewCreate(options = {}) { return runtime.checkout.review(controller.getView().state.cart, options); },
    async create(options = {}) { return runtime.checkout.submit(this.reviewCreate(options)); } };
}

test("runtime construction/opening create review allocates no key, storage write or HTTP", async () => {
  const off = await fixture({ start: false });
  assert.equal(off.calls.length, 0); assert.equal(off.writes(), 0); assert.equal(off.keys(), 0);
  assert.throws(() => off.reviewCreate(), code("CART_CHANGED"));
  const f = await fixture(), before = f.raw();
  f.reviewCreate({ promotionCode: "DEMO10" });
  assert.equal(f.calls.length, 0); assert.equal(f.raw(), before); assert.equal(f.keys(), 0); f.stop();
});

test("create -> official GET -> successful payment uses shared live adapters and clears only the bound cart", async () => {
  const f = await fixture();
  const created = await f.create({ promotionCode: "DEMO10" });
  assert.equal(created.kind, "CURRENT_ORDER"); assert.equal(created.order.total, 90000);
  assert.equal(f.saved().cart.items[0].qty, 2); assert.ok(f.saved().checkoutBindings.A);
  assert.equal(f.controller.getView().canMutate, false);
  const review = await f.runtime.payment.review(ID, "WALLET");
  assert.equal(review.order.total, 90000); assert.equal(f.payments.size, 0);
  const paid = await f.runtime.payment.submit(review);
  assert.equal(paid.kind, "RESOLVED"); assert.equal(paid.settlement.order.status, "PAID");
  assert.equal(f.saved().cart.items.length, 0); assert.equal(f.saved().checkoutBindings.A, undefined);
  assert.equal(f.saved().paymentRecoveries.A[paid.request.requestKey].recoveryStatus, "RESOLVED");
  assert.equal(f.created.size, 1); assert.equal(f.payments.size, 1);
  assert.equal(f.controller.getView().state.isSaving, false); f.stop();
});

test("lost create response publishes pending; explicit retry keeps the same saved key and body", async () => {
  const f = await fixture(); f.mode.lostCreate = true;
  assert.equal((await f.create()).kind, "UNKNOWN");
  const pending = f.controller.getView().records.pending;
  assert.ok(pending); assert.equal(pending.phase, "UNKNOWN"); assert.equal(f.keys(), 1);
  assert.equal((await f.create({ pending })).kind, "CURRENT_ORDER");
  const posts = f.calls.filter(c => c.url === "/api/orders");
  assert.equal(posts.length, 2); assert.equal(posts[0].key, posts[1].key); assert.equal(posts[0].body, posts[1].body);
  assert.equal(f.created.size, 1); assert.equal(f.keys(), 1); f.stop();
});

for (const reason of ["PRODUCT_PRICE_CHANGED", "EXPECTED_TOTAL_MISMATCH"]) {
  test(`default runtime accepts ${reason}, keeps choices and unlocks only after confirmed rejection`, async () => {
    const f = await fixture(), before = structuredClone(f.saved().cart);
    f.mode.orderError = pending => {
      const unitPrice = reason === "PRODUCT_PRICE_CHANGED" ? 55000 : 50000;
      const currentSubtotal = pending.payload.items.reduce((sum, item) => sum + item.qty * unitPrice, 0);
      const currentDiscountTotal = reason === "PRODUCT_PRICE_CHANGED" ? 10000 : 5000;
      return { code: "CHECKOUT_CHANGED", message: "Review the current prices.", details: { reason,
        currentSubtotal, currentDiscountTotal, currentTotal: currentSubtotal - currentDiscountTotal,
        items: pending.payload.items.map(item => ({ productId: item.productId, size: item.size,
          toppingIds: item.toppingIds, currentUnitPrice: unitPrice })) } };
    };
    try {
      const result = await f.create({ promotionCode: "DEMO10" });
      assert.equal(result.kind, "REJECTED");
      assert.equal(result.settlement.outcome.kind, "CHECKOUT_CHANGED");
      assert.equal(result.settlement.outcome.details.reason, reason);
      assert.deepEqual(f.saved().cart, before);
      assert.equal(f.saved().pendingRequests.A, undefined);
      assert.equal(f.controller.getView().canMutate, true);
      assert.equal(f.keys(), 1); assert.equal(f.created.size, 0);
      const posts = f.calls.filter(call => call.method === "POST");
      assert.equal(posts.length, 1);
      assert.deepEqual(JSON.parse(posts[0].body), result.request.payload);
      assert.equal(f.calls.some(call => call.url.startsWith("/api/orders/")), false);
    } finally { f.stop(); }
  });
}

test("default runtime accepts backend stock rejection and preserves the cart for explicit editing", async () => {
  const f = await fixture(), before = structuredClone(f.saved().cart);
  f.mode.orderError = () => ({ code: "OUT_OF_STOCK", message: "Không đủ hàng.", details: {
    reason: "INSUFFICIENT_STOCK", resources: [{ kind: "PRODUCT", id: "cappuccino", requested: 2, available: 1 }] } });
  try {
    const result = await f.create(); assert.equal(result.kind, "REJECTED");
    assert.equal(result.settlement.outcome.kind, "OUT_OF_STOCK"); assert.deepEqual(f.saved().cart, before);
    assert.equal(f.saved().pendingRequests.A, undefined); assert.equal(f.controller.getView().canMutate, true);
    assert.equal(f.calls.filter(call => call.method === "POST").length, 1);
  } finally { f.stop(); }
});

test("default runtime keeps unknown price and proposed stock responses pending without another POST", async () => {
  for (const reason of ["PRICE_OR_TOTAL_CHANGED", "INSUFFICIENT_PRODUCT_STOCK"]) {
    const f = await fixture(), before = structuredClone(f.saved().cart);
    f.mode.orderError = pending => reason === "PRICE_OR_TOTAL_CHANGED"
      ? { code: "CHECKOUT_CHANGED", message: "Review.", details: { reason, currentSubtotal: 110000,
        currentDiscountTotal: 10000, currentTotal: 100000,
        items: pending.payload.items.map(item => ({ productId: item.productId, size: item.size,
          toppingIds: item.toppingIds, currentUnitPrice: 55000 })) } }
      : { code: "OUT_OF_STOCK", message: "Review.", details: { reason,
        resources: [{ kind: "PRODUCT", id: "cappuccino", requested: 2, available: 1 }] } };
    try {
      assert.equal((await f.create({ promotionCode: "DEMO10" })).kind, "UNKNOWN");
      assert.equal(f.saved().pendingRequests.A.phase, "UNKNOWN");
      assert.deepEqual(f.saved().cart, before);
      assert.equal(f.controller.getView().canMutate, false);
      assert.equal(f.keys(), 1); assert.equal(f.created.size, 0);
      assert.equal(f.calls.filter(call => call.method === "POST").length, 1);
    } finally { f.stop(); }
  }
});

test("FAILED permits an explicit new payment with a new key on the same order", async () => {
  const f = await fixture(); await f.create(); f.mode.payment = "FAILED";
  const first = await f.runtime.payment.submit(await f.runtime.payment.review(ID, "CARD"));
  assert.equal(first.kind, "RESOLVED"); assert.equal(first.settlement.order.status, "PAYMENT_FAILED");
  assert.equal(f.saved().cart.items[0].qty, 2);
  f.mode.payment = "SUCCEEDED";
  const second = await f.runtime.payment.submit(await f.runtime.payment.review(ID, "WALLET"));
  assert.equal(second.kind, "RESOLVED"); assert.notEqual(first.request.requestKey, second.request.requestKey);
  assert.equal(first.request.body.orderId, second.request.body.orderId); assert.equal(f.payments.size, 2); f.stop();
});

for (const mode of ["lostPayment", "failAfterPayment"]) {
  test(`${mode} preserves recovery and explicit replay resolves the exact saved request`, async () => {
    const f = await fixture(); await f.create(); f.mode[mode] = true;
    const unknown = await f.runtime.payment.submit(await f.runtime.payment.review(ID, "CARD"));
    assert.equal(unknown.kind, "UNKNOWN");
    const recovery = f.controller.getView().records.recoveries.find(item => item.recoveryStatus === "UNRESOLVED");
    assert.ok(recovery); assert.equal(f.saved().cart.items[0].qty, 2);
    const resolved = await f.runtime.payment.submit(f.runtime.payment.reviewRecovery(recovery));
    assert.equal(resolved.kind, "RESOLVED"); assert.equal(f.payments.size, 1);
    const posts = f.calls.filter(c => c.url === "/api/payments");
    assert.equal(posts.length, 2); assert.equal(posts[0].key, posts[1].key); assert.equal(posts[0].body, posts[1].body);
    assert.equal(f.saved().cart.items.length, 0); f.stop();
  });
}

test("cancel uses B's full DTO parser and releases binding without clearing unpurchased choices", async () => {
  const f = await fixture(); await f.create();
  const result = await f.runtime.cancel.submit(await f.runtime.cancel.review(ID));
  assert.equal(result.kind, "CANCELLED"); assert.equal(f.saved().checkoutBindings.A, undefined);
  assert.equal(f.saved().cart.items[0].qty, 2); assert.equal(f.controller.getView().canMutate, true); f.stop();
});

for (const mode of ["lostCancel", "minimalCancelReply"]) {
  test(`${mode} stays unknown until an explicit full GET check, without another cancel POST`, async () => {
    const f = await fixture(); await f.create(); f.mode[mode] = true;
    const result = await f.runtime.cancel.submit(await f.runtime.cancel.review(ID));
    assert.equal(result.kind, "UNKNOWN"); assert.ok(f.saved().checkoutBindings.A);
    assert.equal((await f.runtime.cancel.check(ID)).kind, "CANCELLED");
    assert.equal(f.calls.filter(c => c.url.endsWith("/cancel")).length, 1);
    assert.equal(f.saved().cart.items[0].qty, 2); f.stop();
  });
}

test("one provider gate blocks edits, logout and a second coordinator while HTTP review waits", async () => {
  const f = await fixture(); await f.create(); const gate = deferred(); f.mode.meGate = gate;
  const reviewing = f.runtime.payment.review(ID, "CARD"); await flush();
  assert.equal(f.controller.getView().state.isSaving, true);
  assert.equal(await f.controller.mutate({ type: "ADD_ITEM", item: draft }), false);
  await assert.rejects(f.auth.logout(), code("CART_CHANGED"));
  await assert.rejects(f.runtime.cancel.review(ID), code("CART_CHANGED"));
  assert.throws(() => f.reviewCreate(), code("CART_CHANGED"));
  gate.resolve(); await reviewing; assert.equal(f.controller.getView().state.isSaving, false); f.stop();
});

test("fresh /me owner mismatch prepares no key or pending and never signs out the other account", async () => {
  const f = await fixture(), before = f.raw(); f.setServerSession(session("B", BINDING_B));
  await assert.rejects(f.create(), code("OWNER_MISMATCH"));
  assert.equal(f.raw(), before); assert.equal(f.keys(), 0);
  assert.deepEqual(f.calls.map(c => c.url), ["/api/auth/me"]); f.stop();
});

test("account switch during HTTP leaves durable pending but publishes no old-owner result", async () => {
  const f = await fixture(), gate = deferred();
  // Pause the create POST after durable preparation (the earlier /me must finish first).
  f.mode.before = call => {
    if (call.url === "/api/auth/me") f.mode.before = () => gate.promise;
  };
  const sending = f.create(); await flush();
  assert.ok(f.saved().pendingRequests.A);
  await f.switchOwner("B"); gate.resolve();
  await assert.rejects(sending, code("OWNER_MISMATCH")); await flush();
  assert.ok(f.saved().pendingRequests.A); assert.equal(f.controller.getView().records.pending, null);
  assert.equal(f.controller.getView().state.cart.ownerId, "B"); f.stop();
});

test("generic terminal rejection cannot silently resolve a payment without an identified attempt", async () => {
  const f = await fixture(); await f.create();
  const review = await f.runtime.payment.review(ID, "CARD"); f.mode.terminalWithoutAttempt = true;
  const result = await f.runtime.payment.submit(review);
  assert.equal(result.kind, "UNKNOWN"); assert.equal(result.order.status, "CANCELLED");
  assert.equal(f.payments.size, 0); assert.equal(f.saved().paymentRecoveries.A[result.request.requestKey].recoveryStatus, "UNRESOLVED");
  assert.equal(f.controller.getView().canMutate, false); f.stop();
});

test("public fixture flags cannot substitute mock /me or order data in the assembled runtime", async () => {
  const keys = ["NEXT_PUBLIC_AUTH_SOURCE", "NEXT_PUBLIC_ORDERS_SOURCE"], previous = keys.map(key => process.env[key]);
  keys.forEach(key => { process.env[key] = "mock"; });
  try {
    const f = await fixture(); assert.equal((await f.create()).kind, "CURRENT_ORDER");
    assert.ok(f.calls.some(c => c.url === "/api/auth/me")); assert.ok(f.calls.some(c => c.url === `/api/orders/${ID}`)); f.stop();
  } finally { keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
});

test("already-aborted create performs no HTTP/key allocation and always releases the provider gate", async () => {
  const f = await fixture(), abort = new AbortController(); abort.abort();
  await assert.rejects(f.runtime.checkout.submit(f.reviewCreate(), abort.signal), error => error.name === "AbortError");
  assert.equal(f.calls.length, 0); assert.equal(f.keys(), 0); assert.equal(f.controller.getView().state.isSaving, false); f.stop();
});

test("subscribeCart observes successful durable operations through the same controller as the badge", async () => {
  const f = await fixture(); let notifications = 0;
  const remove = f.runtime.subscribeCart(() => notifications++);
  await f.create(); assert.ok(notifications > 0); const last = notifications; remove();
  await f.runtime.cancel.check(ID); assert.equal(notifications, last); f.stop();
});


test("runtime restores a stored bound order with HTTP GETs only after the panel is recreated", async () => {
  const f = await fixture(); await f.create();
  const before = f.raw(), posts = f.calls.filter(c => c.method === "POST").length, keys = f.keys();
  const result = await f.runtime.restoreOrder();
  assert.equal(result.order.id, ID); assert.equal(result.order.status, "PENDING");
  assert.equal(f.raw(), before); assert.equal(f.keys(), keys);
  assert.equal(f.calls.filter(c => c.method === "POST").length, posts);
  assert.equal(f.calls.at(-1).headers["X-BrewLite-Expected-Session"], BINDING); f.stop();
});

test("restoring lost create never automatically resends the saved key", async () => {
  const f = await fixture(); f.mode.lostCreate = true; await f.create();
  const before = f.raw(), calls = f.calls.length;
  assert.equal(await f.runtime.restoreOrder(), null);
  assert.equal(f.calls.length, calls); assert.equal(f.raw(), before); assert.ok(f.saved().pendingRequests.A); f.stop();
});

test("restored PAID clears only the bound cart and keeps unresolved payment identity until explicit replay", async () => {
  const f = await fixture(); await f.create(); f.mode.lostPayment = true;
  const unknown = await f.runtime.payment.submit(await f.runtime.payment.review(ID, "CARD"));
  const saved = f.saved().paymentRecoveries.A[unknown.request.requestKey];
  assert.equal((await f.runtime.restoreOrder()).order.status, "PAID");
  assert.equal(f.saved().cart.items.length, 0);
  assert.deepEqual(f.saved().paymentRecoveries.A[unknown.request.requestKey], saved);
  const paid = await f.runtime.payment.submit(f.runtime.payment.reviewRecovery(saved));
  assert.equal(paid.kind, "RESOLVED"); assert.equal(f.payments.size, 1); f.stop();
});

test("restore HTTP failure releases the shared provider gate and permits a later read", async () => {
  const f = await fixture(); await f.create(); f.mode.failNextOrderRead = true;
  const before = f.raw(); await assert.rejects(f.runtime.restoreOrder());
  assert.equal(f.raw(), before); assert.equal(f.controller.getView().state.isSaving, false);
  assert.equal((await f.runtime.restoreOrder()).order.id, ID); f.stop();
});

test("assembled runtime supplies the exact official DTO already fetched for checkout and payment review", async () => {
  const f = await fixture(); const created = await f.create({ promotionCode: "DEMO10" });
  const checkpoint = { ownerId: "A", binding: BINDING, sessionVersion: f.auth.getSessionVersion() };
  const calls = f.calls.length;
  const detail = f.runtime.getOrderDetail({ session: checkpoint, order: created.order });
  assert.equal(detail.subtotal, 100000); assert.equal(detail.discountTotal, 10000);
  assert.equal(detail.total, 90000); assert.equal(detail.promotion.code, "DEMO10");
  assert.equal(f.calls.length, calls);
  const review = await f.runtime.payment.review(ID, "CARD");
  assert.equal(f.runtime.getOrderDetail({ session: checkpoint, order: review.order }).total, review.order.total);
  assert.equal(f.payments.size, 0); f.stop();
});

test("an order change after price review requires confirmation again before allocating a payment key", async () => {
  const f = await fixture(); await f.create(); const review = await f.runtime.payment.review(ID, "WALLET");
  const keys = f.keys(); f.setCurrent({ ...f.current(), version: 1, total: 90000, discountTotal: 10000,
    promotion: { code: "DEMO10", discountAmount: 10000 } });
  await assert.rejects(f.runtime.payment.submit(review), code("CART_CHANGED"));
  assert.equal(f.keys(), keys); assert.equal(f.payments.size, 0); assert.deepEqual(f.saved().paymentRecoveries, {}); f.stop();
});
