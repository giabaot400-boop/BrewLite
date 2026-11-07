// Trạng thái màn hình đọc đơn/lịch sử. Thuần túy để kiểm thử bằng node --test.
// Nguyên tắc: lỗi khi làm mới KHÔNG xóa dữ liệu đang hiển thị; dữ liệu cũ hơn không đè dữ liệu mới.

import { OrderApiError } from "./order-error.ts";
import { mergeHistory, pickOrder } from "./order-version.ts";
import type { HistoryView, OrderDetail } from "./types.ts";

export type ViewState<T> =
  | { phase: "loading"; data: null; error: null; receivedAtMs: null }
  | { phase: "ready"; data: T; error: OrderApiError | null; receivedAtMs: number }
  | { phase: "error"; data: null; error: OrderApiError; receivedAtMs: null };

export type ViewAction<T> =
  | { type: "start" }
  | { type: "success"; data: T; receivedAtMs: number }
  | { type: "failure"; error: OrderApiError };

export const initialViewState = <T>(): ViewState<T> => ({ phase: "loading", data: null, error: null, receivedAtMs: null });

function makeReducer<T>(accept: (current: T | null, incoming: T) => T) {
  return (state: ViewState<T>, action: ViewAction<T>): ViewState<T> => {
    switch (action.type) {
      case "start":
        // Có dữ liệu thì giữ nguyên (đang làm mới nền); chưa có thì quay về đang tải.
        return state.phase === "ready" ? { ...state, error: null } : initialViewState<T>();
      case "success": {
        const data = accept(state.data, action.data);
        // Nếu dữ liệu mới bị bỏ vì cũ hơn, giữ mốc nhận của bản đang hiển thị để đồng hồ không lệch.
        const receivedAtMs = data === action.data ? action.receivedAtMs : (state.receivedAtMs ?? action.receivedAtMs);
        return { phase: "ready", data, error: null, receivedAtMs };
      }
      case "failure":
        return state.phase === "ready"
          ? { ...state, error: action.error }
          : { phase: "error", data: null, error: action.error, receivedAtMs: null };
    }
  };
}

export const orderViewReducer = makeReducer<OrderDetail>((current, incoming) => pickOrder(current, incoming));
export const historyViewReducer = makeReducer<HistoryView>((current, incoming) => mergeHistory(current, incoming));

/**
 * Bộ đếm lượt đọc: chỉ lượt mới nhất được ghi vào màn hình; `cancel` bỏ mọi lượt đang chờ
 * (rời trang hoặc đổi phiên). Dùng đối tượng có phương thức để không đổi trực tiếp state của React.
 */
export function createTicketCounter() {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (ticket: number) => ticket === latest,
    cancel: () => { latest++; },
  };
}
