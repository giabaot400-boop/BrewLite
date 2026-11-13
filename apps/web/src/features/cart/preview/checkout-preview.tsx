"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckoutV2Panel } from "../components/checkout-v2-panel";
import { createCheckoutFixture } from "./checkout-fixture";
import type { CheckoutPreviewFault } from "./checkout-fixture";

export function CheckoutPreview() {
  const [fixture] = useState(() => createCheckoutFixture());
  useSyncExternalStore(fixture.subscribe, fixture.getTick, () => 0);
  const [showCheckout, setShowCheckout] = useState(true);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  async function add() {
    try {
      const result = await fixture.addSample();
      setToolMessage(result.error?.message ?? null);
    } catch (error) { setToolMessage(error instanceof Error ? error.message : "Chưa thêm được món mẫu."); }
  }
  return (
    <>
      <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6">
        <strong>DỮ LIỆU GIẢ LẬP — KHÔNG TẠO ĐƠN HOẶC THANH TOÁN THẬT.</strong>
        <p>Phiên, giỏ và đơn trên trang này nằm riêng trong bộ nhớ. Tải lại trang sẽ tạo dữ liệu mẫu mới. Header phía trên vẫn thuộc ứng dụng hiện tại.</p>
      </div>
      <details className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold">Điều khiển dữ liệu mẫu</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">Kết quả cho lần thanh toán mới
            <select className="block min-h-11 w-full rounded-lg border border-stone-300 p-2" value={fixture.getOutcome()}
              onChange={event => fixture.setOutcome(event.target.value as "SUCCEEDED" | "FAILED")}>
              <option value="SUCCEEDED">Thành công</option><option value="FAILED">Không thành công</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold">Sự cố mô phỏng tiếp theo
            <select className="block min-h-11 w-full rounded-lg border border-stone-300 p-2" value={fixture.getFault()}
              onChange={event => fixture.setFault(event.target.value as CheckoutPreviewFault)}>
              <option value="NONE">Không có</option>
              <option value="CREATE_RESPONSE_LOST">Mất phản hồi tạo đơn sau khi lưu</option>
              <option value="PAYMENT_RESPONSE_LOST">Mất phản hồi thanh toán sau khi lưu</option>
              <option value="PAYMENT_READ_FAILED">Đọc đơn lỗi sau phản hồi thanh toán</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => { void add(); }}>Thêm Cappuccino M mẫu</Button>
          <Button variant="secondary" onClick={() => setShowCheckout(value => !value)}>{showCheckout ? "Ẩn khung checkout" : "Mở lại khung checkout"}</Button>
          <Button variant="text" onClick={() => window.location.reload()}>Làm lại dữ liệu mẫu</Button>
        </div>
        <p className="mt-3 text-sm text-stone-600">Ẩn rồi mở lại khung để thử khôi phục đơn từ bản lưu trong bộ nhớ. F5 vẫn tạo lại toàn bộ dữ liệu mẫu.</p>
        {toolMessage && <p className="mt-3 text-sm" role="alert">{toolMessage}</p>}
      </details>
      {showCheckout && <CheckoutV2Panel environment={fixture.environment} />}
      <Card className="mt-6 p-5">
        <h2 className="font-bold">Dấu vết yêu cầu giả lập</h2>
        <p className="mt-2 text-sm text-stone-600">Dùng để đối chiếu key khi thử lại. Các dòng này không phải request tới backend thật.</p>
        {fixture.getTrace().length === 0 ? <p className="mt-3 text-sm">Chưa gửi yêu cầu mẫu.</p> : <ol aria-label="Dấu vết yêu cầu giả lập" className="mt-3 space-y-2 text-sm">
          {fixture.getTrace().map((item, index) => <li key={index} className="break-all font-mono">
            {index + 1}. {item.operation} · {item.replay ? "replay" : "lần đầu"} · {item.key ?? "không có key"}
          </li>)}
        </ol>}
      </Card>
    </>
  );
}
