import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {activateCartV2} from './cart-activation-v2.ts';

test('provider activation starts its writer only after the storage migration commits', async () => {
  let commit; const order=[];
  const cancel=activateCartV2({storage:{migrateToV2:()=>new Promise(resolve=>{order.push('migrate');commit=resolve;})},controller:{start:()=>{order.push('start');return()=>order.push('stop');}},onError:assert.fail});
  await setImmediate();assert.deepEqual(order,['migrate']);commit();await setImmediate();assert.deepEqual(order,['migrate','start']);cancel();assert.deepEqual(order,['migrate','start','stop']);
});
test('failed storage migration exposes its error without starting a v2 writer; a new activation can retry', async () => {
  const quota=Error('quota'),failures=[];let attempts=0,starts=0;
  const ports={storage:{migrateToV2:async()=>{if(++attempts===1)throw quota;}},controller:{start:()=>{starts++;return()=>{};}},onError:error=>failures.push(error)};
  const first=activateCartV2(ports);await setImmediate();assert.equal(starts,0);assert.deepEqual(failures,[quota]);first();const second=activateCartV2(ports);await setImmediate();assert.equal(starts,1);assert.equal(attempts,2);second();
});
test('unmounted provider cannot start its writer when an earlier migration finishes', async () => {
  let complete,starts=0;const stop=activateCartV2({storage:{migrateToV2:()=>new Promise(resolve=>{complete=resolve;})},controller:{start:()=>{starts++;return()=>{};}},onError:assert.fail});await setImmediate();stop();complete();await setImmediate();assert.equal(starts,0);
});
test('strict-mode replacement starts only the still-mounted controller after queued migrations', async () => {
  const done=[];let starts=0,stops=0;
  const ports={storage:{migrateToV2:()=>new Promise(resolve=>done.push(resolve))},controller:{start:()=>{starts++;return()=>stops++;}},onError:assert.fail};
  const old=activateCartV2(ports);await setImmediate();old();const current=activateCartV2(ports);await setImmediate();done[0]();done[1]();await setImmediate();assert.equal(starts,1);current();assert.equal(stops,1);
});
test('cleanup before the scheduled activation avoids browser storage access', async () => {
  let reads=0;const stop=activateCartV2({storage:{migrateToV2:async()=>{reads++;}},controller:{start:assert.fail},onError:assert.fail});stop();await setImmediate();assert.equal(reads,0);
});
