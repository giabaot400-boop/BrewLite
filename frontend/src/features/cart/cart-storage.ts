import { cartReducer } from "./cart-reducer.ts";
import { CartStorageError, decodeCartEnvelope, encodeCartEnvelope, pendingForOwner } from "./cart-envelope.ts";
import type { CartEnvelope } from "./cart-envelope";
import type { CartAction, CartError } from "./types";

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

  function readStored(storage: CartStorageEnvironment["storage"]): CartEnvelope {
    let raw: string | null;
    try { raw = storage.getItem(CART_STORAGE_KEY); } catch {
      throw new CartStorageError("STORAGE_UNAVAILABLE", "Không đọc được giỏ đã lưu.");
    }
    return decodeCartEnvelope(raw);
  }

  return {
    read(): Promise<CartEnvelope> {
      // Missing data gives an in-memory empty cart; hydration never writes it back.
      return underLock(readStored);
    },

    mutateCart(action: CartAction, expectedOwnerId: string | null): Promise<SavedCartMutation> {
      // Capture the command before waiting; caller cannot change it while queued.
      const captured = structuredClone(action);
      return underLock((storage) => {
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
        const raw = encodeCartEnvelope(next);
        try { storage.setItem(CART_STORAGE_KEY, raw); } catch {
          // No successful state is published when persistence fails.
          throw new CartStorageError("STORAGE_UNAVAILABLE", "Không lưu được giỏ. Thao tác chưa được xác nhận đã lưu.");
        }
        return { envelope: next, error: null };
      });
    },
  };
}
