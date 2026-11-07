import test from "node:test";
import assert from "node:assert/strict";
import { STATUS_META, cancelReasonLabel, statusMeta } from "./order-status.ts";
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
