"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "../../auth/auth-provider";
import { formatPrice } from "../../products/format-price";
import { useCartV2 } from "../cart-provider-v2";
import { getCartLineKey, selectCartQuantity, selectCartTotal } from "../cart-reducer";
import { CartNoticeContent } from "./cart-notice";
import { CartRefreshBoundary } from "./cart-refresh-boundary";
import { CheckoutV2Panel } from "./checkout-v2-panel";

/** Pair with CartProviderV2 only. Activation of the main layout is a separate release step. */
export function CartCheckoutPanelV2() {
  const { state, canMutate, records, checkoutEnvironment, reload, increment, decrement, removeItem } = useCartV2();
  const auth = useAuth();
  const guest = auth.status === "anonymous" && state.status === "ready" && records?.ownerId === null;
  const cart = guest ? state.cart : null;
  const authenticated = auth.status === "authenticated" && state.status === "ready" && records?.ownerId === auth.user?.id;
  return <CartRefreshBoundary ready={state.status === "ready"} restoring={state.status === "restoring"} sessionVersion={auth.sessionVersion}>
    {state.status !== "restoring" && state.status !== "ready" && <CartNoticeContent state={state} reload={reload} />}
    {authenticated && <CheckoutV2Panel environment={checkoutEnvironment} disabled={state.isSaving} />}
    {cart && <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="p-6">
        <h2 className="text-xl font-bold">Các món đã chọn</h2>
        {state.message && <p role="alert" className="mt-3 text-sm">{state.message}</p>}
        {cart.items.length === 0 ? <p className="mt-4">Giỏ hàng của bạn đang trống.</p> : <ul aria-label="Các món trong giỏ" className="mt-4 divide-y divide-stone-200">
          {cart.items.map(line => {
            const key = getCartLineKey(line);
            const label = `${line.productName}, size ${line.size}, ${line.toppingIds.map(id => line.toppingNames[id]).join(", ") || "không topping"}`;
            return <li key={key} className="py-4">
              <h3 className="font-semibold">{line.productName} · Size {line.size}</h3>
              <p className="mt-1 text-sm text-stone-600">{line.toppingIds.map(id => line.toppingNames[id]).join(", ") || "Không topping"} · {formatPrice(line.previewUnitPrice)} / ly</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="secondary" aria-label={`Giảm số lượng ${label}`} disabled={!canMutate || line.qty <= 1} onClick={() => { void decrement(key); }}>−</Button>
                <output aria-label={`Số lượng ${label}`} aria-live="polite">{line.qty} ly</output>
                <Button variant="secondary" aria-label={`Tăng số lượng ${label}`} disabled={!canMutate || line.qty >= 20} onClick={() => { void increment(key); }}>+</Button>
                <Button variant="text" aria-label={`Xóa ${label}`} disabled={!canMutate} onClick={() => { void removeItem(key); }}>Xóa</Button>
              </div>
              <p className="mt-3 font-semibold">Thành tiền: {formatPrice(line.previewUnitPrice * line.qty)}</p>
            </li>;
          })}
        </ul>}
        <div className="mt-5"><ButtonLink href="/" variant="text">Tiếp tục chọn món</ButtonLink></div>
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="text-xl font-bold">Tổng giỏ hàng</h2>
        <p>{selectCartQuantity(cart)} ly · Tổng dự kiến: <strong>{formatPrice(selectCartTotal(cart))}</strong></p>
        <p className="text-sm text-stone-600">Giá chính thức được kiểm tra khi tạo đơn. Vui lòng đăng nhập để tiếp tục đặt hàng.</p>
        <ButtonLink href="/login?next=%2Fcart&reason=required">Đăng nhập để đặt hàng</ButtonLink>
      </Card>
    </div>}
  </CartRefreshBoundary>;
}
