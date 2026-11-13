import 'reflect-metadata';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
import {PrismaClient} from './dist/generated/prisma/client.js';
import {OrdersService} from './dist/orders/orders.service.js';
import {OrdersReaderService} from './dist/orders/orders-reader.service.js';
import {OrderWorkflowService} from './dist/orders/order-workflow.service.js';
import {canonicalizeOrder} from './dist/orders/order-canonical.js';
const url=new URL(process.env.DATABASE_URL);assert(!url.searchParams.has('host')&&!url.searchParams.has('hostaddr'));assert(!url.searchParams.has('schema')||url.searchParams.get('schema')==='public');
if(process.env.A1_CLOSEOUT_LOCAL_TEST==='1'){assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/brewlite_s2_test');}else{assert.equal(url.hostname,'db');assert.equal(url.port,'5432');assert.equal(url.pathname,'/brewlite_s3_demo');}
const schema='a1_legacy_'+randomUUID().replaceAll('-',''),quote=s=>{assert(/^[a-zA-Z0-9_]+$/.test(s));return '"'+s+'"';};
const client=new pg.Client({connectionString:process.env.DATABASE_URL,options:'-c timezone=UTC'});
const report={schema,scope:'exact S1/S2/S3 migration SQL in a fresh isolated schema; legacy replay with compiled services',passed:false,cleanup:false},tables=['products','toppings','product_toppings','users','auth_sessions','orders','order_items','order_item_toppings','order_requests'];
let created=false,orm;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const code=c=>e=>e?.getResponse?.()?.error?.code===c;
const paths=['20261024160346_init_products','20261030152601_sprint2_auth_orders','20261109010714_sprint3_payment_stock'];
try{
 await client.connect();const identity=(await client.query("SELECT current_database() AS name,current_setting('server_version') AS version")).rows[0];assert('/'+identity.name===url.pathname&&identity.version.startsWith('17.'));report.database=identity;
 const files=paths.map(p=>{const sql=fs.readFileSync('./prisma/migrations/'+p+'/migration.sql','utf8');assert(!/\bpublic\s*\./i.test(sql));assert(!/\b(?:CREATE|DROP|ALTER)\s+(?:DATABASE|SCHEMA)\b|\bsearch_path\b/i.test(sql));return {name:p,sql,sha256:createHash('sha256').update(sql).digest('hex')};});report.migrations=files.map(({name,sha256})=>({name,sha256}));
 await client.query('CREATE SCHEMA '+quote(schema));created=true;await client.query('SET search_path TO '+quote(schema));assert.equal((await client.query('SELECT current_schema() AS name')).rows[0].name,schema);
 for(const f of files.slice(0,2))await client.query(f.sql);
 const user='legacy-user',product='legacy-drink',key=randomUUID(),rejectedKey=randomUUID(),pendingKey=randomUUID();
 const payload={items:[{productId:product,size:'S',toppingIds:[],qty:1,expectedUnitPrice:10000}]},hash=canonicalizeOrder(payload).requestHash;
 const rejectedPayload={items:[{productId:product,size:'M',toppingIds:[],qty:1,expectedUnitPrice:14000},{productId:product,size:'S',toppingIds:[],qty:1,expectedUnitPrice:9000}]},rejectedHash=canonicalizeOrder(rejectedPayload).requestHash;
 const success={id:'legacy-success',status:'PENDING',total:10000},rejection={error:{code:'VALIDATION_ERROR',message:'Legacy fixture rejection',fieldErrors:{'items[0].expectedUnitPrice':['Legacy field error']}}};
 await client.query('INSERT INTO products(id,name,description,price,image_url) VALUES($1,$2,$3,$4,$5)',[product,'Legacy drink','Preserved fixture',10000,'/test.svg']);
 await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",[user,'legacy@example.invalid','TEST_ONLY_NOT_A_LOGIN_HASH']);
 for(const [id,k] of [['legacy-success',key],['legacy-pending',pendingKey]]){
  await client.query('INSERT INTO orders(id,user_id,total,request_key,request_hash) VALUES($1,$2,$3,$4,$5)',[id,user,10000,k,hash]);
  await client.query('INSERT INTO order_items(id,order_id,product_id,product_name,size,base_price,size_extra_price,unit_price,qty,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id+'-item',id,product,'Legacy drink','S',10000,0,10000,1,10000]);
 }
 await client.query("INSERT INTO order_requests(id,user_id,request_key,request_hash,state,order_id,http_status,response_json) VALUES($1,$2,$3,$4,'SUCCEEDED',$5,201,$6::jsonb)",['ledger-success',user,key,hash,'legacy-success',JSON.stringify(success)]);
 await client.query("INSERT INTO order_requests(id,user_id,request_key,request_hash,state,http_status,response_json) VALUES($1,$2,$3,$4,'REJECTED',400,$5::jsonb)",['ledger-rejected',user,rejectedKey,rejectedHash,JSON.stringify(rejection)]);
 const columns={};for(const table of tables)columns[table]=(await client.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[schema,table])).rows.map(r=>r.column_name);
 async function originalRows(){const result={};for(const table of tables){const rows=(await client.query('SELECT row_to_json(t) AS row FROM (SELECT '+columns[table].map(quote).join(',')+' FROM '+quote(table)+') t')).rows.map(r=>r.row);result[table]=rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}return result;}
 const before=await originalRows();report.beforeDigest=digest(before);report.rowCounts=Object.fromEntries(tables.map(t=>[t,before[t].length]));
 await client.query(files[2].sql);assert.deepEqual(await originalRows(),before);
 const policies=(await client.query('SELECT id,total,subtotal,checkout_policy_version,payment_deadline,version FROM orders ORDER BY id')).rows;assert.equal(policies.length,2);assert(policies.every(r=>r.total===r.subtotal&&r.checkout_policy_version===1&&r.payment_deadline===null&&r.version===0));
 for(const table of ['stock_reservations','payment_attempts','loyalty_entries'])assert.equal(Number((await client.query('SELECT count(*) AS n FROM '+quote(table))).rows[0].n),0);
 orm=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,options:'-c timezone=UTC -c search_path='+schema},{schema})});await orm.$connect();
 const creator=new OrdersService(orm),reader=new OrdersReaderService(orm),workflow=new OrderWorkflowService(orm,reader,{evaluate:()=>{throw Error('Legacy order must never call payment gateway');}});
 const replay=await creator.createOrder(user,key,payload);assert.equal(replay.httpStatus,200);assert.deepEqual(replay.body,success);
 await assert.rejects(creator.createOrder(user,rejectedKey,rejectedPayload),e=>{assert.equal(e.getStatus(),400);assert.deepEqual(e.getResponse(),rejection);return true;});
 const reversed={items:[...rejectedPayload.items].reverse()};await assert.rejects(creator.createOrder(user,rejectedKey,reversed),e=>e?.getStatus?.()===400&&e.getResponse()?.error?.fieldErrors?.['items[1].expectedUnitPrice']?.[0]==='Legacy field error');
 await assert.rejects(creator.createOrderV2(user,key,{schemaVersion:2,...payload,promotionCode:null,expectedTotal:10000}),code('IDEMPOTENCY_CONFLICT'));
 for(const id of ['legacy-success','legacy-pending']){
  const detail=await reader.getOrderDetail(user,id);assert.equal(detail.canPay,false);assert.equal(detail.canCancel,false);assert.equal(detail.paymentDeadline,null);
  await assert.rejects(workflow.pay(user,randomUUID(),{orderId:id,method:'WALLET'}),code('LEGACY_ORDER_REQUIRES_REVIEW'));await assert.rejects(workflow.cancel(user,id),code('LEGACY_ORDER_REQUIRES_REVIEW'));assert.equal(await workflow.expireOrder(id),false);
 }
 const after=await originalRows();report.afterDigest=digest(after);assert.deepEqual(after,before);report.passed=true;report.assertions={migrationPreservesOriginalColumns:true,legacyPolicy1NoHold:true,successReplay200:true,rejectedReplay400:true,reorderedFieldErrorRemapped:true,v1v2Conflict:true,legacyPayCancelBlocked:true,legacyExpiryIgnored:true};console.log('PASS LEGACY: exact migration SQL preserves original rows/hash/response; compiled replay and read-only policy verified.');
}catch(e){report.error=e.message;report.errorCode=e.getResponse?.()?.error?.code;process.exitCode=1;}
finally{
 try{if(orm)await orm.$disconnect();if(created){await client.query('SET search_path TO pg_catalog');await client.query('DROP SCHEMA '+quote(schema)+' CASCADE');assert.equal((await client.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].n,0);}report.cleanup=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}
 await client.end().catch(()=>{});report.passed=report.passed&&report.cleanup;console.log('LEGACY_DB_RESULT='+JSON.stringify(report));
}
