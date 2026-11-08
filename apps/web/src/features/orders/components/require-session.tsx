"use client";

import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/state-message";
import { useAuth } from "@/features/auth/auth-provider";
import { withReturnTo } from "@/features/auth/return-to";

/** Liên kết đăng nhập có đích quay về đúng trang đang xem. */
export function loginHref(returnTo: string): string {
  return `${withReturnTo("/login", returnTo)}${returnTo === "/" ? "?" : "&"}reason=required`;
}

/**
 * Cổng đăng nhập cho trang đơn hàng. `children` được gọi với id chủ tài khoản để trang con
 * đặt `key` theo chủ + phiên: đổi tài khoản thì dữ liệu cũ bị bỏ, không hiện cho người khác.
 */
export function RequireSession({
  returnTo,
  children,
}: {
  returnTo: string;
  children: (session: { ownerId: string; sessionVersion: number }) => ReactNode;
}) {
  const { status, user, sessionVersion } = useAuth();

  if (status === "loading") return <LoadingState message="Đang kiểm tra phiên đăng nhập…" />;

  if (status !== "authenticated" || !user) {
    const login = loginHref(returnTo);
    return (
      <Card className="space-y-4 px-6 py-10">
        <p>Bạn cần đăng nhập để xem đơn hàng.</p>
        <div>
          <ButtonLink href={login}>Đăng nhập</ButtonLink>
        </div>
      </Card>
    );
  }

  return <>{children({ ownerId: user.id, sessionVersion })}</>;
}
