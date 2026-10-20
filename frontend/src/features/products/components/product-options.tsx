"use client";

import { useState } from "react";
import type { SizeCode, SizeOption, ToppingOption } from "../types";
import { formatPrice } from "../format-price";

function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

type ProductOptionsProps = {
  basePrice: number;
  sizes: SizeOption[];
  toppings: ToppingOption[];
};

export function ProductOptions({
  basePrice,
  sizes,
  toppings,
}: ProductOptionsProps) {
  const [selectedSize, setSelectedSize] = useState<SizeCode>("S");

  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>([]);

  function toggleTopping(toppingId: string) {
    setSelectedToppingIds((current) =>
      current.includes(toppingId)
        ? current.filter((id) => id !== toppingId)
        : [...current, toppingId],
    );
  }

  const selectedSizeOption = sizes.find((size) => size.code === selectedSize);

  const selectedToppings = toppings.filter((topping) =>
    selectedToppingIds.includes(topping.id),
  );

  const priceValues = [
    basePrice,
    selectedSizeOption?.extraPrice,
    ...selectedToppings.map((topping) => topping.price),
  ];

  const calculatedPrice = priceValues.every(isValidPrice)
    ? priceValues.reduce((total, price) => total + price, 0)
    : null;

  const previewPrice = isValidPrice(calculatedPrice) ? calculatedPrice : null;

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
    </>
  );
}
