import { formatDateTime, formatMoney } from "../order-format";
import { METHOD_LABEL, PAYMENT_STATUS_LABEL } from "../order-status";
import type { OrderDetail } from "../types";

/**
 * Lần thanh toán gần nhất của đơn (latestPayment). Đây là lần mới nhất theo thời gian,
 * KHÔNG chứng minh nó là lần của một yêu cầu đang phục hồi (CONTRACTS mục 2).
 */
export function PaymentSummary({ payment }: { payment: OrderDetail["latestPayment"] }) {
  if (payment === null) {
    return <p className="text-stone-600">Chưa có lần thanh toán nào.</p>;
  }
  const refunded = payment.refundedAt !== null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-stone-600">Phương thức</dt>
      <dd>{METHOD_LABEL[payment.method]}</dd>
      <dt className="text-stone-600">Số tiền</dt>
      <dd className="tabular-nums">{formatMoney(payment.amount)}</dd>
      <dt className="text-stone-600">Kết quả</dt>
      <dd>
        {PAYMENT_STATUS_LABEL[payment.status]}
        {payment.failureCode === "PAYMENT_DECLINED" && " (bị từ chối)"}
      </dd>
      <dt className="text-stone-600">Thời gian</dt>
      <dd>{formatDateTime(payment.resolvedAt)}</dd>
      {refunded && (
        <>
          <dt className="text-stone-600">Hoàn tiền</dt>
          <dd className="tabular-nums">
            {formatMoney(payment.refundedAmount)} lúc {formatDateTime(payment.refundedAt)}
          </dd>
        </>
      )}
    </dl>
  );
}
