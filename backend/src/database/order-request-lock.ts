import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';

function createLockKey(userId: string, requestKey: string): bigint {
  const input = JSON.stringify([
    'brewlite:order-request:v1',
    userId,
    requestKey,
  ]);

  const digest = createHash('sha256')
    .update(input, 'utf8')
    .digest();

  return digest.readBigInt64BE(0);
}

export async function tryLockOrderRequest(
  tx: Prisma.TransactionClient,
  userId: string,
  requestKey: string,
): Promise<boolean> {
  if (!userId || !requestKey) {
    throw new Error('userId and requestKey are required.');
  }

  const lockKey = createLockKey(userId, requestKey);

  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(
      ${lockKey}::bigint
    ) AS acquired
  `;

  return rows[0]?.acquired === true;
}