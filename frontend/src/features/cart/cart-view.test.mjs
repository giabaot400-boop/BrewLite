import assert from "node:assert/strict";
import test from "node:test";
import { createInitialCartState } from "./cart-reducer.ts";
import { cartViewReducer, createCartViewState } from "./cart-view.ts";
import { buildProductCartDraft } from "./product-cart-draft.ts";

function product() {
  return { id: "coffee-milk", name: "Cà phê sữa", imageUrl: "/images/coffee-milk.svg", description: "",
    price: 35000, sizes: [{ code: "S", extraPrice: 0 }, { code: "M", extraPrice: 5000 },
      { code: "L", extraPrice: 10000 }],
    toppings: [{ id: "cream", name: "Kem", price: 7000 }, { id: "pearl", name: "Trân châu", price: 5000 }] };
}

test("UI starts unhydrated with an unknown cart instead of an empty saved snapshot", () => {
  const state = createCartViewState();
  assert.equal(state.status, "restoring"); assert.equal(state.cart, null);
});

test("validated guest snapshot becomes ready", () => {
  const cart = createInitialCartState().cart;
  const state = cartViewReducer(createCartViewState(), { type: "SNAPSHOT", sequence: 1, cart });
  assert.equal(state.status, "ready"); assert.strictEqual(state.cart, cart);
});

test("older read cannot replace a newer mutation result", () => {
  const cart = createInitialCartState().cart;
  const current = cartViewReducer(createCartViewState(), { type: "SNAPSHOT", sequence: 5, cart });
  assert.strictEqual(cartViewReducer(current, { type: "SNAPSHOT", sequence: 4,
    cart: { ...cart, revision: 99 } }), current);
  assert.strictEqual(cartViewReducer(current, { type: "FAILED", sequence: 3, message: "stale" }), current);
});

test("refresh while saving stays busy until the write actually finishes", () => {
  const cart = createInitialCartState().cart;
  let state = cartViewReducer(createCartViewState(), { type: "SNAPSHOT", sequence: 1, cart });
  state = cartViewReducer(state, { type: "WRITE_STARTED", sequence: 2 });
  state = cartViewReducer(state, { type: "READ_STARTED", sequence: 3 });
  assert.equal(state.isSaving, true); assert.equal(state.cart, null);
  state = cartViewReducer(state, { type: "SNAPSHOT", sequence: 3, cart });
  assert.equal(state.isSaving, true);
  state = cartViewReducer(state, { type: "WRITE_FINISHED" });
  assert.equal(state.isSaving, false); assert.equal(state.status, "ready");
});

test("owned cart is hidden because local owner metadata is not authentication", () => {
  const cart = { ...createInitialCartState().cart, ownerId: "user-a" };
  const state = cartViewReducer(createCartViewState(), { type: "SNAPSHOT", sequence: 1, cart });
  assert.equal(state.status, "locked"); assert.equal(state.cart, null);
});

test("failed refresh hides stale totals; retry can recover without clearing storage", () => {
  const cart = createInitialCartState().cart;
  let state = cartViewReducer(createCartViewState(), { type: "SNAPSHOT", sequence: 1, cart });
  state = cartViewReducer(state, { type: "FAILED", sequence: 2, message: "storage error" });
  assert.equal(state.cart, null); assert.equal(state.status, "error");
  state = cartViewReducer(state, { type: "SNAPSHOT", sequence: 3, cart });
  assert.equal(state.status, "ready"); assert.equal(state.message, null);
});

test("business rejection can show its message while retaining the validated cart", () => {
  const cart = createInitialCartState().cart;
  const state = cartViewReducer(createCartViewState(), { type: "SNAPSHOT", sequence: 1,
    cart, message: "Mỗi cấu hình tối đa 20 ly." });
  assert.equal(state.status, "ready"); assert.strictEqual(state.cart, cart);
  assert.ok(state.message);
});

test("product draft uses ProductDetail prices for S/M/L and toppings", () => {
  assert.equal(buildProductCartDraft(product(), "S", []).previewUnitPrice, 35000);
  assert.equal(buildProductCartDraft(product(), "M", ["cream"]).previewUnitPrice, 47000);
  assert.equal(buildProductCartDraft(product(), "L", ["pearl", "cream"]).previewUnitPrice, 57000);
});

test("reordered topping selection yields the same draft without mutating inputs", () => {
  const p = product(); const ids = ["pearl", "cream"];
  const before = structuredClone(p);
  const first = buildProductCartDraft(p, "L", ids);
  const second = buildProductCartDraft(p, "L", ["cream", "pearl"]);
  assert.deepEqual(first, second); assert.deepEqual(ids, ["pearl", "cream"]);
  assert.deepEqual(p, before);
  assert.deepEqual(first.toppingNames, { cream: "Kem", pearl: "Trân châu" });
});

test("unknown/duplicate choices or invalid price never produce an addable draft", () => {
  assert.equal(buildProductCartDraft(product(), "XL", []), null);
  assert.equal(buildProductCartDraft(product(), "M", ["missing"]), null);
  assert.equal(buildProductCartDraft(product(), "M", ["cream", "cream"]), null);
  for (const price of [-1, 0.5, "35000", Infinity, 2147483648]) {
    assert.equal(buildProductCartDraft({ ...product(), price }, "S", []), null);
  }
  assert.equal(buildProductCartDraft({ ...product(), price: 2147483647 }, "M", []), null);
});
