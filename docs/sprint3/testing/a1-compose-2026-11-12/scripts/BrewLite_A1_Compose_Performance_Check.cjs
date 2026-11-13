#!/usr/bin/env node
'use strict';
// Sequential, warm API measurement against the existing Compose deployment.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {randomUUID,createHash}=require('node:crypto'), {spawnSync}=require('node:child_process'), http=require('node:http');
const root=path.resolve(process.argv[2]||process.cwd()), base='http://localhost:3000';
const reportDir=path.join(path.dirname(__filename),'BrewLite_A1_Compose_Performance_'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(reportDir,{recursive:true});
const warmups=5,samples=30,limitMs=500,runId='a1-perf-'+randomUUID();
const fixture={runId,productId:runId+'-drink',promotionCode:'AP'+randomUUID().replaceAll('-','').slice(0,20).toUpperCase(),password:randomUUID()+'A1!',
 emails:[runId+'@example.invalid',...Array.from({length:warmups+samples},(_,i)=>runId+'-r-'+i+'@example.invalid')]};
const report={helperVersion:1,startedAt:new Date().toISOString(),repo:'giabaot400-boop/BrewLite',passed:false,cleanup:false,requests:[],
 method:{scope:'Windows host to production Next BFF to Nest to PostgreSQL in Compose',warmupIterations:warmups,measuredIterations:samples,concurrency:1,connection:'fresh TCP per request',clock:'performance.now',bodyReadIncluded:true,limitMs,threshold:'every measured response <500 ms; all HTTP assertions must pass',percentile:'nearest-rank'},
 host:{platform:process.platform,release:os.release(),node:process.version,cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,totalMemoryBytes:os.totalmem()}};
const secrets=[fixture.password];
let fixtureStarted=false,baseline,completed=false;
const dockerExe=process.platform==='win32'?'docker.exe':'docker',gitExe=process.platform==='win32'?'git.exe':'git';
const composeArgs=['compose','--env-file',path.join(root,'.env.compose')];
function errorDetails(error){const result=[];for(let e=error,i=0;e&&i<4;e=e.cause,i++)result.push({name:e.name,code:e.code,message:redact(e.message||String(e))});return result;}
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

const dbProgram=String.raw`
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {PrismaService} from './dist/database/prisma.service.js';
const f=FIXTURE_DATA,action=ACTION_DATA;
assert(/^a1-perf-[0-9a-f-]{36}$/.test(f.runId));assert.equal(f.productId,f.runId+'-drink');
assert.deepEqual(f.emails,[f.runId+'@example.invalid',...Array.from({length:35},(_,i)=>f.runId+'-r-'+i+'@example.invalid')]);
const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'db');assert.equal(url.port,'5432');assert.equal(url.pathname,'/brewlite_s3_demo');
assert(!url.searchParams.has('host')&&!url.searchParams.has('hostaddr'));assert(!url.searchParams.has('schema')||url.searchParams.get('schema')==='public');
const db=new PrismaService();
try{
 await db.$connect();const identity=await db.$queryRawUnsafe("SELECT current_database() AS name,current_setting('server_version') AS version,current_setting('TimeZone') AS timezone");
 assert.equal(identity[0].name,'brewlite_s3_demo');assert(identity[0].version.startsWith('17.'));
 const demo=()=>db.product.findMany({where:{id:{not:f.productId}},orderBy:{id:'asc'},select:{id:true,price:true,stock:true,reservedStock:true,stockVersion:true}});
 let result;
 if(action==='baseline')result={database:identity[0],node:process.version,products:await demo(),users:await db.user.count(),orders:await db.order.count()};
 else if(action==='init'){
  assert.equal(await db.user.count({where:{email:{in:f.emails}}}),0);
  await db.product.create({data:{id:f.productId,name:'Compose performance test drink',description:'Isolated performance fixture',price:50000,imageUrl:'/images/americano.svg',stock:100}});
  await db.promotion.create({data:{code:f.promotionCode,active:true,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),minimumSubtotal:50000,type:'PERCENT',value:10,maxDiscountAmount:20000}});
  result={initialized:true};
 }else if(action==='verify'){
  const users=await db.user.findMany({where:{email:{in:f.emails}},select:{id:true,email:true,loyaltyPoints:true}}),ids=users.map(u=>u.id);
  const orders=await db.order.findMany({where:{userId:{in:ids}},include:{paymentAttempts:true,reservations:true,loyaltyEntry:true}});
  const product=await db.product.findUniqueOrThrow({where:{id:f.productId}});
  assert.equal(users.length,36);assert(users.every(u=>u.loyaltyPoints===0));assert.equal(orders.length,35);
  for(const o of orders){assert.equal(o.status,'CANCELLED');assert.equal(o.total,90000);assert.equal(o.paymentAttempts.length,1);
   assert.equal(o.paymentAttempts[0].status,'SUCCEEDED');assert.equal(o.paymentAttempts[0].refundedAmount,90000);
   assert.equal(o.loyaltyEntry.points,9);assert(o.loyaltyEntry.reversedAt);assert(o.reservations.every(r=>r.state==='RETURNED'));}
  assert.equal(product.stock,100);assert.equal(product.reservedStock,0);
  result={users:users.length,orders:orders.length,onePaymentPerOrder:true,fullRefunds:true,pointsReversed:true,stock:product.stock,reservedStock:product.reservedStock};
 }else if(action==='cleanup'){
  await db.$transaction(async tx=>{
   const users=await tx.user.findMany({where:{email:{in:f.emails}},select:{id:true}}),ids=users.map(u=>u.id);
   await tx.paymentAttempt.deleteMany({where:{userId:{in:ids}}});await tx.loyaltyEntry.deleteMany({where:{userId:{in:ids}}});
   await tx.stockReservation.deleteMany({where:{order:{userId:{in:ids}}}});await tx.orderItemTopping.deleteMany({where:{orderItem:{order:{userId:{in:ids}}}}});
   await tx.orderItem.deleteMany({where:{order:{userId:{in:ids}}}});await tx.orderRequest.deleteMany({where:{userId:{in:ids}}});
   await tx.order.deleteMany({where:{userId:{in:ids}}});await tx.authSession.deleteMany({where:{userId:{in:ids}}});await tx.user.deleteMany({where:{id:{in:ids}}});
   await tx.product.deleteMany({where:{id:f.productId}});await tx.promotion.deleteMany({where:{code:f.promotionCode}});
  },{timeout:10000});
  assert.equal(await db.user.count({where:{email:{in:f.emails}}}),0);assert.equal(await db.product.count({where:{id:f.productId}}),0);assert.equal(await db.promotion.count({where:{code:f.promotionCode}}),0);
  result={cleaned:true,products:await demo()};
 }else throw Error('Unknown database action');
 console.log('PERF_DB_RESULT='+JSON.stringify(result));
}finally{await db.$disconnect();}
`;
function db(action){
 const source=dbProgram.replace('FIXTURE_DATA',()=>JSON.stringify(fixture)).replace('ACTION_DATA',()=>JSON.stringify(action));
 const output=dc(['exec','-T','-w','/app/apps/api','backend','node','--input-type=module'],{input:source}).stdout;
 const line=output.split(/\r?\n/).find(l=>l.startsWith('PERF_DB_RESULT='));assert(line,'Missing database hook result');return JSON.parse(line.slice(15));
}
const labels=['POST /api/auth/register','POST /api/auth/login','GET /api/auth/me','GET /api/products','POST /api/orders','POST /api/payments','POST /api/payments (exact-key replay)','GET /api/orders/:id','GET /api/orders/me','POST /api/orders/:id/cancel','POST /api/auth/logout'];
async function measure(label,phase,iteration,endpoint,options,expected){
 const before=report.requests.length;
 try{
  const r=await request(endpoint,options),sample=report.requests[before];Object.assign(sample,{label,phase,iteration,expectedStatus:expected,valid:r.status===expected});
  assert.equal(r.status,expected,label+' unexpected HTTP status');return r;
 }finally{
  if(report.requests[before])Object.assign(report.requests[before],{label,phase,iteration,expectedStatus:expected});
 }
}
function stats(values){
 const xs=[...values].sort((a,b)=>a-b),n=xs.length;if(!n)return null;
 return {min:xs[0],mean:Math.round(xs.reduce((a,b)=>a+b,0)/n*100)/100,p50:xs[Math.ceil(n*.5)-1],p95:xs[Math.ceil(n*.95)-1],max:xs[n-1]};
}
async function main(){
 assert(fs.existsSync(path.join(root,'.env.compose')),'Missing .env.compose');
 report.sha=run(gitExe,['rev-parse','HEAD']).stdout.trim();assert(report.sha.startsWith('88f5f35'),'Expected reviewed source 88f5f35');
 assert.equal(run(gitExe,['status','--porcelain']).stdout.trim(),'','Working tree must be clean before measuring');
 const config=JSON.parse(dc(['config','--format','json']).stdout);secrets.push(config.services.db.environment.POSTGRES_PASSWORD,config.services.backend.environment.AUTH_JWT_SECRET);
 assert.equal(config.name,'brewlite-sprint3');assert.equal(config.services.backend.environment.MOCK_PAYMENT_OUTCOME,'SUCCEEDED');assert.equal(String(config.services.frontend.environment.CHECKOUT_V2_ENABLED),'1');
 assert(!config.services.db.ports?.length&&!config.services.backend.ports?.length);
 const runtime=JSON.parse(dc(['exec','-T','backend','node','-e','console.log(JSON.stringify({outcome:process.env.MOCK_PAYMENT_OUTCOME,node:process.version}))']).stdout.trim());
 assert.equal(runtime.outcome,'SUCCEEDED');report.backendNode=runtime.node;
 report.servicesBefore=healthy();report.docker=run(dockerExe,['--version']).stdout.trim();report.compose=dc(['version']).stdout.trim();report.imageIds={};
 for(const service of ['backend','frontend','db']){const id=dc(['ps','-q',service]).stdout.trim();report.imageIds[service]=run(dockerExe,['inspect','--format','{{.Image}}',id]).stdout.trim();}
 baseline=db('baseline');report.datasetBefore=baseline;fixtureStarted=true;db('init');
 const registered=await request('/api/auth/register',{method:'POST',body:{email:fixture.emails[0],password:fixture.password}});assert.equal(registered.status,201);
 log('Warmup: '+warmups+' full iterations; measured: '+samples+' full iterations; sequential requests, no load concurrency.');
 for(let i=0;i<warmups+samples;i++){
  const phase=i<warmups?'warmup':'measured',iteration=i<warmups?i+1:i-warmups+1;
  const m=(label,endpoint,options={},expected=200)=>measure(label,phase,iteration,endpoint,options,expected);
  await m(labels[0],'/api/auth/register',{method:'POST',body:{email:fixture.emails[i+1],password:fixture.password}},201);
  const login=await m(labels[1],'/api/auth/login',{method:'POST',body:{email:fixture.emails[0],password:fixture.password}});
  const cookie=login.headers.get('set-cookie')?.split(';',1)[0],binding=login.headers.get('x-brewlite-session-binding');assert(cookie&&binding);secrets.push(cookie);
  const auth={id:login.body.user.id,cookie,binding};
  assert.equal((await m(labels[2],'/api/auth/me',{auth})).body.user.id,auth.id);
  const products=await m(labels[3],'/api/products');assert(Array.isArray(products.body)&&products.body.some(p=>p.id===fixture.productId));
  const payload={schemaVersion:2,items:[{productId:fixture.productId,size:'S',toppingIds:[],qty:2,expectedUnitPrice:50000}],promotionCode:fixture.promotionCode,expectedTotal:90000};
  const created=await m(labels[4],'/api/orders',{method:'POST',body:payload,auth,key:randomUUID()},201);assert.equal(created.body.status,'PENDING');assert.equal(created.body.total,90000);
  const id=created.body.id,key=randomUUID(),paymentBody={orderId:id,method:i%2?'CARD':'WALLET'};
  const paid=await m(labels[5],'/api/payments',{method:'POST',body:paymentBody,auth,key});assert.equal(paid.body.status,'SUCCEEDED');assert.equal(paid.body.amount,90000);
  const replay=await m(labels[6],'/api/payments',{method:'POST',body:paymentBody,auth,key});assert.equal(replay.body.id,paid.body.id);
  const detail=await m(labels[7],'/api/orders/'+id,{auth});assert.equal(detail.body.status,'PAID');assert.equal(detail.body.loyaltyPointsEarned,9);
  const history=await m(labels[8],'/api/orders/me',{auth});assert(history.body.items.some(o=>o.id===id));
  const cancelled=await m(labels[9],'/api/orders/'+id+'/cancel',{method:'POST',body:{},auth});assert.equal(cancelled.body.status,'CANCELLED');assert.equal(cancelled.body.latestPayment.refundedAmount,90000);
  await m(labels[10],'/api/auth/logout',{method:'POST',body:{},auth},204);
  log(phase.toUpperCase()+' '+iteration+'/'+(phase==='warmup'?warmups:samples)+' complete');
 }
 report.fixtureVerification=db('verify');report.servicesAfter=healthy();completed=true;
}
(async()=>{
 try{log('COMPOSE API PERFORMANCE START: '+report.startedAt);await main();}
 catch(error){report.error=redact(error.message||String(error));report.errorCauses=errorDetails(error);log('FAIL: '+report.error);process.exitCode=1;}
 finally{
  if(fixtureStarted){try{const cleaned=db('cleanup');assert.equal(cleaned.cleaned,true);assert.deepEqual(cleaned.products,baseline.products,'Demo inventory changed during measurement');report.cleanup=true;report.demoAfter=cleaned.products;log('Performance fixture cleanup completed; demo inventory unchanged.');}
   catch(e){report.cleanupError=redact(e.message);log('CLEANUP FAILED: '+report.cleanupError);process.exitCode=1;}}
  report.summaries=labels.map(label=>{const rs=report.requests.filter(r=>r.label===label&&r.phase==='measured');const errors=rs.filter(r=>!r.valid||r.error).length;
   return {label,n:rs.length,expectedN:samples,errors,underLimit:rs.filter(r=>r.valid&&!r.error&&r.elapsedMs<limitMs).length,latencyMs:stats(rs.map(r=>r.elapsedMs))};});
  report.functionalPassed=completed;report.latencyPassed=completed&&report.summaries.every(s=>s.n===samples&&s.errors===0&&s.underLimit===samples);
  report.passed=report.functionalPassed&&report.latencyPassed&&report.cleanup;report.completedAt=new Date().toISOString();
  if(fixtureStarted&&!report.cleanup)report.remainingFixture={productId:fixture.productId,emails:fixture.emails};
  fs.writeFileSync(path.join(reportDir,'performance-result.json'),JSON.stringify(report,null,2));
  log('Endpoint | n | errors | p50 ms | p95 ms | max ms | <500ms');
  for(const s of report.summaries)log([s.label,s.n,s.errors,s.latencyMs?.p50??'-',s.latencyMs?.p95??'-',s.latencyMs?.max??'-',s.underLimit+'/'+samples].join(' | '));
  log('REPORT: '+reportDir);
  if(report.passed)log('COMPOSE_API_PERFORMANCE_PASSED');else{log('COMPOSE_API_PERFORMANCE_INCOMPLETE_OR_THRESHOLD_NOT_MET');process.exitCode=1;}
 }
})();
