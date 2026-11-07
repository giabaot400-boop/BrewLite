import { CartStorageError } from "./cart-envelope.ts";
import type { PendingCartRequest } from "./cart-envelope";
import type { AuthSnapshot } from "../auth/auth-session";
import type { Cart } from "./types";
import type { createCartStorage } from "./cart-storage";
import type { createCartSessionBridge } from "./cart-session-bridge";
import type { createCartOrderTransport } from "./cart-order-transport";

export type OrderPhase = "PREPARING" | "SENDING" | "SETTLING" | "IDLE";
export type OrderReview = Readonly<{
  kind: "NEW" | "RETRY";
  ownerId: string;
  displayCart: Cart;
}>;
type CapturedReview = {
  ownerId: string;
  checkpoint: Pick<Cart, "ownerId" | "revision">;
  displayCart: Cart;
  pending: PendingCartRequest | null;
};
type Environment = {
  storage: ReturnType<typeof createCartStorage>;
  bridge: ReturnType<typeof createCartSessionBridge>;
  transport: ReturnType<typeof createCartOrderTransport>;
  getSnapshot: () => AuthSnapshot;
  randomUUID?: () => string;
  now?: () => string;
  onPhase?: (ownerId: string, phase: OrderPhase) => void;
};

function owner(snapshot: AuthSnapshot): string {
  if (snapshot.status !== "authenticated" || !snapshot.user?.id) {
    throw new CartStorageError("OWNER_MISMATCH", "Vui lòng đăng nhập trước khi xác nhận đặt đơn.");
  }
  return snapshot.user.id;
}

function frozenCart(cart: Cart): Cart {
  return Object.freeze({ ...cart, items: Object.freeze(cart.items.map(item => Object.freeze({ ...item,
    toppingIds: Object.freeze([...item.toppingIds]), toppingNames: Object.freeze({ ...item.toppingNames }) }))) });
}

function payload(cart: Cart) {
  return { items: cart.items.map(item => ({ productId: item.productId, size: item.size,
    toppingIds: [...item.toppingIds], qty: item.qty, expectedUnitPrice: item.previewUnitPrice })) };
}

export function createCartOrderClient(environment: Environment) {
  const reviews = new WeakMap<OrderReview, CapturedReview>();
  const busy = new Set<string>();
  const phaseListeners = new Set<(ownerId: string, phase: OrderPhase) => void>();
  return {
    subscribePhase(listener: (ownerId: string, phase: OrderPhase) => void) {
      phaseListeners.add(listener);
      return () => { phaseListeners.delete(listener); };
    },
    // Opening/cancelling a dialog never generates a key, writes storage or sends HTTP.
    review(cart: Cart, pending: PendingCartRequest | null = null): OrderReview {
      const ownerId = owner(environment.getSnapshot());
      if (cart.ownerId !== ownerId || (pending && pending.ownerId !== ownerId)) {
        throw new CartStorageError("OWNER_MISMATCH", "Tài khoản của giỏ hoặc lần đặt đã thay đổi.");
      }
      const displayCart = frozenCart(structuredClone(pending?.cartSnapshot ?? cart));
      if (!displayCart.items.length) throw new CartStorageError("EMPTY_CART", "Giỏ chưa có món để đặt.");
      const review = Object.freeze({ kind: pending ? "RETRY" as const : "NEW" as const, ownerId, displayCart });
      reviews.set(review, { ownerId, checkpoint: { ownerId: cart.ownerId, revision: cart.revision },
        displayCart, pending: pending ? structuredClone(pending) : null });
      return review;
    },

    async submit(review: OrderReview) {
      const captured = reviews.get(review);
      if (!captured) throw new CartStorageError("INVALID_DATA", "Vui lòng mở lại bước xác nhận đặt đơn.");
      if (busy.has(captured.ownerId)) throw new CartStorageError("PENDING_REQUEST", "Đang xử lý lần đặt của tài khoản này.");
      reviews.delete(review); // A second click cannot reuse the same confirmation.
      const identity = environment.getSnapshot();
      if (owner(identity) !== captured.ownerId) {
        throw new CartStorageError("OWNER_MISMATCH", "Phiên đã đổi. Vui lòng kiểm tra giỏ và xác nhận lại.");
      }
      busy.add(captured.ownerId);
      const phase = (value: OrderPhase) => {
        environment.onPhase?.(captured.ownerId, value);
        phaseListeners.forEach(listener => listener(captured.ownerId, value));
      };
      let request: PendingCartRequest | null = null;
      try {
        phase("PREPARING");
        const saved = await environment.bridge.prepareOrder(captured.pending ? {
          type: "RETRY_ORDER", ownerId: captured.ownerId, expectedCart: captured.checkpoint,
          requestKey: captured.pending.requestKey,
        } : {
          type: "BEGIN_ORDER", ownerId: captured.ownerId, expectedCart: captured.checkpoint,
          requestKey: (environment.randomUUID ?? (() => crypto.randomUUID()))(),
          createdAt: (environment.now ?? (() => new Date().toISOString()))(),
        });
        request = saved.request;
        if (!request || environment.getSnapshot() !== identity) {
          throw new CartStorageError("OWNER_MISMATCH", "Phiên đã đổi trước khi gửi. Giữ lần đặt để kiểm tra lại.");
        }
        const reviewedPayload = captured.pending?.payload ?? payload(captured.displayCart);
        if (request.ownerId !== captured.ownerId || JSON.stringify(request.payload) !== JSON.stringify(reviewedPayload)) {
          throw new CartStorageError("CART_CHANGED", "Nội dung lần đặt đã đổi. Vui lòng đọc lại và xác nhận lại.");
        }
        phase("SENDING"); // All durable storage locks have been released.
        const observation = await environment.transport.send(request);
        phase("SETTLING");
        // Always settle for the sent owner/key, even after logout/account switch.
        const settlement = await environment.storage.settleOrder(observation.reply);
        return { request, settlement };
      } catch (error) {
        if (request) {
          try { await environment.storage.applyLifecycle({ type: "MARK_ORDER_UNKNOWN",
            ownerId: request.ownerId, requestKey: request.requestKey }); } catch {
            // Quota/denial must preserve existing bytes; reload treats SUBMITTING as UNKNOWN.
          }
        }
        throw error;
      } finally {
        busy.delete(captured.ownerId);
        phase("IDLE");
      }
    },
  };
}
