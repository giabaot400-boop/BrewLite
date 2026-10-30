"use client";

import { Button } from "@/components/ui/button";
import { useCart } from "../cart-provider";

export function CartNotice() {
  const { state, reload } = useCart();
  if (state.status === "restoring") {
    return <p role="status" className="mt-4 text-sm text-stone-600">Đang khôi phục giỏ hàng…</p>;
  }
  if (!state.message) return null;
  return (
    <div className="mt-4 space-y-3">
      <p role="alert" className="text-sm text-stone-700">{state.message}</p>
      {(state.status === "error" || state.status === "locked") && (
        <Button variant="text" disabled={state.isSaving} onClick={() => { void reload(); }}>
          Thử đọc lại giỏ
        </Button>
      )}
    </div>
  );
}
