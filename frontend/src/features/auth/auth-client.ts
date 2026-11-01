import { AuthApiError } from "./auth-error.ts";
import type { AuthErrorCode, AuthSession, FieldErrors, LogoutScope } from "./types.ts";
import { normalizeEmail, validateNewPassword } from "./validation.ts";

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
  me(): Promise<AuthSession>;
  logout(): Promise<LogoutScope>;
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

/** Gọi BFF; chuyển lỗi mạng và timeout thành AuthApiError để UI không phải đoán. */
async function request(
  fetchImpl: FetchLike,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(path, {
      method: init.method,
      headers: init.method === "POST" ? JSON_HEADERS : undefined,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw await readError(response);
    return response;
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

export function createHttpAuthClient(fetchImpl: FetchLike = fetch, timeoutMs = CLIENT_TIMEOUT_MS): AuthClient {
  return {
    async register(input) {
      const res = await request(fetchImpl, "/api/auth/register", { method: "POST", body: input }, timeoutMs);
      const data = (await res.json()) as { user: { id: string; email: string } };
      return data.user;
    },
    async login(input) {
      const res = await request(fetchImpl, "/api/auth/login", { method: "POST", body: input }, timeoutMs);
      return (await res.json()) as AuthSession;
    },
    async me() {
      const res = await request(fetchImpl, "/api/auth/me", { method: "GET" }, timeoutMs);
      return (await res.json()) as AuthSession;
    },
    async logout() {
      const res = await request(fetchImpl, "/api/auth/logout", { method: "POST", body: {} }, timeoutMs);
      return res.headers.get("X-BrewLite-Logout-Scope") === "local" ? "local" : "session";
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
