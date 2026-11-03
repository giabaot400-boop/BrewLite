import test from "node:test";
import assert from "node:assert/strict";
import { captureOrderConfirmation, reconcileOrderConfirmation } from "./cart-order-confirmation.ts";

const auth = () => ({ status: "authenticated", user: { id: "a", email: "a@example.com" }, sessionExpired: false });
function fixture(retry = false) {
  const cart = { ownerId: "a", revision: 4, items: [{ productId: "coffee", productName: "Coffee",
    imageUrl: "/coffee.svg", size: "S", toppingIds: [], toppingNames: {}, qty: 1, previewUnitPrice: 35000 }] };
  const pending = retry ? { ownerId: "a", requestKey: "00000000-0000-4000-8000-000000000001",
    payload: { items: [{ productId: "coffee", size: "S", toppingIds: [], qty: 1, expectedUnitPrice: 35000 }] },
    cartRevision: 4, cartSnapshot: structuredClone(cart), createdAt: "2026-11-03T15:00:00.000Z", phase: "UNKNOWN" } : null;
  const environment = { identity: auth(), sessionVersion: 1,
    state: { status: "ready", cart, sequence: 1, isSaving: false, message: null }, pending, orderPhase: "IDLE" };
  const review = Object.freeze({ ownerId: "a", kind: retry ? "RETRY" : "NEW", displayCart: structuredClone(cart) });
  return { environment, confirmation: captureOrderConfirmation(review, environment) };
}
const checkingEnvironment = environment => ({ ...environment,
  state: { ...environment.state, status: "restoring", cart: null }, pending: null });

test("unchanged view is stable and checking retains the exact reviewed snapshot", () => {
  const { environment, confirmation } = fixture();
  assert.equal(reconcileOrderConfirmation(confirmation, environment), confirmation);
  const checking = reconcileOrderConfirmation(confirmation, checkingEnvironment(environment));
  assert.equal(checking.status, "checking");
  assert.equal(checking.review, confirmation.review);
  assert.equal(reconcileOrderConfirmation(checking, checkingEnvironment(environment)), checking);
});

test("same-owner successful recheck resumes the original review without refreshing its contents", () => {
  const { environment, confirmation } = fixture();
  const checking = reconcileOrderConfirmation(confirmation, checkingEnvironment(environment));
  const fresh = { ...environment, identity: auth(), state: structuredClone(environment.state) };
  const resumed = reconcileOrderConfirmation(checking, fresh);
  assert.equal(resumed.status, "ready");
  assert.equal(resumed.review, confirmation.review);
  assert.equal(resumed.identity, fresh.identity);
});

test("failed verification cannot resume using cached auth and cannot resurrect after later success", () => {
  const { environment, confirmation } = fixture();
  const checking = reconcileOrderConfirmation(confirmation, checkingEnvironment(environment));
  const invalid = reconcileOrderConfirmation(checking, environment);
  assert.equal(invalid.status, "invalid");
  assert.equal(reconcileOrderConfirmation(invalid, { ...environment, identity: auth() }), invalid);
});

test("another account, expiry, and explicit same-owner login invalidate the dialog", () => {
  for (const update of [
    { identity: { status: "authenticated", user: { id: "b", email: "b@example.com" }, sessionExpired: false } },
    { identity: { status: "anonymous", user: null, sessionExpired: true } },
    { sessionVersion: 2 },
  ]) {
    const { environment, confirmation } = fixture();
    assert.equal(reconcileOrderConfirmation(confirmation, { ...environment, ...update }).status, "invalid");
  }
});

test("A -> B -> A stays invalid even when intermediate renders were batched", () => {
  const { environment, confirmation } = fixture();
  assert.equal(reconcileOrderConfirmation(confirmation, { ...environment, identity: auth(), sessionVersion: 3 }).status, "invalid");
});

test("cart revision changes require a new review even when choices look identical", () => {
  const { environment, confirmation } = fixture();
  const changed = structuredClone(environment);
  changed.state.cart.revision++;
  assert.equal(reconcileOrderConfirmation(confirmation, changed).status, "invalid");
});

test("same-revision quantity, price, topping or row changes also require a new review", () => {
  for (const change of [
    cart => { cart.items[0].qty++; }, cart => { cart.items[0].previewUnitPrice++; },
    cart => { cart.items[0].toppingIds.push("cream"); cart.items[0].toppingNames.cream = "Cream"; },
    cart => { cart.items.length = 0; },
  ]) {
    const { environment, confirmation } = fixture(), changed = structuredClone(environment);
    change(changed.state.cart);
    assert.equal(reconcileOrderConfirmation(confirmation, changed).status, "invalid");
  }
});

test("retry recovery preserves original key/body/snapshot across a same-owner recheck", () => {
  const { environment, confirmation } = fixture(true);
  const checking = reconcileOrderConfirmation(confirmation, checkingEnvironment(environment));
  const fresh = { ...environment, identity: auth() };
  fresh.pending = { ...environment.pending, phase: "SUBMITTING" };
  const resumed = reconcileOrderConfirmation(checking, fresh);
  assert.equal(resumed.status, "ready");
  assert.equal(resumed.review, confirmation.review);
  assert.equal(resumed.pendingSignature, confirmation.pendingSignature);
});

test("replaced, settled or tampered pending invalidates a retry review", () => {
  for (const change of [
    env => { env.pending = null; }, env => { env.pending.requestKey = "00000000-0000-4000-8000-000000000002"; },
    env => { env.pending.payload.items[0].qty = 2; }, env => { env.pending.cartSnapshot.items[0].qty = 2; },
  ]) {
    const { environment, confirmation } = fixture(true), changed = structuredClone(environment);
    change(changed);
    assert.equal(reconcileOrderConfirmation(confirmation, changed).status, "invalid");
  }
});

test("new pending blocks an old new-order confirmation", () => {
  const { environment, confirmation } = fixture();
  assert.equal(reconcileOrderConfirmation(confirmation, { ...environment, pending: fixture(true).environment.pending }).status, "invalid");
});

test("storage failure, locked view, and active order processing invalidate a review", () => {
  for (const status of ["error", "locked"]) {
    const { environment, confirmation } = fixture();
    assert.equal(reconcileOrderConfirmation(confirmation, { ...environment,
      state: { ...environment.state, status, cart: null } }).status, "invalid");
  }
  const { environment, confirmation } = fixture();
  assert.equal(reconcileOrderConfirmation(confirmation, { ...environment, orderPhase: "SENDING" }).status, "invalid");
});

test("null confirmation stays closed through refresh and result recovery", () => {
  const { environment } = fixture();
  assert.equal(reconcileOrderConfirmation(null, checkingEnvironment(environment)), null);
  assert.equal(reconcileOrderConfirmation(null, { ...environment, identity: auth() }), null);
});
