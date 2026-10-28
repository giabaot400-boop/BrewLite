import assert from "node:assert/strict";
import test from "node:test";
import {
  cartReducer, createInitialCartState, getCartLineKey,
  MAX_CART_MONEY, selectCartQuantity, selectCartTotal,
} from "./cart-reducer.ts";

function draft(overrides = {}) {
  return {
    productId: "coffee-milk", productName: "Cà phê sữa",
    imageUrl: "/images/coffee-milk.svg", size: "M",
    toppingIds: ["cream"], toppingNames: { cream: "Kem" },
    previewUnitPrice: 47000, ...overrides,
  };
}

function add(state, item = draft()) {
  return cartReducer(state, { type: "ADD_ITEM", item });
}

function key(state, index = 0) {
  return getCartLineKey(state.cart.items[index]);
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("guest adds one cup without mutating state or input", () => {
  const before = deepFreeze(createInitialCartState());
  const item = deepFreeze(draft());
  const after = add(before, item);
  assert.equal(after.cart.ownerId, null);
  assert.equal(after.cart.revision, 1);
  assert.equal(after.cart.items[0].qty, 1);
  assert.equal(after.cart.items[0].previewUnitPrice, 47000);
  assert.equal(before.cart.items.length, 0);
});

test("same configuration merges regardless of topping order", () => {
  const item = draft({ toppingIds: ["pearl", "cream"],
    toppingNames: { pearl: "Trân châu", cream: "Kem" }, previewUnitPrice: 52000 });
  const first = add(createInitialCartState(), item);
  const after = add(first, { ...item, toppingIds: ["cream", "pearl"] });
  assert.equal(after.cart.items.length, 1);
  assert.equal(after.cart.items[0].qty, 2);
  assert.deepEqual(after.cart.items[0].toppingIds, ["cream", "pearl"]);
});

test("different product, size, or topping set creates distinct rows", () => {
  let state = add(createInitialCartState());
  state = add(state, draft({ productId: "americano" }));
  state = add(state, draft({ size: "L" }));
  state = add(state, draft({ toppingIds: [], toppingNames: {} }));
  assert.equal(state.cart.items.length, 4);
  assert.equal(selectCartQuantity(state.cart), 4);
});

test("opaque IDs with delimiters cannot collide; IDs are not trimmed", () => {
  const first = draft({ productId: "a|M", size: "S", toppingIds: ["x|y"],
    toppingNames: { "x|y": "A" } });
  const second = draft({ productId: "a", size: "M", toppingIds: ["S|x", "y"],
    toppingNames: { "S|x": "B", y: "C" } });
  assert.notEqual(getCartLineKey(first), getCartLineKey(second));
  assert.notEqual(getCartLineKey(first), getCartLineKey({ ...first, productId: " a|M" }));
  assert.notEqual(getCartLineKey(draft({ toppingIds: ["a,b"] })),
    getCartLineKey(draft({ toppingIds: ["a", "b"] })));
});

test("increment/decrement changes one cup; decrement at one is a no-op", () => {
  const first = add(createInitialCartState());
  const increased = cartReducer(first, { type: "INCREMENT", lineKey: key(first) });
  assert.equal(increased.cart.items[0].qty, 2);
  const decreased = cartReducer(increased, { type: "DECREMENT", lineKey: key(first) });
  assert.equal(decreased.cart.items[0].qty, 1);
  const minimum = cartReducer(decreased, { type: "DECREMENT", lineKey: key(first) });
  assert.strictEqual(minimum, decreased);
});

test("removal targets exactly one row; final removal leaves zero totals", () => {
  let state = add(add(createInitialCartState()), draft({ size: "L" }));
  const remainingKey = key(state, 1);
  state = cartReducer(state, { type: "REMOVE_ITEM", lineKey: key(state) });
  assert.equal(state.cart.items.length, 1);
  assert.equal(key(state), remainingKey);
  state = cartReducer(state, { type: "REMOVE_ITEM", lineKey: remainingKey });
  assert.equal(selectCartQuantity(state.cart), 0);
  assert.equal(selectCartTotal(state.cart), 0);
});

test("subtotal is sum of line prices times quantities; badge is cups", () => {
  let state = add(add(createInitialCartState()));
  state = add(state, draft({ productId: "peach-tea", previewUnitPrice: 39000 }));
  assert.equal(state.cart.items.length, 2);
  assert.equal(selectCartQuantity(state.cart), 3);
  assert.equal(selectCartTotal(state.cart), 133000);
});

test("both merge and increment reject cup 21 with unchanged cart/revision", () => {
  let state = createInitialCartState();
  for (let i = 0; i < 20; i++) state = add(state);
  for (const action of [{ type: "ADD_ITEM", item: draft() },
    { type: "INCREMENT", lineKey: key(state) }]) {
    const rejected = cartReducer(state, action);
    assert.equal(rejected.error.code, "MAX_QUANTITY");
    assert.strictEqual(rejected.cart, state.cart);
    assert.equal(rejected.cart.items[0].qty, 20);
  }
});

test("20 configurations allowed; row 21 rejected but existing row still merges", () => {
  let state = createInitialCartState();
  for (let i = 0; i < 20; i++) state = add(state, draft({ productId: `p${i}` }));
  const rejected = add(state, draft({ productId: "p20" }));
  assert.equal(rejected.error.code, "MAX_ITEMS");
  assert.strictEqual(rejected.cart, state.cart);
  const merged = add(rejected, draft({ productId: "p0" }));
  assert.equal(merged.error, null);
  assert.equal(merged.cart.items.length, 20);
  assert.equal(selectCartQuantity(merged.cart), 21);
});

test("invalid draft data rejected without coercion or partial mutation", () => {
  const state = createInitialCartState();
  for (const invalid of [
    { previewUnitPrice: -1 }, { previewUnitPrice: 1.5 },
    { previewUnitPrice: "47000" }, { previewUnitPrice: NaN },
    { previewUnitPrice: Infinity }, { previewUnitPrice: MAX_CART_MONEY + 1 },
    { size: "XL" }, { productId: "" }, { productId: 10 },
    { toppingIds: ["cream", "cream"] }, { toppingIds: [""] },
    { toppingIds: [1] }, { toppingNames: {} },
  ]) {
    const rejected = add(state, draft(invalid));
    assert.equal(rejected.error.code, "INVALID_ITEM");
    assert.strictEqual(rejected.cart, state.cart);
  }
});

test("PostgreSQL Int bound applies to each line and full subtotal", () => {
  const exact = add(createInitialCartState(), draft({ previewUnitPrice: MAX_CART_MONEY }));
  assert.equal(selectCartTotal(exact.cart), MAX_CART_MONEY);
  assert.equal(exact.error, null);
  const lineOverflow = add(exact, draft());
  assert.equal(lineOverflow.error.code, "PRICE_OVERFLOW");
  assert.strictEqual(lineOverflow.cart, exact.cart);
  const incrementOverflow = cartReducer(exact, { type: "INCREMENT", lineKey: key(exact) });
  assert.equal(incrementOverflow.error.code, "PRICE_OVERFLOW");
  const totalOverflow = add(exact, draft({ productId: "other", previewUnitPrice: 1 }));
  assert.equal(totalOverflow.error.code, "PRICE_OVERFLOW");
  assert.strictEqual(totalOverflow.cart, exact.cart);
});

test("no-topping and zero-price configurations remain valid", () => {
  const state = add(createInitialCartState(), draft({ toppingIds: [], toppingNames: {},
    previewUnitPrice: 0 }));
  assert.equal(state.error, null);
  assert.equal(selectCartQuantity(state.cart), 1);
  assert.equal(selectCartTotal(state.cart), 0);
});

test("missing target does not change cart or revision", () => {
  const state = add(createInitialCartState());
  for (const type of ["INCREMENT", "DECREMENT", "REMOVE_ITEM"]) {
    assert.strictEqual(cartReducer(state, { type, lineKey: "missing" }), state);
  }
});

test("adding same configuration preserves existing preview until explicit repricing", () => {
  const state = add(createInitialCartState());
  const after = add(state, draft({ previewUnitPrice: 49000 }));
  assert.equal(after.cart.items.length, 1);
  assert.equal(after.cart.items[0].previewUnitPrice, 47000);
  assert.equal(after.cart.items[0].qty, 2);
});

test("cart owner is preserved and error is cleared by next valid edit", () => {
  const initial = createInitialCartState();
  const owned = { ...initial, cart: { ...initial.cart, ownerId: "user-a" } };
  const rejected = add(owned, draft({ previewUnitPrice: -1 }));
  const accepted = add(rejected);
  assert.equal(accepted.cart.ownerId, "user-a");
  assert.equal(accepted.error, null);
  assert.equal(accepted.cart.revision, 1);
});

test("stored line does not retain mutable aliases to draft topping data", () => {
  const item = draft();
  const state = add(createInitialCartState(), item);
  item.toppingIds.push("pearl");
  item.toppingNames.cream = "changed";
  assert.deepEqual(state.cart.items[0].toppingIds, ["cream"]);
  assert.equal(state.cart.items[0].toppingNames.cream, "Kem");
});
