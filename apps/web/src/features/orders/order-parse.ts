// Kiểm tra phản hồi đọc đơn theo CONTRACTS mục 2. Phản hồi 2xx sai hình dạng
// là INVALID_RESPONSE (chưa tin được), không được hiển thị một phần.
// Mọi object trả về được dựng lại từng trường: trường lạ (kể cả nhạy cảm) bị bỏ.

import { OrderApiError } from "./order-error.ts";
import { ORDER_STATUSES } from "./types.ts";
import type {
  CancelReason,
  HistoryItem,
  HistoryView,
  OrderDetail,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Size,
} from "./types.ts";

const MAX_INT = 2147483647;

function invalid(what: string): never {
  throw new OrderApiError("INVALID_RESPONSE", `Phản hồi không đúng định dạng (${what}).`);
}

function rec(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(what);
  return value as Record<string, unknown>;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") invalid(what);
  return value as string;
}

function int(value: unknown, what: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > MAX_INT) invalid(what);
  return value as number;
}

function bool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") invalid(what);
  return value as boolean;
}

function iso(value: unknown, what: string): string {
  const s = str(value, what);
  if (Number.isNaN(Date.parse(s))) invalid(what);
  return s;
}

function isoOrNull(value: unknown, what: string): string | null {
  return value === null ? null : iso(value, what);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(what);
  return value as T;
}

const SIZES: readonly Size[] = ["S", "M", "L"];
const METHODS: readonly PaymentMethod[] = ["WALLET", "CARD"];
const PAYMENT_STATUSES: readonly PaymentStatus[] = ["FAILED", "SUCCEEDED"];
const CANCEL_REASONS: readonly CancelReason[] = ["CUSTOMER_REQUEST", "PAYMENT_WINDOW_EXPIRED"];

function parseLine(value: unknown): OrderLine {
  const o = rec(value, "items[]");
  if (!Array.isArray(o.toppings)) invalid("items[].toppings");
  return {
    productId: str(o.productId, "items[].productId"),
    productName: str(o.productName, "items[].productName"),
    size: oneOf(o.size, SIZES, "items[].size"),
    basePrice: int(o.basePrice, "items[].basePrice"),
    sizeExtraPrice: int(o.sizeExtraPrice, "items[].sizeExtraPrice"),
    unitPrice: int(o.unitPrice, "items[].unitPrice"),
    qty: int(o.qty, "items[].qty", 1),
    lineTotal: int(o.lineTotal, "items[].lineTotal"),
    toppings: (o.toppings as unknown[]).map(t => {
      const top = rec(t, "toppings[]");
      return {
        toppingId: str(top.toppingId, "toppings[].toppingId"),
        name: str(top.name, "toppings[].name"),
        price: int(top.price, "toppings[].price"),
      };
    }),
  };
}

function parsePayment(value: unknown): NonNullable<OrderDetail["latestPayment"]> {
  const o = rec(value, "latestPayment");
  const failureCode = o.failureCode;
  if (failureCode !== null && failureCode !== "PAYMENT_DECLINED") invalid("latestPayment.failureCode");
  return {
    id: str(o.id, "latestPayment.id"),
    version: int(o.version, "latestPayment.version"),
    orderId: str(o.orderId, "latestPayment.orderId"),
    method: oneOf(o.method, METHODS, "latestPayment.method"),
    amount: int(o.amount, "latestPayment.amount", 1),
    status: oneOf(o.status, PAYMENT_STATUSES, "latestPayment.status"),
    failureCode: failureCode as "PAYMENT_DECLINED" | null,
    createdAt: iso(o.createdAt, "latestPayment.createdAt"),
    resolvedAt: iso(o.resolvedAt, "latestPayment.resolvedAt"),
    refundedAmount: int(o.refundedAmount, "latestPayment.refundedAmount"),
    refundedAt: isoOrNull(o.refundedAt, "latestPayment.refundedAt"),
  };
}

export function parseOrderDetail(value: unknown): OrderDetail {
  const o = rec(value, "order");
  if (!Array.isArray(o.items)) invalid("items");
  let promotion: OrderDetail["promotion"] = null;
  if (o.promotion !== null) {
    const p = rec(o.promotion, "promotion");
    promotion = { code: str(p.code, "promotion.code"), discountAmount: int(p.discountAmount, "promotion.discountAmount") };
  }
  const cancelReason = o.cancelReason === null ? null : oneOf(o.cancelReason, CANCEL_REASONS, "cancelReason");
  return {
    id: str(o.id, "id"),
    version: int(o.version, "version"),
    status: oneOf<OrderStatus>(o.status, ORDER_STATUSES, "status"),
    createdAt: iso(o.createdAt, "createdAt"),
    items: (o.items as unknown[]).map(parseLine),
    subtotal: int(o.subtotal, "subtotal"),
    discountTotal: int(o.discountTotal, "discountTotal"),
    total: int(o.total, "total"),
    promotion,
    paymentDeadline: isoOrNull(o.paymentDeadline, "paymentDeadline"),
    paidAt: isoOrNull(o.paidAt, "paidAt"),
    cancelReason,
    latestPayment: o.latestPayment === null ? null : parsePayment(o.latestPayment),
    loyaltyPointsEarned: int(o.loyaltyPointsEarned, "loyaltyPointsEarned"),
    loyaltyPointsReversed: int(o.loyaltyPointsReversed, "loyaltyPointsReversed"),
    canPay: bool(o.canPay, "canPay"),
    canCancel: bool(o.canCancel, "canCancel"),
    serverTime: iso(o.serverTime, "serverTime"),
  };
}

function parseHistoryItem(value: unknown): HistoryItem {
  const o = rec(value, "history.items[]");
  return {
    id: str(o.id, "items[].id"),
    version: int(o.version, "items[].version"),
    status: oneOf<OrderStatus>(o.status, ORDER_STATUSES, "items[].status"),
    createdAt: iso(o.createdAt, "items[].createdAt"),
    total: int(o.total, "items[].total"),
    paymentDeadline: isoOrNull(o.paymentDeadline, "items[].paymentDeadline"),
    canPay: bool(o.canPay, "items[].canPay"),
    canCancel: bool(o.canCancel, "items[].canCancel"),
    totalItemQuantity: int(o.totalItemQuantity, "items[].totalItemQuantity"),
  };
}

export function parseHistory(value: unknown): HistoryView {
  const o = rec(value, "history");
  if (!Array.isArray(o.items)) invalid("items");
  return { items: (o.items as unknown[]).map(parseHistoryItem), serverTime: iso(o.serverTime, "serverTime") };
}
