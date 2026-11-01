import type { FieldErrors } from "./types.ts";

// Quy tắc theo P08 (Sprint 2 v0.6). Nhóm tự chọn 15 ký tự và 72 byte;
// backend kiểm tra lại cùng quy tắc.
export const PASSWORD_MIN_CODE_POINTS = 15;
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Trim khoảng trắng ngoài và chuyển chữ thường; không áp dụng cho mật khẩu. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Số Unicode code point, không phải độ dài UTF-16 của chuỗi. */
export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function hasLoneSurrogate(value: string): boolean {
  return LONE_SURROGATE.test(value);
}

export function validateEmail(email: string): string | null {
  const value = normalizeEmail(email);
  if (value === "") return "Vui lòng nhập email.";
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(value)) {
    return "Email không đúng định dạng.";
  }
  return null;
}

/** Kiểm tra mật khẩu khi đăng ký (REG-AC-08). Không trim, không cắt, không chuẩn hóa. */
export function validateNewPassword(password: string): string | null {
  if (password === "") return "Vui lòng nhập mật khẩu.";
  if (password.includes("\u0000") || hasLoneSurrogate(password)) {
    return "Mật khẩu chứa ký tự không được hỗ trợ.";
  }
  if (countCodePoints(password) < PASSWORD_MIN_CODE_POINTS) {
    return `Mật khẩu cần ít nhất ${PASSWORD_MIN_CODE_POINTS} ký tự.`;
  }
  if (utf8ByteLength(password) > PASSWORD_MAX_BYTES) {
    return `Mật khẩu không được vượt quá ${PASSWORD_MAX_BYTES} byte (UTF-8). Hãy rút ngắn hoặc bớt ký tự đặc biệt.`;
  }
  return null;
}

export type RegisterInput = { email: string; password: string; confirmPassword: string };
export type LoginInput = { email: string; password: string };

export function validateRegister(input: RegisterInput): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = [email];
  const password = validateNewPassword(input.password);
  if (password) errors.password = [password];
  if (input.confirmPassword === "") {
    errors.confirmPassword = ["Vui lòng nhập lại mật khẩu."];
  } else if (input.confirmPassword !== input.password) {
    errors.confirmPassword = ["Hai mật khẩu không khớp."];
  }
  return errors;
}

/** Đăng nhập chỉ kiểm tra trường bắt buộc và email; không áp quy tắc độ dài mới. */
export function validateLogin(input: LoginInput): FieldErrors {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = [email];
  if (input.password === "") errors.password = ["Vui lòng nhập mật khẩu."];
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
