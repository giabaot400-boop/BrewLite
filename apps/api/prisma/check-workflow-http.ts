import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaService } from "../src/database/prisma.service.js";
import { OrdersService } from "../src/orders/orders.service.js";

assert.equal(process.env.SPRINT3_INTEGRATION_TEST, "1", "Explicit SPRINT3_INTEGRATION_TEST=1 is required.");
const url = new URL(process.env.DATABASE_URL ?? "");
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert(["/brewlite_s2_test", "/brewlite_s3_demo"].includes(url.pathname));
assert(!url.searchParams.has("host") && !url.searchParams.has("hostaddr"));
assert(!url.searchParams.has("schema") || url.searchParams.get("schema") === "public");
const apiDir = fileURLToPath(new URL("..", import.meta.url)), root = path.resolve(apiDir, "../..");
const apiPort = Number(process.env.WORKFLOW_API_PORT ?? 3302), webPort = Number(process.env.WORKFLOW_WEB_PORT ?? 3300);
const api = `http://localhost:${apiPort}`, web = `http://localhost:${webPort}`;
const db = new PrismaService(), creator = new OrdersService(db);
const prefix = `a1-http-${randomUUID()}`, email = `${prefix}@example.invalid`, password = randomUUID() + "A1!";
const emails = [email, `${prefix}-b@example.invalid`], users: string[] = [], children: ChildProcess[] = [];
const productId = `${prefix}-drink`, promotionCode = `A1${randomUUID().replaceAll("-", "").slice(0,20).toUpperCase()}`;
let backend: ChildProcess | undefined, frontend: ChildProcess | undefined, checks = 0;
function check(name: string, action: () => Promise<void>) { return action().then(() => { checks++; console.log(`PASS HTTP/BFF ${checks}: ${name}`); }); }
function start(args: string[], cwd: string, extra: Record<string, string>) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  // Keep server output out of reports: assertions contain only statuses/codes, never tokens or credentials.
  child.stdout?.on("data", chunk => { const line = String(chunk); if (/PASS BROWSER|BROWSER CHECKS/.test(line)) console.log(line.replaceAll(password, "[redacted]")); });
  child.stderr?.resume();
  return child;
}
async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000); timer.unref(); await ended; clearTimeout(timer);
}
async function ready(base: string, child: ChildProcess) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    assert(child.exitCode === null, `Server stopped before readiness (${child.exitCode}).`);
    try { const r = await fetch(base, { signal: AbortSignal.timeout(2000) }); if (r.status < 500) return; } catch { /* bounded readiness retry */ }
    await delay(200);
  }
  throw Error("Server readiness timed out.");
}
async function boot(outcome: "SUCCEEDED" | "FAILED") {
  await stop(backend);
  backend = start(["dist/main.js"], apiDir, { PORT: String(apiPort), FRONTEND_ORIGIN: web,
    MOCK_PAYMENT_OUTCOME: outcome, DEMO_WORKFLOW_ENABLED: "true" });
  await ready(`${api}/health`, backend);
}
async function request(base: string, pathname: string, { method = "GET", body, headers = {} }: { method?: string; body?: unknown; headers?: Record<string,string> } = {}) {
  const response = await fetch(base + pathname, { method, headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}
function body(qty = 1, promo: string | null = null) {
  return { schemaVersion: 2, items: [{ productId, size: "S", toppingIds: [], qty, expectedUnitPrice: 50000 }],
    promotionCode: promo, expectedTotal: promo ? qty * 50000 - Math.min(qty * 5000, 20000) : qty * 50000 };
}
async function main() {
  for (const port of [apiPort, webPort]) {
    assert(Number.isInteger(port) && port > 0 && port <= 65535);
    await new Promise<void>((resolve,reject) => {
      const probe = createServer(); probe.once("error", () => reject(Error(`Test port ${port} is already in use; stop only the test server you own.`)));
      probe.listen(port,"localhost",() => probe.close(error => error ? reject(error) : resolve()));
    });
  }
  await db.$connect();
  const [identity] = await db.$queryRaw<Array<{ name: string; version: string }>>`SELECT current_database() AS name, current_setting('server_version') AS version`;
  assert.equal(`/${identity!.name}`, url.pathname); assert(identity!.version.startsWith("17."));
  await db.product.create({ data: { id: productId, name: "Workflow test drink", description: "Isolated test fixture", imageUrl: "/images/americano.svg", price: 50000, stock: 100 } });
  await db.promotion.create({ data: { code: promotionCode, startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 3600000),
    minimumSubtotal: 50000, type: "PERCENT", value: 10, maxDiscountAmount: 20000 } });
  await boot("FAILED");
  const tokens: string[] = [];
  for (const address of emails) {
    const registered = await request(api, "/auth/register", { method: "POST", body: { email: address, password } });
    assert.equal(registered.status, 201); users.push(registered.body.user.id);
    const login = await request(api, "/auth/login", { method: "POST", body: { email: address, password } });
    assert.equal(login.status, 200); tokens.push(login.body.token);
  }
  const bearer = { Authorization: `Bearer ${tokens[0]}` }, other = { Authorization: `Bearer ${tokens[1]}` };
  const create = async (payload = body(), headers = bearer) => {
    const result = await request(api, "/orders", { method: "POST", body: payload, headers: { ...headers, "Idempotency-Key": randomUUID() } });
    assert.equal(result.status, 201, `Create failed: ${result.body?.error?.code}`); return result.body.id as string;
  };
  const o = await create(), key = randomUUID(), paymentBody = { orderId: o, method: "CARD" };
  await check("FAILED is HTTP 200; holds/points preserved; UI-only fields cannot control payment", async () => {
    for (const extra of [{ amount: 1 }, { outcome: "SUCCEEDED" }, { status: "PAID" }, { mode: "success" }]) {
      const invalid = await request(api, "/payments", { method: "POST", body: { ...paymentBody, ...extra }, headers: { ...bearer, "Idempotency-Key": key } });
      assert.equal(invalid.status, 400); assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
    }
    const failed = await request(api, "/payments", { method: "POST", body: paymentBody, headers: { ...bearer, "Idempotency-Key": key } });
    assert.equal(failed.status, 200); assert.equal(failed.body.status, "FAILED"); assert.equal(failed.body.failureCode, "PAYMENT_DECLINED");
    const saved = await db.order.findUniqueOrThrow({ where: { id: o }, include: { reservations: true, loyaltyEntry: true } });
    assert.equal(saved.status, "PAYMENT_FAILED"); assert.equal(saved.loyaltyEntry, null); assert.equal(saved.reservations[0]!.state, "ACTIVE");
  });
  await boot("SUCCEEDED");
  await check("restart config changes do not change old key; new key pays same order once", async () => {
    const old = await request(api, "/payments", { method: "POST", body: paymentBody, headers: { ...bearer, "Idempotency-Key": key } });
    assert.equal(old.body.status, "FAILED");
    const success = await request(api, "/payments", { method: "POST", body: paymentBody, headers: { ...bearer, "Idempotency-Key": randomUUID() } });
    assert.equal(success.status, 200); assert.equal(success.body.status, "SUCCEEDED"); assert.equal(success.body.amount, 50000);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users[0] } })).loyaltyPoints, 5);
    const oldAgain = await request(api, "/payments", { method: "POST", body: paymentBody, headers: { ...bearer, "Idempotency-Key": key } });
    assert.equal(oldAgain.body.id, old.body.id); assert.equal(oldAgain.body.status, "FAILED");
  });
  await check("authorization, exact DTO/key validation and empty history query", async () => {
    assert.equal((await request(api, "/payments", { method: "POST", body: paymentBody, headers: { "Idempotency-Key": randomUUID() } })).status, 401);
    for (const payload of [null, [], {}, { ...paymentBody, method: "CASH" }, { ...paymentBody, orderId: 42 }]) {
      assert.equal((await request(api, "/payments", { method: "POST", body: payload, headers: { ...bearer, "Idempotency-Key": randomUUID() } })).status, 400);
    }
    assert.equal((await request(api, "/payments", { method: "POST", body: paymentBody, headers: { ...bearer, "Idempotency-Key": "bad" } })).status, 400);
    for (const endpoint of [`/orders/${o}`, `/orders/${o}/cancel`, "/payments"]) {
      const r = await request(api, endpoint, endpoint.endsWith("cancel") ? { method: "POST", body: {}, headers: other }
        : endpoint === "/payments" ? { method: "POST", body: paymentBody, headers: { ...other, "Idempotency-Key": randomUUID() } } : { headers: other });
      assert.equal(r.status, 404); assert.equal(r.body.error.code, "RESOURCE_NOT_FOUND");
    }
    const empty = await request(api, "/orders/me", { headers: other }); assert.deepEqual(empty.body.items, []);
    assert.equal((await request(api, "/orders/me?page=1", { headers: bearer })).status, 400);
  });
  await check("exact cancel body, full refund and repeated cancel do not repeat effects", async () => {
    for (const invalid of [null, [], { reason: "CUSTOMER_REQUEST" }]) assert.equal((await request(api, `/orders/${o}/cancel`, { method: "POST", body: invalid, headers: bearer })).status, 400);
    const result = await request(api, `/orders/${o}/cancel`, { method: "POST", body: {}, headers: bearer });
    assert.equal(result.status, 200); assert.equal(result.body.status, "CANCELLED"); assert.equal(result.body.latestPayment.refundedAmount, 50000);
    const repeated = await request(api, `/orders/${o}/cancel`, { method: "POST", body: {}, headers: bearer });
    assert.equal(repeated.body.version, result.body.version); assert.equal(repeated.body.latestPayment.version, 1);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: users[0] } })).loyaltyPoints, 0);
  });
  await check("startup catch-up expires only eligible policy2; legacy and paid order stay intact", async () => {
    const expired = await create(); await db.order.update({ where: { id: expired }, data: { paymentDeadline: new Date(Date.now() - 1000) } });
    const paid = await create(); await request(api, "/payments", { method: "POST", body: { orderId: paid, method: "WALLET" }, headers: { ...bearer, "Idempotency-Key": randomUUID() } });
    const legacy = await db.order.create({ data: { userId: users[0]!, requestKey: randomUUID(), requestHash: "isolated-legacy", subtotal: 1, total: 1 } });
    await boot("SUCCEEDED");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: expired } })).cancelReason, "PAYMENT_WINDOW_EXPIRED");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: paid } })).status, "PAID");
    assert.equal((await db.order.findUniqueOrThrow({ where: { id: legacy.id } })).version, 0);
  });
  await check("compiled demo CLI validates the flag and advances only the three paid workflow edges", async () => {
    const id = await create(); await request(api,"/payments",{method:"POST",body:{orderId:id,method:"CARD"},headers:{...bearer,"Idempotency-Key":randomUUID()}});
    async function cli(target: string, enabled: string) {
      const child = start(["dist/orders/demo-advance.js", id, target],apiDir,{DEMO_WORKFLOW_ENABLED:enabled});
      return new Promise(resolve=>child.once("exit",resolve));
    }
    assert.equal(await cli("PREPARING","false"),1); assert.equal(await cli("READY","true"),1);
    for(const state of ["PREPARING","READY","COMPLETED"]) { assert.equal(await cli(state,"true"),0); assert.equal((await db.order.findUniqueOrThrow({where:{id}})).status,state); }
    assert.equal((await db.order.findUniqueOrThrow({where:{id}})).version,4);
    assert.equal((await request(api,`/orders/${id}/cancel`,{method:"POST",body:{},headers:bearer})).status,409);
  });
  frontend = start([path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "localhost", "-p", String(webPort)], path.join(root,"apps/web"), {
    APP_ORIGIN: web, BACKEND_INTERNAL_URL: api, CHECKOUT_V2_ENABLED: "1", NEXT_TELEMETRY_DISABLED: "1",
  });
  await ready(`${web}/api/products`, frontend);
  const headers = { "Content-Type": "application/json", Origin: web, "X-BrewLite-Request": "1" };
  const session = await request(web, "/api/auth/login", { method: "POST", body: { email, password }, headers });
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie")?.split(";", 1)[0]; assert(cookie);
  const binding = session.headers.get("x-brewlite-session-binding"); assert(binding);
  const postHeaders = { ...headers, Cookie: cookie, "X-BrewLite-Expected-Owner": users[0]! };
  await check("real BFF cookie authentication, origin and expected-owner guards", async () => {
    const r = await request(web, "/api/payments", { method: "POST", body: { orderId: o, method: "WALLET" }, headers: { ...postHeaders, "X-BrewLite-Expected-Owner": users[1]!, "Idempotency-Key": randomUUID() } });
    assert.equal(r.status, 403);
    assert.equal((await request(web,"/api/payments", { method:"POST",body:paymentBody,headers:{...postHeaders,Origin:"https://bad.invalid","Idempotency-Key":randomUUID()} })).status,403);
    const wrongBinding = await request(web, "/api/orders/me", { headers: { Cookie: cookie, "X-BrewLite-Expected-Session": "0".repeat(64) } });
    assert.equal(wrongBinding.status, 403);
    const history = await request(web, "/api/orders/me", { headers: { Cookie: cookie, "X-BrewLite-Expected-Session": binding } });
    assert.equal(history.status, 200); assert(history.body.items.length >= 3); assert(history.headers.get("cache-control")?.includes("no-store"));
  });
  await check("BFF create promotion, payment, exact-key replay and full refund", async () => {
    const createKey = randomUUID(), payload = body(2, promotionCode);
    const created = await request(web, "/api/orders", { method: "POST", body: payload, headers: { ...postHeaders, "Idempotency-Key": createKey } });
    assert.equal(created.status, 201); assert.equal(created.body.total, 90000);
    const id = created.body.id, payKey = randomUUID();
    const payment = await request(web, "/api/payments", { method: "POST", body: { orderId: id, method: "WALLET" }, headers: { ...postHeaders, "Idempotency-Key": payKey } });
    assert.equal(payment.status, 200); assert.equal(payment.body.status, "SUCCEEDED"); assert.equal(payment.body.amount, 90000);
    const replay = await request(web, "/api/payments", { method: "POST", body: { orderId: id, method: "WALLET" }, headers: { ...postHeaders, "Idempotency-Key": payKey } });
    assert.equal(replay.body.id, payment.body.id);
    const detail = await request(web, `/api/orders/${id}`, { headers: { Cookie: cookie, "X-BrewLite-Expected-Session": binding } });
    assert.equal(detail.body.status, "PAID"); assert.equal(detail.body.loyaltyPointsEarned, 9);
    assert.equal((await request(web,"/api/orders",{method:"POST",body:payload,headers:{...postHeaders,"Idempotency-Key":createKey}})).body.status,"PENDING");
    const cancelled = await request(web, `/api/orders/${id}/cancel`, { method: "POST", body: {}, headers: postHeaders });
    assert.equal(cancelled.status, 200); assert.equal(cancelled.body.loyaltyPointsReversed, 9); assert.equal(cancelled.body.latestPayment.refundedAmount, 90000);
  });
  await check("no-attempt terminal marker is only returned when the exact payment key has no attempt", async () => {
    const id = await create(), k = randomUUID();
    await request(api, `/orders/${id}/cancel`, { method: "POST", body: {}, headers: bearer });
    const r = await request(api,"/payments",{method:"POST",body:{orderId:id,method:"CARD"},headers:{...bearer,"Idempotency-Key":k}});
    assert.equal(r.status,409); assert.equal(r.body.error.details.reason,"NO_ATTEMPT_TERMINAL_ORDER");
    assert.equal(r.body.error.details.orderId,id); assert.equal(await db.paymentAttempt.count({where:{userId:users[0],requestKey:k}}),0);
  });
  if (process.env.A1_BROWSER_TEST === "1") {
    const child = start([path.join(root,"apps/web/scripts/check-workflow-browser.mjs")], root, { A1_TEST_WEB: web, A1_TEST_EMAIL: email, A1_TEST_PASSWORD: password,
      A1_TEST_PRODUCT: productId });
    const code = await new Promise(resolve => child.once("exit", resolve)); assert.equal(code,0,"Browser checks failed."); checks++;
  }
  console.log(`WORKFLOW HTTP/BFF CHECKS: ${checks}/${checks} PASSED (real PostgreSQL/Nest/Next production)`);
}
try { await main(); }
catch (error) { console.error(error instanceof Error ? error.message : "Workflow HTTP checks failed."); process.exitCode = 1; }
finally {
  await Promise.all(children.map(child => stop(child)));
  try {
    // Delete only users created by this run, including any browser-created orders of these users.
    await db.$transaction(async tx => {
      await tx.paymentAttempt.deleteMany({where:{userId:{in:users}}}); await tx.loyaltyEntry.deleteMany({where:{userId:{in:users}}});
      await tx.stockReservation.deleteMany({where:{order:{userId:{in:users}}}});
      await tx.orderItemTopping.deleteMany({where:{orderItem:{order:{userId:{in:users}}}}});
      await tx.orderItem.deleteMany({where:{order:{userId:{in:users}}}}); await tx.orderRequest.deleteMany({where:{userId:{in:users}}});
      await tx.order.deleteMany({where:{userId:{in:users}}}); await tx.authSession.deleteMany({where:{userId:{in:users}}});
      await tx.user.deleteMany({where:{id:{in:users}}}); await tx.product.deleteMany({where:{id:productId}});
      await tx.promotion.deleteMany({where:{code:promotionCode}});
    },{timeout:10000});
    console.log("HTTP fixture cleanup completed.");
  } finally { await db.$disconnect(); }
}
