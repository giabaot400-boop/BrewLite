import { EXPECTED_SESSION_HEADER, isSessionBinding } from "../../lib/session-binding.ts";
import { OrderApiError, type OrderErrorCode } from "./order-error.ts";
import { createMockOrderReadClient } from "./order-fixtures.ts";
import { parseHistory, parseOrderDetail } from "./order-parse.ts";
import type { HistoryView, OrderDetail } from "./types.ts";

/** UI → BFF chờ tối đa 15 giây, gồm cả thời gian đọc body (cùng quy tắc với auth-client). */
export const ORDER_READ_TIMEOUT_MS = 15_000;

/**
 * `binding` là binding của phiên mà UI đang hiển thị (từ /api/auth/me hoặc login). Mỗi lượt đọc gửi nó
 * để BFF từ chối khi cookie đã thuộc phiên khác. Thiếu binding hợp lệ thì không gửi yêu cầu (fail-closed).
 */
export type OrderReadClient = {
  getOrder(id: string, binding: string | undefined): Promise<OrderDetail>;
  getHistory(binding: string | undefined): Promise<HistoryView>;
};

type FetchLike = typeof fetch;

type ErrorBody = { error?: { code?: unknown; message?: unknown; details?: unknown } };

const KNOWN_CODES: ReadonlySet<string> = new Set<OrderErrorCode>([
  "VALIDATION_ERROR", "AUTH_REQUIRED", "SESSION_EXPIRED", "SESSION_INVALID", "REQUEST_FORBIDDEN",
  "RESOURCE_NOT_FOUND", "IDEMPOTENCY_CONFLICT", "CHECKOUT_CHANGED", "PRICE_CHANGED",
  "ORDER_REQUEST_IN_PROGRESS", "PROMOTION_NOT_APPLICABLE", "OUT_OF_STOCK", "ORDER_NOT_PAYABLE",
  "PAYMENT_WINDOW_EXPIRED", "ORDER_NOT_CANCELLABLE", "LEGACY_ORDER_REQUIRES_REVIEW",
  "PAYLOAD_TOO_LARGE", "TRANSACTION_RETRY_EXHAUSTED", "UPSTREAM_UNAVAILABLE", "UPSTREAM_TIMEOUT",
  "INTERNAL_ERROR",
]);

async function readError(response: Response): Promise<OrderApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Không phải JSON (ví dụ trang lỗi của proxy): dùng mã theo HTTP status.
  }
  const rawCode = typeof body.error?.code === "string" ? body.error.code : "UNKNOWN";
  const code = (KNOWN_CODES.has(rawCode) ? rawCode : "UNKNOWN") as OrderErrorCode;
  const message = typeof body.error?.message === "string" ? body.error.message : "";
  return new OrderApiError(code, message, response.status, body.error?.details);
}

async function getJson<T>(
  fetchImpl: FetchLike,
  path: string,
  timeoutMs: number,
  binding: string | undefined,
  parse: (value: unknown) => T,
): Promise<T> {
  if (!isSessionBinding(binding)) {
    return Promise.reject(new OrderApiError("SESSION_INVALID", "Chưa xác minh được phiên đăng nhập.", 401));
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new OrderApiError("CLIENT_TIMEOUT", "Hết thời gian chờ phản hồi."));
    }, timeoutMs);
  });
  const work = (async () => {
    const response = await fetchImpl(path, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", [EXPECTED_SESSION_HEADER]: binding },
      signal: controller.signal,
    });
    if (!response.ok) throw await readError(response);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new OrderApiError("INVALID_RESPONSE", "Phản hồi không đọc được.", response.status);
    }
    return parse(body);
  })();
  work.catch(() => undefined); // deadline có thể thắng; tránh unhandled rejection muộn
  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (error instanceof OrderApiError) throw error;
    if (controller.signal.aborted) throw new OrderApiError("CLIENT_TIMEOUT", "Hết thời gian chờ phản hồi.");
    throw new OrderApiError("NETWORK_ERROR", "Không kết nối được máy chủ.");
  } finally {
    clearTimeout(timer);
  }
}

/** ID đơn là opaque: không trim hay đổi dạng; chỉ mã hóa khi đưa vào đường dẫn. */
export function orderPath(id: string): string {
  return `/api/orders/${encodeURIComponent(id)}`;
}

export function createHttpOrderReadClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs: number = ORDER_READ_TIMEOUT_MS,
): OrderReadClient {
  return {
    getOrder(id, binding) {
      if (id === "") return Promise.reject(new OrderApiError("RESOURCE_NOT_FOUND", "", 404));
      return getJson(fetchImpl, orderPath(id), timeoutMs, binding, parseOrderDetail);
    },
    getHistory(binding) {
      return getJson(fetchImpl, "/api/orders/me", timeoutMs, binding, parseHistory);
    },
  };
}

/** NEXT_PUBLIC_ORDERS_SOURCE=mock dựng UI bằng fixture đúng contract khi backend C chưa sẵn sàng. */
export function createOrderReadClient(): OrderReadClient {
  return process.env.NEXT_PUBLIC_ORDERS_SOURCE === "mock"
    ? createMockOrderReadClient()
    : createHttpOrderReadClient();
}
