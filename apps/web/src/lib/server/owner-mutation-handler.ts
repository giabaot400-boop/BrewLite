import { readExpectedOrderOwner } from "../order-owner.ts";

export const MUTATION_BFF_TIMEOUT_MS = 10_000;

export type OwnerMutationEnvironment = {
  checkPost: (request: Request) => Response | null;
  readToken: () => Promise<string | undefined>;
  backendUrls: () => { me: string; mutation: string };
  fetch: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;
  schedule?: (callback: () => void, delayMs: number) => () => void;
};

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message, fieldErrors: {} } },
    { status, headers: { "Cache-Control": "no-store" } });
}

const unavailable = () => errorResponse(502, "UPSTREAM_UNAVAILABLE", "Chưa xác nhận được kết quả yêu cầu. Vui lòng thử lại cùng yêu cầu.");
const timeout = () => errorResponse(504, "UPSTREAM_TIMEOUT", "Hết thời gian chờ máy chủ. Chưa xác nhận được kết quả yêu cầu.");
const forbidden = () => errorResponse(403, "REQUEST_FORBIDDEN", "Phiên hiện tại không khớp tài khoản của yêu cầu hoặc thiếu thông tin owner hợp lệ. Vui lòng kiểm tra lại tài khoản.");

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sessionOwner(data: unknown): string | null {
  if (!record(data) || !record(data.user) || typeof data.user.id !== "string" || !data.user.id
    || typeof data.user.email !== "string" || !data.user.email
    || !(typeof data.expiresAt === "string" && data.expiresAt.length > 0 && Number.isFinite(Date.parse(data.expiresAt))
      || typeof data.expiresAt === "number" && Number.isFinite(new Date(data.expiresAt).getTime()))) return null;
  return data.user.id;
}

function authErrorCode(data: unknown): string | null {
  if (!record(data) || !record(data.error) || typeof data.error.message !== "string" || !data.error.message
    || typeof data.error.code !== "string" || !["AUTH_REQUIRED", "SESSION_INVALID", "SESSION_EXPIRED"].includes(data.error.code)) return null;
  const fields = data.error.fieldErrors;
  if (fields !== undefined && (!record(fields) || !Object.values(fields).every(messages =>
    Array.isArray(messages) && messages.every(message => typeof message === "string")))) return null;
  return String(data.error.code);
}

async function readBody(request: Request, signal: AbortSignal, bodyLimitBytes: number): Promise<string | Response> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > bodyLimitBytes) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Nội dung yêu cầu vượt giới hạn cho phép.");
  }
  const reader = request.body?.getReader();
  if (!reader) return errorResponse(400, "VALIDATION_ERROR", "Nội dung JSON không hợp lệ.");
  // Cancel without awaiting a potentially stalled source. The outer deadline
  // also bounds adapters which ignore cancellation.
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimitBytes) {
        cancel();
        return errorResponse(413, "PAYLOAD_TOO_LARGE", "Nội dung yêu cầu vượt giới hạn cho phép.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      JSON.parse(text); // Keep the original valid JSON text; Nest validates DTO/business rules.
      return text;
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Nội dung JSON không hợp lệ.");
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

// Pure request orchestration with injected I/O; the Route Handler supplies the
// existing cookie/CSRF helpers and trusted backend URLs. No JWT decoding here.
export function createOwnerMutationHandler(environment: OwnerMutationEnvironment, options: {
  bodyLimitBytes: number;
  forwardIdempotencyKey: boolean;
  validateTarget?: () => Response | null;
}) {
  return async (request: Request): Promise<Response> => {
    const denied = environment.checkPost(request);
    if (denied) { denied.headers.set("Cache-Control", "no-store"); return denied; }

    const invalidTarget = options.validateTarget?.();
    if (invalidTarget) return invalidTarget;
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
    const cancelTimer = schedule(() => interrupt(true), MUTATION_BFF_TIMEOUT_MS);
    if (request.signal.aborted) onAbort();

    const work = async (): Promise<Response> => {
      controller.signal.throwIfAborted();
      const body = await readBody(request, controller.signal, options.bodyLimitBytes);
      if (body instanceof Response) return body;
      const expectedOwner = readExpectedOrderOwner(request.headers);
      if (expectedOwner === null) return forbidden();

      // Read the shared cookie exactly once. A later tab's cookie must not replace
      // this token between verification and forwarding.
      const token = await environment.readToken();
      controller.signal.throwIfAborted();
      if (!token) return errorResponse(401, "AUTH_REQUIRED", "Vui lòng đăng nhập để tiếp tục.");
      const urls = environment.backendUrls();
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      const me = await environment.fetch(urls.me, {
        method: "GET", headers, signal: controller.signal, cache: "no-store", redirect: "error",
      });
      controller.signal.throwIfAborted();
      const session: unknown = await me.json();
      controller.signal.throwIfAborted();
      if (me.status !== 200) {
        const code = me.status === 401 ? authErrorCode(session) : null;
        if (code !== null) {
          return errorResponse(401, code, code === "SESSION_EXPIRED"
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại đúng tài khoản."
            : "Vui lòng đăng nhập lại đúng tài khoản của yêu cầu.");
        }
        return me.status === 504 ? timeout() : unavailable();
      }
      const verifiedOwner = sessionOwner(session);
      if (verifiedOwner === null) return unavailable();
      if (verifiedOwner !== expectedOwner) return forbidden();
      controller.signal.throwIfAborted();

      const requestKey = request.headers.get("idempotency-key");
      const mutationHeaders: Record<string, string> = { ...headers, "Content-Type": "application/json" };
      if (options.forwardIdempotencyKey && requestKey !== null) mutationHeaders["Idempotency-Key"] = requestKey;
      const upstream = await environment.fetch(urls.mutation, {
        method: "POST", headers: mutationHeaders, body, signal: controller.signal,
        cache: "no-store", redirect: "error",
      });
      controller.signal.throwIfAborted();
      const result: unknown = await upstream.json();
      controller.signal.throwIfAborted();
      return Response.json(result, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    };
    // One deadline covers input, /me, the mutation and both upstream body reads.
    // Checking the signal before POST also prevents a late /me from starting a mutation.
    const result = work().catch(() => timedOut ? timeout() : unavailable());
    try { return await Promise.race([result, interrupted]); }
    finally { cancelTimer(); request.signal.removeEventListener("abort", onAbort); }
  };
}
