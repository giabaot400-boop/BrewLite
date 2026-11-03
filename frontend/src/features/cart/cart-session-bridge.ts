import { CartStorageError, pendingForOwner, resultForOwner } from "./cart-envelope.ts";
import type { CartEnvelope } from "./cart-envelope";
import type { createCartStorage } from "./cart-storage";
import type { AuthSnapshot } from "../auth/auth-session";
import type { LogoutScope } from "../auth/types";
import type { CartAction } from "./types";

type StoragePort = ReturnType<typeof createCartStorage>;

function owner(snapshot: AuthSnapshot): string | null {
  if (snapshot.status === "anonymous" && snapshot.user === null) return null;
  if (snapshot.status === "authenticated" && snapshot.user?.id) return snapshot.user.id;
  throw new CartStorageError("OWNER_MISMATCH", "Cần xác nhận phiên đăng nhập trước khi dùng giỏ.");
}

// AuthSnapshot must come from the auth coordinator, never from stored ownerId.
// getSnapshot must return the coordinator's current immutable snapshot object.
export function createCartSessionBridge(storage: StoragePort, getSnapshot: () => AuthSnapshot) {
  let logoutBusy = false;

  function capture() {
    const identity = getSnapshot();
    const ownerId = owner(identity);
    const isCurrent = () => getSnapshot() === identity;
    return { identity, ownerId, isCurrent };
  }

  function requireCurrent(isCurrent: () => boolean) {
    if (!isCurrent()) {
      throw new CartStorageError("OWNER_MISMATCH", "Phiên xác thực đã thay đổi. Vui lòng thử lại.");
    }
  }

  function visible(envelope: CartEnvelope, ownerId: string | null) {
    return {
      cart: envelope.cart.ownerId === ownerId ? envelope.cart : null,
      pending: pendingForOwner(envelope, ownerId),
      result: resultForOwner(envelope, ownerId),
      ownerId,
    };
  }

  return {
    // allowAdoption is only for a newly successful login or /me verification.
    // A storage/focus event alone is not fresh proof of account identity.
    async read(allowAdoption = false) {
      const current = capture();
      let envelope = await storage.read();
      requireCurrent(current.isCurrent);
      if (allowAdoption && current.ownerId !== null && envelope.cart.ownerId !== current.ownerId) {
        if (logoutBusy) throw new CartStorageError("CART_CHANGED", "Đang xử lý đăng xuất.");
        const adopted = await storage.applyLifecycle({ type: "ADOPT_OWNER", ownerId: current.ownerId,
          expectedCart: { ownerId: envelope.cart.ownerId, revision: envelope.cart.revision } }, current.isCurrent);
        envelope = adopted.envelope;
      }
      requireCurrent(current.isCurrent);
      return visible(envelope, current.ownerId);
    },

    async mutate(action: CartAction) {
      if (logoutBusy) throw new CartStorageError("CART_CHANGED", "Đang xử lý đăng xuất.");
      const current = capture();
      const saved = await storage.mutateCart(action, current.ownerId,
        () => current.isCurrent() && !logoutBusy);
      requireCurrent(current.isCurrent);
      return { ...visible(saved.envelope, current.ownerId), error: saved.error };
    },

    // Call before HTTP, then release the lock before sending logout.
    // Invoke complete ONLY after the strict BFF client confirms 204 + scope.
    async prepareLogout() {
      if (logoutBusy) throw new CartStorageError("CART_CHANGED", "Đang xử lý đăng xuất.");
      const current = capture();
      logoutBusy = true;
      try {
        const envelope = await storage.read();
        requireCurrent(current.isCurrent);
        if (envelope.cart.ownerId !== current.ownerId) {
          throw new CartStorageError("OWNER_MISMATCH", "Chủ giỏ đã thay đổi. Vui lòng xác nhận lại phiên.");
        }
        const checkpoint = Object.freeze({ ownerId: envelope.cart.ownerId, revision: envelope.cart.revision });
        let cancelled = false;
        let completion: Promise<Awaited<ReturnType<StoragePort["applyLifecycle"]>>> | null = null;
        let completedScope: LogoutScope | null = null;
        return {
          checkpoint,
          cancel() { if (!completion) { cancelled = true; logoutBusy = false; } },
          complete(scope: LogoutScope) {
            if (cancelled || (scope !== "session" && scope !== "local") ||
                (completedScope !== null && completedScope !== scope)) {
              return Promise.reject(new CartStorageError("INVALID_DATA", "Chưa có xác nhận đăng xuất hợp lệ."));
            }
            if (!completion) {
              completedScope = scope;
              completion = storage.applyLifecycle({ type: "LOGOUT_CONFIRMED", scope, expectedCart: checkpoint })
                .finally(() => { logoutBusy = false; });
            }
            return completion;
          },
        };
      } catch (error) {
        logoutBusy = false;
        throw error;
      }
    },
  };
}
