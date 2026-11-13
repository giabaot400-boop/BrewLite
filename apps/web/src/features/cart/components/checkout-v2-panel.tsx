"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { OrderLines, OrderTotals } from "../../orders/components/order-lines";
import type { OrderDetail } from "../../orders/types";
import { INITIAL_AUTH_SNAPSHOT } from "../../auth/auth-session";
import { formatPrice } from "../../products/format-price";
import { checkoutPreviewV2 } from "../cart-checkout-v2";
import { savedCheckoutOrderIdV2 } from "../cart-order-restore-v2";
import { checkoutUiState, reviewedOrderTotal } from "../cart-checkout-ui";
import { getCartLineKey, selectCartQuantity, selectCartTotal } from "../cart-reducer";
import type { CheckoutUiEnvironment } from "../cart-checkout-ui";
import type { CartEnvelopeV2 } from "../cart-envelope-v2";
import type { CartCurrentOrder } from "../cart-order-binding-v2";
import type { CheckoutReviewV2, CheckoutSessionV2 } from "../cart-checkout-client-v2";
import type { PaymentReviewV2 } from "../cart-payment-client-v2";
import type { CancelReviewV2 } from "../cart-cancel-client-v2";
import type { CartAction } from "../types";

const labels: Record<CartCurrentOrder["status"], string> = { PENDING: "Chờ thanh toán", PAYMENT_FAILED: "Thanh toán chưa thành công",
  PAID: "Đã thanh toán", PREPARING: "Đang pha chế", READY: "Sẵn sàng nhận", COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy" };
type Confirmation = { session: CheckoutSessionV2; trigger: string } & (
  | { kind: "CREATE"; review: CheckoutReviewV2 }
  | { kind: "PAYMENT"; review: PaymentReviewV2; detail: OrderDetail | null }
  | { kind: "CANCEL"; review: CancelReviewV2 }
);
const message = (error: unknown) => error instanceof Error ? error.message : "Chưa hoàn tất thao tác. Vui lòng kiểm tra lại.";

/** Reusable UI with injected ports. It does not choose a backend or migrate storage. */
export function CheckoutV2Panel({ environment, disabled = false }: { environment: CheckoutUiEnvironment; disabled?: boolean }) {
  const identity = useSyncExternalStore(environment.auth.subscribe, environment.auth.getSnapshot, () => INITIAL_AUTH_SNAPSHOT);
  const version = environment.auth.getSessionVersion();
  const [view, setView] = useState<{ session: CheckoutSessionV2; envelope: CartEnvelopeV2 } | null>(null);
  const [current, setCurrent] = useState<{ session: CheckoutSessionV2; order: CartCurrentOrder } | null>(null);
  const [promotion, setPromotion] = useState("");
  const [method, setMethod] = useState<"WALLET" | "CARD">("WALLET");
  const [workingState, setBusy] = useState(true);
  const busy = workingState || disabled;
  const [notice, setNotice] = useState<{ session: CheckoutSessionV2; text: string; error: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const working = useRef(false), alive = useRef(false), sequence = useRef(0), workSequence = useRef(0);

  const capture = useCallback((): CheckoutSessionV2 | null => {
    const snapshot = environment.auth.getSnapshot();
    return snapshot.status === "authenticated" && snapshot.user?.id && snapshot.binding
      ? { ownerId: snapshot.user.id, binding: snapshot.binding, sessionVersion: environment.auth.getSessionVersion() } : null;
  }, [environment]);
  const isCurrent = useCallback((session: CheckoutSessionV2) => {
    const active = capture();
    return active?.ownerId === session.ownerId && active.binding === session.binding
      && active.sessionVersion === session.sessionVersion;
  }, [capture]);
  const reload = useCallback(async () => {
    const session = capture(), read = ++sequence.current;
    if (!session) return;
    try {
      const envelope = await environment.storage.readV2();
      if (alive.current && read === sequence.current && isCurrent(session)) setView({ session, envelope });
    } catch (error) {
      if (alive.current && read === sequence.current && isCurrent(session)) {
        setView(null); setNotice({ session, text: message(error), error: true });
      }
    }
  }, [capture, environment, isCurrent]);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void Promise.resolve().then(() => { if (active) void reload(); });
    const unsubscribe = environment.subscribeCart(() => { void reload(); });
    return () => { active = false; alive.current = false; unsubscribe(); };
  }, [environment, reload, identity.status, identity.user?.id, identity.binding, version]);

  // Navigation/F5 may issue GETs, never create/retry/pay/cancel automatically.
  useEffect(() => {
    const session = capture(), ticket = ++workSequence.current, abort = new AbortController();
    working.current = true;
    void Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      setBusy(true);
      try {
        const restored = session ? await environment.restoreOrder(abort.signal) : null;
        if (alive.current && ticket === workSequence.current && session && isCurrent(session)) {
          setCurrent(restored ? { session, order: restored.order } : null);
        }
      } catch (error) {
        if (!abort.signal.aborted && alive.current && session && isCurrent(session)) {
          setNotice({ session, text: message(error), error: true });
        }
      } finally {
        if (!abort.signal.aborted && ticket === workSequence.current) {
          await reload();
          if (ticket === workSequence.current) { working.current = false; if (alive.current) setBusy(false); }
        }
      }
    });
    return () => { abort.abort(); };
  }, [environment, capture, isCurrent, reload, identity.status, identity.user?.id, identity.binding, version]);

  const visible = view !== null && isCurrent(view.session) ? view : null;
  const savedOrderId = visible ? savedCheckoutOrderIdV2(visible.envelope, visible.session.ownerId) : null;
  const order = current !== null && isCurrent(current.session) && current.order.id === savedOrderId ? current.order : null;
  const official = order && visible ? environment.getOrderDetail({ session: visible.session, order }) : null;
  const shownNotice = notice !== null && isCurrent(notice.session) ? notice : null;
  const dialog = confirmation !== null && isCurrent(confirmation.session) ? confirmation : null;
  const ui = visible ? checkoutUiState(visible.envelope, visible.session.ownerId, order) : null;
  const cart = ui?.cart ?? null;
  const estimate = (() => {
    if (!cart) return { preview: null, error: undefined };
    try { return { preview: checkoutPreviewV2(cart, promotion), error: undefined }; }
    catch (error) { return { preview: null, error: message(error) }; }
  })();

  const tell = (session: CheckoutSessionV2, text: string, error = false) => {
    if (alive.current && isCurrent(session)) setNotice({ session, text, error });
  };
  const showOrder = (session: CheckoutSessionV2, value: CartCurrentOrder | null) => {
    if (alive.current && isCurrent(session)) setCurrent(value ? { session, order: value } : null);
  };
  async function run(work: (session: CheckoutSessionV2) => Promise<void>) {
    const session = capture();
    if (!session || working.current || disabled) return;
    const ticket = ++workSequence.current;
    working.current = true; setBusy(true); setNotice(null);
    try { await work(session); }
    catch (error) { tell(session, message(error), true); }
    finally {
      await reload();
      if (ticket === workSequence.current) { working.current = false; if (alive.current) setBusy(false); }
    }
  }
  function edit(action: CartAction) {
    void run(async session => {
      const result = await environment.storage.mutateCartV2(action, session.ownerId, () => isCurrent(session));
      if (result.error) tell(session, result.error.message, true);
    });
  }
  function reviewCreate(retry = false) {
    if (!cart || !visible || working.current || disabled) return;
    try {
      const review = environment.checkout.review(cart, { promotionCode: promotion, pending: retry ? ui?.pending : null });
      setConfirmation({ kind: "CREATE", review, session: visible.session, trigger: retry ? "checkout-retry-order" : "checkout-create" });
    } catch (error) { tell(visible.session, message(error), true); }
  }
  function reviewPayment(recovery = false) {
    void run(async session => {
      const review = recovery && ui?.recovery ? environment.payment.reviewRecovery(ui.recovery)
        : await environment.payment.review(order!.id, method);
      if (!isCurrent(session)) return;
      if (review.order) showOrder(session, review.order);
      const detail = review.order ? environment.getOrderDetail({ session, order: review.order }) : null;
      if (review.kind === "NEW" && detail === null) throw new Error("Chưa đọc được bảng giá chính thức. Vui lòng đọc lại đơn trước khi thanh toán.");
      setConfirmation({ kind: "PAYMENT", review, detail, session, trigger: recovery ? "checkout-payment-recovery" : "checkout-payment" });
    });
  }
  function reviewCancel() {
    if (!order) return;
    void run(async session => {
      const review = await environment.cancel.review(order.id);
      if (isCurrent(session)) {
        showOrder(session, review.order);
        setConfirmation({ kind: "CANCEL", review, session, trigger: "checkout-cancel" });
      }
    });
  }
  function checkOrder() {
    void run(async session => {
      const restored = await environment.restoreOrder();
      showOrder(session, restored?.order ?? null);
      tell(session, restored ? "Đã đọc lại trạng thái đơn." : "Không còn đơn đã lưu cần đối chiếu.");
    });
  }
  function confirm() {
    if (!dialog) return;
    const selected = dialog;
    void run(async session => {
      try {
        if (selected.kind === "CREATE") {
          const result = await environment.checkout.submit(selected.review);
          if (result.kind === "CURRENT_ORDER") {
            showOrder(session, result.order);
            tell(session, result.order.status === "PENDING" ? "Đơn đã tạo. Giỏ được giữ trong lúc chờ thanh toán." : "Đã đối chiếu trạng thái đơn hiện tại.");
          } else if (result.kind === "REJECTED") {
            const outcome = result.settlement.outcome;
            tell(session, "message" in outcome ? outcome.message : "Yêu cầu bị từ chối. Vui lòng xem lại lựa chọn.", true);
          } else tell(session, "Chưa rõ kết quả tạo đơn. Giữ lần đặt và chủ động thử lại cùng yêu cầu.", true);
        } else if (selected.kind === "PAYMENT") {
          const result = await environment.payment.submit(selected.review);
          if (result.kind === "RESOLVED") {
            // A reload may already have released the paid binding while the exact-key recovery remained unresolved.
            // Settlement then avoids publishing a captured view; restore the current order through the verified reader.
            const currentOrder = result.settlement.order ?? (await environment.restoreOrder())?.order ?? null;
            showOrder(session, currentOrder);
            tell(session, result.settlement.payment === null
              ? "Yêu cầu này chưa tạo giao dịch thanh toán; đơn đã kết thúc hoặc đã được thanh toán bằng lần khác."
              : result.settlement.payment.status === "FAILED" && result.settlement.order?.status === "PAYMENT_FAILED"
              ? "Thanh toán chưa thành công. Giỏ được giữ; bạn có thể xác nhận một lần thanh toán mới."
              : "Đã đối chiếu lần thanh toán. Hãy xem trạng thái đơn hiện tại bên dưới.");
          } else {
            if (result.kind === "UNKNOWN" && result.order) showOrder(session, result.order);
            tell(session, "Chưa xác định đủ kết quả thanh toán. Hãy khôi phục đúng lần đã lưu.", true);
          }
        } else {
          const result = await environment.cancel.submit(selected.review);
          if (result.kind === "CANCELLED" || result.kind === "CURRENT_ORDER") {
            showOrder(session, result.order);
            tell(session, result.kind === "CANCELLED" ? "Đơn đã hủy. Các món còn lại trong giỏ được giữ nguyên." : "Đơn đã đổi trạng thái. Vui lòng kiểm tra lại.");
          } else tell(session, "Chưa rõ kết quả hủy. Vui lòng chủ động đọc lại trạng thái đơn.", true);
        }
      } finally { if (alive.current) setConfirmation(null); }
    });
  }

  const title = dialog?.kind === "CREATE" ? dialog.review.kind === "RETRY" ? "Thử lại lần đặt đã lưu?" : "Tạo và xem đơn?"
    : dialog?.kind === "PAYMENT" ? dialog.review.kind === "RECOVERY" ? "Khôi phục lần thanh toán?" : "Xác nhận thanh toán?" : "Xác nhận hủy đơn?";
  return (
    <div className="mt-6 space-y-6" aria-busy={busy || undefined}>
      {shownNotice && <p role={shownNotice.error ? "alert" : "status"} className={`rounded-xl border p-4 ${shownNotice.error ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>{shownNotice.text}</p>}
      {!visible && <p role="status">Đang đọc giỏ và xác minh phiên…</p>}
      {visible && !cart && <p role="alert">Giỏ đang thuộc tài khoản khác. Vui lòng xác minh đúng tài khoản.</p>}
      {cart && ui && <>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="p-6">
            <h2 className="text-xl font-bold">Các món đã chọn</h2>
            {cart.items.length === 0 ? <p className="mt-4">Giỏ hàng đang trống.</p> : <ul className="mt-4 divide-y divide-stone-200">
              {cart.items.map(line => {
                const key = getCartLineKey(line);
                return <li key={key} className="py-4">
                  <h3 className="font-semibold">{line.productName} · Size {line.size}</h3>
                  <p className="mt-1 text-sm text-stone-600">{line.toppingIds.map(id => line.toppingNames[id]).join(", ") || "Không topping"} · {formatPrice(line.previewUnitPrice)} / ly</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button variant="secondary" disabled={busy || !ui.canEdit || line.qty <= 1} aria-label={`Giảm ${line.productName}`} onClick={() => edit({ type: "DECREMENT", lineKey: key })}>−</Button>
                    <output aria-label={`Số lượng ${line.productName}`}>{line.qty} ly</output>
                    <Button variant="secondary" disabled={busy || !ui.canEdit || line.qty >= 20} aria-label={`Tăng ${line.productName}`} onClick={() => edit({ type: "INCREMENT", lineKey: key })}>+</Button>
                    <Button variant="text" disabled={busy || !ui.canEdit} onClick={() => edit({ type: "REMOVE_ITEM", lineKey: key })}>Xóa</Button>
                  </div>
                </li>;
              })}
            </ul>}
            {ui.block && <p role="status" className="mt-4 rounded-lg bg-stone-100 p-3 text-sm">{ui.block === "ORDER_PENDING"
              ? "Lần đặt trước chưa rõ kết quả. Giỏ đang được khóa để giữ nguyên yêu cầu."
              : ui.block === "PAYMENT_UNRESOLVED" ? "Còn lần thanh toán cần khôi phục. Chưa thể sửa giỏ hoặc tạo lần thanh toán mới."
                : "Giỏ đang gắn với đơn chưa kết thúc. Các lựa chọn vẫn được giữ."}</p>}
          </Card>
          <Card className="space-y-4 p-6">
            <h2 className="text-xl font-bold">Tổng dự kiến</h2>
            <FormField id="checkout-promotion" label="Mã giảm giá" value={promotion} maxLength={64} autoComplete="off"
              disabled={busy || !ui.canEdit} onChange={event => setPromotion(event.target.value)} error={estimate.error}
              hint="DEMO10: 10%, tối đa 20.000đ, đơn từ 50.000đ. Hiệu lực mã được kiểm tra khi tạo đơn." />
            <dl className="space-y-2">
              <div className="flex justify-between gap-4"><dt>{selectCartQuantity(cart)} ly · Tạm tính</dt><dd>{formatPrice(selectCartTotal(cart))}</dd></div>
              <div className="flex justify-between gap-4"><dt>Giảm dự kiến</dt><dd>−{formatPrice(estimate.preview?.discountTotal ?? 0)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-lg font-bold"><dt>Tổng dự kiến</dt><dd>{formatPrice(estimate.preview?.total ?? selectCartTotal(cart))}</dd></div>
            </dl>
            <p className="text-sm text-stone-600">Giá chính thức được kiểm tra khi tạo đơn. Tạo PENDING chưa phải thanh toán thành công.</p>
            <Button id="checkout-create" disabled={busy || !ui.canCreate || estimate.preview === null} onClick={() => reviewCreate()}>Tạo và xem đơn</Button>
            {ui.pending && <Button id="checkout-retry-order" variant="secondary" disabled={busy} onClick={() => reviewCreate(true)}>Thử lại lần đặt đã lưu</Button>}
          </Card>
        </div>
        {!order && savedOrderId && <div className="rounded-xl border border-stone-200 bg-white p-5">
          <p>Đã lưu mã đơn. Cần đọc trạng thái hiện tại trước khi thanh toán hoặc hủy.</p>
          <div className="mt-3"><Button variant="secondary" disabled={busy} onClick={checkOrder}>Đọc lại đơn đã lưu</Button></div>
        </div>}
        {order && <Card className="space-y-4 p-6">
          <h2 className="text-xl font-bold">Đơn đang thao tác</h2>
          <p className="break-all font-mono text-sm">{order.id}</p>
          <p className="font-semibold" role="status">Trạng thái: {labels[order.status]}</p>
          {official ? <section aria-label="Giá chính thức của đơn" className="space-y-3">
            <h3 className="font-bold">Giá chính thức của đơn</h3>
            <OrderLines items={official.items} />
            <OfficialTotals order={official} />
          </section> : <p role="status">Chưa đọc đủ bảng giá chính thức. Vui lòng đọc lại đơn trước khi thanh toán.</p>}
          {order.paymentDeadline === null ? <p>Đơn cũ chỉ xem; không có thanh toán hoặc hủy theo chính sách mới.</p>
            : ["PENDING", "PAYMENT_FAILED"].includes(order.status) && <p className="text-sm text-stone-600">Hạn thanh toán: {new Date(order.paymentDeadline).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}
          {ui.canPay && official && <fieldset disabled={busy} className="flex flex-wrap gap-5">
            <legend className="mb-2 font-semibold">Phương thức thanh toán</legend>
            {(["WALLET", "CARD"] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="checkout-payment-method" value={value} checked={method === value} onChange={() => setMethod(value)} />{value === "WALLET" ? "Ví mô phỏng" : "Thẻ mô phỏng"}
            </label>)}
          </fieldset>}
          <div className="flex flex-wrap gap-3">
            {ui.canPay && official && <Button id="checkout-payment" disabled={busy} onClick={() => reviewPayment()}>{order.status === "PAYMENT_FAILED" ? "Thử thanh toán mới" : "Xác nhận thanh toán"}</Button>}
            {ui.canCancel && <Button id="checkout-cancel" variant="secondary" disabled={busy} onClick={reviewCancel}>Hủy đơn</Button>}
            <Button variant="text" disabled={busy} onClick={checkOrder}>Đọc lại trạng thái</Button>
          </div>
        </Card>}
        {ui.recovery && <Card className="space-y-3 border-amber-300 p-6">
          <h2 className="text-xl font-bold">Lần thanh toán cần khôi phục</h2>
          <p className="break-all">Đơn: {ui.recovery.body.orderId}</p>
          <p>Giữ nguyên yêu cầu đã lưu; khôi phục không tạo một lần thanh toán mới.</p>
          <Button id="checkout-payment-recovery" disabled={busy} onClick={() => reviewPayment(true)}>Khôi phục thanh toán</Button>
        </Card>}
      </>}
      <ConfirmDialog open={dialog !== null} title={title} busy={busy} returnFocusId={dialog?.trigger}
        confirmLabel={dialog?.kind === "CANCEL" ? "Xác nhận hủy" : dialog?.kind === "PAYMENT" ? "Xác nhận" : "Xác nhận tạo đơn"}
        cancelLabel="Quay lại" onCancel={() => setConfirmation(null)} onConfirm={confirm}>
        {dialog?.kind === "CREATE" && <>
          <p>{selectCartQuantity(dialog.review.displayCart)} ly · Tổng dự kiến: <strong>{formatPrice(reviewedOrderTotal(dialog.review.payload))}</strong></p>
          <p className="mt-2">{dialog.review.kind === "RETRY" ? "Dùng lại đúng nội dung và mã yêu cầu đã lưu." : "Bước này tạo đơn chờ thanh toán và giữ giỏ; chưa gửi thanh toán."}</p>
        </>}
        {dialog?.kind === "PAYMENT" && <>
          <p>Đơn: <span className="break-all">{dialog.review.body.orderId}</span></p>
          <p className="mt-2">{dialog.review.body.method === "WALLET" ? "Ví mô phỏng" : "Thẻ mô phỏng"}{dialog.review.kind === "RECOVERY" ? " · Yêu cầu cũ đã lưu" : ""}</p>
          {dialog.detail && <div className="mt-4"><OfficialTotals order={dialog.detail} /></div>}
          {dialog.review.kind === "RECOVERY" && <p className="mt-2">Tra lại đúng lần đã gửi; không đổi phương thức hoặc tạo key mới.</p>}
        </>}
        {dialog?.kind === "CANCEL" && <p>{dialog.review.order.status === "PAID"
          ? "Đơn đã thanh toán. Hủy trước pha chế sẽ hoàn trả mô phỏng theo chính sách của đơn. Giỏ đã dọn sẽ không được dựng lại."
          : "Hủy đơn đang chờ thanh toán. Các món còn lại trong giỏ được giữ nguyên."}</p>}
      </ConfirmDialog>
    </div>
  );
}


/** B owns the official totals renderer; the no-promotion case explicitly shows zero discount. */
function OfficialTotals({ order }: { order: OrderDetail }) {
  return <>
    {order.promotion === null && <p className="text-sm text-stone-600">Không áp dụng mã giảm giá · Giảm giá: {formatPrice(order.discountTotal)}</p>}
    <OrderTotals order={order} />
  </>;
}
