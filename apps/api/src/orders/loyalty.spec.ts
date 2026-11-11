import { test } from "node:test";
import assert from "node:assert/strict";
import { awardPoints, reversePoints } from "./loyalty.js";

const at = new Date("2026-11-09T10:00:00.000Z");

function createTx() {
  const state = {
    balance: 0,
    entry: null as any,
    order: {
      userId: "u1",
      total: 90_000,
      checkoutPolicyVersion: 2,
      loyaltyPointsExpected: 9,
    },
  };

  const tx = {
    $queryRaw: async () => [{ id: "u1" }],

    order: {
      findUnique: async () => state.order,
    },

    user: {
      updateMany: async ({ where, data }: any) => {
        if (where.id !== "u1") return { count: 0 };

        if (
          where.loyaltyPoints?.lte !== undefined &&
          state.balance > where.loyaltyPoints.lte
        ) return { count: 0 };

        if (
          where.loyaltyPoints?.gte !== undefined &&
          state.balance < where.loyaltyPoints.gte
        ) return { count: 0 };

        if (data.loyaltyPoints.increment !== undefined) {
          state.balance += data.loyaltyPoints.increment;
        }

        if (data.loyaltyPoints.decrement !== undefined) {
          state.balance -= data.loyaltyPoints.decrement;
        }

        return { count: 1 };
      },
    },

    loyaltyEntry: {
      findUnique: async () => state.entry,
      create: async ({ data }: any) => {
        state.entry = {
          id: "entry1",
          ...data,
          reversedAt: null,
        };
        return state.entry;
      },
      updateMany: async ({ where, data }: any) => {
        if (
          !state.entry ||
          state.entry.id !== where.id ||
          state.entry.userId !== where.userId ||
          state.entry.reversedAt !== null
        ) return { count: 0 };

        state.entry.reversedAt = data.reversedAt;
        return { count: 1 };
      },
    },
  };

  return { tx: tx as any, state };
}

test("Loyalty: cộng điểm và tạo lịch sử", async () => {
  const { tx, state } = createTx();

  await awardPoints(tx, "o1", "u1", 9, at);

  assert.equal(state.balance, 9);
  assert.equal(state.entry.points, 9);
  assert.equal(state.entry.orderId, "o1");
});

test("Loyalty: gọi award lần hai không cộng trùng", async () => {
  const { tx, state } = createTx();

  await awardPoints(tx, "o1", "u1", 9, at);
  await awardPoints(tx, "o1", "u1", 9, at);

  assert.equal(state.balance, 9);
});

test("Loyalty: từ chối snapshot không nhất quán", async () => {
  const { tx, state } = createTx();
  state.order.loyaltyPointsExpected = 8;

  await assert.rejects(
    awardPoints(tx, "o1", "u1", 9, at),
    /snapshot is inconsistent/,
  );

  assert.equal(state.balance, 0);
});

test("Loyalty: hoàn điểm và đánh dấu reversedAt", async () => {
  const { tx, state } = createTx();

  await awardPoints(tx, "o1", "u1", 9, at);
  await reversePoints(tx, "o1", "u1", at);

  assert.equal(state.balance, 0);
  assert.equal(state.entry.reversedAt, at);
});

test("Loyalty: hoàn điểm lần hai không trừ trùng", async () => {
  const { tx, state } = createTx();

  await awardPoints(tx, "o1", "u1", 9, at);
  await reversePoints(tx, "o1", "u1", at);
  await reversePoints(tx, "o1", "u1", at);

  assert.equal(state.balance, 0);
});
