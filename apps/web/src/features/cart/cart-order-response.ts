import { getCartLineKey, MAX_CART_MONEY } from "./cart-reducer.ts";
import type { ConfirmedCartOrder, OrderPayloadItem, PendingCartRequest } from "./cart-envelope";

export type OrderReply = { status: number | null; body: unknown };
export type PriceChangedItem = OrderPayloadItem & { currentUnitPrice: number; currentLineTotal: number };
export type OrderReplyOutcome =
  | { kind: "CONFIRMED"; order: ConfirmedCartOrder["order"] }
  | { kind: "REJECTED"; message: string; fieldErrors: Readonly<Record<string, readonly string[]>> }
  | { kind: "PRICE_CHANGED"; message: string; details: { items: readonly PriceChangedItem[]; currentTotal: number } }
  | { kind: "UNKNOWN"; code: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function money(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_CART_MONEY;
}

function ids(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
}

function fieldErrors(value: unknown, itemCount: number): value is Record<string, string[]> {
  return record(value) && Object.entries(value).every(([path, messages]) => {
    if (!path || !Array.isArray(messages) || messages.length === 0 || !messages.every(text)) return false;
    if (!path.startsWith("items[")) return true; // Unknown global fields remain global UI errors.
    const match = /^items\[(0|[1-9]\d*)\](?:\.(productId|size|toppingIds|qty|expectedUnitPrice))?$/.exec(path);
    return match !== null && Number(match[1]) < itemCount;
  });
}

function priceDetails(value: unknown, pending: PendingCartRequest): { items: PriceChangedItem[]; currentTotal: number } | null {
  if (!record(value) || !exactKeys(value, ["items", "currentTotal"])
    || !Array.isArray(value.items) || value.items.length !== pending.payload.items.length
    || !money(value.currentTotal)) return null;
  const expected = new Map(pending.payload.items.map((item) => [getCartLineKey(item), item]));
  const seen = new Set<string>();
  const items: PriceChangedItem[] = [];
  let total = 0;
  let changed = false;
  for (const raw of value.items) {
    if (!record(raw) || !exactKeys(raw, ["productId", "size", "toppingIds", "qty",
      "expectedUnitPrice", "currentUnitPrice", "currentLineTotal"])
      || !text(raw.productId) || !(raw.size === "S" || raw.size === "M" || raw.size === "L")
      || !ids(raw.toppingIds) || !money(raw.expectedUnitPrice)
      || !money(raw.currentUnitPrice) || !money(raw.currentLineTotal)) return null;
    const key = getCartLineKey({ productId: raw.productId, size: raw.size, toppingIds: raw.toppingIds });
    const source = expected.get(key);
    if (!source || seen.has(key) || raw.qty !== source.qty || raw.expectedUnitPrice !== source.expectedUnitPrice
      || raw.currentLineTotal !== raw.currentUnitPrice * source.qty) return null;
    seen.add(key);
    total += raw.currentLineTotal;
    if (!money(total)) return null;
    changed ||= raw.currentUnitPrice !== raw.expectedUnitPrice;
    items.push({ productId: raw.productId, size: raw.size, toppingIds: [...raw.toppingIds],
      qty: source.qty, expectedUnitPrice: source.expectedUnitPrice,
      currentUnitPrice: raw.currentUnitPrice, currentLineTotal: raw.currentLineTotal });
  }
  return total === value.currentTotal && changed ? { items, currentTotal: total } : null;
}

// This checks the body for the exact in-flight request captured by the caller.
// A 2xx status alone, or a recognizable code with malformed details, is not proof.
export function classifyOrderReply(reply: OrderReply, pending: PendingCartRequest): OrderReplyOutcome {
  const { status, body } = reply;
  if (status === 200 || status === 201) {
    const expectedTotal = pending.payload.items.reduce((sum, item) => sum + item.qty * item.expectedUnitPrice, 0);
    if (record(body) && exactKeys(body, ["id", "status", "total"]) && text(body.id)
      && body.status === "PENDING" && money(body.total) && body.total === expectedTotal) {
      return { kind: "CONFIRMED", order: { id: body.id, status: "PENDING", total: body.total } };
    }
    return { kind: "UNKNOWN", code: "INVALID_RESPONSE" };
  }
  if (!record(body) || !exactKeys(body, ["error"]) || !record(body.error)
    || !text(body.error.code) || !text(body.error.message)) {
    return { kind: "UNKNOWN", code: status === null ? "NO_RESPONSE" : "INVALID_RESPONSE" };
  }
  const error = body.error;
  if (status === 400 && error.code === "VALIDATION_ERROR"
    && exactKeys(error, ["code", "message"], ["fieldErrors"])
    && (!Object.hasOwn(error, "fieldErrors") || fieldErrors(error.fieldErrors, pending.payload.items.length))) {
    return { kind: "REJECTED", message: error.message as string,
      fieldErrors: Object.hasOwn(error, "fieldErrors")
        ? structuredClone(error.fieldErrors as Record<string, string[]>) : {} };
  }
  if (status === 409 && error.code === "PRICE_CHANGED" && exactKeys(error, ["code", "message", "details"])) {
    const details = priceDetails(error.details, pending);
    if (details) return { kind: "PRICE_CHANGED", message: error.message as string, details };
    return { kind: "UNKNOWN", code: "INVALID_RESPONSE" };
  }
  const recognized: Record<number, readonly string[]> = {
    401: ["AUTH_REQUIRED", "SESSION_EXPIRED", "SESSION_INVALID"],
    403: ["REQUEST_FORBIDDEN"], 413: ["PAYLOAD_TOO_LARGE"],
    409: ["IDEMPOTENCY_CONFLICT", "ORDER_REQUEST_IN_PROGRESS"],
    500: ["INTERNAL_ERROR"], 502: ["UPSTREAM_UNAVAILABLE"], 504: ["UPSTREAM_TIMEOUT"],
  };
  return { kind: "UNKNOWN", code: status !== null && recognized[status]?.includes(error.code as string)
    ? error.code as string : "INVALID_RESPONSE" };
}
