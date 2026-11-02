import type { AuthAction, AuthErrorCode, FieldErrors } from "./types.ts";

export class AuthApiError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly fieldErrors: FieldErrors;

  constructor(code: AuthErrorCode, message: string, status = 0, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "AuthApiError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/** Lỗi mà trình duyệt không thể kết luận server đã xử lý hay chưa. */
export function isOutcomeUnknown(error: AuthApiError): boolean {
  return (
    error.code === "NETWORK_ERROR" ||
    error.code === "CLIENT_TIMEOUT" ||
    error.code === "UPSTREAM_TIMEOUT" ||
    error.code === "UPSTREAM_UNAVAILABLE" ||
    error.code === "INVALID_RESPONSE" ||
    error.code === "INTERNAL_ERROR" ||
    error.status >= 500
  );
}

/**
 * Thông báo hiển thị cho người dùng, theo bảng phản ứng của v0.6.
 * Không bao giờ nói đã đăng xuất hoặc đã thu hồi phiên khi gặp lỗi hệ thống.
 */
export function messageForAuthError(error: AuthApiError, action: AuthAction): string {
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return "Email hoặc mật khẩu không đúng.";
    case "EMAIL_ALREADY_EXISTS":
      return "Email này đã được sử dụng.";
    case "VALIDATION_ERROR":
      return "Vui lòng kiểm tra thông tin đã nhập.";
    case "REQUEST_FORBIDDEN":
      return "Yêu cầu bị từ chối. Vui lòng tải lại trang rồi thử lại.";
    case "PAYLOAD_TOO_LARGE":
      return "Dữ liệu gửi đi quá lớn. Vui lòng rút ngắn rồi thử lại.";
    case "AUTH_REQUIRED":
    case "SESSION_INVALID":
      return "Vui lòng đăng nhập để tiếp tục.";
    case "SESSION_EXPIRED":
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    default:
      break;
  }

  if (!isOutcomeUnknown(error)) {
    return "Có lỗi xảy ra. Vui lòng thử lại.";
  }

  switch (action) {
    case "register":
      // Chưa rõ kết quả: không khẳng định tài khoản chắc chắn chưa được tạo.
      return "Chưa nhận được kết quả đăng ký. Tài khoản có thể đã được tạo; bạn có thể thử đăng nhập hoặc đăng ký lại.";
    case "logout":
      return "Chưa xác nhận đăng xuất hoàn tất. Phiên và giỏ hàng vẫn được giữ; vui lòng thử lại.";
    case "login":
      return "Không thể đăng nhập lúc này. Giỏ hàng của bạn vẫn được giữ; vui lòng thử lại.";
    case "me":
      return "Không kiểm tra được phiên đăng nhập lúc này.";
  }
}
