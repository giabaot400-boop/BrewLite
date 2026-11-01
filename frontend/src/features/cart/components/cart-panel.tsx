"use client";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatPrice } from "@/features/products/format-price";
import { getCartLineKey, MAX_CART_QUANTITY, selectCartQuantity, selectCartTotal } from "../cart-reducer";
import { useCart } from "../cart-provider";
import { CartNotice } from "./cart-notice";

const controlClass = "min-h-11 min-w-11 rounded-lg border border-stone-300 px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50";

export function CartPanel() {
  const { state, canMutate, increment, decrement, removeItem } = useCart();
  const cart = state.status === "ready" ? state.cart : null;
  return (
    <>
      <CartNotice />
      {state.isSaving && <p role="status" className="mt-4 text-sm text-stone-600">Đang lưu giỏ hàng…</p>}
      {cart !== null && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {cart.items.length === 0 ? (
            <Card className="p-6">
              <p>Giỏ hàng của bạn đang trống</p>
              <div className="mt-5"><ButtonLink href="/">Xem menu</ButtonLink></div>
            </Card>
          ) : (
            <ul aria-label="Các món trong giỏ" className="space-y-4">
              {cart.items.map((item) => {
                const lineKey = getCartLineKey(item);
                const toppings = item.toppingIds.map((id) => item.toppingNames[id]).join(", ");
                const label = `${item.productName}, size ${item.size}, ${toppings || "không topping"}`;
                return (
                  <li key={lineKey}>
                    <Card className="p-5 sm:p-6">
                      <h2 className="text-xl font-semibold">{item.productName}</h2>
                      <p className="mt-2 text-sm text-stone-600">Size {item.size} · {toppings || "Không topping"}</p>
                      <p className="mt-3 text-sm">Đơn giá xem trước: {formatPrice(item.previewUnitPrice)}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button type="button" className={controlClass} aria-label={`Giảm số lượng ${label}`}
                          disabled={!canMutate || item.qty === 1} onClick={() => { void decrement(lineKey); }}>−</button>
                        <output aria-label={`Số lượng ${label}`} aria-live="polite" className="min-w-8 text-center font-semibold">{item.qty}</output>
                        <button type="button" className={controlClass} aria-label={`Tăng số lượng ${label}`}
                          disabled={!canMutate || item.qty >= MAX_CART_QUANTITY} onClick={() => { void increment(lineKey); }}>+</button>
                        <button type="button" className={`${controlClass} ml-auto text-coffee`}
                          aria-label={`Xóa ${label}`} disabled={!canMutate} onClick={() => { void removeItem(lineKey); }}>Xóa</button>
                      </div>
                      {item.qty >= MAX_CART_QUANTITY && <p className="mt-2 text-sm text-stone-600">Mỗi cấu hình tối đa 20 ly.</p>}
                      <p className="mt-4 font-semibold">Thành tiền: {formatPrice(item.previewUnitPrice * item.qty)}</p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
          <Card className="p-6">
            <h2 className="text-xl font-semibold">Tổng giỏ hàng</h2>
            <p className="mt-4 text-stone-600">Số lượng: {selectCartQuantity(cart)} ly</p>
            <p className="mt-4 text-sm text-stone-600">Tổng tạm tính</p>
            <p className="mt-2 text-2xl font-bold text-coffee">{formatPrice(selectCartTotal(cart))}</p>
            <p className="mt-4 text-sm leading-6 text-stone-600">Giá trong giỏ là giá xem trước. Giá chính thức được kiểm tra khi tạo đơn.</p>
            {cart.items.length > 0 && <div className="mt-5"><ButtonLink href="/" variant="text">Tiếp tục chọn món</ButtonLink></div>}
          </Card>
        </div>
      )}
      {cart === null && <div className="mt-6"><ButtonLink href="/" variant="text">Về menu</ButtonLink></div>}
    </>
  );
}
