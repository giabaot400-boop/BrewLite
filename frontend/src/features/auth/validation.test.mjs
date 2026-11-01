import test from "node:test";
import assert from "node:assert/strict";
import {
  countCodePoints,
  normalizeEmail,
  utf8ByteLength,
  validateEmail,
  validateLogin,
  validateNewPassword,
  validateRegister,
} from "./validation.ts";

test("email được trim và chuyển chữ thường", () => {
  assert.equal(normalizeEmail("  A@B.Com "), "a@b.com");
});

test("email sai định dạng bị từ chối, email hợp lệ qua", () => {
  assert.ok(validateEmail(""));
  assert.ok(validateEmail("abc"));
  assert.ok(validateEmail("a@b"));
  assert.equal(validateEmail(" User@Example.com "), null);
});

test("mật khẩu 14 ký tự bị từ chối, 15 ký tự qua", () => {
  assert.ok(validateNewPassword("a".repeat(14)));
  assert.equal(validateNewPassword("a".repeat(15)), null);
});

test("đếm theo code point: emoji tính là 1 ký tự", () => {
  const p = "😀".repeat(15); // 15 code point, 60 byte
  assert.equal(countCodePoints(p), 15);
  assert.equal(utf8ByteLength(p), 60);
  assert.equal(validateNewPassword(p), null);
  assert.ok(validateNewPassword("😀".repeat(14)));
});

test("giới hạn 72 byte UTF-8: 72 qua, 73 bị từ chối", () => {
  assert.equal(validateNewPassword("a".repeat(72)), null);
  assert.ok(validateNewPassword("a".repeat(73)));
  // 'é' là 2 byte: 36 ký tự = 72 byte, 37 ký tự = 74 byte.
  assert.equal(validateNewPassword("é".repeat(36)), null);
  assert.ok(validateNewPassword("é".repeat(37)));
});

test("từ chối U+0000 và surrogate lẻ", () => {
  assert.ok(validateNewPassword("a".repeat(15) + "\u0000"));
  assert.ok(validateNewPassword("a".repeat(15) + "\uD800"));
  assert.ok(validateNewPassword("a".repeat(15) + "\uDC00"));
});

test("mật khẩu không bị trim: khoảng trắng đầu/cuối được tính", () => {
  assert.equal(validateNewPassword(" ".repeat(15)), null);
  assert.equal(validateNewPassword(" " + "a".repeat(13) + " "), null);
});

test("đăng ký: xác nhận mật khẩu phải khớp", () => {
  const ok = "a".repeat(15);
  assert.deepEqual(validateRegister({ email: "a@b.co", password: ok, confirmPassword: ok }), {});
  const errs = validateRegister({ email: "a@b.co", password: ok, confirmPassword: ok + "x" });
  assert.ok(errs.confirmPassword);
  assert.ok(validateRegister({ email: "a@b.co", password: ok, confirmPassword: "" }).confirmPassword);
});

test("đăng nhập không áp quy tắc độ dài mật khẩu mới", () => {
  assert.deepEqual(validateLogin({ email: "a@b.co", password: "x" }), {});
  assert.ok(validateLogin({ email: "a@b.co", password: "" }).password);
  assert.ok(validateLogin({ email: "", password: "x" }).email);
});
