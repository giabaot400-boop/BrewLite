import { CartStorageError, isCartEnvelope, pendingForOwner } from "./cart-envelope.ts";
import { classifyOrderReply } from "./cart-order-response.ts";
import { getCartLineKey } from "./cart-reducer.ts";
import type { CartEnvelope, PendingCartRequest } from "./cart-envelope";
import type { OrderReply, OrderReplyOutcome } from "./cart-order-response";
import type { Cart } from "./types";

export type OrderSettlementCommand = OrderReply & {
  ownerId: string;
  requestKey: string;
  receivedAt: string;
};

export type OrderSettlementResult = {
  envelope: CartEnvelope;
  outcome: OrderReplyOutcome | { kind: "IGNORED" };
  cartEffect: "CLEARED" | "REPRICED" | "RESTORED" | "UNCHANGED" | "UNRELATED";
};

function nextRevision(cart: Cart): number {
  if (cart.revision === Number.MAX_SAFE_INTEGER) {
    throw new CartStorageError("REVISION_OVERFLOW", "Phiên bản giỏ vượt giới hạn. Giữ bản lưu để kiểm tra.");
  }
  return cart.revision + 1;
}

function matchesSnapshot(cart: Cart, pending: PendingCartRequest): boolean {
  return cart.ownerId === pending.ownerId && cart.revision === pending.cartRevision;
}

function withoutPending(envelope: CartEnvelope, ownerId: string): CartEnvelope["pendingRequests"] {
  return Object.fromEntries(Object.entries(envelope.pendingRequests).filter(([owner]) => owner !== ownerId));
}

function checked(value: OrderSettlementResult): OrderSettlementResult {
  if (!isCartEnvelope(value.envelope)) {
    throw new CartStorageError("INVALID_DATA", "Không lưu được kết quả lần đặt. Giữ bản ghi để phục hồi.");
  }
  return value;
}

// Caller supplies owner/key from the sent request, not the account active when
// the response arrives. No HTTP/auth work is performed inside this transition.
export function settleCartOrder(envelope: CartEnvelope, command: OrderSettlementCommand): OrderSettlementResult {
  const pending = pendingForOwner(envelope, command.ownerId);
  if (!pending || pending.requestKey !== command.requestKey) {
    return { envelope, outcome: { kind: "IGNORED" }, cartEffect: "UNCHANGED" };
  }
  const outcome = classifyOrderReply(command, pending);
  const cart = envelope.cart;
  if (outcome.kind === "UNKNOWN") {
    return checked({ envelope: { ...envelope,
      pendingRequests: { ...envelope.pendingRequests, [pending.ownerId]: { ...pending, phase: "UNKNOWN" } } },
      outcome, cartEffect: "UNCHANGED" });
  }
  const pendingRequests = withoutPending(envelope, pending.ownerId);
  if (outcome.kind === "CONFIRMED") {
    const clear = matchesSnapshot(cart, pending);
    return checked({ envelope: { ...envelope, pendingRequests,
      cart: clear ? { ownerId: cart.ownerId, revision: nextRevision(cart), items: [] } : cart,
      lastOrderResult: { ownerId: pending.ownerId, requestKey: pending.requestKey,
        order: { ...outcome.order }, confirmedAt: command.receivedAt } },
      outcome, cartEffect: clear ? "CLEARED" : "UNRELATED" });
  }
  // Never resurrect a logged-out cart or replace a different/new nonempty cart.
  const original = matchesSnapshot(cart, pending);
  const restore = !original && cart.ownerId === pending.ownerId && cart.items.length === 0;
  let nextCart = cart;
  let cartEffect: OrderSettlementResult["cartEffect"] = original ? "UNCHANGED" : "UNRELATED";
  if (original || restore) {
    let items = restore ? structuredClone(pending.cartSnapshot.items) : cart.items;
    if (outcome.kind === "PRICE_CHANGED") {
      const prices = new Map(outcome.details.items.map((item) => [getCartLineKey(item), item.currentUnitPrice]));
      items = items.map((item) => {
        const price = prices.get(getCartLineKey(item));
        if (price === undefined) throw new CartStorageError("INVALID_DATA", "Thiếu giá của cấu hình cần phục hồi.");
        return { ...item, previewUnitPrice: price };
      });
    }
    if (restore || outcome.kind === "PRICE_CHANGED") {
      nextCart = { ownerId: cart.ownerId, revision: nextRevision(cart), items };
      cartEffect = restore ? "RESTORED" : "REPRICED";
    }
  }
  return checked({ envelope: { ...envelope, cart: nextCart, pendingRequests }, outcome, cartEffect });
}
