// Contract: docs/sprint3/CONTRACTS.md v1.3, mục 1 (miền dữ liệu) và mục 2 (response chính xác).
// Đây là hình dạng S3 mà backend (C: GET Order/history) phải trả. UI không thêm trường.

export type OrderStatus =
  | "PENDING"
  | "PAYMENT_FAILED"
  | "PAID"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentStatus = "FAILED" | "SUCCEEDED";
export type PaymentMethod = "WALLET" | "CARD";
export type Size = "S" | "M" | "L";
export type CancelReason = "CUSTOMER_REQUEST" | "PAYMENT_WINDOW_EXPIRED";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "PAYMENT_FAILED",
  "PAID",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
];

export type PaymentView = {
  id: string;
  version: number;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  failureCode: "PAYMENT_DECLINED" | null;
  createdAt: string;
  resolvedAt: string;
  refundedAmount: number;
  refundedAt: string | null;
  serverTime: string;
};

export type OrderLine = {
  productId: string;
  productName: string;
  size: Size;
  basePrice: number;
  sizeExtraPrice: number;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  toppings: { toppingId: string; name: string; price: number }[];
};

export type OrderDetail = {
  id: string;
  version: number;
  status: OrderStatus;
  createdAt: string;
  items: OrderLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  promotion: { code: string; discountAmount: number } | null;
  paymentDeadline: string | null;
  paidAt: string | null;
  cancelReason: CancelReason | null;
  latestPayment: Omit<PaymentView, "serverTime"> | null;
  loyaltyPointsEarned: number;
  loyaltyPointsReversed: number;
  canPay: boolean;
  canCancel: boolean;
  serverTime: string;
};

export type HistoryItem = Pick<
  OrderDetail,
  "id" | "version" | "status" | "createdAt" | "total" | "paymentDeadline" | "canPay" | "canCancel"
> & { totalItemQuantity: number };

export type HistoryView = { items: HistoryItem[]; serverTime: string };
