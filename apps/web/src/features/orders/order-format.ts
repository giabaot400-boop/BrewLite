// Định dạng dùng chung cho tiền, thời gian và đếm ngược hạn thanh toán.
// Pure: không đọc đồng hồ hay DOM, để kiểm thử được bằng node --test.

const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

/** Tiền là số nguyên VND (CONTRACTS mục 1). Giá trị không hợp lệ hiện "—", không đoán. */
export function formatMoney(value: number): string {
  return Number.isSafeInteger(value) ? vnd.format(value) : "—";
}

/** Khoản giảm hiển thị có dấu trừ; 0 hiển thị là 0 ₫ không dấu. */
export function formatDiscount(value: number): string {
  if (!Number.isSafeInteger(value)) return "—";
  return value > 0 ? `−${vnd.format(value)}` : vnd.format(0);
}

const dateTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** API trả UTC; người dùng thấy giờ Việt Nam. Chuỗi không hợp lệ hiện "—". */
export function formatDateTime(iso: string | null): string {
  if (iso === null) return "—";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : dateTime.format(new Date(ms));
}

export type Countdown =
  | { kind: "none" }
  | { kind: "running"; remainingMs: number; label: string }
  | { kind: "expired" };

/**
 * Còn bao lâu đến hạn thanh toán, tính theo ĐỒNG HỒ SERVER:
 * lệch = serverTime - thời điểm client nhận phản hồi; "bây giờ" của server ≈ nowMs + lệch.
 * Chỉ để hiển thị. Quyết định hết hạn luôn do server (POST kiểm tra lại, expiry tick 60 giây).
 */
export function paymentCountdown(
  deadlineIso: string | null,
  serverTimeIso: string,
  receivedAtMs: number,
  nowMs: number,
): Countdown {
  if (deadlineIso === null) return { kind: "none" };
  const deadline = Date.parse(deadlineIso);
  const serverTime = Date.parse(serverTimeIso);
  if (Number.isNaN(deadline) || Number.isNaN(serverTime)) return { kind: "none" };
  const serverNow = serverTime + (nowMs - receivedAtMs);
  const remainingMs = deadline - serverNow;
  if (remainingMs <= 0) return { kind: "expired" };
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    kind: "running",
    remainingMs,
    label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

/** Điểm thưởng: số nguyên không âm. */
export function formatPoints(points: number): string {
  return Number.isSafeInteger(points) && points >= 0 ? `${points.toLocaleString("vi-VN")} điểm` : "—";
}

/**
 * Mã đơn hiển thị cho người dùng: ID dài (UUID) rút còn 8 ký tự cuối, ID ngắn giữ nguyên.
 * Chỉ để đọc; ID đầy đủ vẫn dùng cho mọi lệnh gọi.
 */
export function shortOrderId(id: string): string {
  return `#${(id.length > 16 ? id.slice(-8) : id).toUpperCase()}`;
}
