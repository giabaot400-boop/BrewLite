import type { ReactNode } from "react";
import { Button } from "./button";
import { Card } from "./card";

/** Đang tải: đọc được bằng trình đọc màn hình qua role="status". */
export function LoadingState({ message }: { message: string }) {
  return (
    <p role="status" className="text-stone-600">
      {message}
    </p>
  );
}

/** Danh sách rỗng. */
export function EmptyState({ message }: { message: string }) {
  return (
    <Card className="px-6 py-10">
      <p className="text-stone-600">{message}</p>
    </Card>
  );
}

type ErrorStateProps = {
  message: string;
  title?: string;
  /** Có hàm này thì hiện nút "Thử lại". */
  onRetry?: () => void;
  children?: ReactNode;
};

/** Lỗi: role="alert", có nút thử lại khi truyền onRetry. */
export function ErrorState({ message, title, onRetry, children }: ErrorStateProps) {
  return (
    <Card className="px-6 py-10">
      {title && <h1 className="text-2xl font-bold">{title}</h1>}
      <p role="alert" className={title ? "mt-4 text-stone-600" : undefined}>
        {message}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button onClick={onRetry}>Thử lại</Button>
        </div>
      )}
      {children}
    </Card>
  );
}

/** Khung giữ chỗ khi đang tải, cùng kích thước với ProductCard. */
export function ProductCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="aspect-4/3 rounded-xl bg-stone-100" />
      <div className="mt-5 h-5 w-2/3 rounded bg-stone-100" />
      <div className="mt-3 h-5 w-1/3 rounded bg-stone-100" />
    </Card>
  );
}
