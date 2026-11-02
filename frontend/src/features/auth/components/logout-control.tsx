"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "../auth-provider";
import { AuthApiError, messageForAuthError } from "../auth-error";
import { logoutDialogLines, needsLogoutConfirmation } from "./logout-dialog-copy";

/**
 * Nút Đăng xuất. Chỉ báo "đã đăng xuất" khi BFF xác nhận (204 + scope hợp lệ).
 * Lỗi mạng/5xx/phản hồi sai hợp đồng: giữ trạng thái đăng nhập và giỏ, báo lỗi, cho thử lại.
 */
export function LogoutControl() {
  const router = useRouter();
  const toast = useToast();
  const { logout, getLogoutInfo } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  function close() {
    setOpen(false);
    // <dialog> trả focus về phần tử đã mở; nhắc lại phòng khi trình duyệt không làm.
    triggerRef.current?.focus();
  }

  async function run(): Promise<void> {
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

  function onClick() {
    // Đọc trạng thái giỏ tại thời điểm bấm, không dùng bản cũ.
    const info = getLogoutInfo();
    if (needsLogoutConfirmation(info)) {
      setLines(logoutDialogLines(info));
      setOpen(true);
    } else {
      void run();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        disabled={busy && !open}
        aria-busy={busy || undefined}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-coffee disabled:opacity-60"
      >
        {busy && !open ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
      <ConfirmDialog
        open={open}
        title="Đăng xuất?"
        confirmLabel="Đăng xuất"
        cancelLabel="Ở lại"
        busy={busy}
        onConfirm={() => void run()}
        onCancel={close}
      >
        {lines.map((line) => (
          <p key={line} className="mt-2 first:mt-0">
            {line}
          </p>
        ))}
      </ConfirmDialog>
    </>
  );
}
