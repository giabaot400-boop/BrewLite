import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
  let updateCalls = 0;
  let beforeUpdate: (() => void) | undefined;

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
        updateCalls += 1;
        beforeUpdate?.();
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
    getUpdateCalls: () => updateCalls,
    setBeforeUpdate: (callback: () => void) => { beforeUpdate = callback; },
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
    expectError("SESSION_INVALID"),
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

  await fixture.service.logout(fixture.token);
  assert.equal(fixture.getUpdateCalls(), 0);
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

for (const scenario of [
  { name: "missing", expected: "SESSION_INVALID" },
  { name: "wrong owner", expected: "SESSION_INVALID" },
  { name: "revoked", expected: "SESSION_INVALID" },
  { name: "expired", expected: "SESSION_EXPIRED" },
]) {
  test(`me and guard agree for ${scenario.name} session`, async () => {
    const fixture = await createFixture();
    const session = fixture.getSession();
    assert.ok(session);
    if (scenario.name === "missing") fixture.setSession(undefined);
    if (scenario.name === "wrong owner") session.userId = "another-user";
    if (scenario.name === "revoked") session.revokedAt = new Date();
    if (scenario.name === "expired") session.expiresAt = new Date(Date.now() - 1000);
    await assert.rejects(() => fixture.service.me(fixture.token), expectError(scenario.expected));
    await assert.rejects(() => fixture.service.validateSession(fixture.token), expectError(scenario.expected));
  });
}

test("logout succeeds if the verified session disappears during revocation", async () => {
  const fixture = await createFixture();
  fixture.setBeforeUpdate(() => fixture.setSession(undefined));
  await fixture.service.logout(fixture.token);
  assert.equal(fixture.getUpdateCalls(), 1);
});

test("logout succeeds if another request already revoked the same session", async () => {
  const fixture = await createFixture();
  const revokedAt = new Date();
  fixture.setBeforeUpdate(() => {
    const session = fixture.getSession();
    assert.ok(session);
    session.revokedAt = revokedAt;
  });
  await fixture.service.logout(fixture.token);
  assert.equal(fixture.getSession()?.revokedAt, revokedAt);
});

test("logout rejects a changed owner during revocation", async () => {
  const fixture = await createFixture();
  fixture.setBeforeUpdate(() => {
    const session = fixture.getSession();
    assert.ok(session);
    session.userId = "another-user";
  });
  await assert.rejects(() => fixture.service.logout(fixture.token), expectError("SESSION_INVALID"));
  assert.equal(fixture.getSession()?.revokedAt, null);
});

test("logout propagates a database failure without confirming revocation", async () => {
  const fixture = await createFixture();
  const failure = new Error("database unavailable");
  fixture.setBeforeUpdate(() => { throw failure; });
  await assert.rejects(() => fixture.service.logout(fixture.token), error => error === failure);
  assert.equal(fixture.getSession()?.revokedAt, null);
});

test("expired signed JWT is rejected by protected APIs but can revoke its own session", async () => {
  const fixture = await createFixture();
  const parts = fixture.token.slice("Bearer ".length).split(".");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  claims.iat = Math.floor(Date.now() / 1000) - 7200;
  claims.exp = claims.iat + 3600;
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = `${parts[0]}.${payload}`;
  const signature = createHmac("sha256", process.env.AUTH_JWT_SECRET!).update(input).digest("base64url");
  const authorization = `Bearer ${input}.${signature}`;
  const session = fixture.getSession();
  assert.ok(session);
  session.expiresAt = new Date(claims.exp * 1000);
  await assert.rejects(() => fixture.service.validateSession(authorization), expectError("SESSION_EXPIRED"));
  await assert.rejects(() => fixture.service.me(authorization), expectError("SESSION_EXPIRED"));
  await fixture.service.logout(authorization);
  assert.ok(fixture.getSession()?.revokedAt instanceof Date);
});
