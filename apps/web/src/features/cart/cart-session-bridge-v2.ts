import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner } from "./cart-envelope-v2.ts";
import { cartEditBlockForOwnerV2 } from "./cart-writer-v2.ts";
import { isSessionBinding } from "../../lib/session-binding.ts";
import type { AuthSession, AuthSnapshot } from "../auth/auth-session";
import type { LogoutScope } from "../auth/types";
import type { CartEnvelopeV2, PaymentRecovery } from "./cart-envelope-v2";
import type { CartAction } from "./types";
import type { createCartStorage } from "./cart-storage";

type StoragePort = Pick<ReturnType<typeof createCartStorage>, "readV2" | "mutateCartV2" | "applyOwnerLifecycleV2">;
type AuthPort = Pick<AuthSession, "getSnapshot" | "getSessionVersion">;

function changed(): never {
  throw new CartStorageError("OWNER_MISMATCH", "Phiên xác thực đã thay đổi hoặc chưa được xác minh. Vui lòng kiểm tra lại.");
}

/**
 * Provider-facing v2 bridge. Caller owns fresh auth verification and 204/scope
 * validation. This module never migrates v1, sends HTTP, or starts/retries checkout.
 */
export function createCartSessionBridgeV2(storage: StoragePort, auth: AuthPort) {
  let logoutBusy = false;

  function capture() {
    const identity = auth.getSnapshot(), version = auth.getSessionVersion();
    if (!Number.isSafeInteger(version) || version < 0) changed();
    let ownerId: string | null;
    if (identity.status === "anonymous" && identity.user === null && identity.binding === undefined) ownerId = null;
    else if (identity.status === "authenticated" && typeof identity.user?.id === "string" && identity.user.id.length > 0
      && isSessionBinding(identity.binding)) ownerId = identity.user.id;
    else changed();
    const binding = identity.binding;
    const isCurrent = () => {
      const current = auth.getSnapshot();
      return auth.getSessionVersion() === version && current.status === identity.status
        && (ownerId === null ? current.user === null : current.user?.id === ownerId) && current.binding === binding;
    };
    return { identity, ownerId, version, isCurrent };
  }

  function requireCurrent(isCurrent: () => boolean) { if (!isCurrent()) changed(); }

  function visible(envelope: CartEnvelopeV2, ownerId: string | null) {
    const cart = envelope.cart.ownerId === ownerId ? envelope.cart : null;
    const storedPending = ownerId !== null && Object.hasOwn(envelope.pendingRequests, ownerId) ? envelope.pendingRequests[ownerId] : null;
    // Adoption writers preserve stored bytes; the published recovery view still uses UNKNOWN.
    const pending = storedPending?.phase === "SUBMITTING" ? { ...storedPending, phase: "UNKNOWN" as const } : storedPending;
    const result = ownerId !== null && envelope.lastOrderResult?.ownerId === ownerId ? envelope.lastOrderResult : null;
    const binding = checkoutBindingForOwner(envelope, ownerId);
    const recoveries: PaymentRecovery[] = ownerId !== null && Object.hasOwn(envelope.paymentRecoveries, ownerId)
      ? Object.values(envelope.paymentRecoveries[ownerId]) : [];
    const editBlock = cartEditBlockForOwnerV2(envelope, ownerId);
    return { ownerId, cart, pending, result, binding, recoveries, editBlock,
      canMutate: cart !== null && editBlock === null && !logoutBusy };
  }

  return {
    // Only pass the exact newly verified snapshot from successful login or /me.
    // Storage/focus notifications must not grant adoption using a boolean flag.
    async read(verifiedIdentity?: AuthSnapshot) {
      const current = capture();
      const mayAdopt = verifiedIdentity === current.identity && current.ownerId !== null;
      let envelope = await storage.readV2();
      requireCurrent(current.isCurrent);
      if (mayAdopt && envelope.cart.ownerId !== current.ownerId) {
        if (logoutBusy) throw new CartStorageError("CART_CHANGED", "Đang xử lý đăng xuất.");
        envelope = await storage.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: current.ownerId!,
          expectedCart: { ownerId: envelope.cart.ownerId, revision: envelope.cart.revision } },
        () => current.isCurrent() && !logoutBusy);
      }
      requireCurrent(current.isCurrent);
      return visible(envelope, current.ownerId);
    },

    async mutate(action: CartAction) {
      if (logoutBusy) throw new CartStorageError("CART_CHANGED", "Đang xử lý đăng xuất.");
      const current = capture();
      const saved = await storage.mutateCartV2(action, current.ownerId, () => current.isCurrent() && !logoutBusy);
      requireCurrent(current.isCurrent);
      return { ...visible(saved.envelope, current.ownerId), error: saved.error };
    },

    /** Prepare before HTTP; complete only after strict logout and its /me check. */
    async prepareLogout() {
      if (logoutBusy) throw new CartStorageError("CART_CHANGED", "Đang xử lý đăng xuất.");
      const current = capture();
      logoutBusy = true;
      try {
        const envelope = await storage.readV2();
        requireCurrent(current.isCurrent);
        if (envelope.cart.ownerId !== current.ownerId) changed();
        const checkpoint = Object.freeze({ ownerId: envelope.cart.ownerId, revision: envelope.cart.revision });
        // createAuthSession publishes anonymous before invoking preparation.complete.
        const signedOutVersion = current.version + (current.ownerId === null ? 0 : 1);
        const isSignedOut = () => {
          const identity = auth.getSnapshot();
          return Number.isSafeInteger(signedOutVersion) && auth.getSessionVersion() === signedOutVersion
            && identity.status === "anonymous" && identity.user === null && identity.binding === undefined;
        };
        let cancelled = false, completedScope: LogoutScope | null = null;
        let completion: Promise<CartEnvelopeV2> | null = null;
        return {
          checkpoint,
          cancel() { if (!completion) { cancelled = true; logoutBusy = false; } },
          complete(scope: LogoutScope) {
            if (cancelled || (scope !== "session" && scope !== "local")
              || completedScope !== null && completedScope !== scope) {
              return Promise.reject(new CartStorageError("INVALID_DATA", "Chưa có xác nhận đăng xuất hợp lệ."));
            }
            if (!completion) {
              completedScope = scope;
              completion = storage.applyOwnerLifecycleV2({ type: "LOGOUT_CONFIRMED", scope, expectedCart: checkpoint }, isSignedOut)
                .finally(() => { logoutBusy = false; });
            }
            return completion;
          },
        };
      } catch (error) { logoutBusy = false; throw error; }
    },
  };
}
