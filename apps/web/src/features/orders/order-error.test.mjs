import test from "node:test";
import assert from "node:assert/strict";
import { OrderApiError, guidanceForOrderError, isOutcomeUnknown, needsSessionResync } from "./order-error.ts";

const err = (code, status = 0, details) => new OrderApiError(code, "", status, details);

test("mất mạng, timeout, body sai, 5xx: chưa có kết quả đáng tin, không báo thất bại cuối", () => {
  for (const e of [err("NETWORK_ERROR"), err("CLIENT_TIMEOUT"), err("UPSTREAM_TIMEOUT", 504),
    err("UPSTREAM_UNAVAILABLE", 502), err("INVALID_RESPONSE", 200), err("UNKNOWN", 500)]) {
    assert.equal(isOutcomeUnknown(e), true, e.code);
    assert.equal(guidanceForOrderError(e).outcomeUnknown, true, e.code);
    assert.match(guidanceForOrderError(e).message, /Chưa xác nhận|Hết thời gian|Không kết nối/);
  }
});

test("TRANSACTION_RETRY_EXHAUSTED: giữ yêu cầu, cho thử lại CHÍNH yêu cầu đó", () => {
  const g = guidanceForOrderError(err("TRANSACTION_RETRY_EXHAUSTED", 503));
  assert.equal(g.action, "retry-same");
  assert.equal(g.outcomeUnknown, false);
});

test("ORDER_REQUEST_IN_PROGRESS: khách chủ động thử lại, không đổi key", () => {
  const g = guidanceForOrderError(err("ORDER_REQUEST_IN_PROGRESS", 409));
  assert.equal(g.action, "retry-same");
});

test("xác thực: 401 đề nghị đăng nhập, 403 dừng và không coi là hết hạn", () => {
  assert.equal(guidanceForOrderError(err("SESSION_EXPIRED", 401)).action, "login");
  assert.equal(guidanceForOrderError(err("AUTH_REQUIRED", 401)).action, "login");
  const forbidden = guidanceForOrderError(err("REQUEST_FORBIDDEN", 403));
  assert.equal(forbidden.action, "stop");
  assert.doesNotMatch(forbidden.message, /hết hạn/);
});

test("404 không phân biệt không tồn tại với của người khác", () => {
  const g = guidanceForOrderError(err("RESOURCE_NOT_FOUND", 404));
  assert.match(g.message, /trong tài khoản của bạn/);
  assert.equal(g.outcomeUnknown, false);
});

test("giá/tổng thay đổi và hết hàng: khách xem lại rồi xác nhận mới", () => {
  assert.equal(guidanceForOrderError(err("CHECKOUT_CHANGED", 409)).action, "review");
  assert.equal(guidanceForOrderError(err("PRICE_CHANGED", 409)).action, "review");
  const stock = guidanceForOrderError(err("OUT_OF_STOCK", 409, {
    reason: "x", resources: [{ kind: "PRODUCT", id: "latte", requested: 3, available: 1 }] }));
  assert.match(stock.message, /latte: cần 3, còn 1/);
  assert.equal(stock.action, "review");
});

test("OUT_OF_STOCK với details sai hình dạng dùng câu chung, không in dữ liệu lạ", () => {
  const g = guidanceForOrderError(err("OUT_OF_STOCK", 409, { resources: [{ kind: "TOPPING", id: "<b>x</b>" }] }));
  assert.doesNotMatch(g.message, /<b>/);
  assert.equal(g.action, "review");
});

test("mã giảm giá: năm lý do đã biết có câu riêng; lý do lạ không coi là đã xác nhận", () => {
  for (const reason of ["NOT_FOUND", "INACTIVE", "NOT_STARTED", "EXPIRED", "MINIMUM_NOT_MET"]) {
    const g = guidanceForOrderError(err("PROMOTION_NOT_APPLICABLE", 409, { reason }));
    assert.equal(g.confirmed, true, reason);
  }
  const unknownReason = guidanceForOrderError(err("PROMOTION_NOT_APPLICABLE", 409, { reason: "WEIRD" }));
  assert.equal(unknownReason.confirmed, false);
  assert.match(unknownReason.message, /không áp dụng được/);
});

test("đơn không thể thanh toán/hủy/quá hạn: đọc lại trạng thái hiện tại", () => {
  for (const code of ["ORDER_NOT_PAYABLE", "PAYMENT_WINDOW_EXPIRED", "ORDER_NOT_CANCELLABLE"]) {
    assert.equal(guidanceForOrderError(err(code, 409)).action, "refresh", code);
  }
});

test("đơn cũ policy 1 chỉ xem", () => {
  const g = guidanceForOrderError(err("LEGACY_ORDER_REQUIRES_REVIEW", 409));
  assert.equal(g.action, "none");
  assert.match(g.message, /chỉ có thể xem/);
});

test("mã lạ không được coi là lỗi đã xác nhận", () => {
  const g = guidanceForOrderError(err("UNKNOWN", 418));
  assert.equal(g.confirmed, false);
});

test("lỗi phiên (đăng nhập/hết hạn/không khớp) cần đồng bộ lại auth; lỗi khác thì không", () => {
  for (const code of ["AUTH_REQUIRED", "SESSION_EXPIRED", "SESSION_INVALID", "REQUEST_FORBIDDEN"]) {
    assert.equal(needsSessionResync(err(code, 401)), true, code);
  }
  for (const code of ["RESOURCE_NOT_FOUND", "NETWORK_ERROR", "UPSTREAM_UNAVAILABLE", "INVALID_RESPONSE", "UNKNOWN"]) {
    assert.equal(needsSessionResync(err(code)), false, code);
  }
});
