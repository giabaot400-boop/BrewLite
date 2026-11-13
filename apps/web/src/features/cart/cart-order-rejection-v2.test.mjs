import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { applyCartCheckoutV2 } from "./cart-checkout-v2.ts";
import { ORDER_REJECTION_REASONS_V2, settleCartRejectionV2 } from "./cart-order-rejection-v2.ts";
import { cartReducer } from "./cart-reducer.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const KEY2 = "00000000-0000-4000-8000-000000000002";
const TIME = "2026-11-07T13:00:00.000Z";
const current = () => true;
const code = expected => error => error instanceof CartStorageError && error.code === expected;
// Test-only allowlists exercise the integration seam; these are not new backend reason names.
const REASONS = { checkoutChanged: ["TEST_PRICE_REASON"], outOfStock: ["TEST_STOCK_REASON"] };
function fixture(ownerId = "A", { v1 = false, multi = false, promotionCode = "DEMO10" } = {}) {
  let value = createEmptyCartEnvelopeV2();
  const draft = { productId: "coffee", productName: "Coffee", imageUrl: "/coffee.svg", size: "M",
    toppingIds: ["milk", "cream"], toppingNames: { milk: "Milk", cream: "Cream" }, previewUnitPrice: 50000 };
  value.cart = cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
  if (multi) {
    value.cart = cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart;
    value.cart = cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: { ...draft, size: "L" } }).cart;
  }
  value.cart = { ...value.cart, ownerId };
  value = applyCartCheckoutV2(value, { type: "BEGIN_ORDER_V2", ownerId, expectedCart: { ownerId, revision: value.cart.revision },
    requestKey: KEY, createdAt: TIME, promotionCode }).envelope;
  if (v1) { const pending = value.pendingRequests[ownerId]; value.pendingRequests = { [ownerId]: { ...pending, payload: { items: pending.payload.items } } }; }
  return value;
}
const reply = (code = "VALIDATION_ERROR", details, changes = {}) => ({ ownerId: "A", requestKey: KEY,
  status: code === "VALIDATION_ERROR" ? 400 : 409,
  body: { error: { code, message: "Vui lòng xem lại lựa chọn.", ...(details === undefined ? {} : { details }) } }, ...changes });
function checkout(value = fixture(), changes = {}) {
  const items = value.pendingRequests.A.payload.items.map(item => ({ productId: item.productId, size: item.size,
    toppingIds: [...item.toppingIds].reverse(), currentUnitPrice: 55000 }));
  const currentSubtotal = value.pendingRequests.A.payload.items.reduce((sum, item) => sum + item.qty * 55000, 0);
  return { reason: "TEST_PRICE_REASON", items, currentSubtotal, currentDiscountTotal: 5000, currentTotal: currentSubtotal - 5000, ...changes };
}
const stock = (changes = {}) => ({ reason: "TEST_STOCK_REASON", resources: [{ kind: "PRODUCT", id: "coffee", requested: 1, available: 0 }], ...changes });
const settle = (value, command, reasons = REASONS) => settleCartRejectionV2(value, command, reasons);
class Locks {
  held = false; tail = Promise.resolve();
  request(name, options, action) {
    assert.equal(name, CART_LOCK_NAME); assert.equal(options.mode, "exclusive");
    const result = this.tail.then(() => { options.signal.throwIfAborted(); this.held = true;
      try { return action(); } finally { this.held = false; } });
    this.tail = result.catch(() => {}); return result;
  }
}
function setup(value = fixture()) {
  const locks = new Locks(), memory = { raw: typeof value === "string" ? value : encodeCartEnvelopeV2(value), writes: 0, failWrite: false };
  const storage = { getItem(key) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true); return memory.raw; },
    setItem(key, raw) { assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      if (memory.failWrite) throw new Error("quota"); memory.raw = raw; memory.writes++; } };
  return { service: createCartStorage({ storage, locks }), memory, locks, storage };
}
function unknown(value, command, reasons = REASONS) {
  const result = settle(value, command, reasons);
  assert.equal(result.outcome.kind, "UNKNOWN"); assert.equal(result.requiresConfirmation, false);
  assert.deepEqual(result.envelope.cart, value.cart);
  assert.deepEqual(result.envelope.pendingRequests.A, { ...value.pendingRequests.A, phase: "UNKNOWN" });
  return result;
}

test("valid v2 validation rejection ends only its pending and preserves exact cart/body inputs", async () => {
  const value = fixture(), before = JSON.stringify(value), command = reply();
  command.body.error.fieldErrors = { "items[0].toppingIds": ["Không áp dụng."], promotionCode: ["Kiểm tra mã."] };
  const { service, memory, locks } = setup(value);
  const result = await service.settleRejectionV2(command, current);
  assert.equal(result.outcome.kind, "REJECTED"); assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.envelope.pendingRequests, {}); assert.deepEqual(result.envelope.cart, value.cart);
  assert.equal(memory.writes, 1); assert.equal(locks.held, false); assert.equal(JSON.stringify(value), before);
  command.body.error.fieldErrors["items[0].toppingIds"][0] = "changed";
  assert.equal(result.outcome.fieldErrors["items[0].toppingIds"][0], "Không áp dụng.");
});

test("malformed validation envelope, index or message never releases pending", () => {
  for (const error of [{ code: "VALIDATION_ERROR", message: "" }, { code: "VALIDATION_ERROR", message: "bad", fieldErrors: { "items[1].qty": ["bad"] } },
    { code: "VALIDATION_ERROR", message: "bad", fieldErrors: { "items[0].qty": [] } },
    { code: "VALIDATION_ERROR", message: "bad", fieldErrors: { "items[0].qty": "bad" } },
    { code: "VALIDATION_ERROR", message: "bad", details: { reason: "unknown" } }]) {
    unknown(fixture(), reply("VALIDATION_ERROR", undefined, { body: { error } }));
  }
  unknown(fixture(), reply("VALIDATION_ERROR", undefined, { status: 500 }));
});

test("all five agreed promotion reasons end pending without silently removing promo or changing cart", () => {
  for (const reason of ["NOT_FOUND", "INACTIVE", "NOT_STARTED", "EXPIRED", "MINIMUM_NOT_MET"]) {
    const value = fixture(); const before = JSON.stringify(value.pendingRequests.A.payload);
    const result = settle(value, reply("PROMOTION_NOT_APPLICABLE", { reason }));
    assert.equal(result.outcome.kind, "PROMOTION_NOT_APPLICABLE"); assert.equal(result.outcome.reason, reason);
    assert.equal(result.requiresConfirmation, true); assert.deepEqual(result.envelope.cart, value.cart);
    assert.deepEqual(result.envelope.pendingRequests, {}); assert.equal(JSON.stringify(value.pendingRequests.A.payload), before);
  }
});

test("unknown promotion reasons or a rejection for an absent promotion stay uncertain", () => {
  for (const reason of ["NEW_REASON", "expired", "", null, 0]) unknown(fixture(), reply("PROMOTION_NOT_APPLICABLE", { reason }));
  unknown(fixture("A", { promotionCode: null }), reply("PROMOTION_NOT_APPLICABLE", { reason: "NOT_FOUND" }));
});

test("checkout changes require an agreed reason; empty defaults never invent a reason contract", () => {
  const value = fixture(), command = reply("CHECKOUT_CHANGED", checkout());
  unknown(value, command, { checkoutChanged: [], outOfStock: [] });
  assert.equal(settleCartRejectionV2(value, command).outcome.kind, "UNKNOWN");
  unknown(value, reply("CHECKOUT_CHANGED", checkout(value, { reason: "unknown" })));
  const result = settle(value, command);
  assert.equal(result.outcome.kind, "CHECKOUT_CHANGED"); assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.pendingRequests, {});
  assert.equal(result.outcome.details.currentTotal, 50000);
});

test("checkout price hints match every original configuration despite row/topping order", () => {
  const value = fixture("A", { multi: true }), details = checkout(value); details.items.reverse();
  const result = settle(value, reply("CHECKOUT_CHANGED", details));
  assert.equal(result.outcome.kind, "CHECKOUT_CHANGED"); assert.deepEqual(result.envelope.cart, value.cart);
  assert.equal(result.outcome.details.currentSubtotal, 165000);
  details.items[0].currentUnitPrice = 1;
  assert.equal(result.outcome.details.items[0].currentUnitPrice, 55000);
});

test("agreed backend price reasons release only the rejected pending without repricing its cart", () => {
  for (const reason of ["PRODUCT_PRICE_CHANGED", "EXPECTED_TOTAL_MISMATCH"]) {
    const value = fixture(), before = JSON.stringify(value);
    const details = checkout(value, { reason });
    if (reason === "EXPECTED_TOTAL_MISMATCH") {
      details.items[0].currentUnitPrice = 50000;
      Object.assign(details, { currentSubtotal: 50000, currentDiscountTotal: 4000, currentTotal: 46000 });
    }
    const result = settle(value, reply("CHECKOUT_CHANGED", details), ORDER_REJECTION_REASONS_V2);
    assert.equal(result.outcome.kind, "CHECKOUT_CHANGED");
    assert.equal(result.outcome.details.reason, reason);
    assert.equal(result.requiresConfirmation, true);
    assert.deepEqual(result.envelope.cart, value.cart);
    assert.deepEqual(result.envelope.pendingRequests, {});
    assert.equal(JSON.stringify(value), before);
  }
});

test("agreed price reason must match the saved request and line-price precedence", () => {
  const value = fixture();
  const totalOnly = checkout(value, { reason: "PRODUCT_PRICE_CHANGED", currentSubtotal: 50000,
    currentDiscountTotal: 4000, currentTotal: 46000 });
  totalOnly.items[0].currentUnitPrice = 50000;
  unknown(value, reply("CHECKOUT_CHANGED", totalOnly), ORDER_REJECTION_REASONS_V2);
  unknown(value, reply("CHECKOUT_CHANGED", checkout(value, { reason: "EXPECTED_TOTAL_MISMATCH" })), ORDER_REJECTION_REASONS_V2);
  const unchanged = { ...totalOnly, reason: "EXPECTED_TOTAL_MISMATCH", currentDiscountTotal: 5000, currentTotal: 45000 };
  unknown(value, reply("CHECKOUT_CHANGED", unchanged), ORDER_REJECTION_REASONS_V2);
  const compensated = checkout(value, { reason: "PRODUCT_PRICE_CHANGED", currentDiscountTotal: 10000, currentTotal: 45000 });
  assert.equal(settle(value, reply("CHECKOUT_CHANGED", compensated), ORDER_REJECTION_REASONS_V2).outcome.kind, "CHECKOUT_CHANGED");
});

test("agreed reasons exclude old proposals; backend stock evidence must match the saved request", () => {
  unknown(fixture(), reply("CHECKOUT_CHANGED", checkout(fixture(), { reason: "PRICE_OR_TOTAL_CHANGED" })), ORDER_REJECTION_REASONS_V2);
  for (const reason of ["INSUFFICIENT_PRODUCT_STOCK"]) {
    unknown(fixture(), reply("OUT_OF_STOCK", stock({ reason })), ORDER_REJECTION_REASONS_V2);
  }
});

test("backend stock reason resolves only a proven shortage of the requested products", () => {
  const value = fixture(), details = stock({ reason: "INSUFFICIENT_STOCK" });
  const result = settle(value, reply("OUT_OF_STOCK", details), ORDER_REJECTION_REASONS_V2);
  assert.equal(result.outcome.kind, "OUT_OF_STOCK"); assert.deepEqual(result.envelope.cart, value.cart);
  assert.deepEqual(result.envelope.pendingRequests, {});
  for (const changes of [{ id: "foreign" }, { requested: 20 }, { available: details.resources[0].requested }]) {
    const invalid = structuredClone(details); Object.assign(invalid.resources[0], changes);
    unknown(value, reply("OUT_OF_STOCK", invalid), ORDER_REJECTION_REASONS_V2);
  }
});

test("checkout subtotal, discount, positive total and all line arithmetic must agree", () => {
  for (const changes of [{ currentSubtotal: 55001 }, { currentDiscountTotal: 5001 }, { currentTotal: 50001 },
    { currentDiscountTotal: -1 }, { currentTotal: 0 }, { currentTotal: "50000" }, { currentSubtotal: 2147483648 },
    { currentDiscountTotal: 60000, currentTotal: 1 }]) {
    unknown(fixture(), reply("CHECKOUT_CHANGED", checkout(fixture(), changes)));
  }
  const unchanged = checkout(fixture(), { currentSubtotal: 50000, currentDiscountTotal: 5000, currentTotal: 45000 });
  unchanged.items[0].currentUnitPrice = 50000;
  unknown(fixture(), reply("CHECKOUT_CHANGED", unchanged));
});

test("checkout hints reject missing/duplicate/foreign configurations and malformed toppings", () => {
  const value = fixture("A", { multi: true });
  for (const change of [d => { d.items.pop(); }, d => { d.items[1] = structuredClone(d.items[0]); },
    d => { d.items[0].productId = "foreign"; }, d => { d.items[0].size = "XL"; },
    d => { d.items[0].toppingIds = ["milk", "milk"]; }, d => { d.items[0].toppingIds = ["other"]; },
    d => { d.items[0].currentUnitPrice = 2147483647; }]) {
    const details = checkout(value); change(details); unknown(value, reply("CHECKOUT_CHANGED", details));
  }
});

test("a total-only checkout change is valid without guessing the server promotion formula", () => {
  const value = fixture(), details = checkout(value, { currentSubtotal: 50000, currentDiscountTotal: 4000, currentTotal: 46000 });
  details.items[0].currentUnitPrice = 50000;
  const result = settle(value, reply("CHECKOUT_CHANGED", details));
  assert.equal(result.outcome.kind, "CHECKOUT_CHANGED"); assert.equal(result.outcome.details.currentTotal, 46000);
});

test("stock rejection aggregates the same Product across size/topping rows", () => {
  const value = fixture("A", { multi: true });
  const result = settle(value, reply("OUT_OF_STOCK", stock({ resources: [{ kind: "PRODUCT", id: "coffee", requested: 3, available: 2 }] })));
  assert.equal(result.outcome.kind, "OUT_OF_STOCK"); assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.pendingRequests, {});
});

test("stock shortages need an agreed reason and a genuine shortage for this exact request", () => {
  const value = fixture(); unknown(value, reply("OUT_OF_STOCK", stock()), { checkoutChanged: [], outOfStock: [] });
  for (const details of [stock({ reason: "unknown" }), stock({ resources: [] }),
    stock({ resources: [{ kind: "TOPPING", id: "milk", requested: 1, available: 0 }] }),
    stock({ resources: [{ kind: "PRODUCT", id: "foreign", requested: 1, available: 0 }] }),
    stock({ resources: [{ kind: "PRODUCT", id: "coffee", requested: 2, available: 0 }] }),
    stock({ resources: [{ kind: "PRODUCT", id: "coffee", requested: 1, available: 1 }] }),
    stock({ resources: [{ kind: "PRODUCT", id: "coffee", requested: 1, available: -1 }] }),
    stock({ resources: [{ kind: "PRODUCT", id: "coffee", requested: 1, available: "0" }] }),
    stock({ resources: [stock().resources[0], stock().resources[0]] })]) unknown(value, reply("OUT_OF_STOCK", details));
});

test("server details may carry extra metadata, but only checked review fields reach the caller", () => {
  const value = fixture(), details = checkout(); details.debug = "do not publish";
  const result = settle(value, reply("CHECKOUT_CHANGED", details));
  assert.equal(result.outcome.kind, "CHECKOUT_CHANGED"); assert.equal(Object.hasOwn(result.outcome.details, "debug"), false);
});

test("auth, conflict, in-progress, retry-exhausted, network and malformed responses keep immutable identity", () => {
  for (const [status, errorCode] of [[401, "SESSION_EXPIRED"], [403, "REQUEST_FORBIDDEN"], [404, "RESOURCE_NOT_FOUND"],
    [409, "IDEMPOTENCY_CONFLICT"], [409, "ORDER_REQUEST_IN_PROGRESS"], [413, "PAYLOAD_TOO_LARGE"],
    [503, "TRANSACTION_RETRY_EXHAUSTED"], [502, "UPSTREAM_UNAVAILABLE"], [504, "UPSTREAM_TIMEOUT"]]) {
    unknown(fixture(), reply(errorCode, undefined, { status }));
  }
  for (const body of [null, "html", {}, { error: { code: "VALIDATION_ERROR" } }]) unknown(fixture(), reply("VALIDATION_ERROR", undefined, { body }));
  unknown(fixture(), { ownerId: "A", requestKey: KEY, status: null, body: null });
});

test("a successful PENDING response cannot pass through rejection settlement or clear a cart", () => {
  for (const v1 of [true, false]) {
    const value = fixture("A", { v1 });
    unknown(value, reply("unused", undefined, { status: 201, body: { id: "order", status: "PENDING", total: v1 ? 50000 : 45000 } }));
  }
});

test("v1 PRICE_CHANGED retains baseline details and reprices the matching cart only", () => {
  const value = fixture("A", { v1: true }), source = value.pendingRequests.A.payload.items[0];
  const result = settle(value, reply("PRICE_CHANGED", { items: [{ ...source, currentUnitPrice: 55000, currentLineTotal: 55000 }], currentTotal: 55000 }));
  assert.equal(result.outcome.kind, "PRICE_CHANGED"); assert.equal(result.cartEffect, "REPRICED");
  assert.equal(result.envelope.cart.items[0].previewUnitPrice, 55000); assert.equal(result.envelope.cart.revision, value.cart.revision + 1);
  assert.equal(value.pendingRequests.A.payload.items[0].expectedUnitPrice, 50000);
  unknown(fixture(), reply("PRICE_CHANGED", { items: [{ ...source, currentUnitPrice: 55000, currentLineTotal: 55000 }], currentTotal: 55000 }));
});

test("migrated v1 validation still restores an empty same-owner cart but never a logged-out cart", () => {
  const value = fixture("A", { v1: true }); value.cart = { ownerId: "A", revision: 5, items: [] };
  const result = settle(value, reply());
  assert.equal(result.cartEffect, "RESTORED"); assert.equal(result.envelope.cart.items.length, 1); assert.equal(result.envelope.cart.revision, 6);
  value.cart.ownerId = null;
  assert.deepEqual(settle(value, reply()).envelope.cart, value.cart);
});

test("v2 rejections never overwrite a newer cart or resurrect a cleared cart after logout", () => {
  for (const change of [v => { v.cart.ownerId = "B"; }, v => { v.cart = { ownerId: "A", revision: 5, items: [] }; },
    v => { v.cart = { ownerId: null, revision: 5, items: [] }; }, v => { v.cart.items[0].qty = 2; v.cart.revision++; }]) {
    const value = fixture(); change(value); const before = structuredClone(value.cart);
    const result = settle(value, reply("PROMOTION_NOT_APPLICABLE", { reason: "EXPIRED" }));
    assert.deepEqual(result.envelope.cart, before); assert.deepEqual(result.envelope.pendingRequests, {});
  }
});

test("wrong owner/key, repeated and late rejection leave newer pending and storage untouched", async () => {
  const { service, memory } = setup(); const raw = memory.raw;
  for (const changes of [{ ownerId: "B" }, { requestKey: KEY2 }]) {
    assert.equal((await service.settleRejectionV2(reply("VALIDATION_ERROR", undefined, changes), current)).outcome.kind, "IGNORED");
  }
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  await service.settleRejectionV2(reply(), current); const settled = memory.raw;
  assert.equal((await service.settleRejectionV2(reply(), current)).outcome.kind, "IGNORED");
  assert.equal(memory.raw, settled); assert.equal(memory.writes, 1);
});

test("a known creation acknowledgement cannot be undone by a later error for that same key", () => {
  const value = fixture(); value.lastOrderResult = { ownerId: "A", requestKey: KEY, confirmedAt: TIME,
    order: { id: "order", status: "PENDING", total: 45000 } };
  assert.equal(settle(value, reply()).envelope, value);
});

test("another owner's pending/result/binding/recovery survive this owner's rejection", () => {
  const value = fixture(), other = fixture("B"); value.pendingRequests.B = other.pendingRequests.B;
  value.lastOrderResult = { ownerId: "B", requestKey: KEY, confirmedAt: TIME, order: { id: "order-b", status: "PENDING", total: 45000 } };
  value.checkoutBindings.B = { ownerId: "B", orderId: "order-b", cartRevision: other.cart.revision, cartSnapshot: other.cart, orderVersion: 0, boundAt: TIME };
  value.paymentRecoveries.B = { [KEY]: { ownerId: "B", requestKey: KEY, body: { orderId: "order-b", method: "CARD" }, createdAt: TIME, paymentId: null, recoveryStatus: "UNRESOLVED" } };
  const result = settle(value, reply());
  assert.deepEqual(result.envelope.pendingRequests.B, value.pendingRequests.B); assert.deepEqual(result.envelope.lastOrderResult, value.lastOrderResult);
  assert.deepEqual(result.envelope.checkoutBindings, value.checkoutBindings); assert.deepEqual(result.envelope.paymentRecoveries, value.paymentRecoveries);
});

test("v1 rejection cannot reprice a cart protected by an existing checkout binding", () => {
  const value = fixture("A", { v1: true }); value.checkoutBindings.A = { ownerId: "A", orderId: "old-order", cartRevision: value.cart.revision,
    cartSnapshot: structuredClone(value.cart), orderVersion: 0, boundAt: TIME };
  const source = value.pendingRequests.A.payload.items[0];
  const result = settle(value, reply("PRICE_CHANGED", { items: [{ ...source, currentUnitPrice: 55000, currentLineTotal: 55000 }], currentTotal: 55000 }));
  assert.deepEqual(result.envelope.cart, value.cart); assert.deepEqual(result.envelope.checkoutBindings, value.checkoutBindings);
});

test("quota errors do not publish an unlocked/repriced cart or lose saved pending", async () => {
  const { service, memory } = setup(); memory.failWrite = true; const raw = memory.raw;
  await assert.rejects(service.settleRejectionV2(reply(), current), code("STORAGE_UNAVAILABLE"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("changed or asynchronous session checks reject settlement before persistence", async () => {
  for (const guard of [() => false, async () => true, (() => { let calls = 0; return () => ++calls === 1; })()]) {
    const { service, memory } = setup(); const raw = memory.raw;
    await assert.rejects(service.settleRejectionV2(reply(), guard), code("OWNER_MISMATCH"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("queued operations capture both response and pinned reason allowlists", async () => {
  const { service } = setup(), command = reply("CHECKOUT_CHANGED", checkout()), reasons = structuredClone(REASONS);
  const saved = service.settleRejectionV2(command, current, reasons);
  command.body.error.details.currentTotal = 1; reasons.checkoutChanged.length = 0;
  const result = await saved; assert.equal(result.outcome.kind, "CHECKOUT_CHANGED"); assert.equal(result.outcome.details.currentTotal, 50000);
});

test("two tabs settle the same rejection with one durable pending removal", async () => {
  const { service, storage, locks, memory } = setup(); const other = createCartStorage({ storage, locks });
  const results = await Promise.all([service.settleRejectionV2(reply(), current), other.settleRejectionV2(reply(), current)]);
  assert.equal(results.filter(result => result.outcome.kind === "REJECTED").length, 1); assert.equal(memory.writes, 1);
});

test("prototype-like owners remain own entries; malformed storage and missing locks fail closed", async () => {
  for (const ownerId of ["__proto__", "constructor", "toString"]) {
    const value = fixture(ownerId); const result = settle(value, reply("VALIDATION_ERROR", undefined, { ownerId }));
    assert.equal(result.outcome.kind, "REJECTED"); assert.deepEqual(result.envelope.cart, value.cart);
    assert.equal(Object.hasOwn(result.envelope.pendingRequests, ownerId), false);
  }
  const bad = setup('{"schemaVersion":2}');
  await assert.rejects(bad.service.settleRejectionV2(reply(), current), code("INVALID_DATA")); assert.equal(bad.memory.writes, 0);
  const { storage, memory } = setup();
  await assert.rejects(createCartStorage({ storage, locks: undefined }).settleRejectionV2(reply(), current), code("LOCK_UNAVAILABLE"));
  assert.equal(memory.writes, 0);
});

test("malformed reason configuration never becomes an authorization to discard pending", () => {
  for (const reasons of [null, {}, { checkoutChanged: [undefined], outOfStock: [] }]) {
    assert.throws(() => settle(fixture(), reply(), reasons), code("INVALID_DATA"));
  }
});
