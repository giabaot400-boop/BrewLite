import test from "node:test";
import assert from "node:assert/strict";
import { AuthApiError, isOutcomeUnknown, messageForAuthError } from "./auth-error.ts";

const err = (code, status = 0) => new AuthApiError(code, "", status);

test("đăng nhập sai không bị hiểu là hết hạn phiên", () => {
  const msg = messageForAuthError(err("INVALID_CREDENTIALS", 401), "login");
  assert.match(msg, /không đúng/);
  assert.doesNotMatch(msg, /hết hạn/);
});

test("email trùng và hết hạn có thông báo riêng", () => {
  assert.match(messageForAuthError(err("EMAIL_ALREADY_EXISTS", 409), "register"), /đã được sử dụng/);
  assert.match(messageForAuthError(err("SESSION_EXPIRED", 401), "me"), /hết hạn/);
});

test("REQUEST_FORBIDDEN không bị coi là hết hạn", () => {
  assert.doesNotMatch(messageForAuthError(err("REQUEST_FORBIDDEN", 403), "login"), /hết hạn/);
});

test("lỗi mạng khi đăng xuất không khẳng định đã đăng xuất", () => {
  for (const code of ["NETWORK_ERROR", "CLIENT_TIMEOUT", "UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE", "INTERNAL_ERROR"]) {
    const msg = messageForAuthError(err(code), "logout");
    assert.match(msg, /Chưa xác nhận/);
    assert.doesNotMatch(msg, /Đã đăng xuất/);
  }
});

test("lỗi hệ thống khi đăng ký không khẳng định chưa tạo tài khoản", () => {
  assert.match(messageForAuthError(err("CLIENT_TIMEOUT"), "register"), /có thể đã được tạo/);
});

test("isOutcomeUnknown", () => {
  assert.equal(isOutcomeUnknown(err("NETWORK_ERROR")), true);
  assert.equal(isOutcomeUnknown(err("UNKNOWN", 503)), true);
  assert.equal(isOutcomeUnknown(err("INVALID_CREDENTIALS", 401)), false);
});
