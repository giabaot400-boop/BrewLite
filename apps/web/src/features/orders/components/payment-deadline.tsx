"use client";

import { useEffect, useState } from "react";
import { formatDateTime, paymentCountdown } from "../order-format";

type Props = {
  deadline: string | null;
  serverTime: string;
  /** Thời điểm (ms, đồng hồ trình duyệt) khi nhận phản hồi mang serverTime. */
  receivedAtMs: number;
};

/**
 * Đếm ngược theo đồng hồ server. Chỉ để hiển thị: hết giờ ở đây KHÔNG tự hủy hay thanh toán;
 * server quyết định (POST kiểm tra lại, expiry chạy mỗi 60 giây).
 */
export function PaymentDeadline({ deadline, serverTime, receivedAtMs }: Props) {
  const [now, setNow] = useState(receivedAtMs);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const countdown = paymentCountdown(deadline, serverTime, receivedAtMs, Math.max(now, receivedAtMs));
  if (countdown.kind === "none") return null;

  return (
    <p className="text-sm text-stone-700">
      Hạn thanh toán: <strong>{formatDateTime(deadline)}</strong>{" "}
      {countdown.kind === "running" ? (
        <span>
          (còn <span className="tabular-nums font-semibold">{countdown.label}</span>)
        </span>
      ) : (
        <span className="font-semibold text-red-800">
          — đã quá hạn, đơn sẽ được hủy tự động trong ít phút.
        </span>
      )}
    </p>
  );
}
