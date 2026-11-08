// BFF chỉ-đọc cho GET /api/orders/me và GET /api/orders/:id.
// - Đọc cookie một lần, chuyển Bearer cho backend; backend tự xác thực và lọc theo chủ (CONTRACTS mục 3).
// - Một deadline 10 giây phủ cả đọc body upstream. Không bao giờ xóa cookie (cùng nguyên tắc /auth/me).
// - Chỉ chuyển tiếp JSON; không chuyển header của upstream (Set-Cookie...). Luôn Cache-Control: no-store.
// - Chống lệch tài khoản: UI gửi binding của phiên nó đang hiển thị; BFF so với binding của CHÍNH cookie
//   vừa đọc. Không khớp thì trả 403 và không gọi backend, nên tab còn giữ tài khoản A không nhận được
//   dữ liệu của B (cookie đã đổi sang B). Binding chỉ là giá trị đối chiếu, không cấp quyền.
// Handler thuần với I/O được tiêm vào để kiểm thử.

import { EXPECTED_SESSION_HEADER, isSessionBinding } from "../../session-binding.ts";

export const ORDER_READ_TIMEOUT_MS = 10_000;

export type ReadTarget = { kind: "history" } | { kind: "detail"; id: string };

type Environment = {
  readToken: () => Promise<string | undefined>;
  /** Binding công khai suy ra từ đúng token đã đọc (cùng hàm với /api/auth/me). */
  bindingOf: (token: string) => string;
  /** Gốc đường dẫn /orders của backend, không có dấu "/" cuối. */
  ordersUrl: () => string;
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
  schedule?: (callback: () => void, delayMs: number) => () => void;
};

function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  const error: Record<string, unknown> = { code, message, fieldErrors: {} };
  if (details !== undefined) error.details = details;
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

const unavailable = () =>
  errorResponse(502, "UPSTREAM_UNAVAILABLE", "Không đọc được đơn hàng lúc này. Vui lòng thử lại.");
const timeout = () => errorResponse(504, "UPSTREAM_TIMEOUT", "Hết thời gian chờ máy chủ.");

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** ID opaque: không trim hay đổi dạng; từ chối chuỗi rỗng, quá dài hoặc có ký tự điều khiển. */
export function isReadableOrderId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !/[\u0000-\u001f\u007f]/.test(id);
}

export function createOrderReadHandler(environment: Environment) {
  return async (request: Request, target: ReadTarget): Promise<Response> => {
    if (target.kind === "detail" && !isReadableOrderId(target.id)) {
      return errorResponse(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đơn hàng.");
    }

    const controller = new AbortController();
    let timedOut = false;
    let resolveInterruption: (response: Response) => void = () => {};
    const interrupted = new Promise<Response>(resolve => { resolveInterruption = resolve; });
    const interrupt = (isTimeout: boolean) => {
      if (controller.signal.aborted) return;
      timedOut = isTimeout;
      resolveInterruption(isTimeout ? timeout() : unavailable());
      controller.abort();
    };
    const onAbort = () => interrupt(false);
    request.signal.addEventListener("abort", onAbort, { once: true });
    const schedule = environment.schedule ?? ((callback, ms) => {
      const timer = setTimeout(callback, ms);
      return () => clearTimeout(timer);
    });
    const cancelTimer = schedule(() => interrupt(true), ORDER_READ_TIMEOUT_MS);
    if (request.signal.aborted) onAbort();

    const work = async (): Promise<Response> => {
      controller.signal.throwIfAborted();
      const token = await environment.readToken();
      controller.signal.throwIfAborted();
      if (!token) return errorResponse(401, "AUTH_REQUIRED", "Vui lòng đăng nhập để xem đơn hàng.");
      // Cùng một token được dùng để đối chiếu và để gọi backend; không đọc cookie lần hai.
      const expected = request.headers.get(EXPECTED_SESSION_HEADER);
      if (!isSessionBinding(expected) || expected !== environment.bindingOf(token)) {
        return errorResponse(403, "REQUEST_FORBIDDEN", "Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra lại tài khoản.");
      }

      const base = environment.ordersUrl();
      const url = target.kind === "history" ? `${base}/me` : `${base}/${encodeURIComponent(target.id)}`;
      const upstream = await environment.fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      controller.signal.throwIfAborted();
      let body: unknown;
      try {
        body = await upstream.json();
      } catch {
        return unavailable();
      }
      controller.signal.throwIfAborted();

      if (upstream.status === 200) {
        // Chỉ chuyển tiếp object JSON; hình dạng chi tiết do UI kiểm tra (order-parse).
        return isRecord(body)
          ? Response.json(body, { status: 200, headers: { "Cache-Control": "no-store" } })
          : unavailable();
      }
      // Lỗi: chỉ chuyển tiếp khi đúng envelope {error:{code,message}}; còn lại là lỗi hạ tầng.
      if (isRecord(body) && isRecord(body.error) && typeof body.error.code === "string"
        && typeof body.error.message === "string"
        && [400, 401, 403, 404, 409, 503].includes(upstream.status)) {
        return errorResponse(upstream.status, body.error.code, body.error.message, body.error.details);
      }
      return upstream.status === 504 ? timeout() : unavailable();
    };

    const result = work().catch(() => (timedOut ? timeout() : unavailable()));
    try {
      return await Promise.race([result, interrupted]);
    } finally {
      cancelTimer();
      request.signal.removeEventListener("abort", onAbort);
    }
  };
}
