import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutFixture } from "./checkout-fixture.ts";

function setup() { const f = createCheckoutFixture({ delayMs: 0 }); return { f, env: f.environment }; }
async function create(env, promotionCode = "DEMO10") {
  const value = await env.storage.readV2();
  return env.checkout.submit(env.checkout.review(value.cart, { promotionCode }));
}

test("fixture instances have independent in-memory carts and never call global fetch or localStorage", async t => {
  t.mock.method(globalThis, "fetch", () => assert.fail("real network"));
  const prior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { assert.fail("real localStorage"); } });
  try {
    const { f, env } = setup(), other = setup(); await f.addSample();
    assert.equal((await env.storage.readV2()).cart.items[0].qty, 3);
    assert.equal((await other.env.storage.readV2()).cart.items[0].qty, 2);
    const made = await create(env); await env.payment.submit(await env.payment.review(made.order.id, "CARD"));
    await env.cancel.submit(await env.cancel.review(made.order.id));
    assert.equal((await env.storage.readV2()).cart.items.length, 0);
  } finally { if (prior) Object.defineProperty(globalThis, "localStorage", prior); else delete globalThis.localStorage; }
});

test("opening and abandoning create/payment/cancel reviews never adds a fixture mutation", async () => {
  const { f, env } = setup(), first = await env.storage.readV2(); env.checkout.review(first.cart);
  assert.equal(f.getTrace().length, 0);
  const created = await create(env), before = f.getTrace();
  await env.payment.review(created.order.id, "WALLET"); await env.cancel.review(created.order.id);
  assert.deepEqual(f.getTrace(), before); assert.equal((await env.storage.readV2()).cart.items[0].qty, 2);
});

test("DEMO10 fixture creation returns PENDING and keeps two cups/binding until payment", async () => {
  const { env } = setup(), result = await create(env), value = await env.storage.readV2();
  assert.equal(result.kind, "CURRENT_ORDER"); assert.equal(result.order.status, "PENDING"); assert.equal(result.order.total, 90000);
  assert.equal(value.cart.items[0].qty, 2); assert.equal(value.checkoutBindings[value.cart.ownerId].orderId, result.order.id);
});

test("lost create response replays exactly one fixture order using the saved key and body", async () => {
  const { f, env } = setup(); f.setFault("CREATE_RESPONSE_LOST");
  const first = await create(env); assert.equal(first.kind, "UNKNOWN");
  const value = await env.storage.readV2(), owner = value.cart.ownerId, pending = value.pendingRequests[owner];
  const retry = await env.checkout.submit(env.checkout.review(value.cart, { pending, promotionCode: "OTHER" }));
  assert.equal(retry.kind, "CURRENT_ORDER"); assert.equal(retry.order.id, "preview-order-1");
  const trace = f.getTrace(); assert.equal(trace.length, 2); assert.equal(trace[0].key, trace[1].key); assert.equal(trace[1].replay, true);
  assert.deepEqual(retry.request.payload, pending.payload);
});

test("invalid promo leaves choices, closes only the rejected pending and requires an explicit new confirmation", async () => {
  const { f, env } = setup(), before = (await env.storage.readV2()).cart;
  const rejected = await create(env, "UNKNOWN"); assert.equal(rejected.kind, "REJECTED");
  assert.equal(rejected.settlement.outcome.kind, "PROMOTION_NOT_APPLICABLE");
  assert.deepEqual((await env.storage.readV2()).cart, before);
  assert.equal(Object.keys((await env.storage.readV2()).pendingRequests).length, 0);
  assert.equal(f.getTrace().length, 1);
  assert.equal((await create(env)).kind, "CURRENT_ORDER"); assert.notEqual(f.getTrace()[0].key, f.getTrace()[1].key);
});

for (const method of ["WALLET", "CARD"]) {
  test(`${method} fixture payment resolves and clears only its bound cart`, async () => {
    const { env } = setup(), made = await create(env);
    const result = await env.payment.submit(await env.payment.review(made.order.id, method));
    assert.equal(result.kind, "RESOLVED"); assert.equal(result.settlement.payment.method, method);
    assert.equal(result.settlement.order.status, "PAID"); assert.equal(result.settlement.cartEffect, "CLEARED");
    assert.equal((await env.storage.readV2()).cart.items.length, 0);
  });
}

test("FAILED fixture keeps cart; changing outcome does not change old-key replay, while a new confirmed key can succeed", async () => {
  const { f, env } = setup(), made = await create(env); f.setOutcome("FAILED"); f.setFault("PAYMENT_RESPONSE_LOST");
  const unknown = await env.payment.submit(await env.payment.review(made.order.id, "WALLET")); assert.equal(unknown.kind, "UNKNOWN");
  const value = await env.storage.readV2(), recovery = Object.values(value.paymentRecoveries[value.cart.ownerId])[0];
  f.setOutcome("SUCCEEDED");
  const replay = await env.payment.submit(env.payment.reviewRecovery(recovery));
  assert.equal(replay.kind, "RESOLVED"); assert.equal(replay.settlement.payment.status, "FAILED");
  assert.equal((await env.storage.readV2()).cart.items[0].qty, 2);
  const next = await env.payment.submit(await env.payment.review(made.order.id, "WALLET")); assert.equal(next.kind, "RESOLVED");
  assert.equal(next.settlement.payment.status, "SUCCEEDED");
  const trace = f.getTrace().filter(item => item.operation === "PAYMENT");
  assert.equal(trace[0].key, trace[1].key); assert.notEqual(trace[1].key, trace[2].key);
});

test("valid payment plus failed Order read pins identity and can be reconciled only by explicit recovery", async () => {
  const { f, env } = setup(), made = await create(env); f.setFault("PAYMENT_READ_FAILED");
  const first = await env.payment.submit(await env.payment.review(made.order.id, "CARD")); assert.equal(first.kind, "UNKNOWN");
  const value = await env.storage.readV2(), recovery = Object.values(value.paymentRecoveries[value.cart.ownerId])[0];
  assert.equal(recovery.paymentId, "preview-payment-1"); assert.equal(recovery.recoveryStatus, "UNRESOLVED");
  assert.equal(value.cart.items[0].qty, 2);
  const replay = await env.payment.submit(env.payment.reviewRecovery(recovery)); assert.equal(replay.kind, "RESOLVED");
  const trace = f.getTrace().filter(item => item.operation === "PAYMENT"); assert.equal(trace[0].key, trace[1].key);
});

test("cancel before payment keeps choices and never sends a payment key", async () => {
  const { f, env } = setup(), made = await create(env), before = (await env.storage.readV2()).cart;
  const result = await env.cancel.submit(await env.cancel.review(made.order.id)); assert.equal(result.kind, "CANCELLED");
  assert.deepEqual((await env.storage.readV2()).cart, before); assert.deepEqual(f.getTrace().at(-1), { operation: "CANCEL", key: null, replay: false });
  assert.equal(Object.keys((await env.storage.readV2()).checkoutBindings).length, 0);
});

test("cancel after successful payment never reconstructs the already cleared cart", async () => {
  const { env } = setup(), made = await create(env);
  await env.payment.submit(await env.payment.review(made.order.id, "WALLET"));
  const empty = (await env.storage.readV2()).cart;
  const result = await env.cancel.submit(await env.cancel.review(made.order.id)); assert.equal(result.kind, "CANCELLED");
  assert.deepEqual((await env.storage.readV2()).cart, empty);
});

test("read/check and fixture settings changes do not automatically send requests", async () => {
  const { f, env } = setup(), made = await create(env), before = f.getTrace();
  await env.cancel.check(made.order.id); f.setFault("PAYMENT_RESPONSE_LOST"); f.setOutcome("FAILED");
  await Promise.resolve(); assert.deepEqual(f.getTrace(), before);
});
