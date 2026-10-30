import 'dotenv/config';
import assert from 'node:assert/strict';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { tryLockOrderRequest } from '../src/database/order-request-lock.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing DATABASE_URL.');

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

const first = createClient();
const second = createClient();

async function main() {
  const userId = 's2-lock-test-user';
  const requestKey = 's2-lock-test-key';

  await first.$transaction(async (tx1) => {
    assert.equal(
      await tryLockOrderRequest(tx1, userId, requestKey),
      true,
    );
    console.log('PASS 1: transaction A acquired the lock.');

    await second.$transaction(async (tx2) => {
      assert.equal(
        await tryLockOrderRequest(tx2, userId, requestKey),
        false,
      );
      console.log('PASS 2: transaction B could not acquire the same lock.');
    });
  });

  await second.$transaction(async (tx2) => {
    assert.equal(
      await tryLockOrderRequest(tx2, userId, requestKey),
      true,
    );
        console.log('PASS 3: B acquired the lock after A committed.');
  });

  const rollbackMarker = new Error('EXPECTED_TEST_ROLLBACK');

  try {
    await first.$transaction(async (tx1) => {
      assert.equal(
        await tryLockOrderRequest(tx1, userId, requestKey),
        true,
      );

      await second.$transaction(async (tx2) => {
        assert.equal(
          await tryLockOrderRequest(tx2, userId, `${requestKey}-other`),
          true,
        );
        console.log('PASS 4: a different request key acquired its lock.');

        assert.equal(
          await tryLockOrderRequest(tx2, `${userId}-other`, requestKey),
          true,
        );
        console.log('PASS 5: a different user acquired its lock.');
      });

      throw rollbackMarker;
    });
  } catch (error) {
    if (error !== rollbackMarker) throw error;
  }

  await second.$transaction(async (tx2) => {
    assert.equal(
      await tryLockOrderRequest(tx2, userId, requestKey),
      true,
    );
    console.log('PASS 6: the lock was released after rollback.');
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });