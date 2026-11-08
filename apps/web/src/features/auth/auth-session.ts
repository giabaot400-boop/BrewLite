import type { AuthClient, Credentials } from "./auth-client.ts";
import { AuthApiError } from "./auth-error.ts";
import { CLIENT_TIMEOUT_MS } from "./auth-client.ts";
import type { AuthUser, LogoutScope } from "./types.ts";

/**
 * loading: đang hỏi /api/auth/me.
 * anonymous: chắc chắn chưa đăng nhập (AUTH_REQUIRED/SESSION_INVALID/SESSION_EXPIRED).
 * unknown: không kiểm tra được (mạng, 5xx); KHÔNG suy ra là hết hạn.
 */
export type AuthStatus = "loading" | "authenticated" | "anonymous" | "unknown";

export type AuthSnapshot = {
  status: AuthStatus;
  user: AuthUser | null;
  sessionExpired: boolean;
  binding?: string;
};

/** Thông tin giỏ do module giỏ hàng (A) cung cấp để hộp xác nhận đăng xuất nói đúng sự thật. */
export type LogoutInfo = { cartItemCount: number; hasPendingOrder: boolean;
  hasCheckoutOrder?: boolean; hasUnresolvedPayment?: boolean };

export type SignOutHandler = (scope: LogoutScope) => void;

export type SignOutPreparation = {
  complete: (scope: LogoutScope) => Promise<unknown>;
  cancel: () => void;
};
export type SignOutPreparer = () => Promise<SignOutPreparation>;

// The server confirmed logout. This error must not be presented as an upstream failure.
export class ConfirmedLogoutError extends Error {
  readonly scope: LogoutScope;
  readonly reason: "cart" | "session-changed";
  constructor(scope: LogoutScope, reason: "cart" | "session-changed") {
    super(reason === "cart" ? "Chưa xác nhận dọn được giỏ trên thiết bị." : "Phiên hiện tại đã thay đổi.");
    this.name = "ConfirmedLogoutError";
    this.scope = scope;
    this.reason = reason;
  }
}

export const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = { status: "loading", user: null, sessionExpired: false };

/**
 * Điều phối trạng thái phiên, không phụ thuộc React để test được thứ tự hoàn tất.
 * `epoch` tăng khi login/logout THÀNH CÔNG; kết quả /me bắt đầu trước đó là cũ và bị bỏ,
 * nên /me chậm không thể ghi đè phiên mới (và ngược lại).
 */
export function createAuthSession(client: AuthClient, options: { now?: () => number; timeoutMs?: number } = {}) {
  const now = options.now ?? Date.now;
  let snapshot = INITIAL_AUTH_SNAPSHOT;
  let epoch = 0;
  // UI continuity only. Storage guards still compare the exact snapshot object.
  let sessionVersion = 0;
  let refreshVersion = 0;
  let logoutInfoSource: (() => LogoutInfo | null) | null = null;
  const listeners = new Set<() => void>();
  const signOutHandlers = new Set<SignOutHandler>();
  const signOutPreparers = new Set<SignOutPreparer>();

  function set(next: AuthSnapshot, newLogin = false) {
    if (newLogin || snapshot.status !== next.status || snapshot.user?.id !== next.user?.id
      || snapshot.user?.email !== next.user?.email || snapshot.binding !== next.binding) sessionVersion++;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  async function refresh(): Promise<void> {
    const startedAt = epoch;
    const version = ++refreshVersion;
    try {
      const session = await client.me();
      if (startedAt !== epoch || version !== refreshVersion) return;
      set({ status: "authenticated", user: session.user, sessionExpired: false, binding: session.binding });
    } catch (error) {
      if (startedAt !== epoch || version !== refreshVersion) return;
      const code = error instanceof AuthApiError ? error.code : "UNKNOWN";
      if (code === "AUTH_REQUIRED" || code === "SESSION_INVALID" || code === "SESSION_EXPIRED") {
        set({ status: "anonymous", user: null, sessionExpired: code === "SESSION_EXPIRED" });
      } else if (snapshot.status !== "authenticated") {
        // Lỗi hệ thống: giữ người dùng hiện tại nếu có, không giả định hết hạn.
        set({ ...snapshot, status: "unknown" });
      }
    }
  }

  async function login(input: Credentials): Promise<void> {
    const session = await client.login(input);
    epoch++;
    set({ status: "authenticated", user: session.user, sessionExpired: false, binding: session.binding }, true);
  }

  async function register(input: Credentials): Promise<void> {
    // Đăng ký không cấp phiên (v0.6); người dùng phải đăng nhập sau đó.
    await client.register(input);
  }

  /** Chuẩn bị giỏ trước HTTP. Sau 204, lỗi dọn giỏ không đảo ngược kết quả logout. */
  async function logout(): Promise<LogoutScope> {
    const startedAt = epoch;
    const startedOwner = snapshot.user?.id;
    const startedBinding = snapshot.binding;
    const changed = () => startedAt !== epoch || snapshot.user?.id !== startedOwner || snapshot.binding !== startedBinding;
    const prepared: SignOutPreparation[] = [];
    try {
      for (const prepare of signOutPreparers) prepared.push(await prepare());
      if (changed()) throw new AuthApiError("UNKNOWN", "Phiên đã thay đổi. Vui lòng thử lại.");
      const deadline = now() + (options.timeoutMs ?? CLIENT_TIMEOUT_MS);
      const remaining = () => Math.max(0, deadline - now());
      const scope = await client.logout(startedBinding, { timeoutMs: remaining() });
      if (changed()) throw new ConfirmedLogoutError(scope, "session-changed");
      if (startedBinding) {
        // Old /me requests cannot publish while we verify the cookie after 204.
        ++refreshVersion;
        try {
          if (remaining() <= 0) throw new AuthApiError("CLIENT_TIMEOUT", "");
          const current = await client.me({ timeoutMs: remaining() });
          if (changed()) throw new ConfirmedLogoutError(scope, "session-changed");
          ++refreshVersion;
          set({ status: "authenticated", user: current.user, sessionExpired: false, binding: current.binding });
          // Any live session belongs to the current cookie, not the old logout.
          throw new ConfirmedLogoutError(scope, "session-changed");
        } catch (error) {
          if (error instanceof ConfirmedLogoutError) throw error;
          if (changed()) throw new ConfirmedLogoutError(scope, "session-changed");
          ++refreshVersion;
          const code = error instanceof AuthApiError ? error.code : "UNKNOWN";
          if (!["AUTH_REQUIRED", "SESSION_INVALID", "SESSION_EXPIRED"].includes(code)) {
            set({ status: "unknown", user: null, sessionExpired: false });
            throw new ConfirmedLogoutError(scope, "session-changed");
          }
        }
      }
      epoch++;
      set({ status: "anonymous", user: null, sessionExpired: false });
      try {
        for (const preparation of prepared) await preparation.complete(scope);
      } catch {
        throw new ConfirmedLogoutError(scope, "cart");
      }
      signOutHandlers.forEach((handler) => handler(scope));
      return scope;
    } finally {
      prepared.forEach((preparation) => preparation.cancel());
    }
  }

  return {
    getSnapshot: () => snapshot,
    getSessionVersion: () => sessionVersion,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    login,
    register,
    logout,
    prepareSignOut(handler: SignOutPreparer) {
      signOutPreparers.add(handler);
      return () => { signOutPreparers.delete(handler); };
    },
    onSignedOut(handler: SignOutHandler) {
      signOutHandlers.add(handler);
      return () => {
        signOutHandlers.delete(handler);
      };
    },
    /** Module giỏ hàng đăng ký nguồn thông tin; trả hàm hủy đăng ký. */
    setLogoutInfoSource(source: () => LogoutInfo | null) {
      logoutInfoSource = source;
      return () => {
        if (logoutInfoSource === source) logoutInfoSource = null;
      };
    },
    /** null = chưa có thông tin giỏ đã xác minh cho phiên hiện tại. */
    getLogoutInfo: (): LogoutInfo | null => (logoutInfoSource ? logoutInfoSource() : null),
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
