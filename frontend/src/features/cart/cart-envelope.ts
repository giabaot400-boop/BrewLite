import { createInitialCartState, getCartLineKey, MAX_CART_ITEMS,
  MAX_CART_MONEY, MAX_CART_QUANTITY, selectCartTotal } from "./cart-reducer.ts";
import type { Cart, CartLine } from "./types";

export type OrderPayloadItem = {
  productId: string;
  size: CartLine["size"];
  toppingIds: readonly string[];
  qty: number;
  expectedUnitPrice: number;
};

export type PendingCartRequest = {
  ownerId: string;
  requestKey: string;
  payload: { items: readonly OrderPayloadItem[] };
  cartRevision: number;
  cartSnapshot: Cart;
  createdAt: string;
  phase: "SUBMITTING" | "UNKNOWN";
};

export type ConfirmedCartOrder = {
  ownerId: string;
  requestKey: string;
  order: { id: string; status: "PENDING"; total: number };
  confirmedAt: string;
};

export type CartEnvelope = {
  schemaVersion: 1;
  cart: Cart;
  pendingRequests: Readonly<Record<string, PendingCartRequest>>;
  lastOrderResult: ConfirmedCartOrder | null;
};

export type CartStorageErrorCode = "INVALID_DATA" | "UNSUPPORTED_VERSION"
  | "STORAGE_UNAVAILABLE" | "LOCK_UNAVAILABLE" | "LOCK_TIMEOUT"
  | "OWNER_MISMATCH" | "PENDING_REQUEST" | "REVISION_OVERFLOW";

export class CartStorageError extends Error {
  readonly code: CartStorageErrorCode;

  constructor(code: CartStorageErrorCode, message: string) {
    super(message);
    this.name = "CartStorageError";
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function money(value: unknown): value is number {
  return integer(value, 0, MAX_CART_MONEY);
}

function ids(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
}

function size(value: unknown): value is CartLine["size"] {
  return value === "S" || value === "M" || value === "L";
}

function requestKey(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function cartLine(value: unknown): value is CartLine {
  if (!record(value) || !exactKeys(value, ["productId", "productName", "imageUrl", "size",
    "toppingIds", "toppingNames", "previewUnitPrice", "qty"])
    || !text(value.productId) || !text(value.productName) || !text(value.imageUrl)
    || !size(value.size) || !ids(value.toppingIds) || !money(value.previewUnitPrice)
    || !integer(value.qty, 1, MAX_CART_QUANTITY) || !record(value.toppingNames)) return false;
  const names = value.toppingNames;
  return exactKeys(names, value.toppingIds) && value.toppingIds.every((id) => text(names[id]))
    && money(value.previewUnitPrice * value.qty);
}

function cart(value: unknown): value is Cart {
  if (!record(value) || !exactKeys(value, ["ownerId", "revision", "items"])
    || !(value.ownerId === null || text(value.ownerId))
    || !integer(value.revision, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.items) || value.items.length > MAX_CART_ITEMS
    || !value.items.every(cartLine)) return false;
  const items: CartLine[] = value.items;
  return new Set(items.map(getCartLineKey)).size === items.length
    && money(selectCartTotal({ ownerId: value.ownerId, revision: value.revision, items }));
}

function payloadItem(value: unknown): value is OrderPayloadItem {
  return record(value) && exactKeys(value,
    ["productId", "size", "toppingIds", "qty", "expectedUnitPrice"])
    && text(value.productId) && size(value.size) && ids(value.toppingIds)
    && integer(value.qty, 1, MAX_CART_QUANTITY) && money(value.expectedUnitPrice)
    && money(value.expectedUnitPrice * value.qty);
}

function pending(value: unknown, owner: string): value is PendingCartRequest {
  if (!record(value) || !exactKeys(value, ["ownerId", "requestKey", "payload",
    "cartRevision", "cartSnapshot", "createdAt", "phase"])
    || !text(owner) || value.ownerId !== owner || !requestKey(value.requestKey)
    || !cart(value.cartSnapshot) || value.cartSnapshot.ownerId !== owner
    || value.cartRevision !== value.cartSnapshot.revision
    || !timestamp(value.createdAt) || !(value.phase === "SUBMITTING" || value.phase === "UNKNOWN")
    || !record(value.payload) || !exactKeys(value.payload, ["items"])
    || !Array.isArray(value.payload.items) || value.payload.items.length < 1
    || value.payload.items.length > MAX_CART_ITEMS || !value.payload.items.every(payloadItem)
    || new TextEncoder().encode(JSON.stringify(value.payload)).byteLength > 32 * 1024) return false;

  const items: OrderPayloadItem[] = value.payload.items;
  const snapshot = new Map(value.cartSnapshot.items.map((item) => [getCartLineKey(item), item]));
  if (snapshot.size !== items.length || new Set(items.map(getCartLineKey)).size !== items.length) return false;
  return items.every((item) => {
    const saved = snapshot.get(getCartLineKey(item));
    return saved !== undefined && saved.qty === item.qty && saved.previewUnitPrice === item.expectedUnitPrice;
  });
}

function confirmed(value: unknown): value is ConfirmedCartOrder {
  return record(value) && exactKeys(value, ["ownerId", "requestKey", "order", "confirmedAt"])
    && text(value.ownerId) && requestKey(value.requestKey) && timestamp(value.confirmedAt)
    && record(value.order) && exactKeys(value.order, ["id", "status", "total"])
    && text(value.order.id) && value.order.status === "PENDING" && money(value.order.total);
}

export function isCartEnvelope(value: unknown): value is CartEnvelope {
  return record(value) && exactKeys(value,
    ["schemaVersion", "cart", "pendingRequests", "lastOrderResult"])
    && value.schemaVersion === 1 && cart(value.cart) && record(value.pendingRequests)
    && Object.entries(value.pendingRequests).every(([owner, item]) => pending(item, owner))
    && (value.lastOrderResult === null || confirmed(value.lastOrderResult));
}

export function createEmptyCartEnvelope(): CartEnvelope {
  return { schemaVersion: 1, cart: createInitialCartState().cart,
    pendingRequests: {}, lastOrderResult: null };
}

export function decodeCartEnvelope(raw: string | null): CartEnvelope {
  if (raw === null) return createEmptyCartEnvelope();
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    throw new CartStorageError("INVALID_DATA", "Dữ liệu giỏ đã lưu không đọc được.");
  }
  if (record(value) && Object.prototype.hasOwnProperty.call(value, "schemaVersion")
    && value.schemaVersion !== 1) {
    throw new CartStorageError("UNSUPPORTED_VERSION", "Phiên bản dữ liệu giỏ chưa được hỗ trợ.");
  }
  if (!isCartEnvelope(value)) {
    throw new CartStorageError("INVALID_DATA", "Dữ liệu giỏ đã lưu không hợp lệ. Giữ bản lưu để kiểm tra.");
  }
  // Recovery never reorders a pending payload or generates another key.
  // This does not write to storage; a SUBMITTING record has no confirmed result.
  return { ...value, pendingRequests: Object.fromEntries(Object.entries(value.pendingRequests)
    .map(([owner, item]) => [owner, { ...item, phase: "UNKNOWN" as const }])) };
}

export function encodeCartEnvelope(value: CartEnvelope): string {
  if (!isCartEnvelope(value)) {
    throw new CartStorageError("INVALID_DATA", "Không thể lưu dữ liệu giỏ không hợp lệ.");
  }
  return JSON.stringify(value);
}

// Caller must supply the backend-confirmed owner; local data is not proof of identity.
export function pendingForOwner(envelope: CartEnvelope, ownerId: string | null): PendingCartRequest | null {
  return ownerId !== null && Object.prototype.hasOwnProperty.call(envelope.pendingRequests, ownerId)
    ? envelope.pendingRequests[ownerId] : null;
}

export function resultForOwner(envelope: CartEnvelope, ownerId: string | null): ConfirmedCartOrder | null {
  return ownerId !== null && envelope.lastOrderResult?.ownerId === ownerId
    ? envelope.lastOrderResult : null;
}
