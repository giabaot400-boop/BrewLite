import { CartStorageError } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { cartEditBlockForOwnerV2 } from "./cart-writer-v2.ts";
import { selectCartTotal } from "./cart-reducer.ts";
import type { CartEnvelopeV2, OrderPayloadV2, PendingCartRequestV2 } from "./cart-envelope-v2";
import type { CartCheckpoint } from "./cart-lifecycle";
import type { Cart } from "./types";

export type CheckoutPreviewV2 = {
  subtotal: number;
  discountTotal: number;
  total: number;
  promotionCode: string | null;
  promotionPreview: "NONE" | "DEMO10_ESTIMATE" | "UNVERIFIED_CODE";
};

export type CartCheckoutCommandV2 =
  | { type: "BEGIN_ORDER_V2"; ownerId: string; expectedCart: CartCheckpoint;
      requestKey: string; createdAt: string; promotionCode: string | null }
  | { type: "RETRY_ORDER"; ownerId: string; expectedCart: CartCheckpoint; requestKey: string }
  | { type: "MARK_ORDER_UNKNOWN"; ownerId: string; requestKey: string };

export type CartCheckoutResultV2 = {
  envelope: CartEnvelopeV2;
  request: PendingCartRequestV2 | null;
};

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Only new input is normalized; a saved/retried body never goes through this function. */
function promotionInput(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new CartStorageError("INVALID_DATA", "Mã giảm giá không hợp lệ.");
  const normalized = value.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
  if (normalized === "") return null;
  if (!/^[A-Z0-9_-]{1,32}$/.test(normalized)) {
    throw new CartStorageError("INVALID_DATA", "Mã giảm giá chỉ gồm chữ ASCII, số, dấu gạch dưới hoặc gạch ngang, tối đa 32 ký tự.");
  }
  return normalized;
}

/**
 * UI estimate from the agreed demo policy, not catalog pricing or promo validation.
 * A DEMO10 estimate says nothing about its server-side active/window eligibility.
 * Other codes are sent to the backend with no estimated discount.
 */
export function checkoutPreviewV2(cart: Cart, code: string | null): CheckoutPreviewV2 {
  if (!isCartEnvelopeV2({ ...createEmptyCartEnvelopeV2(), cart })) {
    throw new CartStorageError("INVALID_DATA", "Giỏ chưa có dữ liệu hợp lệ để xem tổng dự kiến.");
  }
  const promotionCode = promotionInput(code);
  const subtotal = selectCartTotal(cart);
  const demo = promotionCode === "DEMO10";
  const discountTotal = demo && subtotal >= 50000 ? Math.min(Math.floor(subtotal * 10 / 100), 20000) : 0;
  return { subtotal, discountTotal, total: subtotal - discountTotal, promotionCode,
    promotionPreview: promotionCode === null ? "NONE" : demo ? "DEMO10_ESTIMATE" : "UNVERIFIED_CODE" };
}

function requireOwner(ownerId: string): void {
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    throw new CartStorageError("INVALID_DATA", "Thiếu tài khoản đã được xác thực.");
  }
}

function requireCurrentCart(cart: Cart, ownerId: string, expected: CartCheckpoint): void {
  requireOwner(ownerId);
  if (!expected || !(expected.ownerId === null || typeof expected.ownerId === "string" && expected.ownerId.length > 0)
    || !Number.isSafeInteger(expected.revision) || expected.revision < 0) {
    throw new CartStorageError("INVALID_DATA", "Thiếu phiên bản giỏ cần đối chiếu.");
  }
  if (cart.ownerId !== ownerId || cart.ownerId !== expected.ownerId) {
    throw new CartStorageError("OWNER_MISMATCH", "Tài khoản của giỏ đã thay đổi. Vui lòng xác nhận lại.");
  }
  if (cart.revision !== expected.revision) {
    throw new CartStorageError("CART_CHANGED", "Giỏ đã thay đổi. Vui lòng xem lại trước khi tạo đơn.");
  }
}

function result(envelope: CartEnvelopeV2, request: PendingCartRequestV2 | null = null): CartCheckoutResultV2 {
  if (!isCartEnvelopeV2(envelope)) {
    throw new CartStorageError("INVALID_DATA", "Không thể lưu dữ liệu của lần đặt không hợp lệ.");
  }
  return { envelope, request: request === null ? null : structuredClone(request) };
}

function withPending(value: CartEnvelopeV2, pending: PendingCartRequestV2): CartEnvelopeV2 {
  return { ...value, pendingRequests: { ...value.pendingRequests, [pending.ownerId]: pending } };
}

/** Pure preparation; caller persists the entire result under the shared lock before HTTP. */
export function applyCartCheckoutV2(value: CartEnvelopeV2, command: CartCheckoutCommandV2): CartCheckoutResultV2 {
  result(value);
  switch (command.type) {
    case "BEGIN_ORDER_V2": {
      requireCurrentCart(value.cart, command.ownerId, command.expectedCart);
      if (cartEditBlockForOwnerV2(value, command.ownerId)) {
        throw new CartStorageError("PENDING_REQUEST", "Còn lần đặt hoặc thanh toán cần kiểm tra trước khi tạo đơn mới.");
      }
      if (value.cart.items.length === 0) throw new CartStorageError("EMPTY_CART", "Giỏ chưa có món để đặt.");
      if (value.lastOrderResult?.ownerId === command.ownerId && value.lastOrderResult.requestKey === command.requestKey) {
        throw new CartStorageError("REQUEST_KEY_REUSED", "Lần đặt mới cần mã yêu cầu mới.");
      }
      const snapshot = structuredClone(value.cart);
      const preview = checkoutPreviewV2(snapshot, command.promotionCode);
      const payload: OrderPayloadV2 = { schemaVersion: 2,
        items: snapshot.items.map(item => ({ productId: item.productId, size: item.size,
          toppingIds: [...item.toppingIds], qty: item.qty, expectedUnitPrice: item.previewUnitPrice })),
        promotionCode: preview.promotionCode, expectedTotal: preview.total };
      const pending: PendingCartRequestV2 = { ownerId: command.ownerId, requestKey: command.requestKey,
        payload, cartRevision: snapshot.revision, cartSnapshot: snapshot, createdAt: command.createdAt, phase: "SUBMITTING" };
      return result(withPending(value, pending), pending);
    }
    case "RETRY_ORDER": {
      requireCurrentCart(value.cart, command.ownerId, command.expectedCart);
      const existing = own(value.pendingRequests, command.ownerId) ? value.pendingRequests[command.ownerId] : null;
      if (!existing || existing.requestKey !== command.requestKey) {
        throw new CartStorageError("PENDING_NOT_FOUND", "Không còn bản ghi của lần đặt cần thử lại.");
      }
      // Both migrated v1 and v2 use the exact saved payload/snapshot, even with a new/empty cart.
      const pending: PendingCartRequestV2 = { ...existing, phase: "SUBMITTING" };
      return result(withPending(value, pending), pending);
    }
    case "MARK_ORDER_UNKNOWN": {
      requireOwner(command.ownerId);
      const existing = own(value.pendingRequests, command.ownerId) ? value.pendingRequests[command.ownerId] : null;
      if (!existing || existing.requestKey !== command.requestKey || existing.phase === "UNKNOWN") return result(value);
      return result(withPending(value, { ...existing, phase: "UNKNOWN" }));
    }
    default:
      throw new CartStorageError("INVALID_DATA", "Thao tác lần đặt không được hỗ trợ.");
  }
}
