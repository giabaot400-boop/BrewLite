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
