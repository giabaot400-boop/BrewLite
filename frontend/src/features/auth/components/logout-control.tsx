"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "../auth-provider";
import { AuthApiError, messageForAuthError } from "../auth-error";

/**
 * Nút Đăng xuất + hộp xác nhận. Chỉ báo "đã đăng xuất" khi BFF trả 204.
 * Lỗi mạng/5xx: giữ trạng thái đăng nhập và giỏ, báo lỗi, cho thử lại.
 */
export function LogoutControl() {
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  function close() {
    setOpen(false);
    // <dialog> trả focus về phần tử đã mở; nhắc lại phòng khi trình duyệt không làm.
    triggerRef.current?.focus();
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const scope = await logout();
      setOpen(false);
      toast.show(
        scope === "local"
          ? "Đã đăng xuất khỏi thiết bị này. Phiên trên máy chủ không được xác nhận thu hồi."
          : "Đã đăng xuất.",
        "success",
      );
      router.replace("/");
    } catch (error) {
      const apiError = error instanceof AuthApiError ? error : new AuthApiError("UNKNOWN", "");
      toast.show(messageForAuthError(apiError, "logout"), "error");
      close();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee"
      >
        Đăng xuất
      </button>
      <ConfirmDialog
        open={open}
        title="Đăng xuất?"
        confirmLabel="Đăng xuất"
        busy={busy}
        onConfirm={confirm}
        onCancel={close}
      >
        Bạn có chắc muốn đăng xuất không? Giỏ hàng trên thiết bị này vẫn được giữ.
      </ConfirmDialog>
    </>
  );
}
