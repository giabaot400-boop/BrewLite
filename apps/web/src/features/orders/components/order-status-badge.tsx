import { statusMeta, TONE_CLASS } from "../order-status";
import type { OrderStatus } from "../types";

/** Nhãn trạng thái đơn: luôn có chữ (không chỉ màu), dùng chung cho chi tiết và lịch sử. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${TONE_CLASS[meta.tone]}`}
    >
      <span className="sr-only">Trạng thái: </span>
      {meta.label}
    </span>
  );
}
