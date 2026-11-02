import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';

const PASSWORD = 'correct-horse-battery-staple';
process.env.AUTH_JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';

test('register hashes password and returns only public user', async () => {
  let saved: { email: string; passwordHash: string } | undefined;
  const prisma = {
    user: {
      create: async ({ data }: { data: { email: string; passwordHash: string } }) => {
        saved = data;
        return { id: 'user-1', email: data.email };
      },
    },
  } as unknown as PrismaService;
  const result = await new AuthService(prisma).register({ email: ' Test@Example.com ', password: PASSWORD });
  assert.deepEqual(result, { user: { id: 'user-1', email: 'test@example.com' } });
  assert.ok(saved?.passwordHash.startsWith('$2'));
  assert.notEqual(saved?.passwordHash, PASSWORD);
});

test('register rejects a password shorter than 15 code points', async () => {
  const prisma = {} as PrismaService;
  await assert.rejects(
    () => new AuthService(prisma).register({ email: 'test@example.com', password: 'short-password' }),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 400);
      assert.equal((error as { response?: { error?: { code?: string } } }).response?.error?.code, 'VALIDATION_ERROR');
      return true;
    },
  );
});

test('login creates AuthSession; me reads it; logout revokes it', async () => {
  const passwordHash = await (await import('bcryptjs')).hash(PASSWORD, 4);
  let session: { id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | undefined;
  const user = { id: 'user-2', email: 'test@example.com', passwordHash };
  const prisma = {
    user: { findUnique: async () => user },
    authSession: {
      create: async ({ data }: { data: { id: string; userId: string; expiresAt: Date } }) => {
        session = { ...data, revokedAt: null };
        return session;
      },
      findUnique: async () => session ? { ...session, user } : null,
      updateMany: async ({ data }: { data: { revokedAt: Date } }) => {
        if (session) session.revokedAt = data.revokedAt;
        return { count: session ? 1 : 0 };
      },
    },
  } as unknown as PrismaService;
  const service = new AuthService(prisma);
  const login = await service.login({ email: user.email, password: PASSWORD });
  assert.equal(login.user.id, user.id);
  assert.ok(login.token.split('.').length === 3);
  assert.ok(Date.parse(login.expiresAt) > Date.now());
  assert.ok(Math.abs(Date.parse(login.expiresAt) - Date.now() - 60 * 60 * 1000) < 5_000);
  const claims = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  assert.equal(claims.iss, 'brewlite-api');
  assert.equal(claims.aud, 'brewlite-web');
  assert.equal(claims.exp, (claims.iat as number) + 3600);

  const current = await service.me(`Bearer ${login.token}`);
  assert.deepEqual(current.user, { id: user.id, email: user.email });

  await service.logout(`Bearer ${login.token}`);
  assert.ok(session?.revokedAt instanceof Date);
  await assert.rejects(() => service.me(`Bearer ${login.token}`));
});

test('me rejects a database session that has expired even if the JWT has not yet expired', async () => {
  const passwordHash = await (await import('bcryptjs')).hash(PASSWORD, 4);
  let session: { id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | undefined;
  const user = { id: 'user-exp', email: 'expired@example.com', passwordHash };
  const prisma = {
    user: { findUnique: async () => user },
    authSession: {
      create: async ({ data }: { data: { id: string; userId: string; expiresAt: Date } }) => {
        session = { ...data, revokedAt: null };
        return session;
      },
      findUnique: async () => session ? { ...session, user } : null,
    },
  } as unknown as PrismaService;
  const service = new AuthService(prisma);
  const login = await service.login({ email: user.email, password: PASSWORD });
  assert.ok(session);
  session.expiresAt = new Date(Date.now() - 1_000);
  await assert.rejects(() => service.me(`Bearer ${login.token}`));
});

test('login rejects incorrect credentials without revealing account existence', async () => {
  const prisma = { user: { findUnique: async () => null } } as unknown as PrismaService;
  await assert.rejects(
    () => new AuthService(prisma).login({ email: 'missing@example.com', password: PASSWORD }),
    (error: unknown) => {
      assert.equal((error as { status?: number }).status, 401);
      assert.equal((error as { response?: { error?: { code?: string } } }).response?.error?.code, 'INVALID_CREDENTIALS');
      return true;
    },
  );
});
