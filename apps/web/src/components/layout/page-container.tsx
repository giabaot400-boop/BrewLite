import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "./skip-link";

/** Chiều rộng và padding ngang dùng chung cho header và nội dung. */
export const PAGE_WIDTH = "mx-auto w-full max-w-6xl px-5 sm:px-8";

type PageContainerProps = {
  children: ReactNode;
  /** default: trang danh sách; compact: trang chi tiết và trang trạng thái. */
  spacing?: "default" | "compact";
};

const spacingClass = {
  default: "py-12 sm:py-16",
  compact: "py-10",
} as const;

/** Mỗi trang dùng đúng một PageContainer; đây là landmark <main> của trang. */
export function PageContainer({ children, spacing = "default" }: PageContainerProps) {
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className={`${PAGE_WIDTH} ${spacingClass[spacing]} outline-none`}>
      {children}
    </main>
  );
}
