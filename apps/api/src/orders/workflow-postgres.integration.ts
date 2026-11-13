import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { Prisma, type PaymentStatus } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "./orders.service.js";
import { OrdersReaderService } from "./orders-reader.service.js";
import { OrderWorkflowService } from "./order-workflow.service.js";
import { MockPaymentService } from "./mock-payment.service.js";
import { OrderExpiryService } from "./order-expiry.service.js";

assert.equal(process.env.SPRINT3_INTEGRATION_TEST, "1", "Use the guarded Sprint 3 test runner.");
const url = new URL(process.env.DATABASE_URL ?? "");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert(["/brewlite_s2_test", "/brewlite_s3_demo"].includes(url.pathname));
assert(!url.searchParams.has("host") && !url.searchParams.has("hostaddr"));
assert(!url.searchParams.has("schema") || url.searchParams.get("schema") === "public");
const db = new PrismaService(), reader = new OrdersReaderService(db), creator = new OrdersService(db);
const prefix = `a1-workflow-${randomUUID()}`;
const users = [`${prefix}-A`, `${prefix}-B`], products: string[] = [], promotions: string[] = [];
const httpCode = (code: string) => (error: unknown) => error instanceof HttpException && (error.getResponse() as { error?: { code?: string } }).error?.code === code;
function workflow(outcome: PaymentStatus = "SUCCEEDED", prisma = db) {
  return new OrderWorkflowService(prisma, reader, { evaluate: () => outcome } as unknown as MockPaymentService);
}
before(async () => {
  await db.$connect();
  const [identity] = await db.$queryRaw<Array<{ name: string; version: string }>>`SELECT current_database() AS name, current_setting('server_version') AS version`;
  assert.equal(`/${identity!.name}`, url.pathname); assert(identity!.version.startsWith("17."));
  console.log(`PostgreSQL ${identity!.version}; isolated fixture prefix ${prefix}`);
  for (const userId of users) await db.user.create({ data: { id: userId, email: `${userId}@example.invalid`, passwordHash: "TEST_ONLY_NOT_A_LOGIN_HASH" } });
});
after(async () => {
  try {
    await db.$transaction(async tx => {
      await tx.paymentAttempt.deleteMany({ where: { userId: { in: users } } });
      await tx.loyaltyEntry.deleteMany({ where: { userId: { in: users } } });
      await tx.stockReservation.deleteMany({ where: { order: { userId: { in: users } } } });
      await tx.orderItemTopping.deleteMany({ where: { orderItem: { order: { userId: { in: users } } } } });
      await tx.orderItem.deleteMany({ where: { order: { userId: { in: users } } } });
      await tx.orderRequest.deleteMany({ where: { userId: { in: users } } });
      await tx.order.deleteMany({ where: { userId: { in: users } } });
      await tx.promotion.deleteMany({ where: { code: { in: promotions } } });
      await tx.product.deleteMany({ where: { id: { in: products } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    }, { timeout: 10000 });
    assert.equal(await db.user.count({ where: { id: { in: users } } }), 0);
    assert.equal(await db.product.count({ where: { id: { in: products } } }), 0);
    console.log("CLEANUP: only this run's isolated fixtures removed.");
  } finally { await db.$disconnect(); }
});
async function product(stock = 3, price = 10000) {
  const id = `${prefix}-p-${products.length}`; products.push(id);
  return db.product.create({ data: { id, name: "Isolated A1 workflow test", description: "Temporary fixture", imageUrl: "/test.svg", price, stock } });
}
async function order(qty = 1, userId = users[0]!, p?: Awaited<ReturnType<typeof product>>) {
  p ??= await product();
  const key = randomUUID(), body = { schemaVersion: 2 as const, promotionCode: null, expectedTotal: p.price * qty,
    items: [{ productId: p.id, size: "S" as const, toppingIds: [], qty, expectedUnitPrice: p.price }] };
  const result = await creator.createOrderV2(userId, key, body);
  assert.equal(result.httpStatus, 201); assert("id" in result.body);
  return { id: result.body.id, userId, key, body, productId: p.id };
}
const balance = async () => (await db.user.findUniqueOrThrow({ where: { id: users[0]! } })).loyaltyPoints;
const inspect = async (id: string) => db.order.findUniqueOrThrow({ where: { id }, include: { reservations: true, paymentAttempts: true, loyaltyEntry: true } });

for (const method of ["WALLET", "CARD"] as const) test(`payment ${method} commits one attempt, stock consumption and points`, async () => {
  const o = await order(2), before = await balance(), key = randomUUID(), api = workflow();
  const result = await api.pay(o.userId, key, { orderId: o.id, method });
  assert.equal(result.status, "SUCCEEDED"); assert.equal(result.amount, 20000); assert.equal(result.version, 0);
  const saved = await inspect(o.id), p = await db.product.findUniqueOrThrow({ where: { id: o.productId } });
  assert.equal(saved.status, "PAID"); assert.equal(saved.version, 1); assert.equal(saved.reservations[0]!.state, "CONSUMED");
  assert.equal(p.stock, 1); assert.equal(p.reservedStock, 0); assert.equal(await balance(), before + 2);
  const replay = await api.pay(o.userId, key, { orderId: o.id, method }); assert.equal(replay.id, result.id);
  assert.equal((await inspect(o.id)).version, 1); assert.equal(await balance(), before + 2);
  await assert.rejects(api.pay(o.userId, key, { orderId: o.id, method: method === "CARD" ? "WALLET" : "CARD" }), httpCode("IDEMPOTENCY_CONFLICT"));
  const createReplay = await creator.createOrderV2(o.userId, o.key, o.body);
  assert.equal(createReplay.httpStatus, 200); assert.equal((createReplay.body as { status: string }).status, "PENDING");
  assert.equal((await reader.getOrderDetail(o.userId, o.id)).status, "PAID");
});

test("FAILED keeps hold; replay old key stays FAILED after success with a new key", async () => {
  const o = await order(), before = await balance(), oldKey = randomUUID(), newKey = randomUUID();
  const first = await workflow("FAILED").pay(o.userId, oldKey, { orderId: o.id, method: "CARD" });
  assert.equal(first.status, "FAILED"); assert.equal(first.failureCode, "PAYMENT_DECLINED");
  const failed = await inspect(o.id); assert.equal(failed.status, "PAYMENT_FAILED"); assert.equal(failed.version, 1);
  assert.equal(failed.reservations[0]!.state, "ACTIVE"); assert.equal(await balance(), before);
  await workflow().pay(o.userId, newKey, { orderId: o.id, method: "WALLET" });
  const paid = await inspect(o.id); assert.equal(paid.status, "PAID"); assert.equal(paid.version, 2);
  assert.equal(paid.paymentDeadline?.getTime(), failed.paymentDeadline?.getTime());
  const replay = await workflow().pay(o.userId, oldKey, { orderId: o.id, method: "CARD" });
  assert.equal(replay.id, first.id); assert.equal(replay.status, "FAILED");
  const detail = await reader.getOrderDetail(o.userId, o.id); assert.equal(detail.latestPayment?.status, "SUCCEEDED");
  assert.notEqual(detail.latestPayment?.id, replay.id); assert.equal(await balance(), before + 1);
});

test("cancel before payment releases hold once and retains immutable creation replay", async () => {
  const o = await order(2), api = workflow();
  const canceled = await api.cancel(o.userId, o.id); assert.equal(canceled.status, "CANCELLED"); assert.equal(canceled.cancelReason, "CUSTOMER_REQUEST");
  const p = await db.product.findUniqueOrThrow({ where: { id: o.productId } }); assert.equal(p.stock, 3); assert.equal(p.reservedStock, 0);
  const version = canceled.version; assert.equal((await api.cancel(o.userId, o.id)).version, version);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: o.productId } })).stockVersion, p.stockVersion);
  const replay = await creator.createOrderV2(o.userId, o.key, o.body); assert.equal(replay.httpStatus, 200);
  assert.equal((await reader.getOrderDetail(o.userId, o.id)).status, "CANCELLED");
});

test("PAID cancel refunds full amount, returns stock, reverses points exactly once", async () => {
  const o = await order(2), api = workflow(), before = await balance(), key = randomUUID();
  const payment = await api.pay(o.userId, key, { orderId: o.id, method: "WALLET" });
  const result = await api.cancel(o.userId, o.id); assert.equal(result.status, "CANCELLED");
  assert.equal(result.loyaltyPointsEarned, 2); assert.equal(result.loyaltyPointsReversed, 2); assert.equal(await balance(), before);
  const p = await db.product.findUniqueOrThrow({ where: { id: o.productId } }); assert.equal(p.stock, 3); assert.equal(p.reservedStock, 0);
  const replay = await api.pay(o.userId, key, { orderId: o.id, method: "WALLET" });
  assert.equal(replay.id, payment.id); assert.equal(replay.status, "SUCCEEDED"); assert.equal(replay.refundedAmount, 20000); assert.equal(replay.version, 1);
  assert.equal(replay.createdAt, payment.createdAt); assert.equal(replay.resolvedAt, payment.resolvedAt); assert(replay.refundedAt);
  assert.equal((await api.cancel(o.userId, o.id)).version, result.version); assert.equal(await balance(), before);
  await assert.rejects(api.pay(o.userId, randomUUID(), { orderId: o.id, method: "WALLET" }), httpCode("ORDER_NOT_PAYABLE"));
});

test("expiry rechecks database deadline, rejects payment and never mutates legacy orders", async () => {
  const o = await order(), api = workflow();
  assert.equal(await api.expireOrder(o.id), false);
  await db.order.update({ where: { id: o.id }, data: { paymentDeadline: new Date(Date.now() - 1000) } });
  await assert.rejects(api.pay(o.userId, randomUUID(), { orderId: o.id, method: "CARD" }), httpCode("PAYMENT_WINDOW_EXPIRED"));
  assert.equal(await api.expireOrder(o.id), true); assert.equal(await api.expireOrder(o.id), false);
  const saved = await inspect(o.id); assert.equal(saved.cancelReason, "PAYMENT_WINDOW_EXPIRED"); assert.equal(saved.paymentAttempts.length, 0);
  const legacy = await db.order.create({ data: { userId: o.userId, requestKey: randomUUID(), requestHash: "legacy-fixture", subtotal: 10000, total: 10000 } });
  assert.equal(await api.expireOrder(legacy.id), false);
  await assert.rejects(api.cancel(o.userId, legacy.id), httpCode("LEGACY_ORDER_REQUIRES_REVIEW"));
  await assert.rejects(api.pay(o.userId, randomUUID(), { orderId: legacy.id, method: "WALLET" }), httpCode("LEGACY_ORDER_REQUIRES_REVIEW"));
  assert.equal((await inspect(legacy.id)).version, 0);
});

test("internal demo advances only paid chain and cancellation stops at PREPARING", async () => {
  const o = await order(), api = workflow();
  const prior = process.env.DEMO_WORKFLOW_ENABLED;
  try {
    process.env.DEMO_WORKFLOW_ENABLED = "false";
    await assert.rejects(api.advanceDemoOrder(o.id, "PREPARING"), httpCode("DEMO_WORKFLOW_DISABLED"));
    process.env.DEMO_WORKFLOW_ENABLED = "true";
    await assert.rejects(api.advanceDemoOrder(o.id, "PREPARING"), httpCode("INVALID_ORDER_TRANSITION"));
    await api.pay(o.userId, randomUUID(), { orderId: o.id, method: "CARD" });
    await assert.rejects(api.advanceDemoOrder(o.id, "READY"), httpCode("INVALID_ORDER_TRANSITION"));
    for (const target of ["PREPARING", "READY", "COMPLETED"] as const) assert.equal((await api.advanceDemoOrder(o.id, target)).status, target);
    await assert.rejects(api.cancel(o.userId, o.id), httpCode("ORDER_NOT_CANCELLABLE"));
  } finally { if (prior === undefined) delete process.env.DEMO_WORKFLOW_ENABLED; else process.env.DEMO_WORKFLOW_ENABLED = prior; }
});

test("other owner cannot pay, cancel or read an order; no mutation or attempt is created", async () => {
  const o = await order(), api = workflow();
  await assert.rejects(api.pay(users[1]!, randomUUID(), { orderId: o.id, method: "WALLET" }), httpCode("RESOURCE_NOT_FOUND"));
  await assert.rejects(api.cancel(users[1]!, o.id), httpCode("RESOURCE_NOT_FOUND"));
  await assert.rejects(reader.getOrderDetail(users[1]!, o.id), httpCode("RESOURCE_NOT_FOUND"));
  const saved = await inspect(o.id); assert.equal(saved.version, 0); assert.equal(saved.paymentAttempts.length, 0);
});

test("two concurrent payments with the same key converge on one attempt and one award", async () => {
  const o = await order(), key = randomUUID(), before = await balance(), api = workflow();
  const settled = await Promise.allSettled([api.pay(o.userId, key, { orderId: o.id, method: "CARD" }), api.pay(o.userId, key, { orderId: o.id, method: "CARD" })]);
  const results = settled.map(result => { assert.equal(result.status, "fulfilled"); return (result as PromiseFulfilledResult<Awaited<ReturnType<typeof api.pay>>>).value; });
  assert.equal(results[0]!.id, results[1]!.id); assert.equal((await inspect(o.id)).paymentAttempts.length, 1);
  assert.equal(await balance(), before + 1); assert.equal((await inspect(o.id)).version, 1);
});

test("different payment keys racing on one order cannot produce two successes", async () => {
  const o = await order(), api = workflow();
  const results = await Promise.allSettled([api.pay(o.userId, randomUUID(), { orderId: o.id, method: "CARD" }), api.pay(o.userId, randomUUID(), { orderId: o.id, method: "WALLET" })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((await inspect(o.id)).paymentAttempts.filter(p => p.status === "SUCCEEDED").length, 1);
  assert.equal((await inspect(o.id)).version, 1);
});

test("payment racing cancel leaves one consistent canceled state and zero net award", async () => {
  const o = await order(), before = await balance(), api = workflow();
  const results = await Promise.allSettled([api.pay(o.userId, randomUUID(), { orderId: o.id, method: "WALLET" }), api.cancel(o.userId, o.id)]);
  assert.equal(results[1]!.status, "fulfilled");
  const saved = await inspect(o.id); assert.equal(saved.status, "CANCELLED"); assert.equal(await balance(), before);
  const p = await db.product.findUniqueOrThrow({ where: { id: o.productId } }); assert.equal(p.stock, 3); assert.equal(p.reservedStock, 0);
  if (saved.paymentAttempts.length) assert.equal(saved.paymentAttempts[0]!.refundedAmount, saved.total);
});

function withFailure(model: string, operation: string) {
  const marker = new Error(`TEST_ONLY_FAILURE_${model}_${operation}`);
  const wrapped = new Proxy(db, { get(target, field) {
    if (field === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(async tx => {
      const intercepted = new Proxy(tx, { get(transaction, key) {
        if (key === model) return new Proxy(Reflect.get(transaction, key), { get(delegate, method) {
          if (method === operation) return async () => { throw marker; };
          const value = Reflect.get(delegate, method); return typeof value === "function" ? value.bind(delegate) : value;
        } });
        const value = Reflect.get(transaction, key); return typeof value === "function" ? value.bind(transaction) : value;
      } });
      return work(intercepted);
    }, options);
    const value = Reflect.get(target, field); return typeof value === "function" ? value.bind(target) : value;
  } });
  return { marker, wrapped };
}

for (const [model, operation] of [["paymentAttempt", "create"], ["product", "updateMany"], ["loyaltyEntry", "create"], ["order", "updateMany"]]) {
  test(`payment rollback after injected ${model}.${operation} failure preserves order/hold/points/key`, async () => {
    const o = await order(), before = await balance(), key = randomUUID(), { marker, wrapped } = withFailure(model!, operation!);
    const stock = await db.product.findUniqueOrThrow({ where: { id: o.productId } });
    await assert.rejects(workflow("SUCCEEDED", wrapped).pay(o.userId, key, { orderId: o.id, method: "WALLET" }), error => error === marker);
    const saved = await inspect(o.id); assert.equal(saved.status, "PENDING"); assert.equal(saved.version, 0);
    assert.equal(saved.paymentAttempts.length, 0); assert.equal(saved.loyaltyEntry, null); assert.equal(saved.reservations[0]!.state, "ACTIVE");
    assert.deepEqual(await db.product.findUniqueOrThrow({ where: { id: o.productId } }), stock); assert.equal(await balance(), before);
    assert.equal((await workflow().pay(o.userId, key, { orderId: o.id, method: "WALLET" })).status, "SUCCEEDED");
  });
}

test("refund write failure rolls back returned stock, reversed points and refund metadata", async () => {
  const o = await order(), api = workflow(), key = randomUUID(); await api.pay(o.userId, key, { orderId: o.id, method: "CARD" });
  const stock = await db.product.findUniqueOrThrow({ where: { id: o.productId } }), before = await balance();
  const { marker, wrapped } = withFailure("paymentAttempt", "updateMany");
  await assert.rejects(workflow("SUCCEEDED", wrapped).cancel(o.userId, o.id), error => error === marker);
  const saved = await inspect(o.id); assert.equal(saved.status, "PAID"); assert.equal(saved.version, 1);
  assert.equal(saved.paymentAttempts[0]!.refundedAmount, 0); assert.equal(saved.loyaltyEntry!.reversedAt, null);
  assert.equal(saved.reservations[0]!.state, "CONSUMED"); assert.equal(await balance(), before);
  assert.deepEqual(await db.product.findUniqueOrThrow({ where: { id: o.productId } }), stock);
});

test("two customers reading two available cups cannot reserve quantities 2 and 1 together", async () => {
  const p = await product(2), clients = [new PrismaService(), new PrismaService()], observed: number[] = [];
  let ready = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const timeout = setTimeout(release, 1200);
  function barrier(client: PrismaService) {
    let first = true;
    return new Proxy(client, { get(target, field) {
      if (field === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(async tx => work(new Proxy(tx, { get(transaction, key) {
        if (key === "product") return new Proxy(transaction.product, { get(delegate, method) {
          if (method === "findMany") return async (args: Prisma.ProductFindManyArgs) => {
            const rows = await delegate.findMany(args);
            if (first && args.select?.stock === true) { first = false; observed.push((rows[0] as unknown as { stock: number; reservedStock: number }).stock - (rows[0] as unknown as { reservedStock: number }).reservedStock);
              if (++ready === 2) release(); await gate; }
            return rows;
          };
          const value = Reflect.get(delegate, method); return typeof value === "function" ? value.bind(delegate) : value;
        } });
        const value = Reflect.get(transaction, key); return typeof value === "function" ? value.bind(transaction) : value;
      } })), options);
      const value = Reflect.get(target, field); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  try {
    const requests = [2, 1].map((qty, i) => ({ key: randomUUID(), userId: users[i]!, body: { schemaVersion: 2 as const, promotionCode: null,
      expectedTotal: qty * 10000, items: [{ productId: p.id, size: "S" as const, toppingIds: [], qty, expectedUnitPrice: 10000 }] } }));
    const settled = await Promise.allSettled(requests.map((request, i) => new OrdersService(barrier(clients[i]!)).createOrderV2(request.userId, request.key, request.body)));
    const results = settled.map(result => { assert.equal(result.status, "fulfilled"); return (result as PromiseFulfilledResult<Awaited<ReturnType<typeof creator.createOrderV2>>>).value; });
    assert.deepEqual(observed, [2, 2]); assert.equal(ready, 2); assert.equal(results.filter(r => r.httpStatus === 201).length, 1);
    assert.equal(results.filter(r => r.httpStatus === 409 && "error" in r.body && r.body.error.code === "OUT_OF_STOCK").length, 1);
    const reservations = await db.stockReservation.findMany({ where: { productId: p.id } }); assert.equal(reservations.length, 1);
    const stock = await db.product.findUniqueOrThrow({ where: { id: p.id } }); assert.equal(stock.reservedStock, reservations[0]!.qty); assert(stock.reservedStock <= 2);
  } finally { clearTimeout(timeout); await Promise.all(clients.map(client => client.$disconnect())); }
});

test("expiry batch shares an in-flight scan and retries failed rows without stopping the batch", async () => {
  const o = await order(); await db.order.update({ where: { id: o.id }, data: { paymentDeadline: new Date(Date.now() - 1000) } });
  let scans = 0;
  // Scope the scan to this fixture; the production SQL is exercised by startup HTTP checks.
  const scoped = new Proxy(db, { get(target, field) {
    if (field === "$queryRaw") return async () => { scans++; return [{ id: "test-only-missing" }, { id: o.id }]; };
    const value = Reflect.get(target, field); return typeof value === "function" ? value.bind(target) : value;
  } });
  const real = workflow();
  const api = { async expireOrder(id: string) { if (id === "test-only-missing") throw new Error("test row failure"); return real.expireOrder(id); } } as unknown as OrderWorkflowService;
  const expiry = new OrderExpiryService(scoped, api);
  const first = expiry.runBatch(), second = expiry.runBatch(); assert.equal(first, second);
  assert.deepEqual(await first, { scanned: 2, expired: 1, failed: 1 }); assert.equal(scans, 1);
  assert.equal((await inspect(o.id)).status, "CANCELLED");
});

for (const [price, expected] of [[9000, 0], [90000, 9], [280000, 28]]) test(`loyalty entry includes ${expected} points and reverses the original entry exactly once`, async () => {
  const p = await product(1, price!), o = await order(1, users[0]!, p), before = await balance(), api = workflow();
  await api.pay(o.userId, randomUUID(), { orderId: o.id, method: "WALLET" });
  const saved = await inspect(o.id); assert.equal(saved.loyaltyEntry!.points, expected); assert.equal(await balance(), before + expected!);
  await api.cancel(o.userId, o.id); await api.cancel(o.userId, o.id); assert.equal(await balance(), before);
  const canceled = await inspect(o.id); assert.equal(canceled.loyaltyEntry!.id, saved.loyaltyEntry!.id); assert(canceled.loyaltyEntry!.reversedAt);
});

test("payment racing expiry after the deadline cannot consume the expired hold", async () => {
  const o = await order(), before = await balance(), api = workflow();
  await db.order.update({ where: { id: o.id }, data: { paymentDeadline: new Date(Date.now() - 1000) } });
  const results = await Promise.allSettled([api.pay(o.userId, randomUUID(), { orderId: o.id, method: "WALLET" }), api.expireOrder(o.id)]);
  assert.equal(results[0]!.status, "rejected"); assert.equal(results[1]!.status, "fulfilled");
  const saved = await inspect(o.id); assert.equal(saved.status, "CANCELLED"); assert.equal(saved.paymentAttempts.length, 0);
  assert.equal(saved.reservations[0]!.state, "RELEASED"); assert.equal(await balance(), before);
});

test("cancel racing PREPARING has exactly one valid outcome with consistent refund and stock", async () => {
  const o = await order(), before = await balance(), api = workflow(); await api.pay(o.userId, randomUUID(), { orderId: o.id, method: "CARD" });
  const previous = process.env.DEMO_WORKFLOW_ENABLED; process.env.DEMO_WORKFLOW_ENABLED = "true";
  try {
    const results = await Promise.allSettled([api.cancel(o.userId, o.id), api.advanceDemoOrder(o.id, "PREPARING")]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const saved = await inspect(o.id), p = await db.product.findUniqueOrThrow({ where: { id: o.productId } });
    assert.equal(saved.version, 2); assert.equal(p.reservedStock, 0);
    if (saved.status === "CANCELLED") { assert.equal(saved.paymentAttempts[0]!.refundedAmount, saved.total); assert.equal(p.stock, 3); assert.equal(await balance(), before); }
    else { assert.equal(saved.status, "PREPARING"); assert.equal(saved.paymentAttempts[0]!.refundedAmount, 0); assert.equal(p.stock, 2); assert.equal(await balance(), before + 1); }
  } finally { if (previous === undefined) delete process.env.DEMO_WORKFLOW_ENABLED; else process.env.DEMO_WORKFLOW_ENABLED = previous; }
});

test("new V1 payload keeps canonical identity and still reserves policy2 stock with a deadline", async () => {
  const p = await product(2), key = randomUUID(), body = { items: [{ productId: p.id, size: "S" as const, toppingIds: [], qty: 2, expectedUnitPrice: p.price }] };
  const result = await creator.createOrder(users[0]!, key, body); assert.equal(result.httpStatus, 201); assert("id" in result.body);
  const saved = await inspect(result.body.id); assert.equal(saved.checkoutPolicyVersion, 2); assert.equal(saved.reservations[0]!.qty, 2); assert(saved.paymentDeadline);
  const ledger = await db.orderRequest.findUniqueOrThrow({ where: { userId_requestKey: { userId: users[0]!, requestKey: key } } });
  assert.equal(ledger.canonicalVersion, 1); assert.equal(ledger.requestHash, saved.requestHash);
  await workflow().cancel(users[0]!, saved.id);
  const replay = await creator.createOrder(users[0]!, key, body); assert.equal(replay.httpStatus, 200); assert.deepEqual(replay.body, result.body);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).reservedStock, 0);
});

test("distinct configurations share one Product hold, and failure on the second Product rolls back the first", async () => {
  const a = await product(4), b = await product(4);
  const body = { schemaVersion: 2 as const, promotionCode: null, expectedTotal: 35000, items: [
    { productId: a.id, size: "S" as const, toppingIds: [], qty: 1, expectedUnitPrice: 10000 },
    { productId: a.id, size: "M" as const, toppingIds: [], qty: 1, expectedUnitPrice: 15000 },
    { productId: b.id, size: "S" as const, toppingIds: [], qty: 1, expectedUnitPrice: 10000 },
  ] };
  const result = await creator.createOrderV2(users[0]!, randomUUID(), body); assert.equal(result.httpStatus, 201); assert("id" in result.body);
  const saved = await inspect(result.body.id); assert.equal(saved.reservations.length, 2);
  assert.equal(saved.reservations.find(r => r.productId === a.id)!.qty, 2);
  const stocks = await db.product.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
  const marker = Error("TEST_SECOND_PRODUCT_WRITE"), before = await balance();
  const wrapped = new Proxy(db, { get(target, field) {
    if (field === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => target.$transaction(tx => {
      let writes = 0;
      return work(new Proxy(tx, { get(transaction, key) {
        if (key === "product") return new Proxy(transaction.product, { get(delegate, method) {
          if (method === "updateMany") return async (args: Prisma.ProductUpdateManyArgs) => { if (++writes === 2) throw marker; return delegate.updateMany(args); };
          const value = Reflect.get(delegate, method); return typeof value === "function" ? value.bind(delegate) : value;
        } });
        const value = Reflect.get(transaction, key); return typeof value === "function" ? value.bind(transaction) : value;
      } }));
    }, options);
    const value = Reflect.get(target, field); return typeof value === "function" ? value.bind(target) : value;
  } });
  await assert.rejects(workflow("SUCCEEDED", wrapped).pay(users[0]!, randomUUID(), { orderId: saved.id, method: "CARD" }), e => e === marker);
  assert.deepEqual(await db.product.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: "asc" } }), stocks);
  assert.equal((await inspect(saved.id)).paymentAttempts.length, 0); assert.equal(await balance(), before);
  await workflow().pay(users[0]!, randomUUID(), { orderId: saved.id, method: "CARD" });
  assert((await inspect(saved.id)).reservations.every(r => r.state === "CONSUMED"));
});

test("promotion integer boundary and expiry preserve the original order total through FAILED and retry", async () => {
  const p = await product(3, 50001), code = `P${randomUUID().replaceAll("-", "").slice(0,25).toUpperCase()}`;
  promotions.push(code);
  await db.promotion.create({ data: { code, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000),
    minimumSubtotal: 50000, type: "PERCENT", value: 10, maxDiscountAmount: 20000 } });
  const body = { schemaVersion: 2 as const, promotionCode: ` ${code.toLowerCase()} `, expectedTotal: 45001,
    items: [{ productId: p.id, size: "S" as const, toppingIds: [], qty: 1, expectedUnitPrice: 50001 }] };
  const key = randomUUID(), result = await creator.createOrderV2(users[0]!, key, body); assert.equal(result.httpStatus, 201); assert("id" in result.body);
  const original = await inspect(result.body.id); assert.equal(original.discountTotal, 5000); assert.equal(original.total, 45001);
  await db.promotion.update({ where: { code }, data: { endsAt: new Date(Date.now() - 1000) } });
  const rejected = await creator.createOrderV2(users[0]!, randomUUID(), body); assert.equal(rejected.httpStatus, 409);
  assert("error" in rejected.body); assert.equal(rejected.body.error.code, "PROMOTION_NOT_APPLICABLE");
  const replay = await creator.createOrderV2(users[0]!, key, { ...body, promotionCode: code }); assert.equal(replay.httpStatus, 200); assert.deepEqual(replay.body, result.body);
  const failKey = randomUUID(); await workflow("FAILED").pay(users[0]!, failKey, { orderId: original.id, method: "CARD" });
  const paid = await workflow().pay(users[0]!, randomUUID(), { orderId: original.id, method: "WALLET" }); assert.equal(paid.amount, 45001);
  const saved = await inspect(original.id); assert.deepEqual(saved.promotionSnapshot, original.promotionSnapshot);
  assert.equal(saved.paymentDeadline!.getTime(), original.paymentDeadline!.getTime()); assert.equal(saved.loyaltyEntry!.points, 4);
  assert.equal((await workflow().pay(users[0]!, failKey, { orderId: original.id, method: "CARD" })).status, "FAILED");
});

test("simultaneous create with one key commits one order and replay converges without a second hold", async () => {
  const p = await product(3), key = randomUUID(), body = { schemaVersion: 2 as const, promotionCode: null, expectedTotal: 10000,
    items: [{ productId: p.id, size: "S" as const, toppingIds: [], qty: 1, expectedUnitPrice: 10000 }] };
  const results = await Promise.allSettled([creator.createOrderV2(users[0]!, key, body), creator.createOrderV2(users[0]!, key, body)]);
  assert.equal(results.filter(r => r.status === "fulfilled" && r.value.httpStatus === 201).length, 1);
  for (const r of results) if (r.status === "rejected") assert(httpCode("ORDER_REQUEST_IN_PROGRESS")(r.reason));
  const replay = await creator.createOrderV2(users[0]!, key, body); assert.equal(replay.httpStatus, 200);
  assert.equal(await db.order.count({ where: { userId: users[0], requestKey: key } }), 1);
  assert.equal(await db.orderRequest.count({ where: { userId: users[0], requestKey: key } }), 1);
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: p.id } })).reservedStock, 1);
});

test("a new failed retry uses the logical PENDING edge once; cancel releases its original hold", async () => {
  const o = await order(2), api = workflow("FAILED"), before = await balance(), keys = [randomUUID(), randomUUID()];
  const original = await inspect(o.id);
  for (const key of keys) assert.equal((await api.pay(o.userId, key, { orderId: o.id, method: "CARD" })).status, "FAILED");
  const failed = await inspect(o.id); assert.equal(failed.version, 2); assert.equal(failed.status, "PAYMENT_FAILED");
  assert.equal(failed.paymentAttempts.length, 2); assert.equal(failed.paymentDeadline!.getTime(), original.paymentDeadline!.getTime());
  assert.equal(failed.reservations[0]!.state, "ACTIVE"); assert.equal(await balance(), before);
  const canceled = await api.cancel(o.userId, o.id); assert.equal(canceled.version, 3); assert.equal(canceled.status, "CANCELLED");
  assert.equal((await db.product.findUniqueOrThrow({ where: { id: o.productId } })).reservedStock, 0);
  assert.equal((await api.pay(o.userId, keys[0]!, { orderId: o.id, method: "CARD" })).status, "FAILED");
  await assert.rejects(api.pay(o.userId, keys[0]!, { orderId: "different-order", method: "CARD" }), httpCode("IDEMPOTENCY_CONFLICT"));
  assert.equal((await inspect(o.id)).version, 3);
});
