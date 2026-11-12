import { CartStorageError } from "./cart-envelope.ts";
import { checkoutBindingForOwner, isCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { classifyOrderReply } from "./cart-order-response.ts";
import { settleCartOrder } from "./cart-order-settlement.ts";
import { getCartLineKey, MAX_CART_MONEY } from "./cart-reducer.ts";
import type { CartEnvelopeV2, PendingCartRequestV2 } from "./cart-envelope-v2";
import type { OrderReply, OrderReplyOutcome } from "./cart-order-response";

/**
 * Pin these lists from the agreed C/D response contract, never from a response.
 * CONTRACTS section 3 pins the two CHECKOUT_CHANGED reasons from C (25ff9a8).
 * OUT_OF_STOCK pins the existing backend INSUFFICIENT_STOCK response.
 * Promotion reasons below are already enumerated by CONTRACTS section 3.
 */
export type OrderRejectionReasonsV2 = {
  checkoutChanged: readonly string[];
  outOfStock: readonly string[];
};
const NO_REASONS: OrderRejectionReasonsV2 = { checkoutChanged: [], outOfStock: [] };
export const ORDER_REJECTION_REASONS_V2: OrderRejectionReasonsV2 = Object.freeze({
  checkoutChanged: Object.freeze(["PRODUCT_PRICE_CHANGED", "EXPECTED_TOTAL_MISMATCH"]),
  outOfStock: Object.freeze(["INSUFFICIENT_STOCK"]),
});
export type CheckoutChangedDetails = {
  reason: string; currentSubtotal: number; currentDiscountTotal: number; currentTotal: number;
  items: readonly { productId: string; size: "S" | "M" | "L"; toppingIds: readonly string[]; currentUnitPrice: number }[];
};
export type StockRejectionDetails = {
  reason: string; resources: readonly { kind: "PRODUCT"; id: string; requested: number; available: number }[];
};
type LegacyRejection = Extract<OrderReplyOutcome, { kind: "REJECTED" | "PRICE_CHANGED" }>;
export type CartRejectionOutcomeV2 = LegacyRejection
  | { kind: "CHECKOUT_CHANGED"; message: string; details: CheckoutChangedDetails }
  | { kind: "PROMOTION_NOT_APPLICABLE"; message: string; reason: string }
  | { kind: "OUT_OF_STOCK"; message: string; details: StockRejectionDetails }
  | { kind: "UNKNOWN"; code: string }
  | { kind: "IGNORED" };
export type CartRejectionCommandV2 = OrderReply & { ownerId: string; requestKey: string };
export type CartRejectionResultV2 = {
  envelope: CartEnvelopeV2; outcome: CartRejectionOutcomeV2;
  cartEffect: "UNCHANGED" | "REPRICED" | "RESTORED" | "UNRELATED";
  requiresConfirmation: boolean;
};
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const money = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CART_MONEY;
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const promotionReasons: ReadonlySet<string> = new Set(["NOT_FOUND", "INACTIVE", "NOT_STARTED", "EXPIRED", "MINIMUM_NOT_MET"]);

function checkoutDetails(raw: unknown, pending: PendingCartRequestV2): CheckoutChangedDetails | null {
  if (!record(raw) || !text(raw.reason) || !money(raw.currentSubtotal) || !money(raw.currentDiscountTotal)
    || !money(raw.currentTotal) || raw.currentTotal < 1 || raw.currentSubtotal - raw.currentDiscountTotal !== raw.currentTotal
    || !Array.isArray(raw.items) || raw.items.length !== pending.payload.items.length) return null;
  const requested = new Map(pending.payload.items.map(item => [getCartLineKey(item), item]));
  const seen = new Set<string>(); const items: CheckoutChangedDetails["items"][number][] = [];
  let subtotal = 0, priceChanged = false;
  const totalChanged = "schemaVersion" in pending.payload && pending.payload.expectedTotal !== raw.currentTotal;
  for (const item of raw.items) {
    if (!record(item) || !exact(item, ["productId", "size", "toppingIds", "currentUnitPrice"])
      || !text(item.productId) || !["S", "M", "L"].includes(item.size as string)
      || !Array.isArray(item.toppingIds) || !item.toppingIds.every(text)
      || new Set(item.toppingIds).size !== item.toppingIds.length || !money(item.currentUnitPrice)) return null;
    const line = { productId: item.productId, size: item.size as "S" | "M" | "L", toppingIds: [...item.toppingIds], currentUnitPrice: item.currentUnitPrice };
    const key = getCartLineKey(line), source = requested.get(key);
    if (!source || seen.has(key)) return null;
    seen.add(key); subtotal += source.qty * line.currentUnitPrice;
    if (!money(subtotal)) return null;
    priceChanged ||= source.expectedUnitPrice !== line.currentUnitPrice;
    items.push(line);
  }
  if (raw.reason === "PRODUCT_PRICE_CHANGED" && !priceChanged) return null;
  if (raw.reason === "EXPECTED_TOTAL_MISMATCH" && (priceChanged || !totalChanged)) return null;
  return subtotal === raw.currentSubtotal && (priceChanged || totalChanged) ? { reason: raw.reason,
    currentSubtotal: subtotal, currentDiscountTotal: raw.currentDiscountTotal, currentTotal: raw.currentTotal, items } : null;
}

function stockDetails(raw: unknown, pending: PendingCartRequestV2): StockRejectionDetails | null {
  if (!record(raw) || !text(raw.reason) || !Array.isArray(raw.resources) || raw.resources.length === 0) return null;
  const requested = new Map<string, number>();
  for (const item of pending.payload.items) requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.qty);
  const seen = new Set<string>(); const resources: StockRejectionDetails["resources"][number][] = [];
  for (const resource of raw.resources) {
    if (!record(resource) || !exact(resource, ["kind", "id", "requested", "available"]) || resource.kind !== "PRODUCT"
      || !text(resource.id) || seen.has(resource.id) || !money(resource.requested) || !money(resource.available)
      || resource.requested !== requested.get(resource.id) || resource.available >= resource.requested) return null;
    seen.add(resource.id); resources.push({ kind: "PRODUCT", id: resource.id, requested: resource.requested, available: resource.available });
  }
  return { reason: raw.reason, resources };
}

function classify(reply: OrderReply, pending: PendingCartRequestV2, reasons: OrderRejectionReasonsV2): CartRejectionOutcomeV2 {
  if (!("schemaVersion" in pending.payload) || reply.status === 400) {
    const legacy = classifyOrderReply(reply, pending);
    // Success must go through CREATE_REPLY + current Order binding, never S2 clear-on-PENDING.
    return legacy.kind === "CONFIRMED" ? { kind: "UNKNOWN", code: "USE_ORDER_BINDING" } : legacy;
  }
  const body = reply.body;
  if (!record(body) || !exact(body, ["error"]) || !record(body.error)
    || !text(body.error.code) || !text(body.error.message)) return { kind: "UNKNOWN", code: "INVALID_RESPONSE" };
  const error = body.error;
  if (reply.status !== 409 || !exact(error, ["code", "message", "details"]) || !record(error.details)) {
    return { kind: "UNKNOWN", code: error.code as string };
  }
  const details = error.details;
  if (error.code === "PROMOTION_NOT_APPLICABLE" && text(details.reason) && promotionReasons.has(details.reason)
    && "schemaVersion" in pending.payload && typeof pending.payload.promotionCode === "string"
    && pending.payload.promotionCode.trim() !== "") {
    return { kind: "PROMOTION_NOT_APPLICABLE", message: error.message as string, reason: details.reason };
  }
  if (error.code === "CHECKOUT_CHANGED" && reasons.checkoutChanged.includes(details.reason as string)) {
    const checked = checkoutDetails(details, pending);
    if (checked) return { kind: "CHECKOUT_CHANGED", message: error.message as string, details: checked };
  }
  if (error.code === "OUT_OF_STOCK" && reasons.outOfStock.includes(details.reason as string)) {
    const checked = stockDetails(details, pending);
    if (checked) return { kind: "OUT_OF_STOCK", message: error.message as string, details: checked };
  }
  return { kind: "UNKNOWN", code: "INVALID_RESPONSE" };
}

function checked(envelope: CartEnvelopeV2, outcome: CartRejectionOutcomeV2,
  cartEffect: CartRejectionResultV2["cartEffect"] = "UNCHANGED"): CartRejectionResultV2 {
  if (!isCartEnvelopeV2(envelope)) throw new CartStorageError("INVALID_DATA", "Không lưu được kết quả từ chối. Giữ bản lưu để kiểm tra.");
  return { envelope, outcome, cartEffect, requiresConfirmation: !["UNKNOWN", "IGNORED"].includes(outcome.kind) };
}

/** Pure, request-bound transition. It never sends HTTP, generates a key or removes a promo. */
export function settleCartRejectionV2(value: CartEnvelopeV2, command: CartRejectionCommandV2,
  reasons: OrderRejectionReasonsV2 = NO_REASONS): CartRejectionResultV2 {
  checked(value, { kind: "IGNORED" });
  if (!text(command.ownerId) || !reasons || !Array.isArray(reasons.checkoutChanged) || !reasons.checkoutChanged.every(text)
    || !Array.isArray(reasons.outOfStock) || !reasons.outOfStock.every(text)) {
    throw new CartStorageError("INVALID_DATA", "Thiếu thông tin đối chiếu kết quả từ chối.");
  }
  const pending = Object.hasOwn(value.pendingRequests, command.ownerId) ? value.pendingRequests[command.ownerId] : null;
  if (!pending || pending.requestKey !== command.requestKey) return checked(value, { kind: "IGNORED" });
  // A previously confirmed creation cannot later be undone by an error response.
  if (value.lastOrderResult?.ownerId === pending.ownerId && value.lastOrderResult.requestKey === pending.requestKey) {
    return checked(value, { kind: "IGNORED" });
  }
  const outcome = classify(command, pending, reasons);
  if (outcome.kind === "UNKNOWN") return checked(pending.phase === "UNKNOWN" ? value : { ...value,
    pendingRequests: { ...value.pendingRequests, [pending.ownerId]: { ...pending, phase: "UNKNOWN" } } }, outcome);
  const pendingRequests = Object.fromEntries(Object.entries(value.pendingRequests).filter(([owner]) => owner !== pending.ownerId));
  // V2 retains the current cart verbatim. Price/stock details are review data;
  // only a later explicit user confirmation may prepare a fresh key/body.
  if ("schemaVersion" in pending.payload) return checked({ ...value, pendingRequests }, outcome,
    value.cart.ownerId === pending.ownerId && value.cart.revision === pending.cartRevision ? "UNCHANGED" : "UNRELATED");
  const unresolved = Object.hasOwn(value.paymentRecoveries, pending.ownerId)
    && Object.values(value.paymentRecoveries[pending.ownerId]).some(item => item.recoveryStatus === "UNRESOLVED");
  if (checkoutBindingForOwner(value, pending.ownerId) || unresolved) {
    return checked({ ...value, pendingRequests }, outcome, "UNRELATED");
  }
  // Preserve Sprint 2 rejection/PRICE_CHANGED behavior for migrated v1 bodies.
  const settled = settleCartOrder({ schemaVersion: 1, cart: value.cart, pendingRequests: { [pending.ownerId]: pending }, lastOrderResult: value.lastOrderResult },
    { ...command, receivedAt: pending.createdAt });
  if (settled.cartEffect === "CLEARED") throw new CartStorageError("INVALID_DATA", "Kết quả tạo đơn cần được đối chiếu trạng thái hiện tại.");
  return checked({ ...value, cart: settled.envelope.cart, pendingRequests }, outcome, settled.cartEffect);
}
