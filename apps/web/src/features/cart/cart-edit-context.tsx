"use client";

import { createContext, useContext } from "react";
import type { CartLineDraft } from "./types";
import type { CartViewState } from "./cart-view";

/** Menu/badge editing surface shared by v1 and v2; checkout stays version-specific. */
export type CartEditingValue = {
  state: CartViewState;
  canMutate: boolean;
  addItem: (item: CartLineDraft) => Promise<boolean>;
  increment: (lineKey: string) => Promise<boolean>;
  decrement: (lineKey: string) => Promise<boolean>;
  removeItem: (lineKey: string) => Promise<boolean>;
  reload: () => Promise<void>;
};
export const CartEditingContext = createContext<CartEditingValue | null>(null);
export function useCartEditing(): CartEditingValue {
  const value = useContext(CartEditingContext);
  if (!value) throw new Error("useCartEditing phải nằm trong provider giỏ đang hoạt động.");
  return value;
}
