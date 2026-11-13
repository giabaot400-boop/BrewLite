/** Next has already decoded params once. Encode opaque IDs without decoding or trimming. */
export function encodeOrderPathSegment(orderId: unknown): string | null {
  try {
    // Whole dot segments are normalized by URL/fetch and cannot safely identify an order.
    return typeof orderId === "string" && orderId.length > 0 && orderId !== "." && orderId !== ".."
      ? encodeURIComponent(orderId) : null;
  } catch { return null; }
}
