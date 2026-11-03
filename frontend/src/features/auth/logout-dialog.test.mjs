import test from "node:test";
import assert from "node:assert/strict";
import { logoutDialogLines, needsLogoutConfirmation } from "./components/logout-dialog-copy.ts";

test("giỏ rỗng và không pending: đăng xuất trực tiếp, không hỏi (S2-R05)", () => {
  assert.equal(needsLogoutConfirmation({ cartItemCount: 0, hasPendingOrder: false }), false);
});

test("có món hoặc có pending: phải hỏi; chưa nối giỏ (null): vẫn hỏi", () => {
  assert.equal(needsLogoutConfirmation({ cartItemCount: 1, hasPendingOrder: false }), true);
  assert.equal(needsLogoutConfirmation({ cartItemCount: 0, hasPendingOrder: true }), true);
  assert.equal(needsLogoutConfirmation(null), true);
});

test("nội dung nói rõ sẽ xóa giỏ, không còn câu 'giỏ vẫn được giữ'", () => {
  const text = logoutDialogLines({ cartItemCount: 3, hasPendingOrder: false }).join(" ");
  assert.match(text, /xóa 3 món/);
  assert.doesNotMatch(text, /vẫn được giữ/);
});

test("có pending: nói lần đặt không bị hủy", () => {
  const text = logoutDialogLines({ cartItemCount: 2, hasPendingOrder: true }).join(" ");
  assert.match(text, /không bị hủy/);
});

test("chưa nối giỏ: không nói gì về giỏ", () => {
  const text = logoutDialogLines(null).join(" ");
  assert.doesNotMatch(text, /giỏ/);
});
