"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, cardClassName } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state-message";
import { guidanceForOrderError, needsSessionResync } from "../order-error";
import { formatDateTime, formatMoney, shortOrderId } from "../order-format";
import { useOrderHistory } from "../use-order-reads";
import type { HistoryItem } from "../types";
import { isLegacyViewOnly } from "../order-status";
import { OrderStatusBadge } from "./order-status-badge";
import { RequireSession, loginHref } from "./require-session";

function HistoryRow({ item }: { item: HistoryItem }) {
  return (
    <li>
      <Link
        href={`/orders/${encodeURIComponent(item.id)}`}
        className={`${cardClassName} flex flex-wrap items-center justify-between gap-3 p-4`}
      >
        <span>
          <span className="block font-semibold">{shortOrderId(item.id)}</span>
          <span className="block text-sm text-stone-600">
            {formatDateTime(item.createdAt)} · {item.totalItemQuantity} món
            {isLegacyViewOnly(item) && " · Đơn cũ, chỉ xem"}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="tabular-nums font-semibold">{formatMoney(item.total)}</span>
          <OrderStatusBadge status={item.status} />
        </span>
      </Link>
    </li>
  );
}

function Loader() {
  const { state, reload } = useOrderHistory();

  if (state.phase === "loading") return <LoadingState message="Đang tải lịch sử đơn hàng…" />;

  if (state.phase === "error") {
    const guidance = guidanceForOrderError(state.error);
    return (
      <ErrorState
        message={guidance.message}
        onRetry={guidance.action === "none" || guidance.action === "login" ? undefined : reload}
      >
        {needsSessionResync(state.error) && (
          <div className="mt-4">
            <ButtonLink href={loginHref("/orders")}>Đăng nhập lại</ButtonLink>
          </div>
        )}
      </ErrorState>
    );
  }

  const { items } = state.data;
  return (
    <div className="space-y-4">
      {state.error && (
        <Alert tone="error">
          {guidanceForOrderError(state.error).message} Đang hiển thị danh sách đã nhận trước đó.
        </Alert>
      )}
      {items.length === 0 ? (
        <Card className="space-y-4 px-6 py-10">
          <EmptyState message="Bạn chưa có đơn hàng nào." />
          <ButtonLink href="/">Xem thực đơn</ButtonLink>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <HistoryRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={reload}>
        Làm mới danh sách
      </Button>
    </div>
  );
}

export function OrderHistoryPage() {
  return (
    <RequireSession returnTo="/orders">
      {({ ownerId, sessionVersion }) => <Loader key={`${ownerId}:${sessionVersion}`} />}
    </RequireSession>
  );
}
