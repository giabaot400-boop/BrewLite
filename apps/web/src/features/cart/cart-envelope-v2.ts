import { CartStorageError, createEmptyCartEnvelope, isCartEnvelope } from "./cart-envelope.ts";
import type { CartEnvelope, OrderPayloadItem, PendingCartRequest } from "./cart-envelope";
import type { Cart } from "./types";

// Envelope, HTTP body and canonical versions are separate contracts.
export type OrderPayloadV2 = {
  schemaVersion: 2;
  items: readonly OrderPayloadItem[];
  promotionCode: string | null;
  expectedTotal: number;
};

export type PendingCartRequestV2 = Omit<PendingCartRequest, "payload"> & {
  payload: PendingCartRequest["payload"] | OrderPayloadV2;
};

export type CheckoutBinding = {
  ownerId: string;
  orderId: string;
  cartRevision: number;
  cartSnapshot: Cart;
  orderVersion: number;
  boundAt: string;
};

export type PaymentRecovery = {
  ownerId: string;
  requestKey: string;
  body: { orderId: string; method: "WALLET" | "CARD" };
  createdAt: string;
  paymentId: string | null;
  recoveryStatus: "UNRESOLVED" | "RESOLVED";
};

export type CartEnvelopeV2 = Omit<CartEnvelope, "schemaVersion" | "pendingRequests"> & {
  schemaVersion: 2;
  pendingRequests: Readonly<Record<string, PendingCartRequestV2>>;
  checkoutBindings: Readonly<Record<string, CheckoutBinding>>;
  paymentRecoveries: Readonly<Record<string, Readonly<Record<string, PaymentRecovery>>>>;
};

const MAX_INT = 2147483647;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).length === expected.length && expected.every(key => own(value, key));
const integer = (value: unknown, min: number, max = MAX_INT): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function fitsBody(value: unknown, limit: number): boolean {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= limit; } catch { return false; }
}

function base(cart: unknown, pendingRequests: unknown = {}, lastOrderResult: unknown = null) {
  return { schemaVersion: 1, cart, pendingRequests, lastOrderResult };
}

function validPromotion(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  // Check whether backend normalization accepts the value; never rewrite a saved body.
  const normalized = value.trim().replace(/[a-z]/g, letter => letter.toUpperCase());
  return normalized === "" || /^[A-Z0-9_-]{1,32}$/.test(normalized);
}

function pending(value: unknown, owner: string): value is PendingCartRequestV2 {
  if (!record(value) || !keys(value, ["ownerId", "requestKey", "payload", "cartRevision",
    "cartSnapshot", "createdAt", "phase"]) || !record(value.payload)) return false;
  const payload = value.payload;
  const v1 = keys(payload, ["items"]);
  const v2 = keys(payload, ["schemaVersion", "items", "promotionCode", "expectedTotal"])
    && payload.schemaVersion === 2 && validPromotion(payload.promotionCode)
    && integer(payload.expectedTotal, 1);
  if ((!v1 && !v2) || !fitsBody(payload, 32 * 1024)) return false;
  // Reuse v1 validation for owner/key/time, exact snapshot, row identity and all bounds.
  // The projection is only for validation; it never replaces the original payload.
  return isCartEnvelope(base(value.cartSnapshot, {
    [owner]: { ...value, payload: { items: payload.items } },
  }));
}

function binding(value: unknown, owner: string): value is CheckoutBinding {
  return record(value) && keys(value, ["ownerId", "orderId", "cartRevision", "cartSnapshot",
    "orderVersion", "boundAt"]) && text(owner) && value.ownerId === owner && text(value.orderId)
    && isCartEnvelope(base(value.cartSnapshot)) && record(value.cartSnapshot)
    && value.cartSnapshot.ownerId === owner && Array.isArray(value.cartSnapshot.items)
    && value.cartSnapshot.items.length > 0 && value.cartRevision === value.cartSnapshot.revision
    && integer(value.orderVersion, 0) && timestamp(value.boundAt);
}

function recovery(value: unknown, owner: string, key: string): value is PaymentRecovery {
  return record(value) && keys(value, ["ownerId", "requestKey", "body", "createdAt", "paymentId", "recoveryStatus"])
    && text(owner) && value.ownerId === owner && uuid(key) && value.requestKey === key
    && timestamp(value.createdAt) && (value.paymentId === null || text(value.paymentId))
    && (value.recoveryStatus === "UNRESOLVED" || value.recoveryStatus === "RESOLVED")
    && record(value.body) && keys(value.body, ["orderId", "method"])
    && text(value.body.orderId) && (value.body.method === "WALLET" || value.body.method === "CARD")
    && fitsBody(value.body, 4096);
}

export function isCartEnvelopeV2(value: unknown): value is CartEnvelopeV2 {
  if (!record(value) || !keys(value, ["schemaVersion", "cart", "pendingRequests", "lastOrderResult",
    "checkoutBindings", "paymentRecoveries"]) || value.schemaVersion !== 2
    || !isCartEnvelope(base(value.cart, {}, value.lastOrderResult))
    || !record(value.pendingRequests) || !record(value.checkoutBindings) || !record(value.paymentRecoveries)) return false;
  return Object.entries(value.pendingRequests).every(([owner, item]) => pending(item, owner))
    && Object.entries(value.checkoutBindings).every(([owner, item]) => binding(item, owner))
    && Object.entries(value.paymentRecoveries).every(([owner, items]) => {
      if (!text(owner) || !record(items)) return false;
      const entries = Object.entries(items);
      return entries.every(([key, item]) => recovery(item, owner, key))
        && entries.filter(([, item]) => (item as PaymentRecovery).recoveryStatus === "UNRESOLVED").length <= 1;
    });
}

export function createEmptyCartEnvelopeV2(): CartEnvelopeV2 {
  return { ...createEmptyCartEnvelope(), schemaVersion: 2, checkoutBindings: {}, paymentRecoveries: {} };
}

function parse(raw: string): unknown {
  try { return JSON.parse(raw); } catch {
    throw new CartStorageError("INVALID_DATA", "Dữ liệu giỏ đã lưu không đọc được.");
  }
}

function invalid(): never {
  throw new CartStorageError("INVALID_DATA", "Dữ liệu giỏ đã lưu không hợp lệ. Giữ bản lưu để kiểm tra.");
}

function restore(value: CartEnvelopeV2): CartEnvelopeV2 {
  return { ...value, pendingRequests: Object.fromEntries(Object.entries(value.pendingRequests)
    .map(([owner, item]) => [owner, { ...item, phase: "UNKNOWN" as const }])) };
}

export function encodeCartEnvelopeV2(value: CartEnvelopeV2): string {
  if (!isCartEnvelopeV2(value)) invalid();
  return JSON.stringify(value);
}

/** Validate persisted data without changing any owner's pending phase. Used by writers. */
export function parseStoredCartEnvelopeV2(raw: string | null): CartEnvelopeV2 {
  if (raw === null) return createEmptyCartEnvelopeV2();
  const value = parse(raw);
  if (record(value) && own(value, "schemaVersion") && value.schemaVersion !== 2) {
    throw new CartStorageError("UNSUPPORTED_VERSION", "Phiên bản dữ liệu giỏ chưa được hỗ trợ.");
  }
  if (!isCartEnvelopeV2(value)) invalid();
  return value;
}

/** Read-only recovery: no migration, storage write, new key or body normalization. */
export function decodeCartEnvelopeV2(raw: string | null): CartEnvelopeV2 {
  return restore(parseStoredCartEnvelopeV2(raw));
}

/**
 * Pure migration plan. The caller must read current bytes and apply rawToWrite in
 * one Web Lock. Stored SUBMITTING stays unchanged; only the returned view is UNKNOWN.
 * Migration does not infer checkout binding from an old PENDING creation result.
 */
export function planCartEnvelopeV2Migration(raw: string | null): {
  envelope: CartEnvelopeV2; rawToWrite: string | null;
} {
  if (raw === null) return { envelope: createEmptyCartEnvelopeV2(), rawToWrite: null };
  const value = parse(raw);
  if (record(value) && own(value, "schemaVersion") && ![1, 2].includes(value.schemaVersion as number)) {
    throw new CartStorageError("UNSUPPORTED_VERSION", "Phiên bản dữ liệu giỏ chưa được hỗ trợ.");
  }
  if (record(value) && value.schemaVersion === 2) {
    if (!isCartEnvelopeV2(value)) invalid();
    return { envelope: restore(value), rawToWrite: null };
  }
  if (!isCartEnvelope(value)) invalid();
  const next: CartEnvelopeV2 = { ...value, schemaVersion: 2, checkoutBindings: {}, paymentRecoveries: {} };
  return { envelope: restore(next), rawToWrite: encodeCartEnvelopeV2(next) };
}

// Owner must come from a verified session; these selectors are not authentication.
export function checkoutBindingForOwner(value: CartEnvelopeV2, ownerId: string | null): CheckoutBinding | null {
  return ownerId !== null && own(value.checkoutBindings, ownerId) ? value.checkoutBindings[ownerId] : null;
}

export function paymentRecoveryForOwner(value: CartEnvelopeV2, ownerId: string | null, key: string): PaymentRecovery | null {
  if (ownerId === null || !own(value.paymentRecoveries, ownerId)) return null;
  const items = value.paymentRecoveries[ownerId];
  return own(items, key) ? items[key] : null;
}
