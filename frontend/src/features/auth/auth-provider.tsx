"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createAuthClient, type AuthClient, type Credentials } from "./auth-client";
import { AuthApiError } from "./auth-error";
import type { AuthUser, LogoutScope } from "./types";

/**
 * loading: đang hỏi /api/auth/me.
 * anonymous: chắc chắn chưa đăng nhập (AUTH_REQUIRED/SESSION_INVALID/SESSION_EXPIRED).
 * unknown: không kiểm tra được (mạng, 5xx); KHÔNG suy ra là hết hạn.
 */
export type AuthStatus = "loading" | "authenticated" | "anonymous" | "unknown";

type SignOutHandler = (scope: LogoutScope) => void;

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  /** Hết hạn phiên đã được phát hiện ở lần kiểm tra gần nhất. */
  sessionExpired: boolean;
  login: (input: Credentials) => Promise<void>;
  register: (input: Credentials) => Promise<void>;
  /** Ném AuthApiError nếu chưa xác nhận đăng xuất; khi đó trạng thái đăng nhập được giữ nguyên. */
  logout: () => Promise<LogoutScope>;
  refresh: () => Promise<void>;
  /** Cho module khác (giỏ hàng, đơn) dọn dữ liệu riêng tư sau đăng xuất thành công. Trả hàm hủy đăng ký. */
  onSignedOut: (handler: SignOutHandler) => () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, client }: { children: ReactNode; client?: AuthClient }) {
  const clientRef = useRef<AuthClient>(client ?? createAuthClient());
  const handlers = useRef(new Set<SignOutHandler>());
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const session = await clientRef.current.me();
      setUser(session.user);
      setStatus("authenticated");
      setSessionExpired(false);
    } catch (error) {
      const code = error instanceof AuthApiError ? error.code : "UNKNOWN";
      if (code === "AUTH_REQUIRED" || code === "SESSION_INVALID" || code === "SESSION_EXPIRED") {
        setUser(null);
        setStatus("anonymous");
        setSessionExpired(code === "SESSION_EXPIRED");
      } else {
        // Lỗi hệ thống: giữ người dùng hiện tại nếu có, không giả định hết hạn.
        setStatus((current) => (current === "authenticated" ? current : "unknown"));
      }
    }
  }, []);

  useEffect(() => {
    // Kiểm tra phiên một lần khi tải trang; setState chạy sau await nên không đồng bộ trong effect.
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: Credentials) => {
    const session = await clientRef.current.login(input);
    setUser(session.user);
    setStatus("authenticated");
    setSessionExpired(false);
  }, []);

  const register = useCallback(async (input: Credentials) => {
    // Đăng ký không cấp phiên (v0.6); người dùng phải đăng nhập sau đó.
    await clientRef.current.register(input);
  }, []);

  const logout = useCallback(async () => {
    const scope = await clientRef.current.logout();
    setUser(null);
    setStatus("anonymous");
    setSessionExpired(false);
    handlers.current.forEach((handler) => handler(scope));
    return scope;
  }, []);

  const onSignedOut = useCallback((handler: SignOutHandler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, login, register, logout, refresh, onSignedOut }),
    [status, user, sessionExpired, login, register, logout, refresh, onSignedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải nằm trong AuthProvider.");
  return value;
}
