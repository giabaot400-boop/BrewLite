"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/features/cart/cart-provider";
import { CartNotice } from "@/features/cart/components/cart-notice";
import { buildProductCartDraft } from "@/features/cart/product-cart-draft";
import type { ProductDetail, SizeCode } from "../types";
import { formatPrice } from "../format-price";

function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

type ProductOptionsProps = {
  product: ProductDetail;
};

export function ProductOptions({ product }: ProductOptionsProps) {
  const { sizes, toppings } = product;
  const { state: cartState, canMutate, addItem } = useCart();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<SizeCode>("S");

  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>([]);

  function toggleTopping(toppingId: string) {
    setSelectedToppingIds((current) =>
      current.includes(toppingId)
        ? current.filter((id) => id !== toppingId)
        : [...current, toppingId],
    );
  }

  const draft = buildProductCartDraft(product, selectedSize, selectedToppingIds);
  const previewPrice = draft?.previewUnitPrice ?? null;

  async function addToCart() {
    setFeedback(null);
    if (draft && await addItem(draft)) setFeedback("Đã thêm 1 ly vào giỏ hàng.");
  }

  return (
    <>
      <fieldset className="mt-8">
        <legend className="font-semibold">Size</legend>

        <div className="mt-3 flex flex-wrap gap-3">
          {sizes.map((size) => (
            <label
              key={size.code}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 ${
                selectedSize === size.code
                  ? "border-coffee bg-coffee text-white"
                  : "border-stone-300 bg-white"
              }`}
            >
              <input
                type="radio"
                name="product-size"
                value={size.code}
                checked={selectedSize === size.code}
                onChange={() => setSelectedSize(size.code)}
              />

              <span className="font-semibold">{size.code}</span>
              <span className="text-sm">
                {isValidPrice(size.extraPrice)
                  ? `+${formatPrice(size.extraPrice)}`
                  : "Giá không hợp lệ"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-8">
        <legend className="font-semibold">Topping — có thể chọn nhiều</legend>

        {toppings.length === 0 ? (
          <p className="mt-3 text-sm text-stone-600">
            Sản phẩm này không có topping.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {toppings.map((topping) => (
              <label
                key={topping.id}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 ${
                  selectedToppingIds.includes(topping.id)
                    ? "border-coffee bg-coffee text-white"
                    : "border-stone-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  name="product-topping"
                  value={topping.id}
                  checked={selectedToppingIds.includes(topping.id)}
                  onChange={() => toggleTopping(topping.id)}
                />

                <span>{topping.name}</span>
                <span className="text-sm">
                  {isValidPrice(topping.price)
                    ? `+${formatPrice(topping.price)}`
                    : "Giá không hợp lệ"}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <section
        aria-label="Giá xem trước"
        aria-live="polite"
        className="mt-8 border-t border-stone-200 pt-5"
      >
        <p className="text-sm text-stone-600">Tổng tạm tính</p>

        <p className="mt-2 text-3xl font-bold text-coffee">
          {previewPrice === null
            ? "Không thể tính giá sản phẩm."
            : formatPrice(previewPrice)}
        </p>
      </section>
      <CartNotice />
      <div className="mt-5 [&>button:disabled]:cursor-not-allowed [&>button:disabled]:opacity-50">
        <Button disabled={!canMutate || draft === null} onClick={() => { void addToCart(); }}>
          {cartState.isSaving ? "Đang lưu giỏ…" : "Thêm vào giỏ"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-stone-600">{feedback}</p>
    </>
  );
}
