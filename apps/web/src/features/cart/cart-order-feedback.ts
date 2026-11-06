import { getCartLineKey } from "./cart-reducer.ts";
import type { PendingCartRequest } from "./cart-envelope";
import type { OrderSettlementResult } from "./cart-order-settlement";

export type CartOrderFeedback = {
  kind: "confirmed" | "price" | "rejected" | "unknown" | "local-error";
  message: string;
  lineErrors: Readonly<Record<string, readonly string[]>>;
  globalErrors: readonly string[];
  loginReason: "expired" | "required" | null;
  repriced: boolean;
};

export function localOrderError(message: string): CartOrderFeedback {
  return { kind: "local-error", message, lineErrors: {}, globalErrors: [], loginReason: null, repriced: false };
}

export function orderFeedback(result: OrderSettlementResult, request: PendingCartRequest): CartOrderFeedback {
  const feedback: CartOrderFeedback = { kind: "unknown", message: "Chưa xác định được kết quả. Giữ nguyên lần đặt để thử lại.",
    lineErrors: {}, globalErrors: [], loginReason: null, repriced: false };
  const outcome = result.outcome;
  if (outcome.kind === "IGNORED") {
    const saved = result.envelope.lastOrderResult;
    return saved?.ownerId === request.ownerId && saved.requestKey === request.requestKey
      ? { ...feedback, kind: "confirmed", message: "Đơn đã được xác nhận ở lượt xử lý khác. Chờ thanh toán." }
      : localOrderError("Phản hồi thuộc lượt xử lý cũ. Vui lòng kiểm tra trạng thái giỏ và lần đặt đang hiển thị.");
  }
  if (outcome.kind === "CONFIRMED") {
    return { ...feedback, kind: "confirmed", message: result.cartEffect === "UNRELATED"
      ? "Đã xác nhận đơn. Giỏ hiện tại được giữ nguyên vì đã khác lần đặt đó."
      : "Đã xác nhận đơn. Chờ thanh toán." };
  }
  if (outcome.kind === "PRICE_CHANGED") {
    const repriced = result.cartEffect === "REPRICED" || result.cartEffect === "RESTORED";
    return { ...feedback, kind: "price", repriced, message: repriced
      ? "Giá đã thay đổi. Giỏ đã cập nhật giá mới; vui lòng kiểm tra và chủ động xác nhận đặt lại."
      : "Giá của lần đặt đã thay đổi. Giỏ hiện tại đã khác; vui lòng kiểm tra các món trước khi đặt mới." };
  }
  if (outcome.kind === "REJECTED") {
    const lines = new Map<string, string[]>(), globalErrors: string[] = [];
    const canAnnotateCart = result.cartEffect !== "UNRELATED";
    for (const [path, messages] of Object.entries(outcome.fieldErrors)) {
      const match = /^items\[(\d+)\](?:\.[a-zA-Z]+)?$/.exec(path);
      const item = match ? request.payload.items[Number(match[1])] : undefined;
      if (item && canAnnotateCart) {
        const key = getCartLineKey(item);
        lines.set(key, [...(lines.get(key) ?? []), ...messages]);
      } else globalErrors.push(...messages);
    }
    return { ...feedback, kind: "rejected", message: outcome.message,
      lineErrors: Object.fromEntries(lines), globalErrors };
  }
  if (outcome.kind === "UNKNOWN") {
    const messages: Record<string, string> = {
      AUTH_REQUIRED: "Lần gửi cần đăng nhập. Giữ nguyên lần đặt; đăng nhập đúng tài khoản rồi chủ động thử lại.",
      SESSION_INVALID: "Phiên của lần gửi không hợp lệ. Giữ nguyên lần đặt; đăng nhập đúng tài khoản rồi thử lại.",
      SESSION_EXPIRED: "Phiên của lần gửi đã hết hạn. Giữ nguyên lần đặt; đăng nhập lại rồi chủ động thử lại.",
      REQUEST_FORBIDDEN: "Yêu cầu bị chặn. Kiểm tra tài khoản hoặc cấu hình kết nối trước khi thử lại cùng lần đặt.",
      IDEMPOTENCY_CONFLICT: "Nội dung không khớp lần đặt đã ghi nhận. Giữ dữ liệu để đối chiếu; không tạo lần đặt mới để vượt lỗi.",
      PAYLOAD_TOO_LARGE: "Yêu cầu vượt giới hạn. Giữ lần đặt để đối chiếu; chưa xác định được kết quả lần gửi trước.",
      ORDER_REQUEST_IN_PROGRESS: "Lần đặt đang được xử lý. Chưa xác định được kết quả; hãy chủ động thử lại sau.",
    };
    return { ...feedback, message: messages[outcome.code] ?? feedback.message,
      loginReason: outcome.code === "SESSION_EXPIRED" ? "expired"
        : ["AUTH_REQUIRED", "SESSION_INVALID"].includes(outcome.code) ? "required" : null };
  }
  return feedback;
}
