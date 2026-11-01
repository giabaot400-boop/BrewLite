"use client";

import Link from "next/link";
import { useAuth } from "../auth-provider";
import { LogoutControl } from "./logout-control";

const linkClass = "flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee";

/**
 * Phần tài khoản trong thanh điều hướng. Chiếm chỗ cố định khi đang kiểm tra
 * phiên để thanh điều hướng không giật. Trả về các mục <li>-free (fragment)
 * để header đặt vào cùng hàng với liên kết khác.
 */
export function AuthNav() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <span aria-hidden="true" className="inline-block h-11 w-24" />;
  }

  if (status === "authenticated" && user) {
    return (
      <>
        <span className="max-w-40 truncate px-1 text-sm text-stone-600" title={user.email}>
          <span className="sr-only">Đã đăng nhập: </span>
          {user.email}
        </span>
        <LogoutControl />
      </>
    );
  }

  return (
    <>
      <Link href="/login" className={linkClass}>
        Đăng nhập
      </Link>
      <Link href="/register" className={linkClass}>
        Đăng ký
      </Link>
    </>
  );
}
