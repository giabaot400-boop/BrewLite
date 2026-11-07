// Chống ghi đè trạng thái mới bằng dữ liệu cũ (AC S3-ORD-03).
// version của Order tăng mỗi lần đổi nghiệp vụ (CONTRACTS mục 2); UI không bao giờ hạ version.
// Replay create hay response về muộn có thể mang trạng thái lịch sử (PENDING) cho đơn đã PAID:
// những dữ liệu đó không được đè lên bản đọc hiện tại.

import type { HistoryItem, HistoryView, OrderDetail } from "./types.ts";

/** true nếu `incoming` được phép thay `current` trong màn hình. */
export function shouldAcceptOrder(current: OrderDetail | null, incoming: OrderDetail): boolean {
  if (current === null || current.id !== incoming.id) return true;
  if (incoming.version !== current.version) return incoming.version > current.version;
  // Cùng version: dữ liệu giống nhau; nhận lượt đọc mới hơn để đồng hồ server được làm mới.
  return Date.parse(incoming.serverTime) >= Date.parse(current.serverTime);
}

export function pickOrder(current: OrderDetail | null, incoming: OrderDetail): OrderDetail {
  return shouldAcceptOrder(current, incoming) ? incoming : (current as OrderDetail);
}

function byCreatedAtDesc(a: HistoryItem, b: HistoryItem): number {
  const t = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (t !== 0) return t;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC khi cùng createdAt
}

/**
 * Gộp lịch sử: một lượt đọc cũ hơn (serverTime nhỏ hơn) bị bỏ hoàn toàn;
 * lượt mới hơn là danh sách đúng nhưng từng đơn không bị hạ version so với bản đang có.
 */
export function mergeHistory(current: HistoryView | null, incoming: HistoryView): HistoryView {
  if (current === null) return incoming;
  if (Date.parse(incoming.serverTime) < Date.parse(current.serverTime)) return current;
  const known = new Map(current.items.map(item => [item.id, item]));
  const items = incoming.items.map(item => {
    const existing = known.get(item.id);
    return existing && existing.version > item.version ? existing : item;
  });
  return { items: items.sort(byCreatedAtDesc), serverTime: incoming.serverTime };
}

/** Khi chi tiết đơn mới hơn bản trong lịch sử, đồng bộ dòng lịch sử tương ứng. */
export function applyDetailToHistory(history: HistoryView, detail: OrderDetail): HistoryView {
  let changed = false;
  const items = history.items.map(item => {
    if (item.id !== detail.id || item.version >= detail.version) return item;
    changed = true;
    return {
      ...item,
      version: detail.version,
      status: detail.status,
      total: detail.total,
      paymentDeadline: detail.paymentDeadline,
      canPay: detail.canPay,
      canCancel: detail.canCancel,
    };
  });
  return changed ? { ...history, items } : history;
}
