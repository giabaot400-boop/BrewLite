import type { SizeCode } from "../products/types";

export type CartLine = {
  productId: string;
  productName: string;
  imageUrl: string;
  size: SizeCode;
  toppingIds: readonly string[];
  toppingNames: Readonly<Record<string, string>>;
  previewUnitPrice: number;
  qty: number;
};

export type CartLineDraft = Omit<CartLine, "qty">;

// Persist this part inside the P09 envelope, not CartState.error.
export type Cart = {
  ownerId: string | null;
  revision: number;
  items: readonly CartLine[];
};

export type CartError = {
  code: "INVALID_ITEM" | "MAX_ITEMS" | "MAX_QUANTITY" | "PRICE_OVERFLOW";
  message: string;
};

export type CartState = { cart: Cart; error: CartError | null };

export type CartAction =
  | { type: "ADD_ITEM"; item: CartLineDraft }
  | { type: "INCREMENT"; lineKey: string }
  | { type: "DECREMENT"; lineKey: string }
  | { type: "REMOVE_ITEM"; lineKey: string };
