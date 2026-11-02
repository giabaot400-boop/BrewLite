import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "./auth.service.js";
import type { PrismaService } from "../database/prisma.service.js";

process.env.AUTH_JWT_SECRET = "test-only-secret-that-is-at-least-32-bytes-long";

const PASSWORD = "correct-horse-battery-staple";

type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

async function createFixture() {
  const passwordHash = await (await import("bcryptjs")).hash(PASSWORD, 4);

  const user = {
    id: "review-user",
    email: "review@example.com",
    passwordHash,
  };

  let session: Session | undefined;

  const prisma = {
    user: {
      findUnique: async () => user,
    },
    authSession: {
      create: async ({ data }: { data: Omit<Session, "revokedAt"> }) => {
        session = { ...data, revokedAt: null };
        return session;
      },
      findUnique: async () =>
        session
          ? {
              ...session,
              user: {
                id: user.id,
                email: user.email,
              },
            }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          userId: string;
          revokedAt: null;
        };
        data: { revokedAt: Date };
      }) => {
        if (
          session &&
          session.id === where.id &&
          session.userId === where.userId &&
          session.revokedAt === null
        ) {
          session.revokedAt = data.revokedAt;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  } as unknown as PrismaService;

  const service = new AuthService(prisma);
  const login = await service.login({
    email: user.email,
    password: PASSWORD,
  });

  return {
    service,
    token: `Bearer ${login.token}`,
    getSession: () => session,
    setSession: (value: Session | undefined) => {
      session = value;
    },
  };
}

function expectError(code: string) {
  return (error: unknown) => {
    const response = (
      error as {
        response?: {
          error?: { code?: string };
        };
      }
    ).response;

    assert.equal(response?.error?.code, code);
    return true;
  };
}

test("AUTH-R01: Session khong ton tai", async () => {
  const fixture = await createFixture();

  fixture.setSession(undefined);

  await assert.rejects(
    () => fixture.service.validateSession(fixture.token),
    expectError("SESSION_INVALID"),
  );
});

test("AUTH-R02: Session sai nguoi dung", async () => {
  const fixture = await createFixture();

  const session = fixture.getSession();
  assert.ok(session);

  session.userId = "another-user";

  await assert.rejects(
    () => fixture.service.validateSession(fixture.token),
    expectError("SESSION_INVALID"),
  );
});

test("AUTH-R03: Session bi thu hoi", async () => {
  const fixture = await createFixture();

  const session = fixture.getSession();
  assert.ok(session);

  session.revokedAt = new Date();

  await assert.rejects(
    () => fixture.service.validateSession(fixture.token),
    expectError("SESSION_EXPIRED"),
  );
});

test("AUTH-R04: Session het han", async () => {
  const fixture = await createFixture();

  const session = fixture.getSession();
  assert.ok(session);

  session.expiresAt = new Date(Date.now() - 1000);

  await assert.rejects(
    () => fixture.service.validateSession(fixture.token),
    expectError("SESSION_EXPIRED"),
  );
});

test("AUTH-R05: Logout hai lan", async () => {
  const fixture = await createFixture();

  await fixture.service.logout(fixture.token);

  const firstRevokedAt = fixture.getSession()?.revokedAt;

  assert.ok(firstRevokedAt instanceof Date);

  await fixture.service.logout(fixture.token);

  assert.equal(fixture.getSession()?.revokedAt, firstRevokedAt);
});

test("AUTH-R06: Logout session khong ton tai", async () => {
  const fixture = await createFixture();

  fixture.setSession(undefined);

  await assert.rejects(
    () => fixture.service.logout(fixture.token),
    expectError("SESSION_INVALID"),
  );
});

test("AUTH-R07: Logout session sai nguoi dung", async () => {
  const fixture = await createFixture();

  const session = fixture.getSession();
  assert.ok(session);

  session.userId = "another-user";

  await assert.rejects(
    () => fixture.service.logout(fixture.token),
    expectError("SESSION_INVALID"),
  );
});
