import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime, formatPoints, shortOrderId } from "../order-format";
import { guidanceForOrderError, type OrderApiError } from "../order-error";
import { LEGACY_DESCRIPTION, cancelReasonLabel, isLegacyViewOnly, statusMeta } from "../order-status";
import type { OrderDetail } from "../types";
import { OrderLines, OrderTotals } from "./order-lines";
import { OrderStatusBadge } from "./order-status-badge";
import { PaymentDeadline } from "./payment-deadline";
import { PaymentSummary } from "./payment-summary";

export type OrderActionFlags = { canPay: boolean; canCancel: boolean };

type Props = {
  order: OrderDetail;
  /** Thời điểm (ms) trình duyệt nhận phản hồi, dùng cho đồng hồ server. */
  receivedAtMs: number;
  /** Vừa tạo đơn (từ luồng đặt hàng): hiện thông báo xác nhận. */
  placed?: boolean;
  /** Lỗi khi làm mới; dữ liệu đang hiển thị vẫn đúng ở version đã nhận. */
  refreshError?: OrderApiError | null;
  onRefresh?: () => void;
  /**
   * Điểm gắn nút Thanh toán/Hủy (S3-A-02). canPay/canCancel chỉ là gợi ý của server;
   * POST luôn kiểm tra lại. Không truyền thì trang chỉ để xem.
   */
  renderActions?: (flags: OrderActionFlags) => ReactNode;
};

/** Trang xác nhận và chi tiết đơn dùng chung một giao diện: luôn hiển thị đơn HIỆN TẠI do server trả. */
export function OrderDetailView({ order, receivedAtMs, placed, refreshError, onRefresh, renderActions }: Props) {
  const meta = statusMeta(order.status);
  const cancelText = cancelReasonLabel(order.cancelReason);
  const legacy = isLegacyViewOnly(order);
  const awaitingPayment = !legacy && (order.status === "PENDING" || order.status === "PAYMENT_FAILED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Đơn hàng {shortOrderId(order.id)}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      {placed && <Alert tone="success">Đơn hàng đã được ghi nhận. Trạng thái hiện tại: {meta.label}.</Alert>}

      {refreshError && (
        <Alert tone="error">
          {guidanceForOrderError(refreshError).message} Đang hiển thị dữ liệu đã nhận trước đó.
        </Alert>
      )}

      <Card className="space-y-2 p-5">
        <p>{legacy ? LEGACY_DESCRIPTION : meta.description}</p>
        {cancelText && <p className="text-stone-700">{cancelText}</p>}
        {awaitingPayment && order.paymentDeadline && (
          <PaymentDeadline deadline={order.paymentDeadline} serverTime={order.serverTime} receivedAtMs={receivedAtMs} />
        )}
        {order.status === "CANCELLED" && order.latestPayment?.refundedAt && (
          <p className="text-stone-700">Đã hoàn tiền cho lần thanh toán này.</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-xl font-bold">Món đã đặt</h2>
        <OrderLines items={order.items} />
        <OrderTotals order={order} />
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-xl font-bold">Thanh toán</h2>
        <PaymentSummary payment={order.latestPayment} />
        {order.paidAt && <p className="text-sm text-stone-600">Thanh toán lúc {formatDateTime(order.paidAt)}.</p>}
      </Card>

      {(order.loyaltyPointsEarned > 0 || order.loyaltyPointsReversed > 0) && (
        <Card className="space-y-1 p-5">
          <h2 className="text-xl font-bold">Điểm thưởng</h2>
          <p>Đã nhận: {formatPoints(order.loyaltyPointsEarned)}</p>
          {order.loyaltyPointsReversed > 0 && <p>Đã thu hồi: {formatPoints(order.loyaltyPointsReversed)}</p>}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {renderActions?.({ canPay: order.canPay, canCancel: order.canCancel })}
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh}>
            Làm mới trạng thái
          </Button>
        )}
        <ButtonLink href="/orders" variant="text">
          Xem lịch sử đơn
        </ButtonLink>
      </div>
    </div>
  );
}
