import test from "node:test";
import assert from "node:assert/strict";
import { fixtureHistory, fixtureOrders } from "./order-fixtures.ts";
import { applyDetailToHistory, mergeHistory, pickOrder, shouldAcceptOrder } from "./order-version.ts";

const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const base = () => fixtureOrders(NOW).find(o => o.id === "ord-pending");
const paid = () => ({ ...base(), version: 1, status: "PAID", canPay: false, serverTime: new Date(NOW + 5000).toISOString() });

// S3-ORD-03: ledger create lưu PENDING nhưng đơn đã PAID/CANCELLED; UI đọc current Order.
test("trạng thái lịch sử (version thấp, PENDING) không đè đơn đã PAID", () => {
  const current = paid();
  const stale = base(); // replay create hoặc response về muộn
  assert.equal(shouldAcceptOrder(current, stale), false);
  assert.equal(pickOrder(current, stale).status, "PAID");
});

test("đảo thứ tự response: version cao đến trước, version thấp đến sau vẫn giữ version cao", () => {
  let screen = null;
  for (const arrival of [{ ...base(), version: 3, status: "READY" }, { ...base(), version: 2, status: "PREPARING" }, base()]) {
    screen = pickOrder(screen, arrival);
  }
  assert.equal(screen.version, 3);
  assert.equal(screen.status, "READY");
});

test("version cao hơn luôn được nhận; đơn khác id luôn được nhận", () => {
  assert.equal(shouldAcceptOrder(base(), paid()), true);
  assert.equal(shouldAcceptOrder(paid(), { ...base(), id: "other" }), true);
  assert.equal(shouldAcceptOrder(null, base()), true);
});

test("cùng version: nhận lượt đọc mới hơn hoặc bằng, bỏ lượt cũ hơn", () => {
  const a = base();
  const newer = { ...a, serverTime: new Date(NOW + 1000).toISOString() };
  const older = { ...a, serverTime: new Date(NOW - 1000).toISOString() };
  assert.equal(shouldAcceptOrder(a, newer), true);
  assert.equal(shouldAcceptOrder(a, a), true);
  assert.equal(shouldAcceptOrder(a, older), false);
});

test("lịch sử: lượt đọc cũ hơn bị bỏ hoàn toàn", () => {
  const current = fixtureHistory(NOW + 10_000);
  const stale = fixtureHistory(NOW);
  assert.equal(mergeHistory(current, stale), current);
});

test("lịch sử: lượt mới hơn nhưng một đơn mang version thấp thì đơn đó giữ bản cao", () => {
  const current = fixtureHistory(NOW);
  const target = current.items.find(i => i.id === "ord-pending");
  const bumped = { ...current, items: current.items.map(i => i.id === "ord-pending" ? { ...i, version: 5, status: "COMPLETED" } : i) };
  const incoming = { ...fixtureHistory(NOW + 5000) }; // ord-pending vẫn version 0/PENDING
  const merged = mergeHistory(bumped, incoming);
  const row = merged.items.find(i => i.id === "ord-pending");
  assert.equal(row.version, 5);
  assert.equal(row.status, "COMPLETED");
  assert.equal(target.version, 0);
  assert.equal(merged.serverTime, incoming.serverTime);
});

test("lịch sử luôn sắp createdAt DESC, id DESC", () => {
  const merged = mergeHistory(null, fixtureHistory(NOW));
  const twice = mergeHistory(merged, fixtureHistory(NOW + 1000));
  for (let i = 1; i < twice.items.length; i++) {
    const a = twice.items[i - 1], b = twice.items[i];
    assert.ok(Date.parse(a.createdAt) > Date.parse(b.createdAt) || (a.createdAt === b.createdAt && a.id > b.id));
  }
});

test("chi tiết mới hơn cập nhật dòng lịch sử; cũ hơn thì không", () => {
  const history = fixtureHistory(NOW);
  const updated = applyDetailToHistory(history, paid());
  assert.equal(updated.items.find(i => i.id === "ord-pending").status, "PAID");
  assert.equal(applyDetailToHistory(updated, base()), updated);
});
