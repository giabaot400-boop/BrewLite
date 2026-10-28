"use client";

import Link from "next/link";
import { selectCartQuantity } from "../cart-reducer";
import { useCart } from "../cart-provider";

export function CartBadge() {
  const { state } = useCart();
  const quantity = state.status === "ready" && state.cart !== null ? selectCartQuantity(state.cart) : null;
  const label = quantity === null ? "Giỏ hàng, số lượng chưa xác định" : `Giỏ hàng, ${quantity} ly`;
  return (
    <Link href="/cart" aria-label={label}
      className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee">
      Giỏ hàng <span aria-live="polite" className="ml-1">({quantity === null ? "…" : quantity})</span>
    </Link>
  );
}
