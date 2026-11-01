"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Đang xử lý: khóa nút, không cho đóng bằng Esc hoặc Hủy. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Hộp thoại xác nhận dùng <dialog> gốc: showModal() tự giữ focus trong hộp,
 * Esc để đóng, nền phía sau không thao tác được. Focus quay về nút đã mở hộp.
 * Focus ban đầu ở nút Hủy để Enter không vô tình xác nhận.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Hủy",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Esc: để React quyết định đóng, tránh <dialog> tự đóng khi đang xử lý.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-ink backdrop:bg-black/40"
    >
      <h2 id={titleId} className="text-xl font-bold">
        {title}
      </h2>
      <div id={bodyId} className="mt-3 text-stone-700">
        {children}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          ref={cancelRef}
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-5 py-3 font-semibold disabled:opacity-60"
        >
          {cancelLabel}
        </button>
        <Button onClick={onConfirm} disabled={busy} aria-busy={busy || undefined}>
          {busy ? "Đang xử lý…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
