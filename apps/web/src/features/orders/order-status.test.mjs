import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_DESCRIPTION, STATUS_META, cancelReasonLabel, isLegacyViewOnly, statusMeta } from "./order-status.ts";
import { ORDER_STATUSES } from "./types.ts";

test("đủ bảy trạng thái, mỗi trạng thái có nhãn và mô tả", () => {
  assert.equal(ORDER_STATUSES.length, 7);
  assert.deepEqual(Object.keys(STATUS_META).sort(), [...ORDER_STATUSES].sort());
  for (const status of ORDER_STATUSES) {
    const meta = statusMeta(status);
    assert.ok(meta.label.length > 0 && meta.description.length > 0, status);
  }
});

test("chỉ COMPLETED và CANCELLED là trạng thái cuối", () => {
  const terminal = ORDER_STATUSES.filter(s => statusMeta(s).terminal);
  assert.deepEqual(terminal, ["COMPLETED", "CANCELLED"]);
});

test("PAYMENT_FAILED không được mô tả như thất bại cuối cùng của đơn", () => {
  const text = statusMeta("PAYMENT_FAILED").description;
  assert.match(text, /thử lại/);
  assert.doesNotMatch(text, /đã hủy/i);
});

test("lý do hủy có câu riêng, null thì không có", () => {
  assert.match(cancelReasonLabel("PAYMENT_WINDOW_EXPIRED"), /quá hạn/);
  assert.match(cancelReasonLabel("CUSTOMER_REQUEST"), /yêu cầu hủy/);
  assert.equal(cancelReasonLabel(null), null);
});

test("đơn cũ chỉ xem: chỉ PENDING không hạn, không thanh toán/hủy được", () => {
  const legacy = { status: "PENDING", paymentDeadline: null, canPay: false, canCancel: false };
  assert.equal(isLegacyViewOnly(legacy), true);
  assert.equal(isLegacyViewOnly({ ...legacy, paymentDeadline: "2026-11-06T10:15:00.000Z" }), false);
  assert.equal(isLegacyViewOnly({ ...legacy, canPay: true }), false);
  assert.equal(isLegacyViewOnly({ ...legacy, canCancel: true }), false);
  assert.equal(isLegacyViewOnly({ ...legacy, status: "PAID" }), false);
});

test("mô tả đơn cũ không khẳng định đã giữ hàng hay hướng dẫn thanh toán trước hạn", () => {
  assert.doesNotMatch(LEGACY_DESCRIPTION, /giữ hàng|trước hạn|Hãy thanh toán/i);
  assert.match(LEGACY_DESCRIPTION, /chỉ có thể xem/);
});
