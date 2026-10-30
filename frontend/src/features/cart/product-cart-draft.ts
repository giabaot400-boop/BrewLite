import { MAX_CART_MONEY } from "./cart-reducer.ts";
import type { ProductDetail, SizeCode } from "../products/types";
import type { CartLineDraft } from "./types";

function money(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CART_MONEY;
}

export function buildProductCartDraft(
  product: ProductDetail,
  selectedSize: SizeCode,
  toppingIds: readonly string[],
): CartLineDraft | null {
  const size = product.sizes.find((option) => option.code === selectedSize);
  if (!size || new Set(toppingIds).size !== toppingIds.length) return null;
  const selected = toppingIds.flatMap((id) => {
    const topping = product.toppings.find((option) => option.id === id);
    return topping ? [topping] : [];
  });
  if (selected.length !== toppingIds.length) return null;
  const prices = [product.price, size.extraPrice, ...selected.map((topping) => topping.price)];
  if (!prices.every(money)) return null;
  const previewUnitPrice = prices.reduce((total, price) => total + price, 0);
  if (!money(previewUnitPrice)) return null;

  return { productId: product.id, productName: product.name, imageUrl: product.imageUrl,
    size: selectedSize, toppingIds: [...toppingIds].sort(),
    toppingNames: Object.fromEntries(selected.map((topping) => [topping.id, topping.name])),
    previewUnitPrice };
}
