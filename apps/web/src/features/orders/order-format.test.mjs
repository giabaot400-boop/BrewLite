import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatDiscount, formatMoney, formatPoints, paymentCountdown, shortOrderId } from "./order-format.ts";

const vndText = s => s.replace(/\s/g, " ");

test("tiền VND là số nguyên; giá trị lạ hiện dấu gạch, không đoán", () => {
  assert.match(vndText(formatMoney(45001)), /^45\.001 ₫$/);
  assert.equal(formatMoney(1.5), "—");
  assert.equal(formatMoney(Number.NaN), "—");
});

test("khoản giảm có dấu trừ, bằng 0 thì không dấu (ví dụ 50.001 → giảm 5.000 → 45.001)", () => {
  assert.match(vndText(formatDiscount(5000)), /^−5\.000 ₫$/);
  assert.match(vndText(formatDiscount(0)), /^0 ₫$/);
  assert.equal(50001 - 5000, 45001);
});

test("thời gian hiện theo giờ Việt Nam, chuỗi hỏng hiện gạch", () => {
  // 2026-11-06T10:00:00Z = 17:00 ngày 06/11/2026 (UTC+7)
  assert.match(formatDateTime("2026-11-06T10:00:00.000Z"), /17:00/);
  assert.match(formatDateTime("2026-11-06T10:00:00.000Z"), /06\/11\/2026/);
  assert.equal(formatDateTime("không phải ngày"), "—");
  assert.equal(formatDateTime(null), "—");
});

test("đếm ngược theo đồng hồ server, không theo giờ máy", () => {
  const server = "2026-11-06T10:00:00.000Z";
  const deadline = "2026-11-06T10:15:00.000Z";
  // Máy khách nhận lúc 1000 ms (đồng hồ máy bất kỳ); 30 giây sau còn 14:30.
  const c = paymentCountdown(deadline, server, 1000, 31_000);
  assert.equal(c.kind, "running");
  assert.equal(c.label, "14:30");
  // Giờ máy lệch hàng giờ không ảnh hưởng vì chỉ dùng hiệu now - receivedAt.
  const skew = paymentCountdown(deadline, server, 9_000_000_000_000, 9_000_000_030_000);
  assert.equal(skew.label, "14:30");
});

test("tới hạn hoặc qua hạn là expired; không có hạn là none; dữ liệu hỏng là none", () => {
  const server = "2026-11-06T10:15:00.000Z";
  assert.deepEqual(paymentCountdown("2026-11-06T10:15:00.000Z", server, 0, 0), { kind: "expired" });
  assert.deepEqual(paymentCountdown("2026-11-06T10:00:00.000Z", server, 0, 5000), { kind: "expired" });
  assert.deepEqual(paymentCountdown(null, server, 0, 0), { kind: "none" });
  assert.deepEqual(paymentCountdown("xxx", server, 0, 0), { kind: "none" });
});

test("làm tròn lên giây: còn 0,4 giây vẫn hiện 00:01", () => {
  const c = paymentCountdown("2026-11-06T10:00:01.000Z", "2026-11-06T10:00:00.600Z", 0, 0);
  assert.equal(c.label, "00:01");
});

test("điểm thưởng và mã đơn rút gọn", () => {
  assert.equal(formatPoints(9), "9 điểm");
  assert.equal(formatPoints(-1), "—");
  assert.equal(shortOrderId("3f2b9c1e-aaaa-bbbb-cccc-0123456789ab"), "#456789AB");
  assert.equal(shortOrderId("ord-pending"), "#ORD-PENDING");
});
