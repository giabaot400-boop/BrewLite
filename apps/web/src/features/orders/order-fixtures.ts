// Fixture đúng contract S3 để dựng/QA UI trước khi backend C/D/E tích hợp.
// KHÔNG phải bằng chứng E2E (TEAM_PLAN mục 3). Chỉ dùng khi NEXT_PUBLIC_ORDERS_SOURCE=mock.

import { OrderApiError } from "./order-error.ts";
import type { HistoryItem, HistoryView, OrderDetail, OrderLine } from "./types.ts";

const MIN = 60_000;

const LINE_CAPPUCCINO: OrderLine = {
  productId: "cappuccino",
  productName: "Cappuccino",
  size: "M",
  basePrice: 45_000,
  sizeExtraPrice: 5_000,
  unitPrice: 50_000,
  qty: 2,
  lineTotal: 100_000,
  toppings: [],
};

const LINE_LATTE: OrderLine = {
  productId: "latte",
  productName: "Latte",
  size: "L",
  basePrice: 50_000,
  sizeExtraPrice: 10_000,
  unitPrice: 65_000,
  qty: 1,
  lineTotal: 65_000,
  toppings: [{ toppingId: "pearl", name: "Trân châu", price: 5_000 }],
};

const iso = (ms: number) => new Date(ms).toISOString();

/** Đơn có mã DEMO10: 100.000 − 10.000 = 90.000. */
function discounted(nowMs: number, overrides: Partial<OrderDetail>): OrderDetail {
  const createdMs = nowMs - 5 * MIN;
  return {
    id: "ord-pending",
    version: 0,
    status: "PENDING",
    createdAt: iso(createdMs),
    items: [LINE_CAPPUCCINO],
    subtotal: 100_000,
    discountTotal: 10_000,
    total: 90_000,
    promotion: { code: "DEMO10", discountAmount: 10_000 },
    paymentDeadline: iso(createdMs + 15 * MIN),
    paidAt: null,
    cancelReason: null,
    latestPayment: null,
    loyaltyPointsEarned: 0,
    loyaltyPointsReversed: 0,
    canPay: true,
    canCancel: true,
    serverTime: iso(nowMs),
    ...overrides,
  };
}

function succeeded(orderId: string, nowMs: number, refunded = false) {
  return {
    id: `pay-${orderId}`,
    version: refunded ? 1 : 0,
    orderId,
    method: "WALLET" as const,
    amount: 90_000,
    status: "SUCCEEDED" as const,
    failureCode: null,
    createdAt: iso(nowMs - 3 * MIN),
    resolvedAt: iso(nowMs - 3 * MIN),
    refundedAmount: refunded ? 90_000 : 0,
    refundedAt: refunded ? iso(nowMs - MIN) : null,
  };
}

export function fixtureOrders(nowMs: number): OrderDetail[] {
  const paid = { paidAt: iso(nowMs - 3 * MIN), canPay: false, loyaltyPointsEarned: 9 };
  return [
    discounted(nowMs, {}),
    discounted(nowMs, {
      id: "ord-failed", version: 1, status: "PAYMENT_FAILED",
      latestPayment: { id: "pay-ord-failed", version: 0, orderId: "ord-failed", method: "CARD", amount: 90_000,
        status: "FAILED", failureCode: "PAYMENT_DECLINED", createdAt: iso(nowMs - 2 * MIN),
        resolvedAt: iso(nowMs - 2 * MIN), refundedAmount: 0, refundedAt: null },
    }),
    discounted(nowMs, { id: "ord-paid", version: 1, status: "PAID", ...paid, latestPayment: succeeded("ord-paid", nowMs) }),
    discounted(nowMs, { id: "ord-preparing", version: 2, status: "PREPARING", ...paid, canCancel: false,
      latestPayment: succeeded("ord-preparing", nowMs) }),
    discounted(nowMs, { id: "ord-ready", version: 3, status: "READY", ...paid, canCancel: false,
      latestPayment: succeeded("ord-ready", nowMs) }),
    discounted(nowMs, { id: "ord-done", version: 4, status: "COMPLETED", ...paid, canCancel: false,
      latestPayment: succeeded("ord-done", nowMs) }),
    discounted(nowMs, { id: "ord-expired", version: 1, status: "CANCELLED", cancelReason: "PAYMENT_WINDOW_EXPIRED",
      canPay: false, canCancel: false, paymentDeadline: iso(nowMs - MIN) }),
    discounted(nowMs, { id: "ord-refunded", version: 2, status: "CANCELLED", cancelReason: "CUSTOMER_REQUEST",
      canPay: false, canCancel: false, paidAt: iso(nowMs - 3 * MIN), loyaltyPointsEarned: 9, loyaltyPointsReversed: 9,
      latestPayment: succeeded("ord-refunded", nowMs, true) }),
    // Đơn cũ (policy 1): chỉ xem, canPay/canCancel=false, không mã, không hạn.
    {
      id: "ord-legacy", version: 0, status: "PENDING", createdAt: iso(nowMs - 3 * 24 * 60 * MIN),
      items: [LINE_LATTE], subtotal: 65_000, discountTotal: 0, total: 65_000, promotion: null,
      paymentDeadline: null, paidAt: null, cancelReason: null, latestPayment: null,
      loyaltyPointsEarned: 0, loyaltyPointsReversed: 0, canPay: false, canCancel: false, serverTime: iso(nowMs),
    },
  ];
}

export function toHistoryItem(order: OrderDetail): HistoryItem {
  return {
    id: order.id, version: order.version, status: order.status, createdAt: order.createdAt, total: order.total,
    paymentDeadline: order.paymentDeadline, canPay: order.canPay, canCancel: order.canCancel,
    totalItemQuantity: order.items.reduce((sum, line) => sum + line.qty, 0),
  };
}

export function fixtureHistory(nowMs: number): HistoryView {
  const items = fixtureOrders(nowMs).map(toHistoryItem).sort((a, b) => {
    const t = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return t !== 0 ? t : a.id < b.id ? 1 : -1;
  });
  return { items, serverTime: iso(nowMs) };
}

/** Client giả: trễ ngắn để thấy trạng thái đang tải; id lạ → 404 như backend (không lộ chủ). */
export function createMockOrderReadClient(now: () => number = Date.now, delayMs = 250) {
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, delayMs));
  return {
    async getOrder(id: string): Promise<OrderDetail> {
      await wait();
      const found = fixtureOrders(now()).find(order => order.id === id);
      if (!found) throw new OrderApiError("RESOURCE_NOT_FOUND", "", 404);
      return found;
    },
    async getHistory(): Promise<HistoryView> {
      await wait();
      return fixtureHistory(now());
    },
  };
}
