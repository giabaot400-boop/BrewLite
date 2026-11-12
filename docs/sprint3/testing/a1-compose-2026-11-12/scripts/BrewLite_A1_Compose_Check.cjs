#!/usr/bin/env node
'use strict';
// Checks the existing A1 Compose deployment. No build, seed, reset or host DB access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(process.argv[2] || process.cwd());
const reportDir = path.join(path.dirname(__filename), 'BrewLite_A1_Compose_' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(reportDir, { recursive: true });
const report = { helperVersion: 2, startedAt: new Date().toISOString(), repo: 'giabaot400-boop/BrewLite', groups: [], passed: false, cleanup: false };
const runId = 'a1-docker-' + randomUUID();
const fixture = { runId, productId: runId + '-drink', promotionCode: 'AD' + randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase(),
  emails: [runId + '@example.invalid', runId + '-browser@example.invalid'], password: randomUUID() + 'A1!' };
const secrets = [fixture.password];
let fixtureStarted = false, outcomeDirty = false, stackStopped = false, baseline;
const dockerExe = process.platform === 'win32' ? 'docker.exe' : 'docker';
const gitExe = process.platform === 'win32' ? 'git.exe' : 'git';
const base = 'http://localhost:3000';
const composeArgs = ['compose', '--env-file', path.join(root, '.env.compose')];
function redact(s) { for (const secret of secrets) if (secret) s = String(s).split(secret).join('[redacted]'); return String(s); }
function log(s) { s = redact(s); console.log(s); fs.appendFileSync(path.join(reportDir, 'run.txt'), s + '\n'); }
function run(exe, args, options = {}) {
  const r = spawnSync(exe, args, { cwd: root, encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024,
    timeout: options.timeout || 180000, input: options.input, env: { ...process.env, ...options.env } });
  if (r.error) throw Error('Command could not finish: ' + r.error.code);
  if (!options.allowFailure && r.status !== 0) throw Error('Command failed (exit ' + r.status + '): ' + redact((r.stderr || r.stdout || '').slice(-2200)));
  return r;
}
function dc(args, options) { return run(dockerExe, [...composeArgs, ...args], options); }
function jsonRows(s) { s = s.trim(); if (!s) return []; return s.startsWith('[') ? JSON.parse(s) : s.split(/\r?\n/).filter(Boolean).map(x => JSON.parse(x)); }
function healthy() {
  const rows = jsonRows(dc(['ps', '--format', 'json']).stdout);
  for (const service of ['db', 'backend', 'frontend']) {
    const row = rows.find(x => x.Service === service); assert(row, 'Missing Compose service: ' + service);
    assert.equal(row.State, 'running', service + ' is not running'); assert.equal(row.Health, 'healthy', service + ' is not healthy');
  }
  return rows.map(x => ({ service: x.Service, name: x.Name, state: x.State, health: x.Health, image: x.Image }));
}
function group(name) { report.groups.push({ name, passed: true }); log('PASS COMPOSE ' + report.groups.length + ': ' + name); }
function phase(name) { report.phase = name; log('STEP: ' + name); }
function errorDetails(error) {
  const chain = []; let current = error;
  for (let i = 0; current && i < 4; i++, current = current.cause) {
    chain.push({name:current.name,code:current.code,message:redact(current.message || String(current))});
  }
  return chain;
}
async function readyBff(reason) {
  phase('readiness: ' + reason);
  const until = Date.now() + 30000, probes = [];
  while (Date.now() < until) {
    try {
      const r = await httpOnce(new URL('/api/products',base), {method:'GET',headers:{Accept:'application/json'}}, 4000);
      probes.push({status:r.status});
      if (r.status === 200 && Array.isArray(JSON.parse(r.text))) {
        (report.readiness ||= []).push({reason,probes});
        log('READY: ' + reason + ' (' + probes.length + ' GET probe(s))'); return;
      }
    } catch (e) { probes.push({error:errorDetails(e)}); }
    await delay(250);
  }
  (report.readiness ||= []).push({reason,probes});
  throw Error('BFF readiness timed out after ' + reason);
}
async function setOutcome(outcome) {
  phase('recreate backend with MOCK_PAYMENT_OUTCOME=' + outcome);
  outcomeDirty = true;
  dc(['up', '-d', '--no-deps', '--force-recreate', '--wait', 'backend'], { env: { MOCK_PAYMENT_OUTCOME: outcome } });
  await readyBff('backend outcome ' + outcome);
  outcomeDirty = outcome !== 'SUCCEEDED';
}

// Database hooks run inside the existing backend container using its own configuration.
// They are restricted to this run's UUID fixtures and the expected Docker database.
const dbProgram = String.raw`
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { PrismaService } from './dist/database/prisma.service.js';
const f = FIXTURE_DATA;
assert(/^a1-docker-[0-9a-f-]{36}$/.test(f.runId));
assert.equal(f.productId, f.runId + '-drink');
assert.deepEqual(f.emails, [f.runId + '@example.invalid', f.runId + '-browser@example.invalid']);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'db'); assert.equal(url.port, '5432'); assert.equal(url.pathname, '/brewlite_s3_demo');
assert(!url.searchParams.has('host') && !url.searchParams.has('hostaddr'));
assert(!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public');
const db = new PrismaService();
try {
 await db.$connect();
 const identity = await db.$queryRawUnsafe("SELECT current_database() AS name, current_setting('server_version') AS version");
 assert.equal(identity[0].name, 'brewlite_s3_demo'); assert(identity[0].version.startsWith('17.'));
 const action = ACTION_DATA, arg = ARG_DATA;
 let result;
 const demo = () => db.product.findMany({where:{id:{not:f.productId}},orderBy:{id:'asc'},select:{id:true,price:true,stock:true,reservedStock:true,stockVersion:true}});
 if (action === 'baseline') result = await demo();
 else if (action === 'init') {
  assert.equal(await db.user.count({where:{email:{in:f.emails}}}),0);
  await db.product.create({data:{id:f.productId,name:'Compose workflow test drink',description:'Isolated Compose fixture',imageUrl:'/images/americano.svg',price:50000,stock:100}});
  await db.promotion.create({data:{code:f.promotionCode,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),minimumSubtotal:50000,type:'PERCENT',value:10,maxDiscountAmount:20000}});
  result = { initialized:true };
 } else if (action === 'snapshot') {
  result = {
   product:await db.product.findUnique({where:{id:f.productId}}),
   users:await db.user.findMany({where:{email:{in:f.emails}},orderBy:{email:'asc'},select:{id:true,email:true,loyaltyPoints:true}}),
   orders:await db.order.findMany({where:{user:{email:{in:f.emails}}},orderBy:{id:'asc'},include:{reservations:{orderBy:{id:'asc'}},paymentAttempts:{orderBy:{id:'asc'}},loyaltyEntry:true}})
  };
 } else if (action === 'expire') {
  const order=await db.order.findUniqueOrThrow({where:{id:arg.orderId},include:{user:true}});
  assert(f.emails.includes(order.user.email)); assert.equal(order.status,'PENDING'); assert.equal(order.checkoutPolicyVersion,2);
  await db.order.update({where:{id:order.id},data:{paymentDeadline:new Date(Date.now()-5000)}}); result={expiredFixture:true};
 } else if (action === 'cleanup') {
  await db.$transaction(async tx => {
   const users=await tx.user.findMany({where:{email:{in:f.emails}},select:{id:true}}), ids=users.map(u=>u.id);
   await tx.paymentAttempt.deleteMany({where:{userId:{in:ids}}}); await tx.loyaltyEntry.deleteMany({where:{userId:{in:ids}}});
   await tx.stockReservation.deleteMany({where:{order:{userId:{in:ids}}}});
   await tx.orderItemTopping.deleteMany({where:{orderItem:{order:{userId:{in:ids}}}}});
   await tx.orderItem.deleteMany({where:{order:{userId:{in:ids}}}}); await tx.orderRequest.deleteMany({where:{userId:{in:ids}}});
   await tx.order.deleteMany({where:{userId:{in:ids}}}); await tx.authSession.deleteMany({where:{userId:{in:ids}}});
   await tx.user.deleteMany({where:{id:{in:ids}}});
   await tx.product.deleteMany({where:{id:f.productId}}); await tx.promotion.deleteMany({where:{code:f.promotionCode}});
  },{timeout:10000});
  assert.equal(await db.user.count({where:{email:{in:f.emails}}}),0);
  assert.equal(await db.product.count({where:{id:f.productId}}),0);
  assert.equal(await db.promotion.count({where:{code:f.promotionCode}}),0);
  result={cleaned:true,demo:await demo()};
 } else throw Error('Unknown database action');
 console.log('COMPOSE_DB_RESULT='+JSON.stringify(result));
} finally { await db.$disconnect(); }
`;
function db(action, arg = {}) {
  const source = dbProgram.replace('FIXTURE_DATA', () => JSON.stringify(fixture)).replace('ACTION_DATA', () => JSON.stringify(action)).replace('ARG_DATA', () => JSON.stringify(arg));
  const output = dc(['exec', '-T', '-w', '/app/apps/api', 'backend', 'node', '--input-type=module'], { input: source }).stdout;
  const line = output.split(/\r?\n/).find(x => x.startsWith('COMPOSE_DB_RESULT=')); assert(line, 'Database hook returned no result');
  return JSON.parse(line.slice('COMPOSE_DB_RESULT='.length));
}
// One connection per request. Synchronous Docker commands may outlive a server's
// keep-alive timeout. Mutation requests are sent once and are never auto-retried.
function httpOnce(url, {method,headers,body}, timeoutMs = 20000) {
  return new Promise((resolve,reject) => {
    const req = http.request(url,{method,agent:false,headers:{...headers,Connection:'close'}},res => {
      const chunks=[]; let length=0;
      res.on('data',chunk => { length+=chunk.length; if(length>2*1024*1024) req.destroy(Object.assign(Error('HTTP response too large'),{code:'RESPONSE_TOO_LARGE'})); else chunks.push(chunk); });
      res.on('error',reject);
      res.on('aborted',()=>reject(Object.assign(Error('HTTP response aborted'),{code:'RESPONSE_ABORTED'})));
      res.on('end',()=>{
        const resultHeaders=new Headers();
        for(let i=0;i<res.rawHeaders.length;i+=2) resultHeaders.append(res.rawHeaders[i],res.rawHeaders[i+1]);
        resolve({status:res.statusCode,headers:resultHeaders,text:Buffer.concat(chunks).toString('utf8')});
      });
    });
    const timer=setTimeout(()=>req.destroy(Object.assign(Error('HTTP request timed out'),{code:'HTTP_TIMEOUT'})),timeoutMs);
    req.once('close',()=>clearTimeout(timer)); req.once('error',reject);
    req.end(body);
  });
}
async function request(endpoint, { method = 'GET', body, auth, key, headers = {} } = {}) {
  const started = performance.now();
  const requestInfo={method,path:endpoint.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g,':id')};
  report.lastRequest=requestInfo;
  try {
  const r = await httpOnce(new URL(endpoint,base), { method,
    headers: { ...(body === undefined ? {} : {'Content-Type':'application/json',Origin:base,'X-BrewLite-Request':'1'}),
      ...(auth ? {Cookie:auth.cookie,'X-BrewLite-Expected-Owner':auth.id,'X-BrewLite-Expected-Session':auth.binding} : {}),
      ...(key ? {'Idempotency-Key':key} : {}), ...headers },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
  (report.requests ||= []).push({...requestInfo,status:r.status,elapsedMs:Math.round((performance.now()-started)*100)/100});
  return {status:r.status, body:r.text ? JSON.parse(r.text) : null, headers:r.headers};
  } catch(e) {
    const details=errorDetails(e); (report.requests ||= []).push({...requestInfo,error:details,elapsedMs:Math.round((performance.now()-started)*100)/100});
    throw Error(method+' '+requestInfo.path+' failed: '+details.map(x=>[x.code,x.message].filter(Boolean).join(': ')).join(' <- '),{cause:e});
  }
}
function payload(qty = 1, promo = false) {
  return {schemaVersion:2,items:[{productId:fixture.productId,size:'S',toppingIds:[],qty,expectedUnitPrice:50000}],
    promotionCode:promo ? fixture.promotionCode : null,expectedTotal:qty*50000-(promo ? Math.min(qty*5000,20000) : 0)};
}
async function create(auth, qty = 1, promo = false) {
  const r = await request('/api/orders',{method:'POST',body:payload(qty,promo),auth,key:randomUUID()});
  assert.equal(r.status,201,'Create order HTTP status'); assert.equal(r.body.status,'PENDING'); return r.body;
}
function payment(auth, orderId, key = randomUUID(), method = 'CARD', extra = {}) {
  return request('/api/payments',{method:'POST',body:{orderId,method,...extra},auth,key});
}
function cancel(auth, id) { return request('/api/orders/'+id+'/cancel',{method:'POST',body:{},auth}); }
function detail(auth, id) { return request('/api/orders/'+id,{auth}); }
function own(snapshot, id) { const order=snapshot.orders.find(o=>o.id===id); assert(order,'Fixture order missing'); return order; }

async function main() {
  assert(fs.existsSync(path.join(root,'.env.compose')), 'Missing .env.compose');
  report.sha=run(gitExe,['rev-parse','HEAD']).stdout.trim(); assert(report.sha.startsWith('88f5f35'),'Expected A1 commit 88f5f35');
  assert.equal(run(gitExe,['status','--porcelain']).stdout.trim(),'','Working tree must be clean');
  const runner=path.join(root,'apps/web/scripts/check-workflow-browser.mjs');
  const runnerBytes=Buffer.from(fs.readFileSync(runner,'utf8').replace(/\r\n/g,'\n'),'utf8');
  report.browserRunnerBlob=createHash('sha1').update('blob '+runnerBytes.length+'\0').update(runnerBytes).digest('hex');
  assert.equal(report.browserRunnerBlob,'f9a248160eab2b3ced5647d1c4110ef5e906c32f','Browser runner differs from reviewed commit');
  assert(!process.env.A1_BROWSER_ARGS && !process.env.A1_BROWSER_EXECUTABLE,'Clear custom browser overrides before this check');
  const repoRequire=createRequire(path.join(root,'package.json')), pw=repoRequire('playwright');
  assert(fs.existsSync(pw.chromium.executablePath()),'Chromium is missing. Run npx --no-install playwright install chromium first.');
  const config=JSON.parse(dc(['config','--format','json']).stdout);
  secrets.push(config.services.db.environment.POSTGRES_PASSWORD, config.services.backend.environment.AUTH_JWT_SECRET);
  assert.equal(config.name,'brewlite-sprint3'); assert.equal(String(config.services.frontend.environment.CHECKOUT_V2_ENABLED),'1');
  assert.equal(config.services.backend.environment.MOCK_PAYMENT_OUTCOME,'SUCCEEDED','Start this check with MOCK_PAYMENT_OUTCOME=SUCCEEDED');
  assert(!config.services.db.ports?.length && !config.services.backend.ports?.length,'Database/backend must not publish host ports');
  assert(config.services.frontend.ports.some(p=>String(p.published)==='3000'&&p.host_ip==='127.0.0.1'));
  report.beforeServices=healthy(); report.docker=run(dockerExe,['--version']).stdout.trim(); report.compose=dc(['version']).stdout.trim();
  report.imageIds={}; for(const service of ['backend','frontend','db']) {
    const id=dc(['ps','-q',service]).stdout.trim(); report.imageIds[service]=run(dockerExe,['inspect','--format','{{.Image}}',id]).stdout.trim();
  }
  const runtime=JSON.parse(dc(['exec','-T','frontend','node','-e','console.log(JSON.stringify({checkout:process.env.CHECKOUT_V2_ENABLED,backend:process.env.BACKEND_INTERNAL_URL,origin:process.env.APP_ORIGIN}))']).stdout.trim());
  assert.deepEqual(runtime,{checkout:'1',backend:'http://backend:3001',origin:base});
  await readyBff('initial deployment');
  phase('BFF registration/login and guards');
  baseline=db('baseline'); report.demoBaseline=baseline; fixtureStarted=true; db('init');
  const auths=[];
  for(const email of fixture.emails) {
    const registered=await request('/api/auth/register',{method:'POST',body:{email,password:fixture.password}}); assert.equal(registered.status,201);
    const login=await request('/api/auth/login',{method:'POST',body:{email,password:fixture.password}}); assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie')?.split(';',1)[0], binding=login.headers.get('x-brewlite-session-binding');
    assert(cookie && binding); secrets.push(cookie); auths.push({id:login.body.user.id,cookie,binding});
  }
  const [auth,other]=auths;
  assert.equal((await request('/api/orders/me')).status,401);
  const guarded=await create(auth);
  assert.equal((await payment(auth,guarded.id,randomUUID(),'CARD',{})).status,200);
  assert.equal((await request('/api/payments',{method:'POST',body:{orderId:guarded.id,method:'CARD'},auth:other,key:randomUUID()})).status,404);
  assert.equal((await request('/api/payments',{method:'POST',body:{orderId:guarded.id,method:'CARD'},auth,key:randomUUID(),headers:{Origin:'https://bad.invalid'}})).status,403);
  assert.equal((await request('/api/payments',{method:'POST',body:{orderId:guarded.id,method:'CARD'},auth,key:randomUUID(),headers:{'X-BrewLite-Expected-Owner':other.id}})).status,403);
  assert.equal((await request('/api/orders/me',{auth,headers:{'X-BrewLite-Expected-Session':'0'.repeat(64)}})).status,403);
  assert.equal((await cancel(auth,guarded.id)).status,200);
  group('three healthy services, private DB/backend, real BFF registration/login and access guards');

  phase('payment, replay and refund');
  const order=await create(auth,2,true), key=randomUUID(); assert.equal(order.total,90000);
  const paid=await payment(auth,order.id,key,'WALLET'); assert.equal(paid.status,200); assert.equal(paid.body.status,'SUCCEEDED'); assert.equal(paid.body.amount,90000);
  const replay=await payment(auth,order.id,key,'WALLET'); assert.equal(replay.body.id,paid.body.id);
  let snap=db('snapshot'); assert.equal(own(snap,order.id).paymentAttempts.length,1);
  assert.equal(snap.users.find(u=>u.id===auth.id).loyaltyPoints,9); assert.equal(snap.product.stock,98); assert.equal(snap.product.reservedStock,0);
  const cancelled=await cancel(auth,order.id); assert.equal(cancelled.status,200); assert.equal(cancelled.body.latestPayment.refundedAmount,90000);
  const twice=await cancel(auth,order.id); assert.equal(twice.body.version,cancelled.body.version);
  snap=db('snapshot'); assert.equal(snap.product.stock,100); assert.equal(snap.users.find(u=>u.id===auth.id).loyaltyPoints,0);
  assert(own(snap,order.id).loyaltyEntry.reversedAt); assert.equal(own(snap,order.id).paymentAttempts[0].version,1);
  group('promotion total, successful payment, exact-key replay, points, full refund and repeated cancel');

  phase('FAILED payment and new-key retry');
  const failedOrder=await create(auth), failedKey=randomUUID();
  const deadline=own(db('snapshot'),failedOrder.id).paymentDeadline;
  assert.equal(typeof deadline,'string');
  await setOutcome('FAILED');
  phase('validate payment DTO and record FAILED attempt');
  assert.equal((await payment(auth,failedOrder.id,failedKey,'CARD',{outcome:'SUCCEEDED'})).status,400);
  const failed=await payment(auth,failedOrder.id,failedKey); assert.equal(failed.status,200); assert.equal(failed.body.status,'FAILED');
  snap=db('snapshot'); assert.equal(own(snap,failedOrder.id).status,'PAYMENT_FAILED'); assert.equal(snap.product.stock,100); assert.equal(snap.product.reservedStock,1);
  assert.equal(own(snap,failedOrder.id).loyaltyEntry,null); assert.equal(own(snap,failedOrder.id).paymentDeadline,deadline);
  await setOutcome('SUCCEEDED');
  phase('replay old key and pay with a new key');
  assert.equal((await payment(auth,failedOrder.id,failedKey)).body.status,'FAILED');
  const retry=await payment(auth,failedOrder.id); assert.equal(retry.body.status,'SUCCEEDED');
  snap=db('snapshot'); assert.equal(own(snap,failedOrder.id).paymentAttempts.length,2); assert.equal(snap.product.stock,99); assert.equal(snap.product.reservedStock,0);
  assert.equal(snap.users.find(u=>u.id===auth.id).loyaltyPoints,5);
  assert.equal((await cancel(auth,failedOrder.id)).status,200);
  assert.equal((await payment(auth,failedOrder.id,failedKey)).body.status,'FAILED');
  group('FAILED configuration, preserved hold/deadline, old-key replay after restart and new-key retry');

  phase('terminal no-attempt marker');
  const terminal=await create(auth); assert.equal((await cancel(auth,terminal.id)).status,200);
  const absent=await payment(auth,terminal.id); assert.equal(absent.status,409); assert.equal(absent.body.error.details.reason,'NO_ATTEMPT_TERMINAL_ORDER');
  assert.equal(own(db('snapshot'),terminal.id).paymentAttempts.length,0);
  group('terminal no-attempt marker does not create a payment');

  phase('compiled workflow CLI');
  const cliOrder=await create(auth); assert.equal((await payment(auth,cliOrder.id)).body.status,'SUCCEEDED');
  function cli(state,enabled) { return dc(['exec','-T','-e','DEMO_WORKFLOW_ENABLED='+enabled,'-w','/app/apps/api','backend','node','dist/orders/demo-advance.js',cliOrder.id,state],{allowFailure:true}); }
  assert.equal(cli('PREPARING','false').status,1); assert.equal(cli('READY','true').status,1);
  for(const state of ['PREPARING','READY','COMPLETED']) { assert.equal(cli(state,'true').status,0); assert.equal((await detail(auth,cliOrder.id)).body.status,state); }
  assert.equal((await cancel(auth,cliOrder.id)).status,409);
  group('compiled internal CLI flag, legal state transitions and late-cancel rejection');

  phase('expiry startup catch-up');
  const expiry=await create(auth); db('expire',{orderId:expiry.id});
  dc(['up','-d','--no-deps','--force-recreate','--wait','backend']);
  await readyBff('expiry backend restart');
  const expired=await detail(auth,expiry.id); assert.equal(expired.body.status,'CANCELLED'); assert.equal(expired.body.cancelReason,'PAYMENT_WINDOW_EXPIRED');
  snap=db('snapshot'); assert.equal(snap.product.reservedStock,0); assert.equal(snap.product.stock,99);
  group('backend startup catches up expired policy2 fixture and releases its hold');

  phase('existing browser suite against Compose');
  log('Running existing browser suite against http://localhost:3000 in Compose.');
  const browser=run(process.execPath,[runner],{timeout:240000,env:{A1_TEST_WEB:base,A1_TEST_EMAIL:fixture.emails[1],A1_TEST_PASSWORD:fixture.password,
    A1_TEST_PRODUCT:fixture.productId,A1_TEST_REPORT_DIR:reportDir},allowFailure:true});
  log(browser.stdout || ''); if(browser.stderr) log(browser.stderr);
  assert.equal(browser.status,0,'Browser workflow failed');
  report.browser=JSON.parse(fs.readFileSync(path.join(reportDir,'browser-result.json'),'utf8'));
  assert.equal(report.browser.passed,true); assert.equal(report.browser.checks,9);
  snap=db('snapshot'); const browserOrders=snap.orders.filter(o=>o.userId===other.id); assert.equal(browserOrders.length,1);
  assert.equal(browserOrders[0].status,'CANCELLED'); assert.equal(browserOrders[0].paymentAttempts.length,1);
  assert.equal(browserOrders[0].paymentAttempts[0].refundedAmount,50000); assert.equal(snap.users.find(u=>u.id===other.id).loyaltyPoints,0);
  group('real browser 9/9: login/cart/create/reload/lost response/replay/refund/history/mobile');

  phase('persistent data after three-service stop/start');
  const before=db('snapshot'); stackStopped=true;
  dc(['stop','frontend','backend','db']); dc(['up','-d','--wait']); stackStopped=false;
  await readyBff('three-service stop/start');
  assert.deepEqual(db('snapshot'),before,'Fixture data changed after container stop/start');
  assert.equal((await request('/api/orders/me',{auth})).status,200);
  report.afterServices=healthy();
  group('all three services stop/start with persistent orders, payment ledger, points, stock and session');
}

(async () => {
 try { log('COMPOSE CHECK START (helper v2): '+report.startedAt); await main(); }
 catch(error) { report.error=redact(error.message || String(error)); report.errorCauses=errorDetails(error); log('FAIL ['+report.phase+']: '+report.error); process.exitCode=1; }
 finally {
  if(stackStopped || outcomeDirty) {
   try { dc(['up','-d','--wait'],{env:{MOCK_PAYMENT_OUTCOME:'SUCCEEDED'}}); stackStopped=false; outcomeDirty=false; log('Compose services restored with SUCCEEDED outcome.'); }
   catch(e) { report.restoreError=redact(e.message); log('RESTORE FAILED: '+report.restoreError); process.exitCode=1; }
  }
  if(fixtureStarted && !stackStopped && !outcomeDirty) {
   try {
    const cleaned=db('cleanup'); assert.equal(cleaned.cleaned,true); assert.deepEqual(cleaned.demo,baseline,'Demo product inventory changed during the check');
    report.cleanup=true; report.demoAfter=cleaned.demo; log('Fixture cleanup completed; demo product inventory unchanged.');
   } catch(e) { report.cleanupError=redact(e.message); log('CLEANUP FAILED: '+report.cleanupError); process.exitCode=1; }
  }
  report.completedAt=new Date().toISOString();
  report.passed=!process.exitCode && report.groups.length===8 && report.cleanup;
  if(fixtureStarted && !report.cleanup) report.remainingFixture={productId:fixture.productId,emails:fixture.emails};
  fs.writeFileSync(path.join(reportDir,'compose-result.json'),JSON.stringify(report,null,2));
  log('COMPOSE WORKFLOW CHECKS: '+report.groups.length+'/8 '+(report.passed?'PASSED':'INCOMPLETE/FAILED'));
  log('REPORT: '+reportDir);
  if(report.passed) log('COMPOSE_WORKFLOW_CHECKS_PASSED');
 }
})();
