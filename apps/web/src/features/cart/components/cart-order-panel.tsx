"use client";

import { useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { withReturnTo } from "@/features/auth/return-to";
import { formatPrice } from "@/features/products/format-price";
import { useCart } from "../cart-provider";
import { getCartLineKey, selectCartQuantity, selectCartTotal } from "../cart-reducer";
import { captureOrderConfirmation, reconcileOrderConfirmation } from "../cart-order-confirmation";
import type { OrderConfirmation } from "../cart-order-confirmation";
import type { Cart } from "../types";
import { CartRefreshBoundary } from "./cart-refresh-boundary";

function Snapshot({ cart }: { cart: Cart }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm">
        {cart.items.map(item => (
          <li key={getCartLineKey(item)}>
            <p className="font-semibold">{item.productName} · size {item.size} · {item.qty} ly</p>
            <p>{item.toppingIds.map(id => item.toppingNames[id]).join(", ") || "Không topping"}</p>
            <p>{formatPrice(item.previewUnitPrice)} / ly · {formatPrice(item.previewUnitPrice * item.qty)}</p>
          </li>
        ))}
      </ul>
      <p className="font-semibold">{selectCartQuantity(cart)} ly · Tổng xem trước: {formatPrice(selectCartTotal(cart))}</p>
    </div>
  );
}

export function CartOrderPanel() {
  const { status, sessionExpired, sessionSnapshot, getSessionSnapshot, sessionVersion, getSessionVersion } = useAuth();
  const { state, pending, lastOrder, orderPhase, orderFeedback: feedback, reviewOrder, submitOrder, reload } = useCart();
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const triggerId = useId();
  const environment = { identity: sessionSnapshot, sessionVersion, state, pending, orderPhase };
  // Adjust only this component's state; invalid reviews cannot reappear after A -> B -> A.
  const reconciled = reconcileOrderConfirmation(confirmation, environment);
  if (reconciled !== confirmation) setConfirmation(reconciled);
  const cart = state.status === "ready" ? state.cart : null;
  const busy = orderPhase !== "IDLE";
  const authenticated = status === "authenticated";
  const loginHref = withReturnTo("/login", "/cart") + `&reason=${sessionExpired ? "expired" : "required"}`;
  const currentReview = reconciled && reconciled.status !== "invalid" ? reconciled.review : null;
  const checking = reconciled?.status === "checking";
  function openReview(retry = false) {
    const review = reviewOrder(retry);
    setConfirmation(review ? captureOrderConfirmation(review, {
      ...environment, identity: getSessionSnapshot(), sessionVersion: getSessionVersion(),
    }) : null);
  }

  return (
    <section aria-label="Đặt đơn và kết quả" className="mt-6 space-y-4">
      <CartRefreshBoundary ready={state.status === "ready"} restoring={state.status === "restoring"} sessionVersion={sessionVersion}>
      <div className="space-y-4">
      {reconciled?.status === "invalid" && <p role="alert">{reconciled.message}</p>}
      {busy && <p role="status" aria-live="polite" className="font-semibold text-coffee">Đang tạo đơn…</p>}
      {feedback && (
        <div role={feedback.kind === "confirmed" ? "status" : "alert"} className="rounded-xl border border-stone-200 bg-white p-4">
          <p>{feedback.message}</p>
          {feedback.globalErrors.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm">
            {feedback.globalErrors.map((message, index) => <li key={index}>{message}</li>)}
          </ul>}
          {feedback.loginReason && <div className="mt-3"><ButtonLink href={withReturnTo("/login", "/cart") + `&reason=${feedback.loginReason}`} variant="text">Đăng nhập lại để kiểm tra lần đặt</ButtonLink></div>}
        </div>
      )}
      {status === "anonymous" && (cart === null || cart.items.length > 0) && (
        <Card className="space-y-3 p-5">
          <p>{sessionExpired ? "Phiên đã hết hạn. Giỏ được giữ để đăng nhập lại đúng tài khoản." : "Đăng nhập để xác nhận đặt đơn hoặc kiểm tra lần đặt đang chờ."}</p>
          <ButtonLink href={loginHref}>Đăng nhập để tiếp tục</ButtonLink>
        </Card>
      )}
      {status === "unknown" && <Button variant="text" onClick={() => { void reload(); }}>Kiểm tra lại phiên và giỏ</Button>}
      {authenticated && pending && (
        <Card className="space-y-4 p-5">
          <h2 className="text-xl font-semibold">Lần đặt chưa rõ kết quả</h2>
          <p>Thông tin dưới đây thuộc lần đặt đã lưu. Thử lại sẽ kiểm tra hoặc tạo đơn cho chính lần đặt đó, kể cả giỏ hiện tại đã trống.</p>
          <Snapshot cart={pending.cartSnapshot} />
          <Button id={triggerId} disabled={busy || state.isSaving || cart === null} onClick={() => openReview(true)}>
            Thử lại cùng lần đặt
          </Button>
        </Card>
      )}
      {authenticated && !pending && cart && cart.items.length > 0 && (
        <Button id={triggerId} disabled={busy || state.isSaving} onClick={() => openReview()}>
          {feedback?.repriced ? "Kiểm tra và đặt theo giá mới" : "Đặt hàng"}
        </Button>
      )}
      {authenticated && lastOrder && !pending && !busy && (
        <Card className="space-y-2 p-5">
          <h2 className="text-xl font-semibold">Đơn đã xác nhận gần nhất</h2>
          <p className="break-all">Mã đơn: <strong>{lastOrder.order.id}</strong></p>
          <p>Trạng thái: <strong>Chờ thanh toán (PENDING)</strong></p>
          <p>Tổng tiền chính thức: <strong>{formatPrice(lastOrder.order.total)}</strong></p>
          <p className="text-sm text-stone-600">Đây là kết quả tạo đơn đã nhận trên thiết bị này.</p>
        </Card>
      )}
      </div>
      </CartRefreshBoundary>
      <ConfirmDialog open={currentReview !== null} title={currentReview?.kind === "RETRY" ? "Thử lại cùng lần đặt?" : "Xác nhận đặt đơn?"}
        confirmLabel={currentReview?.kind === "RETRY" ? "Xác nhận thử lại" : "Xác nhận đặt hàng"}
        confirmDisabled={checking}
        returnFocusId={triggerId}
        onCancel={() => setConfirmation(null)} onConfirm={() => {
          if (!currentReview || reconciled?.status !== "ready"
            || getSessionVersion() !== reconciled.sessionVersion || getSessionSnapshot() !== reconciled.identity) return;
          setConfirmation(null);
          void submitOrder(currentReview);
        }}>
        {currentReview && <>
          {checking && <p role="status" className="mb-3 text-sm">Đang kiểm tra lại phiên và giỏ…</p>}
          <div tabIndex={0} role="region" aria-label="Các món đang xác nhận" className="max-h-[45vh] overflow-y-auto pr-2">
            <Snapshot cart={currentReview.displayCart} />
          </div>
          <p className="mt-3 text-sm">{currentReview.kind === "RETRY"
            ? "Giữ nguyên nội dung lần đặt cũ. Một lần thử lại có thể tạo đơn đầu tiên nếu lần gửi trước chưa tới máy chủ."
            : "Máy chủ sẽ kiểm tra giá chính thức. Nếu giá thay đổi, bạn sẽ kiểm tra và xác nhận lại trước khi tạo đơn."}</p>
        </>}
      </ConfirmDialog>
    </section>
  );
}
