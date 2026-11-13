import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma, type OrderStatus } from "../generated/prisma/client.js";
import { assertTransition, canonicalizePayment, evaluateMock } from "./order-workflow.js";
import { MockPaymentService } from "./mock-payment.service.js";
import { isRetryableWorkflowError, runWorkflowTransaction } from "./workflow-transaction.js";
import { StockConflict } from "../database/stock.js";
import type { PrismaService } from "../database/prisma.service.js";

const statuses: OrderStatus[] = ["PENDING", "PAYMENT_FAILED", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"];
const allowed = new Set(["PENDING:PAYMENT_FAILED", "PENDING:PAID", "PENDING:CANCELLED", "PAYMENT_FAILED:PENDING",
  "PAYMENT_FAILED:CANCELLED", "PAID:PREPARING", "PAID:CANCELLED", "PREPARING:READY", "READY:COMPLETED"]);
for (const from of statuses) for (const to of statuses) test(`state machine ${from} -> ${to}`, () => {
  if (allowed.has(`${from}:${to}`)) assert.doesNotThrow(() => assertTransition(from, to));
  else assert.throws(() => assertTransition(from, to), error => (error as { getStatus(): number }).getStatus() === 409);
});

test("payment canonical has stable field order, namespace content and method/order sensitivity", () => {
  const a = canonicalizePayment("id %/ opaque", "WALLET");
  assert.equal(a.canonical, '{"version":1,"orderId":"id %/ opaque","method":"WALLET"}');
  assert.equal(a.requestHash.length, 64);
  assert.notEqual(a.requestHash, canonicalizePayment("id %/ opaque", "CARD").requestHash);
  assert.notEqual(a.requestHash, canonicalizePayment("other", "WALLET").requestHash);
});
test("mock uses backend startup configuration and rejects an invalid configuration", () => {
  const previous = process.env.MOCK_PAYMENT_OUTCOME;
  try {
    process.env.MOCK_PAYMENT_OUTCOME = "FAILED"; const failed = new MockPaymentService();
    process.env.MOCK_PAYMENT_OUTCOME = "SUCCEEDED";
    assert.equal(failed.evaluate("WALLET"), "FAILED"); assert.equal(failed.evaluate("CARD"), "FAILED");
    assert.equal(new MockPaymentService().evaluate("CARD"), "SUCCEEDED");
    process.env.MOCK_PAYMENT_OUTCOME = "invalid"; assert.throws(() => new MockPaymentService());
    assert.equal(evaluateMock("CARD", "SUCCEEDED"), "SUCCEEDED");
  } finally { if (previous === undefined) delete process.env.MOCK_PAYMENT_OUTCOME; else process.env.MOCK_PAYMENT_OUTCOME = previous; }
});
const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError("Test error", { code, clientVersion: "7.10.1", meta });
test("retry classifier admits conflicts and only named payment uniqueness constraints", () => {
  for (const error of [new StockConflict(), known("P2034"), known("P2010", { code: "40001" }), known("P2010", { code: "40P01" }),
    known("P2010", { driverAdapterError: { cause: { originalCode: "40001" } } }),
    known("P2002", { target: "payment_attempts_one_success_per_order" }),
    known("P2002", { modelName: "PaymentAttempt", target: ["user_id", "request_key"] })]) assert.equal(isRetryableWorkflowError(error), true);
  for (const error of [new Error("40001"), known("P2003"), known("P2028"), known("P2002", { target: ["id"] }),
    known("P2002", { target: "users_email_key" }), known("P2010", { code: "23514" })]) assert.equal(isRetryableWorkflowError(error), false);
});
test("one retry loop runs at most three transactions and propagates non-conflicts", async () => {
  let attempts = 0;
  const prisma = { async $transaction() { attempts++; throw new StockConflict(); } } as unknown as PrismaService;
  await assert.rejects(runWorkflowTransaction(prisma, async () => null), error => (error as { getStatus(): number }).getStatus() === 503);
  assert.equal(attempts, 3);
  attempts = 0;
  const failure = new Error("write failed");
  const failing = { async $transaction() { attempts++; throw failure; } } as unknown as PrismaService;
  await assert.rejects(runWorkflowTransaction(failing, async () => null), error => error === failure); assert.equal(attempts, 1);
});
