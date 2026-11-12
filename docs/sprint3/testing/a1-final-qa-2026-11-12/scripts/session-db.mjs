import 'reflect-metadata';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {PrismaService} from './dist/database/prisma.service.js';
import {OrdersReaderService} from './dist/orders/orders-reader.service.js';
import {OrderWorkflowService} from './dist/orders/order-workflow.service.js';
// f, action and input are supplied as constants on stdin by the bounded host runner.
assert(/^a1-session-[0-9a-f-]{36}$/.test(f.runId));assert.deepEqual(f.users,[f.runId+'-u0',f.runId+'-u1']);assert.deepEqual(f.products,[f.runId+'-p0',f.runId+'-p1']);
const url=new URL(process.env.DATABASE_URL);assert(!url.searchParams.has('host')&&!url.searchParams.has('hostaddr'));assert(!url.searchParams.has('schema')||url.searchParams.get('schema')==='public');
if(process.env.A1_CLOSEOUT_LOCAL_TEST==='1'){assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/brewlite_s2_test');}else{assert.equal(url.hostname,'db');assert.equal(url.port,'5432');assert.equal(url.pathname,'/brewlite_s3_demo');}
const db=new PrismaService();
try{
 await db.$connect();const [identity]=await db.$queryRawUnsafe("SELECT current_database() AS name,current_setting('server_version') AS version");assert('/'+identity.name===url.pathname&&identity.version.startsWith('17.'));
 const inventory=()=>db.product.findMany({where:{id:{notIn:f.products}},orderBy:{id:'asc'},select:{id:true,price:true,stock:true,reservedStock:true,stockVersion:true}});let result;
 if(action==='baseline')result={database:identity,inventory:await inventory()};
 else if(action==='init'){
  const hash=await bcrypt.hash(f.password,12);for(let i=0;i<2;i++)await db.user.create({data:{id:f.users[i],email:f.emails[i],passwordHash:hash}});
  for(let i=0;i<2;i++)await db.product.create({data:{id:f.products[i],name:i?'AC Session Drink B':'AC Session Drink A',description:'Isolated browser fixture',imageUrl:'/images/americano.svg',price:i?60000:50000,stock:100}});result={initialized:true};
 }else if(action==='inspect'){
  const orders=await db.order.findMany({where:{userId:{in:f.users}},orderBy:{id:'asc'},select:{id:true,userId:true,requestKey:true,status:true,total:true,version:true,paymentDeadline:true}});
  const payments=await db.paymentAttempt.findMany({where:{userId:{in:f.users}},orderBy:{id:'asc'},select:{id:true,orderId:true,requestKey:true,status:true,amount:true}});result={orders,payments};
 }else if(action==='expire'){
  const order=await db.order.findFirstOrThrow({where:{id:input.orderId,userId:{in:f.users}},include:{items:true}});assert.equal(order.checkoutPolicyVersion,2);assert(['PENDING','PAYMENT_FAILED'].includes(order.status));assert(order.items.every(item=>f.products.includes(item.productId)));
  await db.order.update({where:{id:order.id},data:{paymentDeadline:new Date(Date.now()-1000)}});
  const api=new OrderWorkflowService(db,new OrdersReaderService(db),{evaluate:()=>{throw Error('Expiry must not evaluate a payment');}});await api.expireOrder(order.id);const saved=await db.order.findUniqueOrThrow({where:{id:order.id}});assert.equal(saved.cancelReason,'PAYMENT_WINDOW_EXPIRED');result={id:order.id,status:saved.status};
 }else if(action==='revoke'){
  assert(f.users.includes(input.userId));const changed=await db.authSession.updateMany({where:{userId:input.userId,revokedAt:null},data:{revokedAt:new Date()}});result={revoked:changed.count};
 }else if(action==='cleanup'){
  await db.$transaction(async tx=>{await tx.paymentAttempt.deleteMany({where:{userId:{in:f.users}}});await tx.loyaltyEntry.deleteMany({where:{userId:{in:f.users}}});await tx.stockReservation.deleteMany({where:{order:{userId:{in:f.users}}}});await tx.orderItemTopping.deleteMany({where:{orderItem:{order:{userId:{in:f.users}}}}});await tx.orderItem.deleteMany({where:{order:{userId:{in:f.users}}}});await tx.orderRequest.deleteMany({where:{userId:{in:f.users}}});await tx.order.deleteMany({where:{userId:{in:f.users}}});await tx.authSession.deleteMany({where:{userId:{in:f.users}}});await tx.user.deleteMany({where:{id:{in:f.users}}});await tx.product.deleteMany({where:{id:{in:f.products}}});},{timeout:10000});assert.equal(await db.user.count({where:{id:{in:f.users}}}),0);assert.equal(await db.product.count({where:{id:{in:f.products}}}),0);result={cleaned:true,inventory:await inventory()};
 }else throw Error('Unknown fixture action');
 console.log('SESSION_DB_RESULT='+JSON.stringify(result));
}finally{await db.$disconnect();}
