import { CartStorageError, isCartEnvelope, pendingForOwner } from "./cart-envelope.ts";
import type { CartEnvelope, PendingCartRequest } from "./cart-envelope";
import type { Cart } from "./types";

// A local compare-and-swap checkpoint, not proof of an authenticated session.
export type CartCheckpoint = Pick<Cart, "ownerId" | "revision">;

export type CartLifecycleCommand =
  | { type: "ADOPT_OWNER"; ownerId: string; expectedCart: CartCheckpoint }
  | { type: "LOGOUT_CONFIRMED"; scope: "session" | "local"; expectedCart: CartCheckpoint }
  | { type: "BEGIN_ORDER"; ownerId: string; expectedCart: CartCheckpoint;
      requestKey: string; createdAt: string }
  | { type: "RETRY_ORDER"; ownerId: string; expectedCart: CartCheckpoint; requestKey: string }
  | { type: "MARK_ORDER_UNKNOWN"; ownerId: string; requestKey: string };

export type CartLifecycleResult = {
  envelope: CartEnvelope;
  // Only BEGIN_ORDER/RETRY_ORDER return a sendable snapshot, after storage saves it.
  request: PendingCartRequest | null;
};

function requireOwner(ownerId: string): void {
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    throw new CartStorageError("INVALID_DATA", "Chưa có tài khoản đã được xác thực.");
  }
}

function requireCheckpoint(cart: Cart, expected: CartCheckpoint): void {
  if (!expected || !(expected.ownerId === null || typeof expected.ownerId === "string"
    && expected.ownerId.length > 0) || !Number.isSafeInteger(expected.revision) || expected.revision < 0) {
    throw new CartStorageError("INVALID_DATA", "Thiếu phiên bản giỏ cần đối chiếu.");
  }
  if (cart.ownerId !== expected.ownerId) {
    throw new CartStorageError("OWNER_MISMATCH", "Tài khoản của giỏ đã thay đổi. Vui lòng tải lại trạng thái.");
  }
  if (cart.revision !== expected.revision) {
    throw new CartStorageError("CART_CHANGED", "Giỏ đã thay đổi. Vui lòng xem lại trước khi tiếp tục.");
  }
}

function nextRevision(cart: Cart): number {
  if (cart.revision === Number.MAX_SAFE_INTEGER) {
    throw new CartStorageError("REVISION_OVERFLOW", "Phiên bản giỏ vượt giới hạn. Giữ bản lưu để kiểm tra.");
  }
  return cart.revision + 1;
}

function requireCurrentOwner(cart: Cart, ownerId: string): void {
  requireOwner(ownerId);
  if (cart.ownerId !== ownerId) {
    throw new CartStorageError("OWNER_MISMATCH", "Cần xác thực đúng tài khoản của lần đặt.");
  }
}

function result(envelope: CartEnvelope, request: PendingCartRequest | null = null): CartLifecycleResult {
  // Includes UUID v4, snapshot/owner/revision agreement and the UTF-8 body bound.
  if (!isCartEnvelope(envelope)) {
    throw new CartStorageError("INVALID_DATA", "Không thể lưu dữ liệu của lần đặt không hợp lệ.");
  }
  return { envelope, request: request === null ? null : structuredClone(request) };
}

function withPending(envelope: CartEnvelope, pending: PendingCartRequest): CartEnvelope {
  return { ...envelope, pendingRequests: { ...envelope.pendingRequests, [pending.ownerId]: pending } };
}

// Pure transitions only. Production callers use storage.applyLifecycle(), then
// await its durable result and lock release before starting any HTTP operation.
export function applyCartLifecycle(envelope: CartEnvelope, command: CartLifecycleCommand): CartLifecycleResult {
  const cart = envelope.cart;
  switch (command.type) {
    case "ADOPT_OWNER": {
      requireOwner(command.ownerId);
      requireCheckpoint(cart, command.expectedCart);
      if (cart.ownerId === command.ownerId) return result(envelope);
      // First login keeps guest choices; switching accounts clears old choices.
      return result({ ...envelope, cart: { ownerId: command.ownerId,
        revision: nextRevision(cart), items: cart.ownerId === null ? cart.items : [] } });
    }
    case "LOGOUT_CONFIRMED": {
      if (command.scope !== "session" && command.scope !== "local") {
        throw new CartStorageError("INVALID_DATA", "Chưa có xác nhận đăng xuất hợp lệ.");
      }
      requireCheckpoint(cart, command.expectedCart);
      if (cart.ownerId === null && cart.items.length === 0) return result(envelope);
      return result({ ...envelope, cart: { ownerId: null, revision: nextRevision(cart), items: [] } });
    }
    case "BEGIN_ORDER": {
      requireCurrentOwner(cart, command.ownerId);
      requireCheckpoint(cart, command.expectedCart);
      if (pendingForOwner(envelope, command.ownerId)) {
        throw new CartStorageError("PENDING_REQUEST", "Lần đặt trước chưa rõ kết quả. Hãy thử lại cùng lần đặt.");
      }
      if (cart.items.length === 0) {
        throw new CartStorageError("EMPTY_CART", "Giỏ chưa có món để tạo lần đặt mới.");
      }
      if (envelope.lastOrderResult?.ownerId === command.ownerId
        && envelope.lastOrderResult.requestKey === command.requestKey) {
        throw new CartStorageError("REQUEST_KEY_REUSED", "Lần đặt mới cần mã yêu cầu mới.");
      }
      const snapshot = structuredClone(cart);
      const pending: PendingCartRequest = { ownerId: command.ownerId,
        requestKey: command.requestKey, cartRevision: cart.revision, cartSnapshot: snapshot,
        payload: { items: snapshot.items.map((item) => ({ productId: item.productId, size: item.size,
          toppingIds: [...item.toppingIds], qty: item.qty, expectedUnitPrice: item.previewUnitPrice })) },
        createdAt: command.createdAt, phase: "SUBMITTING" };
      return result(withPending(envelope, pending), pending);
    }
    case "RETRY_ORDER": {
      requireCurrentOwner(cart, command.ownerId);
      requireCheckpoint(cart, command.expectedCart);
      const existing = pendingForOwner(envelope, command.ownerId);
      if (!existing || existing.requestKey !== command.requestKey) {
        throw new CartStorageError("PENDING_NOT_FOUND", "Không còn bản ghi của lần đặt cần thử lại. Vui lòng tải lại trạng thái.");
      }
      // Reuse the persisted snapshot even when the current cart is empty or new.
      const pending: PendingCartRequest = { ...existing, phase: "SUBMITTING" };
      return result(withPending(envelope, pending), pending);
    }
    case "MARK_ORDER_UNKNOWN": {
      requireOwner(command.ownerId);
      const existing = pendingForOwner(envelope, command.ownerId);
      // A late callback must not touch a newer request or another account's cart.
      if (!existing || existing.requestKey !== command.requestKey) return result(envelope);
      return result(withPending(envelope, { ...existing, phase: "UNKNOWN" }));
    }
    default:
      throw new CartStorageError("INVALID_DATA", "Thao tác giỏ không được hỗ trợ.");
  }
}
