import test from "node:test";
import assert from "node:assert/strict";
import { OrderApiError } from "./order-error.ts";
import { fixtureOrders } from "./order-fixtures.ts";
import { createTicketCounter, initialViewState, orderViewReducer } from "./order-view-state.ts";

const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const order = () => fixtureOrders(NOW).find(o => o.id === "ord-pending");

test("tải lần đầu: loading → ready; lỗi lần đầu → error có thể thử lại", () => {
  let s = initialViewState();
  assert.equal(s.phase, "loading");
  s = orderViewReducer(s, { type: "failure", error: new OrderApiError("NETWORK_ERROR", "") });
  assert.equal(s.phase, "error");
  s = orderViewReducer(s, { type: "start" });
  assert.equal(s.phase, "loading");
  s = orderViewReducer(s, { type: "success", data: order(), receivedAtMs: 100 });
  assert.equal(s.phase, "ready");
  assert.equal(s.receivedAtMs, 100);
});

test("lỗi khi làm mới KHÔNG xóa dữ liệu đang hiển thị", () => {
  let s = orderViewReducer(initialViewState(), { type: "success", data: order(), receivedAtMs: 1 });
  s = orderViewReducer(s, { type: "start" });
  assert.equal(s.phase, "ready");
  s = orderViewReducer(s, { type: "failure", error: new OrderApiError("CLIENT_TIMEOUT", "") });
  assert.equal(s.phase, "ready");
  assert.equal(s.data.id, "ord-pending");
  assert.equal(s.error.code, "CLIENT_TIMEOUT");
  s = orderViewReducer(s, { type: "success", data: { ...order(), version: 1, status: "PAID" }, receivedAtMs: 2 });
  assert.equal(s.error, null);
  assert.equal(s.data.status, "PAID");
});

test("dữ liệu cũ hơn bị bỏ và giữ mốc nhận của bản đang hiển thị", () => {
  let s = orderViewReducer(initialViewState(), { type: "success", data: { ...order(), version: 2, status: "PREPARING" }, receivedAtMs: 50 });
  s = orderViewReducer(s, { type: "success", data: order(), receivedAtMs: 999 });
  assert.equal(s.data.version, 2);
  assert.equal(s.receivedAtMs, 50);
});

test("bộ đếm lượt: chỉ lượt mới nhất hợp lệ; cancel bỏ tất cả lượt đang chờ", () => {
  const t = createTicketCounter();
  const a = t.next();
  const b = t.next();
  assert.equal(t.isCurrent(a), false);
  assert.equal(t.isCurrent(b), true);
  t.cancel();
  assert.equal(t.isCurrent(b), false);
});
