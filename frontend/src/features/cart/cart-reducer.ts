import type { Cart, CartAction, CartError, CartLine, CartLineDraft, CartState } from "./types";

export const MAX_CART_ITEMS = 20;
export const MAX_CART_QUANTITY = 20;
export const MAX_CART_MONEY = 2_147_483_647;

export function createInitialCartState(): CartState {
  return { cart: { ownerId: null, revision: 0, items: [] }, error: null };
}

// JSON tuple keeps opaque IDs distinct even when they contain punctuation.
// Default sort compares UTF-16 code units, as specified in P06.
export function getCartLineKey(
  line: Pick<CartLine, "productId" | "size" | "toppingIds">,
): string {
  return JSON.stringify([line.productId, line.size, [...line.toppingIds].sort()]);
}

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= 0 && value <= MAX_CART_MONEY;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeDraft(draft: CartLineDraft): CartLineDraft | null {
  if (!draft || !isNonEmptyText(draft.productId)
    || !isNonEmptyText(draft.productName) || !isNonEmptyText(draft.imageUrl)
    || !["S", "M", "L"].includes(draft.size)
    || !Array.isArray(draft.toppingIds) || !draft.toppingIds.every(isNonEmptyText)
    || new Set(draft.toppingIds).size !== draft.toppingIds.length
    || !isMoney(draft.previewUnitPrice)
    || !draft.toppingNames || typeof draft.toppingNames !== "object"
    || Array.isArray(draft.toppingNames)) return null;

  if (!draft.toppingIds.every((id) =>
    Object.prototype.hasOwnProperty.call(draft.toppingNames, id)
      && isNonEmptyText(draft.toppingNames[id]))) return null;

  const toppingIds = [...draft.toppingIds].sort();
  return {
    productId: draft.productId,
    productName: draft.productName,
    imageUrl: draft.imageUrl,
    size: draft.size,
    toppingIds,
    toppingNames: Object.fromEntries(toppingIds.map((id) => [id, draft.toppingNames[id]])),
    previewUnitPrice: draft.previewUnitPrice,
  };
}

export function selectCartTotal(cart: Cart): number {
  return cart.items.reduce((total, item) => total + item.previewUnitPrice * item.qty, 0);
}

export function selectCartQuantity(cart: Cart): number {
  return cart.items.reduce((total, item) => total + item.qty, 0);
}

function reject(state: CartState, code: CartError["code"], message: string): CartState {
  return { cart: state.cart, error: { code, message } };
}

function noChange(state: CartState): CartState {
  return state.error ? { cart: state.cart, error: null } : state;
}

function commit(state: CartState, items: readonly CartLine[]): CartState {
  const nextCart = { ...state.cart, revision: state.cart.revision + 1, items };
  if (!isMoney(selectCartTotal(nextCart))) {
    return reject(state, "PRICE_OVERFLOW", "Tổng tiền vượt giới hạn cho phép.");
  }
  return { cart: nextCart, error: null };
}

// Pure domain reducer. A later Provider must validate restored data and run
// mutations against the latest envelope under a Web Lock before publishing UI.
// This reducer does not read/write storage, authenticate users, or send orders.
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const draft = normalizeDraft(action.item);
      if (!draft) return reject(state, "INVALID_ITEM", "Thông tin món không hợp lệ.");

      const key = getCartLineKey(draft);
      const index = state.cart.items.findIndex((item) => getCartLineKey(item) === key);
      if (index >= 0) {
        const existing = state.cart.items[index];
        if (existing.qty >= MAX_CART_QUANTITY) {
          return reject(state, "MAX_QUANTITY", "Mỗi cấu hình tối đa 20 ly.");
        }
        // Adding one cup preserves the row's existing preview. Authoritative
        // repricing is handled later by the explicit PRICE_CHANGED flow.
        return commit(state, state.cart.items.map((item, i) =>
          i === index ? { ...item, qty: item.qty + 1 } : item));
      }

      if (state.cart.items.length >= MAX_CART_ITEMS) {
        return reject(state, "MAX_ITEMS", "Giỏ hàng có tối đa 20 cấu hình khác nhau.");
      }
      return commit(state, [...state.cart.items, { ...draft, qty: 1 }]);
    }
    case "INCREMENT":
    case "DECREMENT":
    case "REMOVE_ITEM": {
      const index = state.cart.items.findIndex((item) =>
        getCartLineKey(item) === action.lineKey);
      if (index < 0) return noChange(state);
      const selected = state.cart.items[index];

      if (action.type === "REMOVE_ITEM") {
        return commit(state, state.cart.items.filter((_, i) => i !== index));
      }
      if (action.type === "DECREMENT" && selected.qty === 1) return noChange(state);
      if (action.type === "INCREMENT" && selected.qty >= MAX_CART_QUANTITY) {
        return reject(state, "MAX_QUANTITY", "Mỗi cấu hình tối đa 20 ly.");
      }
      const delta = action.type === "INCREMENT" ? 1 : -1;
      return commit(state, state.cart.items.map((item, i) =>
        i === index ? { ...item, qty: item.qty + delta } : item));
    }
    default:
      return state;
  }
}
