import type { AuthSnapshot } from "../auth/auth-session";
import type { PendingCartRequest } from "./cart-envelope";
import type { OrderPhase, OrderReview } from "./cart-order-client";
import type { CartViewState } from "./cart-view";

type ReviewEnvironment = {
  identity: AuthSnapshot;
  sessionVersion: number;
  state: CartViewState;
  pending: PendingCartRequest | null;
  orderPhase: OrderPhase;
};

export type OrderConfirmation = {
  review: OrderReview;
  identity: AuthSnapshot;
  sessionVersion: number;
  cartSignature: string;
  pendingSignature: string;
  status: "ready" | "checking" | "invalid";
  message: string | null;
};

// Ignore SUBMITTING -> UNKNOWN recovery, but compare the entire immutable request.
function pendingSignature(pending: PendingCartRequest | null): string {
  if (!pending) return "null";
  const { ownerId, requestKey, payload, cartRevision, cartSnapshot, createdAt } = pending;
  return JSON.stringify({ ownerId, requestKey, payload, cartRevision, cartSnapshot, createdAt });
}

export function captureOrderConfirmation(review: OrderReview, environment: ReviewEnvironment): OrderConfirmation {
  return {
    review, identity: environment.identity, sessionVersion: environment.sessionVersion,
    cartSignature: JSON.stringify(environment.state.cart), pendingSignature: pendingSignature(environment.pending),
    status: "ready", message: null,
  };
}

export function reconcileOrderConfirmation(current: OrderConfirmation | null,
  environment: ReviewEnvironment): OrderConfirmation | null {
  if (!current || current.status === "invalid") return current;
  const invalidate = (message: string): OrderConfirmation => ({ ...current, status: "invalid", message });
  if (environment.sessionVersion !== current.sessionVersion || environment.identity.status !== "authenticated"
    || environment.identity.user?.id !== current.review.ownerId) {
    return invalidate("Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra giỏ và mở lại xác nhận.");
  }
  if (environment.state.status === "error" || environment.state.status === "locked") {
    return invalidate("Chưa kiểm tra được phiên hoặc giỏ. Vui lòng kiểm tra lại trước khi đặt.");
  }
  if (environment.orderPhase !== "IDLE") {
    return invalidate("Lần đặt đang được xử lý. Vui lòng kiểm tra kết quả trước khi tiếp tục.");
  }
  if (environment.state.status === "restoring" || environment.state.isSaving) {
    return current.status === "checking" ? current : { ...current, status: "checking" };
  }
  if (JSON.stringify(environment.state.cart) !== current.cartSignature
    || pendingSignature(environment.pending) !== current.pendingSignature) {
    return invalidate("Giỏ hoặc lần đặt đã thay đổi. Vui lòng xem lại nội dung và mở lại xác nhận.");
  }
  if (current.status === "checking" && environment.identity === current.identity) {
    // /me network failures preserve cached auth; they are not fresh verification.
    return invalidate("Chưa xác minh lại được phiên. Vui lòng kiểm tra kết nối và mở lại xác nhận.");
  }
  return current.identity === environment.identity && current.status === "ready" ? current
    : { ...current, identity: environment.identity, status: "ready", message: null };
}
