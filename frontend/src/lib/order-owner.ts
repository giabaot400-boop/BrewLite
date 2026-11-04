// UI -> BFF only. This is an expected identity, never authentication evidence.
export const ORDER_OWNER_HEADER = "X-BrewLite-Expected-Owner";

// Encoding preserves opaque IDs exactly and keeps the HTTP header ASCII-safe.
export function encodeOrderOwner(ownerId: string): string {
  return encodeURIComponent(ownerId);
}

export function readExpectedOrderOwner(headers: Headers): string | null {
  const raw = headers.get(ORDER_OWNER_HEADER);
  if (!raw) return null;
  try {
    const ownerId = decodeURIComponent(raw);
    return ownerId.length > 0 && encodeOrderOwner(ownerId) === raw ? ownerId : null;
  } catch { return null; }
}
