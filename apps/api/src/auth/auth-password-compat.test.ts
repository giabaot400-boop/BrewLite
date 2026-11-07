import test from "node:test";
import assert from "node:assert/strict";
import { hash as legacyHash, compare as legacyCompare } from "bcryptjs";
import { getRounds } from "bcrypt";
import { AuthService } from "./auth.service.js";
import type { PrismaService } from "../database/prisma.service.js";

process.env.AUTH_JWT_SECRET = "test-only-secret-that-is-at-least-32-bytes-long";
const vectors = [
  ["ASCII minimum", "a".repeat(15)],
  ["ASCII 72 bytes", "a".repeat(72)],
  ["Unicode 72 bytes", "é".repeat(36)],
  ["emoji 72 bytes", "😀".repeat(18)],
  ["leading/trailing spaces", "  BrewLite-password-123456  "],
] as const;

function fixture(passwordHash = "") {
  let savedHash = passwordHash, sessionCount = 0, createCount = 0;
  const user = { id: "compat-user", email: "compat@example.com" };
  const prisma = {
    user: {
      findUnique: async () => ({ ...user, passwordHash: savedHash }),
      create: async ({ data }: { data: { passwordHash: string } }) => {
        createCount++; savedHash = data.passwordHash; return user;
      },
    },
    authSession: {
      create: async ({ data }: { data: unknown }) => { sessionCount++; return data; },
    },
  } as unknown as PrismaService;
  return { service: new AuthService(prisma), user, hash: () => savedHash,
    sessions: () => sessionCount, creates: () => createCount };
}
function apiCode(code: string) {
  return (error: unknown) => (error as { response?: { error?: { code?: string } } })
    .response?.error?.code === code;
}

for (const [name, password] of vectors) {
  test("login accepts existing bcryptjs cost-12 hash: " + name, async () => {
    const f = fixture(await legacyHash(password, 12));
    const original = f.hash();
    const result = await f.service.login({ email: f.user.email, password });
    assert.equal(result.user.id, f.user.id);
    assert.equal(f.sessions(), 1);
    assert.equal(f.hash(), original, "Login must not rewrite or migrate the old hash");
    await assert.rejects(f.service.login({ email: f.user.email, password: "X" + password }), apiCode("INVALID_CREDENTIALS"));
    assert.equal(f.sessions(), 1, "Wrong password must not create a session");
    if (name === "leading/trailing spaces") {
      await assert.rejects(f.service.login({ email: f.user.email, password: password.trim() }), apiCode("INVALID_CREDENTIALS"));
    }
  });
  test("register writes cost-12 hash readable by bcryptjs: " + name, async () => {
    const f = fixture();
    const result = await f.service.register({ email: f.user.email, password });
    assert.deepEqual(result, { user: f.user });
    assert.equal(getRounds(f.hash()), 12);
    assert.equal(await legacyCompare(password, f.hash()), true);
    assert.equal(await legacyCompare("X" + password, f.hash()), false);
    assert.equal(f.sessions(), 0, "Registration must not log in");
    if (name === "leading/trailing spaces") assert.equal(await legacyCompare(password.trim(), f.hash()), false);
  });
}
for (const [name, password] of [
  ["14 code points", "a".repeat(14)], ["73 ASCII bytes", "a".repeat(73)],
  ["74 Unicode bytes", "é".repeat(37)], ["NUL", "a".repeat(15) + "\u0000"],
  ["unpaired high surrogate", "a".repeat(15) + "\uD800"],
  ["unpaired low surrogate", "a".repeat(15) + "\uDC00"],
]) {
  test("register still rejects before persistence: " + name, async () => {
    const f = fixture();
    await assert.rejects(f.service.register({ email: f.user.email, password }), apiCode("VALIDATION_ERROR"));
    assert.equal(f.creates(), 0); assert.equal(f.sessions(), 0);
  });
}
