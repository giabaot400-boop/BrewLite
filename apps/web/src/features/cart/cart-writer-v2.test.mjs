import assert from "node:assert/strict";
import test from "node:test";
import { CartStorageError, createEmptyCartEnvelope, encodeCartEnvelope } from "./cart-envelope.ts";
import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "./cart-envelope-v2.ts";
import { cartEditBlockForOwnerV2 } from "./cart-writer-v2.ts";
import { cartReducer, getCartLineKey } from "./cart-reducer.ts";
import { CART_LOCK_NAME, CART_STORAGE_KEY, createCartStorage } from "./cart-storage.ts";

const KEY = "00000000-0000-4000-8000-000000000001";
const TIME = "2026-11-07T12:00:00.000Z";
const draft = { productId: "coffee-milk", productName: "Cà phê sữa", imageUrl: "/images/coffee-milk.svg",
  size: "M", toppingIds: ["cream"], toppingNames: { cream: "Kem" }, previewUnitPrice: 47000 };
const code = expected => error => error instanceof CartStorageError && error.code === expected;
const checkpoint = cart => ({ ownerId: cart.ownerId, revision: cart.revision });
const current = () => true;

function envelope(ownerId = "A") {
  const value = createEmptyCartEnvelopeV2();
  value.cart = { ...cartReducer({ cart: value.cart, error: null }, { type: "ADD_ITEM", item: draft }).cart, ownerId };
  return value;
}

function pending(ownerId) {
  const cartSnapshot = envelope(ownerId).cart;
  return { ownerId, requestKey: KEY, cartSnapshot, cartRevision: cartSnapshot.revision,
    payload: { schemaVersion: 2, items: [{ productId: "coffee-milk", size: "M", toppingIds: ["cream"],
      qty: 1, expectedUnitPrice: 47000 }], promotionCode: " demo10 ", expectedTotal: 47000 },
    createdAt: TIME, phase: "SUBMITTING" };
}

function bound(ownerId) {
  const cartSnapshot = envelope(ownerId).cart;
  return { ownerId, orderId: "order-A", cartSnapshot, cartRevision: cartSnapshot.revision, orderVersion: 0, boundAt: TIME };
}

function recovery(ownerId, recoveryStatus = "UNRESOLVED") {
  return { ownerId, requestKey: KEY, body: { orderId: "order-A", method: "CARD" },
    paymentId: null, recoveryStatus, createdAt: TIME };
}

function withRecords(value, ownerId) {
  value.pendingRequests = { ...value.pendingRequests, [ownerId]: pending(ownerId) };
  value.checkoutBindings = { ...value.checkoutBindings, [ownerId]: bound(ownerId) };
  value.paymentRecoveries = { ...value.paymentRecoveries, [ownerId]: { [KEY]: recovery(ownerId) } };
  value.lastOrderResult = { ownerId, requestKey: KEY,
    order: { id: "old-pending", status: "PENDING", total: 47000 }, confirmedAt: TIME };
  return value;
}

// FIFO storage/lock ports. These tests do not mount UI, browser sessions or NestJS.
class Locks {
  held = false;
  tail = Promise.resolve();
  request(name, options, operation) {
    assert.equal(name, CART_LOCK_NAME); assert.equal(options.mode, "exclusive");
    const task = this.tail.then(() => {
      options.signal.throwIfAborted(); this.held = true;
      try { return operation(); } finally { this.held = false; }
    });
    this.tail = task.catch(() => {}); return task;
  }
}

function setup(value = envelope()) {
  const locks = new Locks();
  const memory = { raw: value === null || typeof value === "string" ? value : encodeCartEnvelopeV2(value),
    reads: 0, writes: 0, failRead: false, failWrite: false };
  const storage = {
    getItem(key) {
      assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true); memory.reads++;
      if (memory.failRead) throw new Error("denied"); return memory.raw;
    },
    setItem(key, raw) {
      assert.equal(key, CART_STORAGE_KEY); assert.equal(locks.held, true);
      if (memory.failWrite) throw new Error("quota"); memory.raw = raw; memory.writes++;
    },
  };
  return { memory, locks, storage, service: createCartStorage({ locks, storage }) };
}

test("v2 reads do not hydrate-write; a first guest edit saves a schema-2 envelope", async () => {
  const { service, memory } = setup(null);
  const a = await service.readV2(), b = await service.readV2();
  assert.notEqual(a.cart.items, b.cart.items); assert.equal(memory.raw, null);
  const saved = await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, null, current);
  assert.equal(saved.envelope.schemaVersion, 2); assert.equal(saved.envelope.cart.ownerId, null);
  assert.equal(saved.envelope.cart.revision, 1); assert.equal(memory.writes, 1);
});

test("v2 APIs require explicit v1 migration and reject corrupted/unknown data unchanged", async () => {
  for (const raw of [encodeCartEnvelope(createEmptyCartEnvelope()), "{", "null", '{"schemaVersion":3}', '{"schemaVersion":2}']) {
    const { service, memory } = setup(raw);
    await assert.rejects(service.readV2(), CartStorageError);
    await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current), CartStorageError);
    await assert.rejects(service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A",
      expectedCart: { ownerId: null, revision: 0 } }, current), CartStorageError);
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("recovery reads show UNKNOWN without rewriting SUBMITTING or any payload", async () => {
  const value = withRecords(envelope("B"), "A"); const { service, memory } = setup(value); const raw = memory.raw;
  const read = await service.readV2();
  assert.equal(read.pendingRequests.A.phase, "UNKNOWN"); assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  assert.deepEqual(read.pendingRequests.A.payload, value.pendingRequests.A.payload);
});

test("editing B preserves every A record exactly, including stored SUBMITTING and raw promotion spelling", async () => {
  const value = withRecords(envelope("B"), "A"); const { service, memory } = setup(value);
  await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "B", current);
  const stored = JSON.parse(memory.raw);
  assert.equal(stored.cart.items[0].qty, 2); assert.equal(stored.cart.revision, 2); assert.equal(memory.writes, 1);
  for (const key of ["pendingRequests", "checkoutBindings", "paymentRecoveries", "lastOrderResult"]) {
    assert.equal(JSON.stringify(stored[key]), JSON.stringify(value[key]), key);
  }
});

test("two v2 clients read the latest cart under the shared lock without losing edits", async () => {
  const { service, locks, storage, memory } = setup(); const second = createCartStorage({ locks, storage });
  await Promise.all([service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current),
    second.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current)]);
  const stored = JSON.parse(memory.raw);
  assert.equal(stored.cart.items[0].qty, 3); assert.equal(stored.cart.revision, 3); assert.equal(memory.writes, 2);
});

test("pending, checkout binding and unresolved payment each block every cart edit", async () => {
  for (const reason of ["ORDER_PENDING", "CHECKOUT_BOUND", "PAYMENT_UNRESOLVED"]) {
    const value = envelope();
    if (reason === "ORDER_PENDING") value.pendingRequests.A = pending("A");
    if (reason === "CHECKOUT_BOUND") value.checkoutBindings.A = bound("A");
    if (reason === "PAYMENT_UNRESOLVED") value.paymentRecoveries.A = { [KEY]: recovery("A") };
    assert.equal(cartEditBlockForOwnerV2(value, "A"), reason);
    const { service, memory } = setup(value); const raw = memory.raw;
    const lineKey = getCartLineKey(value.cart.items[0]);
    for (const action of [{ type: "ADD_ITEM", item: draft }, { type: "INCREMENT", lineKey },
      { type: "DECREMENT", lineKey }, { type: "REMOVE_ITEM", lineKey }]) {
      await assert.rejects(service.mutateCartV2(action, "A", current), code("PENDING_REQUEST"));
    }
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("own unresolved records keep edits blocked even after logout and same-owner return emptied the cart", async () => {
  const value = withRecords(envelope(), "A"); const { service, memory } = setup(value);
  const guest = await service.applyOwnerLifecycleV2({ type: "LOGOUT_CONFIRMED", scope: "session", expectedCart: checkpoint(value.cart) }, current);
  const returned = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A", expectedCart: checkpoint(guest.cart) }, current);
  assert.deepEqual(returned.cart.items, []); const raw = memory.raw;
  await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current), code("PENDING_REQUEST"));
  assert.equal(memory.raw, raw); assert.deepEqual(returned.paymentRecoveries, value.paymentRecoveries);
});

test("resolved recovery or historical PENDING result alone does not lock a new cart", async () => {
  const value = envelope(); value.paymentRecoveries.A = { [KEY]: recovery("A", "RESOLVED") };
  value.lastOrderResult = withRecords(envelope(), "A").lastOrderResult;
  assert.equal(cartEditBlockForOwnerV2(value, "A"), null);
  const { service, memory } = setup(value);
  await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current);
  assert.equal(memory.writes, 1); assert.deepEqual(JSON.parse(memory.raw).lastOrderResult, value.lastOrderResult);
});

test("business rejection and no-op do not persist or alter other-owner recovery", async () => {
  const value = withRecords(envelope(), "B"); value.cart.items[0].qty = 20;
  const { service, memory } = setup(value); const raw = memory.raw;
  const rejected = await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current);
  assert.equal(rejected.error.code, "MAX_QUANTITY");
  await service.mutateCartV2({ type: "REMOVE_ITEM", lineKey: "missing" }, "A", current);
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("queued edits capture the draft before caller changes it", async () => {
  const { service, memory } = setup();
  const item = structuredClone(draft); item.productId = "second";
  const saved = service.mutateCartV2({ type: "ADD_ITEM", item }, "A", current);
  item.productId = "changed"; item.toppingNames.cream = "Changed";
  await saved;
  const line = JSON.parse(memory.raw).cart.items.find(item => item.productId === "second");
  assert.equal(line.toppingNames.cream, "Kem");
});

test("missing, false or asynchronous session verification cannot authorize a v2 write", async () => {
  for (const guard of [undefined, () => false, async () => true]) {
    const { service, memory } = setup(); const raw = memory.raw;
    await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", guard), code("OWNER_MISMATCH"));
    await assert.rejects(service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "B",
      expectedCart: { ownerId: "A", revision: 1 } }, guard), code("OWNER_MISMATCH"));
    assert.equal(memory.raw, raw); assert.equal(memory.reads, 0); assert.equal(memory.writes, 0);
  }
});

test("session change while queued is detected inside the lock before reading/writing", async () => {
  const { service, memory } = setup(); let version = 1;
  const result = service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", () => version === 1);
  version = 2;
  await assert.rejects(result, code("OWNER_MISMATCH")); assert.equal(memory.reads, 0); assert.equal(memory.writes, 0);
});

test("session is rechecked before persistence; a stale owner never edits another cart", async () => {
  const { service, memory } = setup(); const raw = memory.raw; let calls = 0;
  await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", () => ++calls === 1), code("OWNER_MISMATCH"));
  await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "B", current), code("OWNER_MISMATCH"));
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("read/quota errors never publish a successful cart or owner transition", async () => {
  for (const flag of ["failRead", "failWrite"]) {
    const { service, memory } = setup(); const raw = memory.raw; memory[flag] = true;
    await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current), code("STORAGE_UNAVAILABLE"));
    await assert.rejects(service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "B",
      expectedCart: { ownerId: "A", revision: 1 } }, current), code("STORAGE_UNAVAILABLE"));
    assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
  }
});

test("guest adoption keeps choices/revision lineage and all owners' recovery bytes", async () => {
  const value = withRecords(envelope(null), "B"); const { service, memory } = setup(value);
  const result = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A", expectedCart: checkpoint(value.cart) }, current);
  assert.equal(result.cart.ownerId, "A"); assert.equal(result.cart.revision, 2);
  assert.deepEqual(result.cart.items, value.cart.items); assert.equal(Object.hasOwn(result, "request"), false);
  const stored = JSON.parse(memory.raw);
  for (const field of ["pendingRequests", "checkoutBindings", "paymentRecoveries", "lastOrderResult"]) assert.deepEqual(stored[field], value[field]);
});

test("same-owner verification is a no-op and cannot unlock an outstanding checkout", async () => {
  const value = withRecords(envelope(), "A"); const { service, memory } = setup(value); const raw = memory.raw;
  const result = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "A", expectedCart: checkpoint(value.cart) }, current);
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0); assert.equal(result.cart.revision, 1);
  assert.notEqual(cartEditBlockForOwnerV2(result, "A"), null);
});

test("account switch clears old choices, retains A records, and allows B to edit B's cart", async () => {
  const value = withRecords(envelope(), "A"); const { service, memory } = setup(value);
  const result = await service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "B", expectedCart: checkpoint(value.cart) }, current);
  assert.deepEqual(result.cart, { ownerId: "B", revision: 2, items: [] });
  await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "B", current);
  const stored = JSON.parse(memory.raw);
  for (const field of ["pendingRequests", "checkoutBindings", "paymentRecoveries", "lastOrderResult"]) assert.deepEqual(stored[field], value[field]);
});

test("both confirmed logout scopes clear only the cart and retain pending/binding/payment records", async () => {
  for (const scope of ["session", "local"]) {
    const value = withRecords(envelope(), "A"); const { service, memory } = setup(value);
    const result = await service.applyOwnerLifecycleV2({ type: "LOGOUT_CONFIRMED", scope, expectedCart: checkpoint(value.cart) }, current);
    assert.deepEqual(result.cart, { ownerId: null, revision: 2, items: [] }); assert.equal(memory.writes, 1);
    for (const field of ["pendingRequests", "checkoutBindings", "paymentRecoveries", "lastOrderResult"]) assert.deepEqual(result[field], value[field]);
  }
});

test("stale checkpoints, unknown logout scope and order commands cannot perform an owner transition", async () => {
  const value = envelope(); const { service, memory } = setup(value); const raw = memory.raw;
  for (const command of [
    { type: "ADOPT_OWNER", ownerId: "B", expectedCart: { ownerId: "A", revision: 0 } },
    { type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: { ownerId: "B", revision: 1 } },
    { type: "LOGOUT_CONFIRMED", scope: "unknown", expectedCart: checkpoint(value.cart) },
    { type: "BEGIN_ORDER", ownerId: "A", expectedCart: checkpoint(value.cart), requestKey: KEY, createdAt: TIME },
  ]) await assert.rejects(service.applyOwnerLifecycleV2(command, current), CartStorageError);
  assert.equal(memory.raw, raw); assert.equal(memory.writes, 0);
});

test("queued owner commands capture their checkpoint before caller mutation", async () => {
  const { service, memory } = setup(); const command = { type: "ADOPT_OWNER", ownerId: "B", expectedCart: { ownerId: "A", revision: 1 } };
  const result = service.applyOwnerLifecycleV2(command, current);
  command.expectedCart.revision = 99; command.ownerId = "C";
  assert.equal((await result).cart.ownerId, "B"); assert.equal(memory.writes, 1);
});

test("prototype-like owner entries are isolated from inherited properties", async () => {
  const value = withRecords(envelope("constructor"), "__proto__"); const { service, memory } = setup(value);
  assert.equal(cartEditBlockForOwnerV2(value, "constructor"), null);
  await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "constructor", current);
  assert.equal(JSON.parse(memory.raw).cart.items[0].qty, 2);
  assert.equal(Object.hasOwn(JSON.parse(memory.raw).pendingRequests, "__proto__"), true);
});

test("v2 revisions cannot overflow and empty guest logout remains a no-op", async () => {
  const value = envelope(); value.cart.revision = Number.MAX_SAFE_INTEGER;
  const { service, memory } = setup(value); const raw = memory.raw;
  await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current), code("REVISION_OVERFLOW"));
  await assert.rejects(service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "B", expectedCart: checkpoint(value.cart) }, current), code("REVISION_OVERFLOW"));
  assert.equal(memory.raw, raw);
  const guest = setup(createEmptyCartEnvelopeV2());
  await guest.service.applyOwnerLifecycleV2({ type: "LOGOUT_CONFIRMED", scope: "local", expectedCart: { ownerId: null, revision: 0 } }, current);
  assert.equal(guest.memory.writes, 0);
});

test("v2 writer and migration share the same lock; stale v1 writer remains blocked", async () => {
  const { service, memory } = setup(encodeCartEnvelope(createEmptyCartEnvelope()));
  await service.migrateToV2();
  await service.mutateCartV2({ type: "ADD_ITEM", item: draft }, null, current);
  const raw = memory.raw;
  await assert.rejects(service.mutateCart({ type: "ADD_ITEM", item: draft }, null), code("UNSUPPORTED_VERSION"));
  assert.equal(memory.raw, raw); assert.equal(JSON.parse(raw).schemaVersion, 2);
});

test("missing Web Locks prevents all v2 operations without reading or writing", async () => {
  const { storage, memory } = setup(); const service = createCartStorage({ storage, locks: undefined });
  await assert.rejects(service.readV2(), code("LOCK_UNAVAILABLE"));
  await assert.rejects(service.mutateCartV2({ type: "ADD_ITEM", item: draft }, "A", current), code("LOCK_UNAVAILABLE"));
  await assert.rejects(service.applyOwnerLifecycleV2({ type: "ADOPT_OWNER", ownerId: "B",
    expectedCart: { ownerId: "A", revision: 1 } }, current), code("LOCK_UNAVAILABLE"));
  assert.equal(memory.reads, 0); assert.equal(memory.writes, 0);
});
