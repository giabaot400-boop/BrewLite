import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, string> = {
  error: "border-red-300 bg-red-50 text-red-900",
  success: "border-green-300 bg-green-50 text-green-900",
  info: "border-stone-300 bg-stone-50 text-ink",
};

type AlertProps = {
  tone?: Tone;
  children: ReactNode;
  /** Id để ô nhập liên kết bằng aria-describedby hoặc đưa focus vào. */
  id?: string;
};

/** Thông báo trong trang. error dùng role="alert"; còn lại role="status". */
export function Alert({ tone = "info", children, id }: AlertProps) {
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
