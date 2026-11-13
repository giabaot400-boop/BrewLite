"use client";

import Link from "next/link";
import { selectCartQuantity } from "../cart-reducer";
import { useCartEditing } from "../cart-edit-context";

export function CartBadge() {
  const { state } = useCartEditing();
  const quantity = state.status === "ready" && state.cart !== null ? selectCartQuantity(state.cart) : null;
  const quantityLabel = quantity === null ? "số lượng chưa xác định" : `${quantity} ly`;
  return (
    <>
      <Link href="/cart"
        className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee">
        Giỏ hàng <span aria-hidden="true" className="ml-1">({quantity === null ? "…" : quantity})</span>
        <span className="sr-only">, {quantityLabel}</span>
      </Link>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {quantity === null ? "" : `Giỏ hàng hiện có ${quantity} ly.`}
      </span>
    </>
  );
}
