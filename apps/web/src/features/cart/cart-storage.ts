import { cartReducer } from "./cart-reducer.ts";
import { CartStorageError, decodeCartEnvelope, encodeCartEnvelope, pendingForOwner } from "./cart-envelope.ts";
import { applyCartLifecycle } from "./cart-lifecycle.ts";
import { settleCartOrder } from "./cart-order-settlement.ts";
import { decodeCartEnvelopeV2, encodeCartEnvelopeV2, parseStoredCartEnvelopeV2,
  planCartEnvelopeV2Migration } from "./cart-envelope-v2.ts";
import { applyCartMutationV2, applyCartOwnerLifecycleV2 } from "./cart-writer-v2.ts";
import { applyCartCheckoutV2 } from "./cart-checkout-v2.ts";
import { applyCartOrderBindingV2 } from "./cart-order-binding-v2.ts";
import { settleCartRejectionV2 } from "./cart-order-rejection-v2.ts";
import { applyCartPaymentV2 } from "./cart-payment-recovery-v2.ts";
import type { CartEnvelope } from "./cart-envelope";
import type { CartLifecycleCommand, CartLifecycleResult } from "./cart-lifecycle";
import type { OrderSettlementCommand, OrderSettlementResult } from "./cart-order-settlement";
import type { CartAction, CartError } from "./types";
import type { CartEnvelopeV2 } from "./cart-envelope-v2";
import type { CartOwnerLifecycleV2, SavedCartMutationV2 } from "./cart-writer-v2";
import type { CartCheckoutCommandV2, CartCheckoutResultV2 } from "./cart-checkout-v2";
import type { CartOrderBindingCommandV2, CartOrderBindingResultV2 } from "./cart-order-binding-v2";
import type { CartRejectionCommandV2, CartRejectionResultV2, OrderRejectionReasonsV2 } from "./cart-order-rejection-v2";
import type { CartPaymentCommandV2, CartPaymentResultV2 } from "./cart-payment-recovery-v2";

export const CART_STORAGE_KEY = "brewlite.cart.v1";
export const CART_LOCK_NAME = "brewlite:cart-envelope:v1";
export const CART_LOCK_WAIT_MS = 2000;

export type CartStorageEnvironment = {
  storage: Pick<Storage, "getItem" | "setItem">;
  locks: Pick<LockManager, "request">;
};

export type SavedCartMutation = { envelope: CartEnvelope; error: CartError | null };

function browserEnvironment(): CartStorageEnvironment {
  if (typeof window === "undefined" || typeof navigator === "undefined"
    || !navigator.locks || typeof navigator.locks.request !== "function") {
    throw new CartStorageError("LOCK_UNAVAILABLE", "Trình duyệt chưa hỗ trợ cách lưu giỏ an toàn.");
  }
  try { return { storage: window.localStorage, locks: navigator.locks }; } catch {
    throw new CartStorageError("STORAGE_UNAVAILABLE", "Không truy cập được bộ nhớ lưu giỏ.");
  }
}

// Optional environment injection is for deterministic tests. Production callers
// use the default browser environment; there is no lockless storage fallback.
export function createCartStorage(environment?: CartStorageEnvironment) {
  async function underLock<T>(operation: (storage: CartStorageEnvironment["storage"]) => T): Promise<T> {
    const env = environment ?? browserEnvironment();
    if (!env.locks || typeof env.locks.request !== "function") {
      throw new CartStorageError("LOCK_UNAVAILABLE", "Không có Web Locks để lưu giỏ.");
    }
    const controller = new AbortController();
    let acquired = false;
    const timer = setTimeout(() => controller.abort(), CART_LOCK_WAIT_MS);
    try {
      return await env.locks.request(CART_LOCK_NAME,
        { mode: "exclusive", signal: controller.signal }, () => {
          acquired = true;
          clearTimeout(timer); // Timeout only bounds the queue wait.
          return operation(env.storage); // Synchronous storage work only.
        });
    } catch (error) {
      if (!acquired && controller.signal.aborted) {
        throw new CartStorageError("LOCK_TIMEOUT", "Chưa lấy được khóa lưu giỏ. Vui lòng thử lại.");
      }
      if (error instanceof CartStorageError) throw error;
      throw new CartStorageError("LOCK_UNAVAILABLE", "Không thể lấy khóa lưu giỏ. Vui lòng thử lại.");
    } finally { clearTimeout(timer); }
  }

  function readRaw(storage: CartStorageEnvironment["storage"]): string | null {
    try { return storage.getItem(CART_STORAGE_KEY); } catch {
      throw new CartStorageError("STORAGE_UNAVAILABLE", "Không đọc được giỏ đã lưu.");
    }
  }

  function readStored(storage: CartStorageEnvironment["storage"]): CartEnvelope {
    return decodeCartEnvelope(readRaw(storage));
  }

  function writeStored(storage: CartStorageEnvironment["storage"], envelope: CartEnvelope): void {
    const raw = encodeCartEnvelope(envelope);
    try { storage.setItem(CART_STORAGE_KEY, raw); } catch {
      throw new CartStorageError("STORAGE_UNAVAILABLE", "Không lưu được giỏ. Thao tác chưa được xác nhận đã lưu.");
    }
  }

  function writeStoredV2(storage: CartStorageEnvironment["storage"], envelope: CartEnvelopeV2): void {
    const raw = encodeCartEnvelopeV2(envelope);
    try { storage.setItem(CART_STORAGE_KEY, raw); } catch {
      throw new CartStorageError("STORAGE_UNAVAILABLE", "Không lưu được giỏ. Thao tác chưa được xác nhận đã lưu.");
    }
  }

  // A captured, synchronous session check is required for every v2 write.
  // Returning a Promise is not verification and must not hold the lock across HTTP.
  function requireCurrent(isCurrent: () => boolean): void {
    if (typeof isCurrent !== "function" || isCurrent() !== true) {
      throw new CartStorageError("OWNER_MISMATCH", "Phiên xác thực đã thay đổi. Vui lòng thử lại.");
    }
  }

  return {
    read(): Promise<CartEnvelope> {
      // Missing data gives an in-memory empty cart; hydration never writes it back.
      return underLock(readStored);
    },

    /** Explicit integration step; current UI keeps using v1 until backend S3 is ready. */
    migrateToV2() {
      return underLock((storage) => {
        const migration = planCartEnvelopeV2Migration(readRaw(storage));
        if (migration.rawToWrite !== null) {
          try { storage.setItem(CART_STORAGE_KEY, migration.rawToWrite); } catch {
            throw new CartStorageError("STORAGE_UNAVAILABLE", "Không lưu được giỏ. Giữ bản lưu để thử lại.");
          }
        }
        return migration.envelope;
      });
    },

    /** Explicit v2 reader: recovery is in-memory only, and v1 needs migrateToV2 first. */
    readV2(): Promise<CartEnvelopeV2> {
      return underLock(storage => decodeCartEnvelopeV2(readRaw(storage)));
    },

    mutateCartV2(action: CartAction, expectedOwnerId: string | null,
      isCurrent: () => boolean): Promise<SavedCartMutationV2> {
      const captured = structuredClone(action);
      return underLock((storage) => {
        requireCurrent(isCurrent);
        const envelope = parseStoredCartEnvelopeV2(readRaw(storage));
        const saved = applyCartMutationV2(envelope, captured, expectedOwnerId);
        requireCurrent(isCurrent);
        if (saved.envelope !== envelope) writeStoredV2(storage, saved.envelope);
        return saved;
      });
    },

    applyOwnerLifecycleV2(command: CartOwnerLifecycleV2,
      isCurrent: () => boolean): Promise<CartEnvelopeV2> {
      const captured = structuredClone(command);
      return underLock((storage) => {
        requireCurrent(isCurrent);
        const envelope = parseStoredCartEnvelopeV2(readRaw(storage));
        const saved = applyCartOwnerLifecycleV2(envelope, captured);
        requireCurrent(isCurrent);
        if (saved !== envelope) writeStoredV2(storage, saved);
        return saved;
      });
    },

    applyCheckoutLifecycleV2(command: CartCheckoutCommandV2,
      isCurrent: () => boolean): Promise<CartCheckoutResultV2> {
      const captured = structuredClone(command);
      return underLock((storage) => {
        requireCurrent(isCurrent);
        const envelope = parseStoredCartEnvelopeV2(readRaw(storage));
        const saved = applyCartCheckoutV2(envelope, captured);
        requireCurrent(isCurrent);
        if (saved.envelope !== envelope) writeStoredV2(storage, saved.envelope);
        // Only a durable result may reach the caller; start HTTP after this promise releases the lock.
        return saved;
      });
    },

    applyOrderBindingV2(command: CartOrderBindingCommandV2,
      isCurrent: () => boolean): Promise<CartOrderBindingResultV2> {
      const captured = structuredClone(command);
      return underLock((storage) => {
        requireCurrent(isCurrent);
        const envelope = parseStoredCartEnvelopeV2(readRaw(storage));
        const saved = applyCartOrderBindingV2(envelope, captured);
        requireCurrent(isCurrent);
        if (saved.envelope !== envelope) writeStoredV2(storage, saved.envelope);
        return saved;
      });
    },

    settleRejectionV2(command: CartRejectionCommandV2, isCurrent: () => boolean,
      reasons?: OrderRejectionReasonsV2): Promise<CartRejectionResultV2> {
      const captured = structuredClone(command), capturedReasons = structuredClone(reasons);
      return underLock(storage => {
        requireCurrent(isCurrent);
        const envelope = parseStoredCartEnvelopeV2(readRaw(storage));
        const saved = settleCartRejectionV2(envelope, captured, capturedReasons);
        requireCurrent(isCurrent);
        if (saved.envelope !== envelope) writeStoredV2(storage, saved.envelope);
        return saved;
      });
    },

    applyPaymentLifecycleV2(command: CartPaymentCommandV2, isCurrent: () => boolean): Promise<CartPaymentResultV2> {
      const captured = structuredClone(command);
      return underLock(storage => {
        requireCurrent(isCurrent);
        const envelope = parseStoredCartEnvelopeV2(readRaw(storage));
        const saved = applyCartPaymentV2(envelope, captured);
        requireCurrent(isCurrent);
        if (saved.envelope !== envelope) writeStoredV2(storage, saved.envelope);
        // Only a durably saved request is returned, after this synchronous lock callback.
        return saved;
      });
    },

    applyLifecycle(command: CartLifecycleCommand, isCurrent?: () => boolean): Promise<CartLifecycleResult> {
      const captured = structuredClone(command);
      return underLock((storage) => {
        if (isCurrent && !isCurrent()) {
          throw new CartStorageError("OWNER_MISMATCH", "Phiên xác thực đã thay đổi. Vui lòng thử lại.");
        }
        const envelope = readStored(storage);
        const saved = applyCartLifecycle(envelope, captured);
        if (saved.envelope !== envelope) writeStored(storage, saved.envelope);
        // No sendable request is returned if validation or persistence failed.
        return saved;
      });
    },

    settleOrder(command: OrderSettlementCommand): Promise<OrderSettlementResult> {
      const captured = structuredClone(command);
      return underLock((storage) => {
        const envelope = readStored(storage);
        const saved = settleCartOrder(envelope, captured);
        if (saved.envelope !== envelope) writeStored(storage, saved.envelope);
        // Save result, pending removal and cart update atomically in one envelope.
        return saved;
      });
    },

    mutateCart(action: CartAction, expectedOwnerId: string | null, isCurrent?: () => boolean): Promise<SavedCartMutation> {
      // Capture the command before waiting; caller cannot change it while queued.
      const captured = structuredClone(action);
      return underLock((storage) => {
        if (isCurrent && !isCurrent()) {
          throw new CartStorageError("OWNER_MISMATCH", "Phiên xác thực đã thay đổi. Vui lòng thử lại.");
        }
        const envelope = readStored(storage);
        if (envelope.cart.ownerId !== expectedOwnerId) {
          throw new CartStorageError("OWNER_MISMATCH", "Tài khoản của giỏ đã thay đổi. Vui lòng tải lại trạng thái.");
        }
        if (pendingForOwner(envelope, expectedOwnerId)) {
          throw new CartStorageError("PENDING_REQUEST", "Lần đặt trước chưa rõ kết quả. Chưa thể sửa giỏ này.");
        }
        if (envelope.cart.revision === Number.MAX_SAFE_INTEGER) {
          throw new CartStorageError("REVISION_OVERFLOW", "Phiên bản giỏ vượt giới hạn. Giữ bản lưu để kiểm tra.");
        }
        const result = cartReducer({ cart: envelope.cart, error: null }, captured);
        if (result.error || result.cart === envelope.cart) {
          return { envelope, error: result.error };
        }
        const next = { ...envelope, cart: result.cart };
        writeStored(storage, next);
        return { envelope: next, error: null };
      });
    },
  };
}
