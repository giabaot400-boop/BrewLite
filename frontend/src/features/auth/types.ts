// Contract: docs Sprint 2 v0.6, mục "Hợp đồng API xác thực" và "Hợp đồng lỗi dùng chung".

export type AuthUser = { id: string; email: string };

/** expiresAt do backend quyết định; UI chỉ lưu nguyên giá trị nhận được. */
export type AuthSession = { user: AuthUser; expiresAt: string | number };

/** Giá trị của header X-BrewLite-Logout-Scope trong phản hồi 204. */
export type LogoutScope = "session" | "local";

export type FieldErrors = Record<string, string[]>;

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_INVALID"
  | "REQUEST_FORBIDDEN"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  // Phản hồi 2xx nhưng thân/header không đúng contract: chưa kết luận được kết quả.
  | "INVALID_RESPONSE"
  // Chỉ phát sinh ở trình duyệt: không có phản hồi HTTP hoặc quá 15.000 ms.
  | "NETWORK_ERROR"
  | "CLIENT_TIMEOUT"
  | "UNKNOWN";

export type AuthAction = "register" | "login" | "logout" | "me";
