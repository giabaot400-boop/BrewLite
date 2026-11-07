"use client";

import { ErrorState, LoadingState } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { guidanceForOrderError } from "../order-error";
import { useOrderDetail } from "../use-order-reads";
import { OrderDetailView, type OrderActionFlags } from "./order-detail-view";
import { RequireSession } from "./require-session";
import type { ReactNode } from "react";

type Props = {
  id: string;
  placed: boolean;
  renderActions?: (flags: OrderActionFlags) => ReactNode;
};

function Loader({ id, placed, renderActions }: Props) {
  const { state, reload } = useOrderDetail(id);

  if (state.phase === "loading") return <LoadingState message="Đang tải đơn hàng…" />;

  if (state.phase === "error") {
    const guidance = guidanceForOrderError(state.error);
    return (
      <ErrorState
        title="Không mở được đơn hàng"
        message={guidance.message}
        onRetry={guidance.action === "none" || guidance.action === "login" ? undefined : reload}
      >
        <div className="mt-4">
          <ButtonLink href="/orders" variant="text">
            Xem lịch sử đơn
          </ButtonLink>
        </div>
      </ErrorState>
    );
  }

  return (
    <OrderDetailView
      order={state.data}
      receivedAtMs={state.receivedAtMs}
      placed={placed}
      refreshError={state.error}
      onRefresh={reload}
      renderActions={renderActions}
    />
  );
}

/** Trang xác nhận/chi tiết đơn. Đổi chủ hoặc phiên thì Loader được dựng lại (key) và bỏ dữ liệu cũ. */
export function OrderDetailPage(props: Props) {
  return (
    <RequireSession returnTo={`/orders/${encodeURIComponent(props.id)}`}>
      {({ ownerId, sessionVersion }) => <Loader key={`${ownerId}:${sessionVersion}:${props.id}`} {...props} />}
    </RequireSession>
  );
}
