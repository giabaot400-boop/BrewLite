// Bảng lỗi dùng chung cho đọc đơn (B) và tạo/thanh toán/hủy (A).
// Nguồn: CONTRACTS mục 3. Lỗi có chủ đích KHÔNG nói "thất bại cuối" khi chưa có kết quả đáng tin.

export type OrderErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_INVALID"
  | "REQUEST_FORBIDDEN"
  | "RESOURCE_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "CHECKOUT_CHANGED"
  | "PRICE_CHANGED"
  | "ORDER_REQUEST_IN_PROGRESS"
  | "PROMOTION_NOT_APPLICABLE"
  | "OUT_OF_STOCK"
  | "ORDER_NOT_PAYABLE"
  | "PAYMENT_WINDOW_EXPIRED"
  | "ORDER_NOT_CANCELLABLE"
  | "LEGACY_ORDER_REQUIRES_REVIEW"
  | "PAYLOAD_TOO_LARGE"
  | "TRANSACTION_RETRY_EXHAUSTED"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "INTERNAL_ERROR"
  // Chỉ phát sinh ở trình duyệt hoặc khi phản hồi 2xx sai contract.
  | "NETWORK_ERROR"
  | "CLIENT_TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

export class OrderApiError extends Error {
  readonly code: OrderErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: OrderErrorCode, message: string, status = 0, details: unknown = undefined) {
    super(message);
    this.name = "OrderApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Việc UI nên làm tiếp. UI không tự thực hiện thay khách (không auto-retry, không đổi key). */
export type ErrorAction =
  | "login" // đề nghị đăng nhập, giữ dữ liệu theo chủ
  | "stop" // dừng, không gửi tiếp
  | "review" // khách xem lại giá/mã/món rồi xác nhận yêu cầu mới
  | "retry-same" // khách chủ động thử lại CHÍNH yêu cầu đó
  | "refresh" // đọc lại trạng thái đơn hiện tại
  | "none";

export type ErrorGuidance = {
  message: string;
  action: ErrorAction;
  /** true: chưa có kết quả đáng tin; không được báo thất bại cuối. */
  outcomeUnknown: boolean;
  /** false khi code/reason không thuộc contract đã biết: không coi là lỗi đã xác nhận. */
  confirmed: boolean;
};

const PROMOTION_REASONS: Record<string, string> = {
  NOT_FOUND: "Mã giảm giá không tồn tại.",
  INACTIVE: "Mã giảm giá hiện không hoạt động.",
  NOT_STARTED: "Mã giảm giá chưa đến thời gian áp dụng.",
  EXPIRED: "Mã giảm giá đã hết hạn.",
  MINIMUM_NOT_MET: "Đơn hàng chưa đạt giá trị tối thiểu của mã giảm giá.",
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function outOfStockMessage(details: unknown): string | null {
  if (!record(details) || !Array.isArray(details.resources) || details.resources.length === 0) return null;
  const parts: string[] = [];
  for (const entry of details.resources) {
    if (!record(entry) || entry.kind !== "PRODUCT" || typeof entry.id !== "string"
      || !Number.isSafeInteger(entry.requested) || !Number.isSafeInteger(entry.available)) return null;
    parts.push(`${entry.id}: cần ${entry.requested}, còn ${entry.available}`);
  }
  return `Một số món không đủ số lượng (${parts.join("; ")}). Hãy giảm số lượng rồi xác nhận lại.`;
}

/** Lỗi mạng/timeout/body sai/5xx: chưa biết server đã xử lý hay chưa. */
export function isOutcomeUnknown(error: OrderApiError): boolean {
  if (error.code === "TRANSACTION_RETRY_EXHAUSTED") return false; // server nói rõ: chưa hoàn tất, thử lại đúng yêu cầu
  return (
    error.code === "NETWORK_ERROR" ||
    error.code === "CLIENT_TIMEOUT" ||
    error.code === "UPSTREAM_TIMEOUT" ||
    error.code === "UPSTREAM_UNAVAILABLE" ||
    error.code === "INVALID_RESPONSE" ||
    error.code === "INTERNAL_ERROR" ||
    error.code === "UNKNOWN" ||
    error.status >= 500
  );
}

export function guidanceForOrderError(error: OrderApiError): ErrorGuidance {
  const unknown = isOutcomeUnknown(error);
  const make = (message: string, action: ErrorAction, confirmed = true): ErrorGuidance =>
    ({ message, action, outcomeUnknown: unknown, confirmed });

  switch (error.code) {
    case "AUTH_REQUIRED":
    case "SESSION_INVALID":
      return make("Vui lòng đăng nhập đúng tài khoản để tiếp tục.", "login");
    case "SESSION_EXPIRED":
      return make("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "login");
    case "REQUEST_FORBIDDEN":
      return make("Phiên hiện tại không khớp tài khoản của thao tác này. Hãy kiểm tra tài khoản đang đăng nhập.", "stop");
    case "RESOURCE_NOT_FOUND":
      // Không phân biệt "không tồn tại" và "của người khác" để không lộ dữ liệu.
      return make("Không tìm thấy đơn hàng này trong tài khoản của bạn.", "none");
    case "IDEMPOTENCY_CONFLICT":
      return make("Yêu cầu này trùng mã với một yêu cầu khác nội dung. Đã dừng để tránh đặt nhầm.", "stop");
    case "CHECKOUT_CHANGED":
      return make("Giá hoặc tổng tiền đã thay đổi. Hãy xem lại giỏ hàng rồi xác nhận lại.", "review");
    case "PRICE_CHANGED":
      return make("Giá một số món đã thay đổi. Hãy xem lại giá mới rồi xác nhận lại.", "review");
    case "ORDER_REQUEST_IN_PROGRESS":
      return make("Yêu cầu trước đó vẫn đang được xử lý. Vui lòng thử lại sau ít giây.", "retry-same");
    case "PROMOTION_NOT_APPLICABLE": {
      const reason = record(error.details) && typeof error.details.reason === "string" ? error.details.reason : null;
      const text = reason !== null ? PROMOTION_REASONS[reason] : undefined;
      // Lý do lạ: vẫn báo mã không áp dụng được nhưng không coi là lỗi đã xác nhận.
      return text
        ? make(text, "review")
        : make("Mã giảm giá không áp dụng được cho đơn này.", "review", false);
    }
    case "OUT_OF_STOCK": {
      const text = outOfStockMessage(error.details);
      return text ? make(text, "review") : make("Một số món hiện không đủ số lượng. Hãy chỉnh giỏ hàng rồi xác nhận lại.", "review");
    }
    case "ORDER_NOT_PAYABLE":
      return make("Đơn này không còn ở trạng thái có thể thanh toán. Đang hiển thị trạng thái hiện tại.", "refresh");
    case "PAYMENT_WINDOW_EXPIRED":
      return make("Đơn đã quá hạn thanh toán và sẽ được hủy tự động.", "refresh");
    case "ORDER_NOT_CANCELLABLE":
      return make("Đơn đã vào pha chế nên không thể hủy.", "refresh");
    case "LEGACY_ORDER_REQUIRES_REVIEW":
      return make("Đơn cũ này chỉ có thể xem, không thể thanh toán hay hủy tại đây.", "none");
    case "PAYLOAD_TOO_LARGE":
      return make("Nội dung gửi đi quá lớn.", "stop");
    case "TRANSACTION_RETRY_EXHAUSTED":
      return make("Hệ thống đang bận, chưa xử lý xong. Bạn có thể thử lại chính yêu cầu này.", "retry-same");
    case "VALIDATION_ERROR":
      return make("Dữ liệu gửi đi không hợp lệ.", "stop");
    case "CLIENT_TIMEOUT":
    case "UPSTREAM_TIMEOUT":
      return make("Hết thời gian chờ phản hồi. Chưa xác nhận được kết quả.", "retry-same");
    case "NETWORK_ERROR":
      return make("Không kết nối được máy chủ. Chưa xác nhận được kết quả.", "retry-same");
    default:
      return make("Chưa xác nhận được kết quả. Vui lòng thử lại.", "retry-same", error.code !== "UNKNOWN");
  }
}

/** Dùng khi chỉ cần thông báo cho trang đọc đơn/lịch sử. */
export function messageForOrderError(error: OrderApiError): string {
  return guidanceForOrderError(error).message;
}

/** Lỗi cho thấy phiên UI có thể đã lệch với cookie: cần đồng bộ lại auth và/hoặc đăng nhập lại. */
export function needsSessionResync(error: OrderApiError): boolean {
  return guidanceForOrderError(error).action === "login" || error.code === "REQUEST_FORBIDDEN";
}
