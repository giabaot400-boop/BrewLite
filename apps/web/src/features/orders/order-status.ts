import type { CancelReason, OrderStatus, PaymentMethod, PaymentStatus } from "./types.ts";

export type StatusTone = "neutral" | "warning" | "danger" | "success" | "info";

export type StatusMeta = {
  label: string;
  /** Một câu cho người dùng: đơn đang ở đâu và bước tiếp theo là gì. */
  description: string;
  tone: StatusTone;
  /** Trạng thái cuối: sẽ không đổi nữa (trừ khi dữ liệu nền sai). */
  terminal: boolean;
};

// Bảy trạng thái theo CONTRACTS mục 1. Mô tả chỉ nói điều server đã xác nhận.
export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: {
    label: "Chờ thanh toán",
    description: "Đơn đã được giữ hàng. Hãy thanh toán trước hạn để quán bắt đầu pha chế.",
    tone: "warning",
    terminal: false,
  },
  PAYMENT_FAILED: {
    label: "Thanh toán chưa thành công",
    description: "Lần thanh toán gần nhất không thành công. Bạn có thể thử lại nếu đơn còn hạn.",
    tone: "danger",
    terminal: false,
  },
  PAID: {
    label: "Đã thanh toán",
    description: "Đã nhận thanh toán. Đơn đang chờ quán nhận pha chế.",
    tone: "info",
    terminal: false,
  },
  PREPARING: {
    label: "Đang pha chế",
    description: "Quán đang pha chế đơn của bạn. Đơn đã pha chế không thể hủy.",
    tone: "info",
    terminal: false,
  },
  READY: {
    label: "Sẵn sàng nhận",
    description: "Đồ uống đã sẵn sàng. Mời bạn đến quầy nhận.",
    tone: "success",
    terminal: false,
  },
  COMPLETED: {
    label: "Hoàn thành",
    description: "Đơn đã hoàn thành. Cảm ơn bạn!",
    tone: "success",
    terminal: true,
  },
  CANCELLED: {
    label: "Đã hủy",
    description: "Đơn đã được hủy.",
    tone: "neutral",
    terminal: true,
  },
};

export function statusMeta(status: OrderStatus): StatusMeta {
  return STATUS_META[status];
}

const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  CUSTOMER_REQUEST: "Bạn đã yêu cầu hủy đơn.",
  PAYMENT_WINDOW_EXPIRED: "Đơn quá hạn thanh toán nên được hủy tự động.",
};

export function cancelReasonLabel(reason: CancelReason | null): string | null {
  return reason === null ? null : CANCEL_REASON_LABEL[reason];
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  WALLET: "Ví điện tử",
  CARD: "Thẻ",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  FAILED: "Không thành công",
  SUCCEEDED: "Thành công",
};

export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-stone-300 bg-stone-100 text-stone-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-900",
  success: "border-green-300 bg-green-50 text-green-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
};
