const DEFAULT_RETURN_TO = "/";

/**
 * Đích quay lại sau đăng nhập. Chỉ nhận đường dẫn nội bộ để tránh open redirect:
 * phải bắt đầu bằng một dấu "/" và không có "//", "\" hay ký tự điều khiển.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return DEFAULT_RETURN_TO;
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_RETURN_TO;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_RETURN_TO;
  return value;
}

/** Giữ đích quay lại khi chuyển giữa đăng nhập và đăng ký. */
export function withReturnTo(path: "/login" | "/register", returnTo: string): string {
  const safe = sanitizeReturnTo(returnTo);
  return safe === DEFAULT_RETURN_TO ? path : `${path}?next=${encodeURIComponent(safe)}`;
}

export type LoginNotice = "expired" | "required";

/** Chỉ chấp nhận giá trị đã biết cho tham số reason. */
export function parseLoginNotice(value: string | null | undefined): LoginNotice | null {
  return value === "expired" || value === "required" ? value : null;
}
