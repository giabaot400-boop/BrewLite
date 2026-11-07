import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { applyCartLifecycle } from "./cart-lifecycle.ts";
import { cartReducer } from "./cart-reducer.ts";
import type { CartEnvelopeV2 } from "./cart-envelope-v2";
import type { CartLifecycleCommand } from "./cart-lifecycle";
import type { CartAction, CartError } from "./types";

export type CartEditBlockV2 = "ORDER_PENDING" | "PAYMENT_UNRESOLVED" | "CHECKOUT_BOUND";
export type CartOwnerLifecycleV2 = Extract<CartLifecycleCommand, { type: "ADOPT_OWNER" | "LOGOUT_CONFIRMED" }>;
export type SavedCartMutationV2 = { envelope: CartEnvelopeV2; error: CartError | null };

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Caller supplies the verified owner; local maps are not proof of authentication. */
export function cartEditBlockForOwnerV2(value: CartEnvelopeV2, ownerId: string | null): CartEditBlockV2 | null {
  if (ownerId === null) return null;
  if (own(value.pendingRequests, ownerId)) return "ORDER_PENDING";
  if (own(value.paymentRecoveries, ownerId)
    && Object.values(value.paymentRecoveries[ownerId]).some(item => item.recoveryStatus === "UNRESOLVED")) {
    return "PAYMENT_UNRESOLVED";
  }
  return checkoutBindingForOwner(value, ownerId) ? "CHECKOUT_BOUND" : null;
}

function requireEnvelope(value: CartEnvelopeV2): void {
  if (!isCartEnvelopeV2(value)) {
    throw new CartStorageError("INVALID_DATA", "Dữ liệu giỏ đã lưu không hợp lệ. Giữ bản lưu để kiểm tra.");
  }
}

/** Pure edits; storage must re-read and persist under one Web Lock. No checkout unlock here. */
export function applyCartMutationV2(value: CartEnvelopeV2, action: CartAction,
  expectedOwnerId: string | null): SavedCartMutationV2 {
  requireEnvelope(value);
  if (!(expectedOwnerId === null || typeof expectedOwnerId === "string" && expectedOwnerId.length > 0)) {
    throw new CartStorageError("INVALID_DATA", "Thiếu tài khoản cần đối chiếu.");
  }
  if (value.cart.ownerId !== expectedOwnerId) {
    throw new CartStorageError("OWNER_MISMATCH", "Tài khoản của giỏ đã thay đổi. Vui lòng tải lại trạng thái.");
  }
  const block = cartEditBlockForOwnerV2(value, expectedOwnerId);
  if (block) {
    const message = block === "ORDER_PENDING" ? "Lần đặt trước chưa rõ kết quả. Hãy kiểm tra chính lần đặt đó."
      : block === "PAYMENT_UNRESOLVED" ? "Chưa xác nhận được lần thanh toán. Giữ nguyên dữ liệu để khôi phục."
        : "Giỏ đang gắn với đơn chưa kết thúc. Hãy kiểm tra đơn trước khi sửa giỏ.";
    throw new CartStorageError("PENDING_REQUEST", message);
  }
  if (value.cart.revision === Number.MAX_SAFE_INTEGER) {
    throw new CartStorageError("REVISION_OVERFLOW", "Phiên bản giỏ vượt giới hạn. Giữ bản lưu để kiểm tra.");
  }
  const saved = cartReducer({ cart: value.cart, error: null }, action);
  if (saved.error || saved.cart === value.cart) return { envelope: value, error: saved.error };
  const next = { ...value, cart: saved.cart };
  requireEnvelope(next);
  return { envelope: next, error: null };
}

/**
 * Reuse the accepted S2 owner/revision rules without passing v2 pending bodies
 * into the v1 order workflow. These transitions cannot return a sendable request.
 * Logout/account switch changes only the active cart, retaining all recovery maps.
 */
export function applyCartOwnerLifecycleV2(value: CartEnvelopeV2, command: CartOwnerLifecycleV2): CartEnvelopeV2 {
  requireEnvelope(value);
  if (!command || (command.type !== "ADOPT_OWNER" && command.type !== "LOGOUT_CONFIRMED")) {
    throw new CartStorageError("INVALID_DATA", "Thao tác chủ giỏ không được hỗ trợ.");
  }
  const projection = { schemaVersion: 1 as const, cart: value.cart, pendingRequests: {}, lastOrderResult: null };
  const saved = applyCartLifecycle(projection, command);
  if (saved.envelope.cart === value.cart) return value;
  const next = { ...value, cart: saved.envelope.cart };
  requireEnvelope(next);
  return next;
}
