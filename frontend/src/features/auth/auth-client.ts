import { AuthApiError } from "./auth-error.ts";
import type { AuthErrorCode, AuthSession, FieldErrors, LogoutScope } from "./types.ts";
import { normalizeEmail, validateNewPassword } from "./validation.ts";
import { EXPECTED_SESSION_HEADER, SESSION_BINDING_HEADER, isSessionBinding } from "../../lib/session-binding.ts";

/** UI → BFF chờ tối đa 15 giây (mục "Thời gian chờ" của v0.6). */
export const CLIENT_TIMEOUT_MS = 15_000;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "X-BrewLite-Request": "1",
} as const;

export type Credentials = { email: string; password: string };

export type AuthClient = {
  register(input: Credentials): Promise<{ id: string; email: string }>;
  login(input: Credentials): Promise<AuthSession>;
  me(options?: { timeoutMs?: number }): Promise<AuthSession>;
  logout(expectedBinding?: string, options?: { timeoutMs?: number }): Promise<LogoutScope>;
};

type FetchLike = typeof fetch;

type ErrorBody = { error?: { code?: string; message?: string; fieldErrors?: FieldErrors } };

async function readError(response: Response): Promise<AuthApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Phản hồi không phải JSON (ví dụ trang lỗi của proxy): dùng mã theo HTTP status.
  }
  const code = (body.error?.code ?? "UNKNOWN") as AuthErrorCode;
  return new AuthApiError(code, body.error?.message ?? "", response.status, body.error?.fieldErrors ?? {});
}

/**
 * Gọi BFF với MỘT deadline chung cho gửi request VÀ đọc body (v0.6: 15 s).
 * `read` chạy trong cùng cửa sổ thời gian; timer chỉ được dọn sau khi đọc xong.
 * Chỉ dùng AbortSignal là chưa đủ với adapter không hỗ trợ abort, nên có thêm Promise.race.
 */
async function request<T>(
  fetchImpl: FetchLike,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; headers?: Record<string, string> },
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AuthApiError("CLIENT_TIMEOUT", "Hết thời gian chờ phản hồi."));
    }, timeoutMs);
  });
  const work = (async () => {
    const response = await fetchImpl(path, {
      method: init.method,
      headers: init.method === "POST" ? { ...JSON_HEADERS, ...init.headers } : undefined,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw await readError(response);
    return await read(response);
  })();
  // Nếu deadline thắng, work có thể reject muộn: chặn unhandled rejection.
  work.catch(() => undefined);
  try {
    return await Promise.race([work, deadline]);
  } catch (error) {
    if (error instanceof AuthApiError) throw error;
    if (controller.signal.aborted) {
      throw new AuthApiError("CLIENT_TIMEOUT", "Hết thời gian chờ phản hồi.");
    }
    throw new AuthApiError("NETWORK_ERROR", "Không kết nối được máy chủ.");
  } finally {
    clearTimeout(timer);
  }
}

function isUser(value: unknown): value is { id: string; email: string } {
  const v = value as { id?: unknown; email?: unknown } | null;
  return typeof v === "object" && v !== null && typeof v.id === "string" && typeof v.email === "string";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    // Lỗi do abort/timeout phải giữ nguyên để request() phân loại; còn lại là thân sai.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AuthApiError("INVALID_RESPONSE", "Phản hồi không hợp lệ.", response.status);
  }
}

async function readSession(response: Response): Promise<AuthSession> {
  const data = (await readJson(response)) as { user?: unknown; expiresAt?: unknown } | null;
  const okExpiry = typeof data?.expiresAt === "string" || typeof data?.expiresAt === "number";
  const binding = response.headers.get(SESSION_BINDING_HEADER);
  if (!data || !isUser(data.user) || !okExpiry || !isSessionBinding(binding)) {
    throw new AuthApiError("INVALID_RESPONSE", "Phản hồi không hợp lệ.", response.status);
  }
  return { user: data.user, expiresAt: data.expiresAt as string | number, binding };
}

export function createHttpAuthClient(fetchImpl: FetchLike = fetch, timeoutMs = CLIENT_TIMEOUT_MS): AuthClient {
  return {
    register(input) {
      return request(fetchImpl, "/api/auth/register", { method: "POST", body: input }, timeoutMs, async (res) => {
        const data = (await readJson(res)) as { user?: unknown } | null;
        if (!data || !isUser(data.user)) {
          throw new AuthApiError("INVALID_RESPONSE", "Phản hồi không hợp lệ.", res.status);
        }
        return data.user;
      });
    },
    login(input) {
      return request(fetchImpl, "/api/auth/login", { method: "POST", body: input }, timeoutMs, readSession);
    },
    me(options) {
      return request(fetchImpl, "/api/auth/me", { method: "GET" }, Math.min(timeoutMs, options?.timeoutMs ?? timeoutMs), readSession);
    },
    logout(expectedBinding, options) {
      // P05: chỉ HTTP 204 với scope đúng "session" hoặc "local" mới là đã xác nhận đăng xuất.
      const headers: Record<string, string> = isSessionBinding(expectedBinding) ? { [EXPECTED_SESSION_HEADER]: expectedBinding } : {};
      return request(fetchImpl, "/api/auth/logout", { method: "POST", body: {}, headers },
        Math.min(timeoutMs, options?.timeoutMs ?? timeoutMs), async (res) => {
        const scope = res.headers.get("X-BrewLite-Logout-Scope");
        if (res.status !== 204 || (scope !== "session" && scope !== "local")) {
          throw new AuthApiError("INVALID_RESPONSE", "Phản hồi đăng xuất không đúng hợp đồng.", res.status);
        }
        return scope;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Chế độ mock: chỉ để B phát triển và demo giao diện khi BFF của C chưa sẵn sàng.
// Bật bằng NEXT_PUBLIC_AUTH_SOURCE=mock. Không dùng cho production.
// ---------------------------------------------------------------------------

const MOCK_KEY = "brewlite.mock-auth";
const MOCK_DELAY_MS = 400;

type MockUser = { id: string; email: string; password: string };

function fail(code: AuthErrorCode, status: number, fieldErrors: FieldErrors = {}): never {
  throw new AuthApiError(code, "", status, fieldErrors);
}

export function createMockAuthClient(options: { delayMs?: number; storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> } = {}): AuthClient {
  const delay = options.delayMs ?? MOCK_DELAY_MS;
  const users = new Map<string, MockUser>();
  let session: AuthSession | null = null;

  const storage = options.storage ?? safeSessionStorage();
  try {
    const saved = storage?.getItem(MOCK_KEY);
    if (saved) session = JSON.parse(saved) as AuthSession;
  } catch {
    session = null;
  }

  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delay));
  const persist = () => {
    try {
      if (session) storage?.setItem(MOCK_KEY, JSON.stringify(session));
      else storage?.removeItem(MOCK_KEY);
    } catch {
      // Bỏ qua: mock vẫn chạy trong bộ nhớ.
    }
  };

  return {
    async register({ email, password }) {
      await wait();
      const key = normalizeEmail(email);
      const passwordError = validateNewPassword(password);
      if (passwordError) fail("VALIDATION_ERROR", 400, { password: [passwordError] });
      if (users.has(key)) fail("EMAIL_ALREADY_EXISTS", 409);
      const user = { id: `mock-${users.size + 1}`, email: key, password };
      users.set(key, user);
      return { id: user.id, email: user.email };
    },
    async login({ email, password }) {
      await wait();
      const user = users.get(normalizeEmail(email));
      // Mock có sẵn một tài khoản để thử nhanh khi chưa đăng ký.
      const demo = normalizeEmail(email) === "demo@brewlite.test" && password === "demo-password-123456";
      if (!demo && (!user || user.password !== password)) fail("INVALID_CREDENTIALS", 401);
      const id = user?.id ?? "mock-demo";
      session = { user: { id, email: normalizeEmail(email) }, expiresAt: Date.now() + 3_600_000 };
      persist();
      return session;
    },
    async me() {
      await wait();
      if (!session) fail("AUTH_REQUIRED", 401);
      if (Number(session.expiresAt) <= Date.now()) {
        session = null;
        persist();
        fail("SESSION_EXPIRED", 401);
      }
      return session;
    },
    async logout() {
      await wait();
      const scope: LogoutScope = session ? "session" : "local";
      session = null;
      persist();
      return scope;
    },
  };
}

function safeSessionStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function createAuthClient(): AuthClient {
  return process.env.NEXT_PUBLIC_AUTH_SOURCE === "mock" ? createMockAuthClient() : createHttpAuthClient();
}
