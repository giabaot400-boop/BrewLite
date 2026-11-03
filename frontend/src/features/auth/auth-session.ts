import type { AuthClient, Credentials } from "./auth-client.ts";
import { AuthApiError } from "./auth-error.ts";
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
};

/** Thông tin giỏ do module giỏ hàng (A) cung cấp để hộp xác nhận đăng xuất nói đúng sự thật. */
export type LogoutInfo = { cartItemCount: number; hasPendingOrder: boolean };

export type SignOutHandler = (scope: LogoutScope) => void;

export const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = { status: "loading", user: null, sessionExpired: false };

/**
 * Điều phối trạng thái phiên, không phụ thuộc React để test được thứ tự hoàn tất.
 * `epoch` tăng khi login/logout THÀNH CÔNG; kết quả /me bắt đầu trước đó là cũ và bị bỏ,
 * nên /me chậm không thể ghi đè phiên mới (và ngược lại).
 */
export function createAuthSession(client: AuthClient) {
  let snapshot = INITIAL_AUTH_SNAPSHOT;
  let epoch = 0;
  let logoutInfoSource: (() => LogoutInfo) | null = null;
  const listeners = new Set<() => void>();
  const signOutHandlers = new Set<SignOutHandler>();

  function set(next: AuthSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  async function refresh(): Promise<void> {
    const startedAt = epoch;
    try {
      const session = await client.me();
      if (startedAt !== epoch) return;
      set({ status: "authenticated", user: session.user, sessionExpired: false });
    } catch (error) {
      if (startedAt !== epoch) return;
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
    set({ status: "authenticated", user: session.user, sessionExpired: false });
  }

  async function register(input: Credentials): Promise<void> {
    // Đăng ký không cấp phiên (v0.6); người dùng phải đăng nhập sau đó.
    await client.register(input);
  }

  /** Ném AuthApiError nếu chưa xác nhận đăng xuất; khi đó trạng thái và giỏ giữ nguyên. */
  async function logout(): Promise<LogoutScope> {
    const scope = await client.logout();
    epoch++;
    set({ status: "anonymous", user: null, sessionExpired: false });
    signOutHandlers.forEach((handler) => handler(scope));
    return scope;
  }

  return {
    getSnapshot: () => snapshot,
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
    onSignedOut(handler: SignOutHandler) {
      signOutHandlers.add(handler);
      return () => {
        signOutHandlers.delete(handler);
      };
    },
    /** Module giỏ hàng đăng ký nguồn thông tin; trả hàm hủy đăng ký. */
    setLogoutInfoSource(source: () => LogoutInfo) {
      logoutInfoSource = source;
      return () => {
        if (logoutInfoSource === source) logoutInfoSource = null;
      };
    },
    /** null = chưa có module giỏ hàng đăng ký (không được nói gì về giỏ). */
    getLogoutInfo: (): LogoutInfo | null => (logoutInfoSource ? logoutInfoSource() : null),
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
