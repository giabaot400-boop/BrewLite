import assert from "node:assert/strict";
import test from "node:test";
import { checkoutUiState, reviewedOrderTotal } from "./cart-checkout-ui.ts";
import { createEmptyCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { createCheckoutFixture } from "./preview/checkout-fixture.ts";

const pendingOrder = () => ({ id: "order-a", version: 0, status: "PENDING", total: 50000,
  paymentDeadline: "2026-11-08T10:15:00.000Z", paidAt: null, canPay: true, canCancel: true, serverTime: "2026-11-08T10:00:00.000Z" });
async function created() {
  const f = createCheckoutFixture({ delayMs: 0 }), env = f.environment;
  const value = await env.storage.readV2();
  const result = await env.checkout.submit(env.checkout.review(value.cart));
  return { f, env, result, value: await env.storage.readV2(), owner: value.cart.ownerId };
}

test("UI allows new checkout only for an editable nonempty cart owned by the verified account", async () => {
  const f = createCheckoutFixture({ delayMs: 0 }), value = await f.environment.storage.readV2(), owner = value.cart.ownerId;
  const ui = checkoutUiState(value, owner, null);
  assert.equal(ui.canEdit, true); assert.equal(ui.canCreate, true); assert.equal(ui.canPay, false);
  const hidden = checkoutUiState(value, "other-user", null);
  assert.equal(hidden.cart, null); assert.equal(hidden.pending, null); assert.equal(hidden.recovery, null); assert.equal(hidden.canCreate, false);
});

test("created PENDING keeps choices locked while offering payment and cancel actions", async () => {
  const { value, owner, result } = await created(), ui = checkoutUiState(value, owner, result.order);
  assert.equal(ui.block, "CHECKOUT_BOUND"); assert.equal(ui.canEdit, false); assert.equal(ui.canCreate, false);
  assert.equal(ui.canPay, true); assert.equal(ui.canCancel, true); assert.equal(ui.cart.items[0].qty, 2);
});

test("unknown create exposes only explicit retry, retaining the exact saved pending", async () => {
  const f = createCheckoutFixture({ delayMs: 0 }), env = f.environment; f.setFault("CREATE_RESPONSE_LOST");
  const value = await env.storage.readV2(); await env.checkout.submit(env.checkout.review(value.cart));
  const saved = await env.storage.readV2(), ui = checkoutUiState(saved, value.cart.ownerId, null);
  assert.equal(ui.block, "ORDER_PENDING"); assert.equal(ui.pending.phase, "UNKNOWN");
  assert.equal(ui.canEdit, false); assert.equal(ui.canCreate, false); assert.equal(ui.canPay, false);
});

test("unknown payment offers recovery and blocks new attempts but keeps cancellation available", async () => {
  const { f, env, result, owner } = await created(); f.setFault("PAYMENT_RESPONSE_LOST");
  await env.payment.submit(await env.payment.review(result.order.id, "CARD"));
  const value = await env.storage.readV2(), ui = checkoutUiState(value, owner, result.order);
  assert.equal(ui.block, "PAYMENT_UNRESOLVED"); assert.equal(ui.recovery.body.method, "CARD");
  assert.equal(ui.canPay, false); assert.equal(ui.canCancel, true); assert.equal(ui.canEdit, false);
});

test("resolved records do not block a fresh cart; records of another owner never become recovery UI", async () => {
  const value = createEmptyCartEnvelopeV2(); value.cart.ownerId = "A";
  value.paymentRecoveries = { A: { old: { recoveryStatus: "RESOLVED" } }, B: { pending: { recoveryStatus: "UNRESOLVED" } } };
  const ui = checkoutUiState(value, "A", null);
  assert.equal(ui.recovery, null); assert.equal(ui.canEdit, true); assert.equal(ui.canCreate, false);
});

test("legacy, expired and terminal Orders never offer a new payment", () => {
  const value = createEmptyCartEnvelopeV2(); value.cart.ownerId = "A";
  for (const order of [{ ...pendingOrder(), paymentDeadline: null }, { ...pendingOrder(), serverTime: "2026-11-08T10:15:00.000Z" },
    { ...pendingOrder(), status: "CANCELLED", canPay: false, canCancel: false }]) {
    assert.equal(checkoutUiState(value, "A", order).canPay, false);
  }
  assert.equal(checkoutUiState(value, "A", { ...pendingOrder(), paymentDeadline: null }).canCancel, false);
});

test("confirmation displays the saved v2 total or exact v1 line sum without using a newer cart preview", () => {
  const items = [{ qty: 2, expectedUnitPrice: 50000 }];
  assert.equal(reviewedOrderTotal({ items }), 100000);
  assert.equal(reviewedOrderTotal({ schemaVersion: 2, items, promotionCode: "DEMO10", expectedTotal: 90000 }), 90000);
});

test("official discounted prices remain available after panel restore without another POST", async () => {
  const f = createCheckoutFixture({ delayMs: 0 }), env = f.environment;
  const value = await env.storage.readV2();
  await env.checkout.submit(env.checkout.review(value.cart, { promotionCode: "DEMO10" }));
  const posts = f.getTrace().length, restored = await env.restoreOrder();
  const detail = env.getOrderDetail(restored);
  assert.equal(detail.subtotal, 100000); assert.equal(detail.discountTotal, 10000);
  assert.equal(detail.total, 90000); assert.equal(detail.promotion.code, "DEMO10");
  assert.equal(f.getTrace().length, posts);
});

test("no-promotion official prices explicitly retain zero discount and the full subtotal", async () => {
  const { env, result } = await created();
  const checkpoint = { ownerId: env.auth.getSnapshot().user.id, binding: env.auth.getSnapshot().binding,
    sessionVersion: env.auth.getSessionVersion() };
  const detail = env.getOrderDetail({ session: checkpoint, order: result.order });
  assert.equal(detail.promotion, null); assert.equal(detail.discountTotal, 0);
  assert.equal(detail.subtotal, 100000); assert.equal(detail.total, 100000);
});

test("retry preserves the saved promotion, key and body rather than rebuilding from the new preview", async () => {
  const f = createCheckoutFixture({ delayMs: 0 }), env = f.environment;
  const value = await env.storage.readV2(); f.setFault("CREATE_RESPONSE_LOST");
  await env.checkout.submit(env.checkout.review(value.cart, { promotionCode: "DEMO10" }));
  const pending = (await env.storage.readV2()).pendingRequests[value.cart.ownerId];
  const review = env.checkout.review(value.cart, { pending, promotionCode: "" });
  assert.equal(review.payload.promotionCode, "DEMO10"); assert.deepEqual(review.payload, pending.payload);
  const result = await env.checkout.submit(review);
  const detail = env.getOrderDetail({ session: { ownerId: value.cart.ownerId, binding: env.auth.getSnapshot().binding,
    sessionVersion: env.auth.getSessionVersion() }, order: result.order });
  assert.equal(detail.total, 90000); assert.equal(detail.promotion.code, "DEMO10");
  const trace = f.getTrace(); assert.equal(trace[0].key, trace[1].key); assert.equal(trace[1].replay, true);
});

test("the paid order's official snapshot is independent of the next cart's prices", async () => {
  const f = createCheckoutFixture({ delayMs: 0 }), env = f.environment;
  const value = await env.storage.readV2();
  const created = await env.checkout.submit(env.checkout.review(value.cart, { promotionCode: "DEMO10" }));
  const paid = await env.payment.submit(await env.payment.review(created.order.id, "WALLET"));
  await f.addSample(); const next = await env.storage.readV2();
  assert.equal(next.cart.items[0].qty, 1);
  const detail = env.getOrderDetail({ session: { ownerId: value.cart.ownerId, binding: env.auth.getSnapshot().binding,
    sessionVersion: env.auth.getSessionVersion() }, order: paid.settlement.order });
  assert.equal(detail.items[0].qty, 2); assert.equal(detail.total, 90000); assert.equal(detail.discountTotal, 10000);
});
