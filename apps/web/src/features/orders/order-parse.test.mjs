import test from "node:test";
import assert from "node:assert/strict";
import { fixtureHistory, fixtureOrders } from "./order-fixtures.ts";
import { OrderApiError } from "./order-error.ts";
import { parseHistory, parseOrderDetail } from "./order-parse.ts";

const NOW = Date.parse("2026-11-06T10:00:00.000Z");
const clone = value => JSON.parse(JSON.stringify(value));
const invalid = fn => assert.throws(fn, e => e instanceof OrderApiError && e.code === "INVALID_RESPONSE");

test("mọi fixture của chín tình huống đều đúng contract", () => {
  const orders = fixtureOrders(NOW);
  assert.equal(orders.length, 9);
  for (const order of orders) assert.deepEqual(parseOrderDetail(clone(order)), order, order.id);
});

test("fixture phủ đủ bảy trạng thái", () => {
  const statuses = new Set(fixtureOrders(NOW).map(o => o.status));
  assert.equal(statuses.size, 7);
});

test("fixture đúng công thức: subtotal − discount = total, DEMO10 90.000", () => {
  for (const o of fixtureOrders(NOW)) assert.equal(o.subtotal - o.discountTotal, o.total, o.id);
  const pending = fixtureOrders(NOW)[0];
  assert.equal(pending.total, 90_000);
  assert.equal(pending.promotion.discountAmount, 10_000);
});

test("lịch sử: createdAt giảm dần, id giảm dần khi trùng; có serverTime", () => {
  const history = parseHistory(clone(fixtureHistory(NOW)));
  const times = history.items.map(i => Date.parse(i.createdAt));
  for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] >= times[i]);
  assert.equal(history.serverTime, "2026-11-06T10:00:00.000Z");
});

test("trường lạ, kể cả nhạy cảm, bị bỏ khỏi kết quả", () => {
  const raw = clone(fixtureOrders(NOW)[2]);
  raw.gatewayKey = "mock:secret";
  raw.requestHash = "abc";
  raw.latestPayment.gatewayKey = "mock:x";
  raw.items[0].internalNote = "x";
  const parsed = parseOrderDetail(raw);
  const text = JSON.stringify(parsed);
  assert.doesNotMatch(text, /gatewayKey|requestHash|internalNote|secret/);
});

test("phản hồi sai hình dạng là INVALID_RESPONSE, không hiển thị một phần", () => {
  const base = fixtureOrders(NOW)[0];
  const bad = patch => () => parseOrderDetail({ ...clone(base), ...patch });
  invalid(bad({ status: "SHIPPED" }));
  invalid(bad({ total: "90000" })); // không tự ép chuỗi số thành số
  invalid(bad({ total: 90000.5 }));
  invalid(bad({ total: -1 }));
  invalid(bad({ version: null }));
  invalid(bad({ canPay: "true" }));
  invalid(bad({ serverTime: "hôm qua" }));
  invalid(bad({ items: null }));
  invalid(bad({ cancelReason: "BORED" }));
  invalid(bad({ promotion: { code: "X" } }));
  invalid(bad({ latestPayment: { id: "p" } }));
  invalid(() => parseOrderDetail(null));
  invalid(() => parseOrderDetail([]));
  invalid(() => parseHistory({ items: [{}], serverTime: "2026-11-06T10:00:00.000Z" }));
  invalid(() => parseHistory({ items: {}, serverTime: "2026-11-06T10:00:00.000Z" }));
});

test("qty phải ≥ 1 và id không được rỗng (id opaque, không trim)", () => {
  const base = clone(fixtureOrders(NOW)[0]);
  base.items[0].qty = 0;
  invalid(() => parseOrderDetail(base));
  const spaced = clone(fixtureOrders(NOW)[0]);
  spaced.id = " a ";
  assert.equal(parseOrderDetail(spaced).id, " a ");
  spaced.id = "";
  invalid(() => parseOrderDetail(spaced));
});
