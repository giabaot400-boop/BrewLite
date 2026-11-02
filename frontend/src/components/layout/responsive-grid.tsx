import type { ReactNode } from "react";

/**
 * Lưới theo hồ sơ mục 6.4: dưới 640 px một cột, từ 640 px hai cột,
 * từ 1024 px bốn cột.
 */
export function ResponsiveGrid({
  children,
  hidden = false,
}: {
  children: ReactNode;
  /** true cho lưới chỉ để trang trí (skeleton), ẩn khỏi trình đọc màn hình. */
  hidden?: boolean;
}) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      {children}
    </div>
  );
}
