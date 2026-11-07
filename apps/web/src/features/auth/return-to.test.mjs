import test from "node:test";
import assert from "node:assert/strict";
import { parseLoginNotice, sanitizeReturnTo, withReturnTo } from "./return-to.ts";

test("chấp nhận đường dẫn nội bộ", () => {
  assert.equal(sanitizeReturnTo("/cart"), "/cart");
  assert.equal(sanitizeReturnTo("/products/1?x=2"), "/products/1?x=2");
});

test("từ chối URL ngoài và biến thể open redirect", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "", "/a\nb"]) {
    assert.equal(sanitizeReturnTo(bad), "/", bad);
  }
  assert.equal(sanitizeReturnTo(null), "/");
  assert.equal(sanitizeReturnTo(undefined), "/");
});

test("withReturnTo giữ và mã hóa đích", () => {
  assert.equal(withReturnTo("/login", "/"), "/login");
  assert.equal(withReturnTo("/register", "/cart"), "/register?next=%2Fcart");
  assert.equal(withReturnTo("/login", "//evil.com"), "/login");
});

test("parseLoginNotice chỉ nhận giá trị đã biết", () => {
  assert.equal(parseLoginNotice("expired"), "expired");
  assert.equal(parseLoginNotice("required"), "required");
  assert.equal(parseLoginNotice("<script>"), null);
  assert.equal(parseLoginNotice(undefined), null);
});
