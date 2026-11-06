import type { Cart } from "./types";

export type CartViewState = {
  sequence: number;
  status: "restoring" | "ready" | "error" | "locked";
  cart: Cart | null;
  isSaving: boolean;
  message: string | null;
};

export type CartViewAction =
  | { type: "READ_STARTED"; sequence: number }
  | { type: "WRITE_STARTED"; sequence: number }
  | { type: "SNAPSHOT"; sequence: number; cart: Cart; message?: string; verifiedOwnerId?: string | null }
  | { type: "LOCKED"; sequence: number; message: string }
  | { type: "FAILED"; sequence: number; message: string }
  | { type: "WRITE_FINISHED" };

export function createCartViewState(): CartViewState {
  return { sequence: 0, status: "restoring", cart: null, isSaving: false, message: null };
}

// verifiedOwnerId is supplied only after the auth bridge verifies identity.
export function cartViewReducer(state: CartViewState, action: CartViewAction): CartViewState {
  if (action.type === "WRITE_FINISHED") return { ...state, isSaving: false };
  if (action.sequence < state.sequence) return state;
  switch (action.type) {
    case "READ_STARTED":
      return { ...state, sequence: action.sequence, status: "restoring", cart: null, message: null };
    case "WRITE_STARTED":
      return { ...state, sequence: action.sequence, isSaving: true, message: null };
    case "SNAPSHOT":
      if (action.cart.ownerId !== (action.verifiedOwnerId ?? null)) {
        return { ...state, sequence: action.sequence, status: "locked", cart: null,
          message: "Giỏ này cần xác nhận tài khoản trước khi tiếp tục." };
      }
      return { ...state, sequence: action.sequence, status: "ready", cart: action.cart,
        message: action.message ?? null };
    case "FAILED":
      return { ...state, sequence: action.sequence, status: "error", cart: null, message: action.message };
    case "LOCKED":
      return { ...state, sequence: action.sequence, status: "locked", cart: null, message: action.message };
    default:
      return state;
  }
}
