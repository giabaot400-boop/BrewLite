"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createAuthClient, type AuthClient, type Credentials } from "./auth-client";
import {
  INITIAL_AUTH_SNAPSHOT,
  createAuthSession,
  type AuthStatus,
  type LogoutInfo,
  type SignOutHandler,
  type AuthSnapshot,
  type SignOutPreparer,
} from "./auth-session";
import type { AuthUser, LogoutScope } from "./types";

export type { AuthStatus, LogoutInfo };

export type AuthContextValue = {
  sessionSnapshot: AuthSnapshot;
  getSessionSnapshot: () => AuthSnapshot;
  subscribeSession: (listener: () => void) => () => void;
  /** Same-owner /me refresh keeps this version; login/logout/account changes invalidate reviews. */
  sessionVersion: number;
  getSessionVersion: () => number;
  status: AuthStatus;
  user: AuthUser | null;
  /** Hết hạn phiên đã được phát hiện ở lần kiểm tra gần nhất. */
  sessionExpired: boolean;
  login: (input: Credentials) => Promise<void>;
  register: (input: Credentials) => Promise<void>;
  /** AuthApiError: chưa xác nhận logout. ConfirmedLogoutError: đã có 204, nhưng dọn giỏ hoặc phiên cục bộ thay đổi. */
  logout: () => Promise<LogoutScope>;
  refresh: () => Promise<void>;
  /** Cho giỏ hàng/đơn dọn dữ liệu sau khi BFF xác nhận 204 (scope session hoặc local). Trả hàm hủy. */
  onSignedOut: (handler: SignOutHandler) => () => void;
  /** Chụp checkpoint trước HTTP; complete được await sau 204, cancel giải phóng khi lỗi hoặc phiên thay đổi. */
  prepareSignOut: (handler: SignOutPreparer) => () => void;
  /** Giỏ hàng đăng ký để hộp xác nhận đăng xuất nêu đúng số món và lần đặt chưa rõ kết quả. */
  setLogoutInfoSource: (source: () => LogoutInfo | null) => () => void;
  getLogoutInfo: () => LogoutInfo | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, client }: { children: ReactNode; client?: AuthClient }) {
  const [session] = useState(() => createAuthSession(client ?? createAuthClient()));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, () => INITIAL_AUTH_SNAPSHOT);

  useEffect(() => {
    // Kiểm tra phiên một lần khi tải trang; kết quả đến sau await nên không setState đồng bộ.
    void session.refresh();
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      sessionSnapshot: snapshot,
      getSessionSnapshot: session.getSnapshot,
      subscribeSession: session.subscribe,
      sessionVersion: session.getSessionVersion(),
      getSessionVersion: session.getSessionVersion,
      login: session.login,
      register: session.register,
      logout: session.logout,
      refresh: session.refresh,
      onSignedOut: session.onSignedOut,
      prepareSignOut: session.prepareSignOut,
      setLogoutInfoSource: session.setLogoutInfoSource,
      getLogoutInfo: session.getLogoutInfo,
    }),
    [snapshot, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth phải nằm trong AuthProvider.");
  return value;
}
