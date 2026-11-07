"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { OrderApiError } from "./order-error";
import { createOrderReadClient, type OrderReadClient } from "./order-read-client";
import { createTicketCounter, historyViewReducer, initialViewState, orderViewReducer, type ViewAction, type ViewState } from "./order-view-state";
import type { HistoryView, OrderDetail } from "./types";

type Loaded<T> = {
  state: ViewState<T>;
  /** Tải lại; dữ liệu đang hiển thị được giữ trong lúc chờ. */
  reload: () => void;
};

function useRead<T>(
  reducer: (state: ViewState<T>, action: ViewAction<T>) => ViewState<T>,
  /** Phải ổn định giữa các lần render (useCallback) vì là đầu vào của effect. */
  load: (client: OrderReadClient) => Promise<T>,
  client?: OrderReadClient,
): Loaded<T> {
  const { status, getSessionVersion } = useAuth();
  const http = useMemo(() => client ?? createOrderReadClient(), [client]);
  const [state, dispatch] = useReducer(reducer, undefined, initialViewState<T>);
  // Bộ đếm lượt đọc: lượt cũ về muộn hoặc sau khi rời trang bị bỏ.
  const [tracker] = useState(createTicketCounter);

  // Mỗi lượt đọc nhớ phiên lúc bắt đầu. Phản hồi đến sau khi phiên đổi (đăng xuất, đổi tài khoản)
  // bị bỏ, để dữ liệu của chủ cũ không hiện cho chủ mới. Màn hình còn được tách bằng key theo chủ.
  const run = useCallback(async () => {
    const sessionAtStart = getSessionVersion();
    const ticket = tracker.next();
    try {
      const data = await load(http);
      if (!tracker.isCurrent(ticket) || getSessionVersion() !== sessionAtStart) return;
      dispatch({ type: "success", data, receivedAtMs: Date.now() });
    } catch (error) {
      if (!tracker.isCurrent(ticket) || getSessionVersion() !== sessionAtStart) return;
      dispatch({ type: "failure", error: error instanceof OrderApiError ? error : new OrderApiError("UNKNOWN", "") });
    }
  }, [getSessionVersion, http, load, tracker]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void run();
    return () => {
      tracker.cancel(); // hủy kết quả của lượt đang chờ khi rời trang
    };
  }, [status, run, tracker]);

  const reload = useCallback(() => {
    dispatch({ type: "start" });
    void run();
  }, [run]);

  return { state, reload };
}

export function useOrderDetail(id: string, client?: OrderReadClient): Loaded<OrderDetail> {
  const load = useCallback((c: OrderReadClient) => c.getOrder(id), [id]);
  return useRead<OrderDetail>(orderViewReducer, load, client);
}

const loadHistory = (c: OrderReadClient) => c.getHistory();

export function useOrderHistory(client?: OrderReadClient): Loaded<HistoryView> {
  return useRead<HistoryView>(historyViewReducer, loadHistory, client);
}
