import type { ReactNode } from "react";

/** Class nền của card để Link hoặc button có thể dùng chung kiểu dáng. */
export const cardClassName = "rounded-2xl border border-stone-200 bg-white";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${cardClassName} ${className}`.trim()}>{children}</div>;
}
