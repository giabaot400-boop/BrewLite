// Manual PostgreSQL checks for Sprint 2 ORDER-08/10. Run from repo root after backend build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const require = createRequire(path.join(root, 'apps/api/package.json'));
const DB = 'brewlite_s2_a_auth_test';
const run = crypto.randomUUID();
const report = { dateUtc: new Date().toISOString(), database: DB,
  method: 'Actual OrdersService from apps/api/dist; actual Prisma/PostgreSQL. Fault injection changes writes inside the real transaction. Two Prisma clients plus one pg control connection hold a private advisory gate before try-lock evaluation; no mocked database errors and no increased transaction timeout. No HTTP/browser or API performance conclusion.',
  checks: [], fixture: { users: [], product: 's2-orders-closeout-' + run, topping: 's2-orders-closeout-topping-' + run },
  races: [], environment: { platform: os.platform(), node: process.version, cpu: os.cpus()[0]?.model } };
let a, b, control;
const pass = (name, details = {}) => { report.checks.push({ name, passed: true, ...details }); console.log('PASS: ' + name); };
const fail = (name, error) => { report.checks.push({ name, passed: false }); console.error('FAIL: ' + name + (error?.code ? ' [' + error.code + ']' : '')); };
const bind = (obj, prop) => { const v = Reflect.get(obj, prop, obj); return typeof v === 'function' ? v.bind(obj) : v; };
function instrument(prisma, wrap, onError = () => {}) {
  return new Proxy(prisma, { get(target, prop) {
    if (prop !== '$transaction') return bind(target, prop);
    return async (callback, options) => {
      assert.equal(options.timeout, 2000);
      assert.equal(options.maxWait, 1000);
      assert.equal(options.isolationLevel, 'RepeatableRead');
      try { return await target.$transaction(tx => callback(wrap(tx)), options); }
      catch (e) { onError(e); throw e; }
    };
  } });
}
async function outcome(action) {
  try { const r = await action(); return { status: r.httpStatus, body: r.body }; }
  catch (e) {
    if (typeof e?.getStatus === 'function') return { status: e.getStatus(), body: e.getResponse() };
    throw e;
  }
}
async function main() {
  const config = require('dotenv').parse(fs.readFileSync(path.join(root, 'apps/api/.env.test')));
  const u = new URL(config.DATABASE_URL);
  assert.equal(u.pathname, '/' + DB, 'Unexpected test database');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(u.hostname), 'Test database must be local');
  process.env.DATABASE_URL = config.DATABASE_URL;
  const compiled = fs.readFileSync(path.join(root, 'apps/api/dist/orders/orders.service.js'));
  assert.ok(compiled.includes(Buffer.from('ORDER_REQUEST_INVARIANT_VIOLATION')), 'Apply fix and rebuild backend first');
  report.ordersDistSha256 = crypto.createHash('sha256').update(compiled).digest('hex');
  report.ordersSourceSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'apps/api/src/orders/orders.service.ts'))).digest('hex');
  try { report.sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch {}
  await import(pathToFileURL(require.resolve('reflect-metadata')).href);
  const load = relative => import(pathToFileURL(path.join(root, 'apps/api/dist', relative)).href);
  const { PrismaService } = await load('database/prisma.service.js');
  const { Prisma } = await load('generated/prisma/client.js');
  const { OrdersService } = await load('orders/orders.service.js');
  const { canonicalizeOrder } = await load('orders/order-canonical.js');
  const { Client } = require('pg');
  control = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await control.connect();
  const info = (await control.query("SELECT current_database() AS name, current_setting('server_version') AS version")).rows[0];
  assert.equal(info.name, DB); report.postgresVersion = info.version;
  a = new PrismaService(); b = new PrismaService();
  await Promise.all([a.$connect(), b.$connect()]);
  const owner = crypto.randomUUID(), other = crypto.randomUUID();
  report.fixture.users.push(owner, other);
  await a.user.createMany({ data: [owner, other].map(id => ({ id, email: 's2-orders-' + id + '@example.test', passwordHash: 'test-fixture-no-auth-login' })) });
  await a.product.create({ data: { id: report.fixture.product, name: '[S2 test] Orders closeout', description: 'Dedicated transaction fixture', price: 25000, imageUrl: '/images/coffee-milk.svg',
    toppings: { create: { topping: { create: { id: report.fixture.topping, name: '[S2 test] Closeout topping', price: 3000 } } } } } });
  const dto = { items: [{ productId: report.fixture.product, size: 'S', toppingIds: [report.fixture.topping], qty: 2, expectedUnitPrice: 28000 }] };
  const service = new OrdersService(a);
  const normalKey = crypto.randomUUID();
  const first = await service.createOrder(owner, normalKey, dto);
  const replay = await service.createOrder(owner, normalKey, dto);
  assert.equal(first.httpStatus, 201); assert.equal(replay.httpStatus, 200); assert.deepEqual(replay.body, first.body);
  const ledger = await a.orderRequest.findUnique({ where: { userId_requestKey: { userId: owner, requestKey: normalKey } }, include: { order: true } });
  assert.equal(ledger.state, 'SUCCEEDED'); assert.equal(ledger.orderId, first.body.id);
  for (const field of ['userId', 'requestKey', 'requestHash']) assert.equal(ledger[field], ledger.order[field]);
  pass('ORDER-08: matching pair commits and replays one order');

  async function atomicCase(kind) {
    const requestKey = crypto.randomUUID(), alteredKey = crypto.randomUUID();
    const ids = [];
    const wrapped = instrument(a, tx => new Proxy(tx, { get(t, prop) {
      if (!['order', 'orderRequest'].includes(prop)) return bind(t, prop);
      const delegate = t[prop];
      return new Proxy(delegate, { get(d, method) {
        if (method !== 'create') return bind(d, method);
        return async args => {
          if (prop === 'orderRequest' && kind === 'between-writes') throw new Error('S2_FORCED_LEDGER_FAILURE');
          const changed = structuredClone(args);
          const side = prop === 'order' ? 'order' : 'ledger';
          if (kind === side + '.userId') changed.data.userId = other;
          if (kind === side + '.requestKey') changed.data.requestKey = alteredKey;
          if (kind === side + '.requestHash') changed.data.requestHash = 'f'.repeat(64);
          const saved = await d.create(changed);
          if (prop === 'order') ids.push(saved.id);
          return saved;
        };
      } });
    } }));
    let caught;
    try { await new OrdersService(wrapped).createOrder(owner, requestKey, dto); } catch (e) { caught = e; }
    assert.equal(caught?.message, kind === 'between-writes' ? 'S2_FORCED_LEDGER_FAILURE' : 'ORDER_REQUEST_INVARIANT_VIOLATION');
    const where = { userId: { in: [owner, other] }, requestKey: { in: [requestKey, alteredKey] } };
    assert.equal(await a.order.count({ where }), 0);
    assert.equal(await a.orderRequest.count({ where }), 0);
    assert.equal(ids.length, 1);
    assert.equal(await a.orderItem.count({ where: { orderId: { in: ids } } }), 0);
    assert.equal(await a.orderItemTopping.count({ where: { orderItem: { orderId: { in: ids } } } }), 0);
    pass('ORDER-08: ' + kind + ' rolls back order, snapshots and ledger');
  }
  for (const kind of ['between-writes', 'order.userId', 'order.requestKey', 'order.requestHash', 'ledger.userId', 'ledger.requestKey', 'ledger.requestHash']) {
    try { await atomicCase(kind); } catch (e) { fail('ORDER-08: ' + kind, e); }
  }

  async function raceCase(rejected) {
    const requestKey = crypto.randomUUID();
    const payload = structuredClone(dto);
    if (rejected) payload.items[0].expectedUnitPrice--;
    const gate = crypto.randomBytes(8).readBigUInt64BE() & ((1n << 63n) - 1n);
    const hi = (gate >> 32n).toString(), lo = (gate & 0xffffffffn).toString();
    const record = { state: rejected ? 'REJECTED' : 'SUCCEEDED', timeout: 2000, maxWait: 1000, attempts: 0, databaseErrors: [], observedWaitingGate: false, firstLockAcquired: false, firstLedgerMissing: false };
    report.races.push(record);
    await control.query('SELECT pg_advisory_lock($1::bigint)', [gate.toString()]);
    let unlocked = false;
    const unlock = async () => { if (!unlocked) { await control.query('SELECT pg_advisory_unlock($1::bigint)', [gate.toString()]); unlocked = true; } };
    const wrapped = instrument(a, tx => {
      const attempt = ++record.attempts;
      let queryCount = 0, ledgerReads = 0;
      return new Proxy(tx, { get(t, prop) {
        if (prop === '$queryRaw') return async (...args) => {
          queryCount++;
          if (attempt !== 1 || queryCount !== 1) return t.$queryRaw(...args);
          assert.ok(Array.isArray(args[0]) && String(args[0]).includes('pg_try_advisory_xact_lock'), 'Expected try-lock as first service statement');
          const lockKey = args[1];
          assert.equal(typeof lockKey, 'bigint');
          // The original try-lock is the first statement. Its snapshot is taken
          // before this private gate waits; its lock expression runs after writer commit.
          const rows = await t.$queryRaw(Prisma.sql`
            WITH gate AS MATERIALIZED (SELECT pg_advisory_xact_lock(${gate}::bigint))
            SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) AS acquired FROM gate
          `);
          record.firstLockAcquired = rows[0]?.acquired === true;
          return rows;
        };
        if (prop === 'orderRequest') return new Proxy(t.orderRequest, { get(d, method) {
          if (method !== 'findUnique') return bind(d, method);
          return async args => {
            const r = await d.findUnique(args);
            if (attempt === 1 && ++ledgerReads === 1) record.firstLedgerMissing = r === null;
            return r;
          };
        } });
        return bind(t, prop);
      } });
    }, e => { if (e?.code) record.databaseErrors.push({ code: e.code, sqlState: e.meta?.driverAdapterError?.cause?.originalCode }); });
    const stale = outcome(() => new OrdersService(wrapped).createOrder(owner, requestKey, payload)).then(value => ({ value }), error => ({ error }));
    let writer, staleResult;
    try {
      const deadline = Date.now() + 900;
      while (Date.now() < deadline) {
        const waiting = await control.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=$1::oid AND objid=$2::oid AND objsubid=1", [hi, lo]);
        if (waiting.rowCount) { record.observedWaitingGate = true; break; }
        const settled = await Promise.race([stale, Promise.resolve(null)]);
        if (settled?.error) throw settled.error;
        await delay(10);
      }
      assert.ok(record.observedWaitingGate, 'Did not observe stale transaction at first SQL statement');
      writer = await outcome(() => new OrdersService(b).createOrder(owner, requestKey, payload));
      assert.equal(writer.status, rejected ? 409 : 201);
      if (rejected) assert.equal(writer.body.error.code, 'PRICE_CHANGED');
      await unlock();
      staleResult = await stale;
    } finally { await unlock(); await stale; }
    if (staleResult.error) throw staleResult.error;
    assert.ok(record.firstLockAcquired && record.firstLedgerMissing);
    assert.ok(record.attempts >= 2 && record.attempts <= 3);
    assert.ok(record.databaseErrors.some(e => ['P2002', 'P2034'].includes(e.code)), 'No real database retry error observed');
    assert.equal(staleResult.value.status, rejected ? 409 : 200);
    assert.deepEqual(staleResult.value.body, writer.body);
    const saved = await b.orderRequest.findUnique({ where: { userId_requestKey: { userId: owner, requestKey } }, include: { order: true } });
    assert.equal(saved.state, record.state);
    assert.equal(saved.requestHash, canonicalizeOrder(payload).requestHash);
    assert.equal(await b.orderRequest.count({ where: { userId: owner, requestKey } }), 1);
    assert.equal(await b.order.count({ where: { userId: owner, requestKey } }), rejected ? 0 : 1);
    if (!rejected) for (const f of ['userId', 'requestKey', 'requestHash']) assert.equal(saved[f], saved.order[f]);
    else assert.equal(saved.orderId, null);
    pass('ORDER-10: stale first try-lock snapshot retries ' + record.state, { attempts: record.attempts, realDatabaseErrors: record.databaseErrors });
  }
  for (const rejected of [false, true]) {
    try { await raceCase(rejected); } catch (e) { fail('ORDER-10: ' + (rejected ? 'REJECTED' : 'SUCCEEDED'), e); }
  }
}
try { await main(); }
catch (e) { fail('setup or baseline check', e); }
finally {
  await Promise.allSettled([a?.$disconnect(), b?.$disconnect(), control?.end()]);
  const passed = report.checks.filter(c => c.passed).length;
  report.functionalPassed = passed === 10 && report.checks.length === 10;
  const output = path.join(os.tmpdir(), 'BrewLite_S2_Orders_Closeout_Result_' + Date.now() + '.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log('ORDERS CLOSEOUT CHECKS: ' + passed + '/10 PASSED');
  console.log('REPORT: ' + output);
  process.exitCode = report.functionalPassed ? 0 : 1;
}
