import test from "node:test";
import assert from "node:assert/strict";
import { orderFeedback } from "./cart-order-feedback.ts";
import { getCartLineKey } from "./cart-reducer.ts";

const coffee = { productId: "coffee", size: "S", toppingIds: ["cream"], qty: 1, expectedUnitPrice: 35000 };
const tea = { productId: "tea", size: "M", toppingIds: [], qty: 2, expectedUnitPrice: 40000 };
const pending = { payload: { items: [coffee, tea] } };
test("line validation uses the original request configuration key, independent of displayed order", () => {
  const feedback = orderFeedback({ cartEffect: "UNCHANGED", outcome: { kind: "REJECTED", message: "Fix items",
    fieldErrors: { "items[1].qty": ["Invalid quantity"], "items[0].toppingIds": ["Unavailable topping"],
      items: ["Check cart"] } } }, pending);
  assert.deepEqual(feedback.lineErrors[getCartLineKey(coffee)], ["Unavailable topping"]);
  assert.deepEqual(feedback.lineErrors[getCartLineKey(tea)], ["Invalid quantity"]);
  assert.deepEqual(feedback.globalErrors, ["Check cart"]);
});
test("late validation on an unrelated cart is global and cannot annotate new rows", () => {
  const feedback = orderFeedback({ cartEffect: "UNRELATED", outcome: { kind: "REJECTED", message: "Fix items",
    fieldErrors: { "items[0].qty": ["Invalid"] } } }, pending);
  assert.deepEqual(feedback.lineErrors, {}); assert.deepEqual(feedback.globalErrors, ["Invalid"]);
});
test("reprice feedback requires another confirmation; unrelated cart never claims to have new prices", () => {
  const repriced = orderFeedback({ cartEffect: "REPRICED", outcome: { kind: "PRICE_CHANGED" } }, pending);
  assert.equal(repriced.kind, "price"); assert.equal(repriced.repriced, true);
  const unrelated = orderFeedback({ cartEffect: "UNRELATED", outcome: { kind: "PRICE_CHANGED" } }, pending);
  assert.equal(unrelated.repriced, false);
});
test("owner mismatch 403 never asks to sign out the active account", () => {
  const feedback = orderFeedback({ cartEffect: "UNCHANGED", outcome: { kind: "UNKNOWN", code: "REQUEST_FORBIDDEN" } }, pending);
  assert.equal(feedback.kind, "unknown"); assert.equal(feedback.loginReason, null);
});
test("session expiry requests login but other uncertainty remains an unresolved order", () => {
  assert.equal(orderFeedback({ outcome: { kind: "UNKNOWN", code: "SESSION_EXPIRED" } }, pending).loginReason, "expired");
  for (const code of ["UPSTREAM_TIMEOUT", "NO_RESPONSE", "INVALID_RESPONSE", "IDEMPOTENCY_CONFLICT", "PAYLOAD_TOO_LARGE"]) {
    const feedback = orderFeedback({ outcome: { kind: "UNKNOWN", code } }, pending);
    assert.equal(feedback.kind, "unknown"); assert.equal(feedback.loginReason, null);
  }
});
test("confirmed response is represented as awaiting payment, without payment controls", () => {
  const feedback = orderFeedback({ cartEffect: "CLEARED", outcome: { kind: "CONFIRMED" } }, pending);
  assert.equal(feedback.kind, "confirmed"); assert.match(feedback.message, /Chờ thanh toán/);
});
test("already settled same-key result is not presented as unknown after another tab confirms", () => {
  const request = { ...pending, ownerId: "a", requestKey: "key-a" };
  const result = { outcome: { kind: "IGNORED" }, envelope: { lastOrderResult: { ownerId: "a", requestKey: "key-a" } } };
  assert.equal(orderFeedback(result, request).kind, "confirmed");
  assert.equal(orderFeedback(result, { ...request, requestKey: "key-other" }).kind, "local-error");
});
