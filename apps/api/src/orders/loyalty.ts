
import type { Prisma } from "../generated/prisma/client.js";

const MAX_INT = 2_147_483_647;

async function lockUser(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE
  `;

  if (rows.length !== 1) {
    throw new Error("Loyalty user does not exist.");
  }
}

export async function awardPoints(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  points: number,
  at: Date,
): Promise<void> {
  if (!Number.isInteger(points) || points < 0 || points > MAX_INT) {
    throw new Error("Invalid loyalty points.");
  }

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      total: true,
      checkoutPolicyVersion: true,
      loyaltyPointsExpected: true,
    },
  });

  if (
    !order ||
    order.userId !== userId ||
    order.checkoutPolicyVersion !== 2 ||
    order.loyaltyPointsExpected !== points ||
    points !== Math.floor(order.total / 10_000)
  ) {
    throw new Error("Order loyalty snapshot is inconsistent.");
  }

  // D đã khóa Order và xử lý Stock trước khi gọi helper này.
  await lockUser(tx, userId);

  const existing = await tx.loyaltyEntry.findUnique({
    where: { orderId },
  });

  if (existing) {
    if (
      existing.userId !== userId ||
      existing.points !== points ||
      existing.reversedAt !== null
    ) {
      throw new Error("Existing loyalty entry is inconsistent.");
    }

    // Không cộng điểm lần thứ hai.
    return;
  }

  const updated = await tx.user.updateMany({
    where: {
      id: userId,
      loyaltyPoints: { lte: MAX_INT - points },
    },
    data: {
      loyaltyPoints: { increment: points },
    },
  });

  if (updated.count !== 1) {
    throw new Error("Loyalty balance is missing or exceeds Int limit.");
  }

  await tx.loyaltyEntry.create({
    data: {
      userId,
      orderId,
      points,
      createdAt: at,
    },
  });
}

export async function reversePoints(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  at: Date,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      checkoutPolicyVersion: true,
    },
  });

  if (
    !order ||
    order.userId !== userId ||
    order.checkoutPolicyVersion !== 2
  ) {
    throw new Error("Order is not eligible for loyalty reversal.");
  }

  await lockUser(tx, userId);

  const entry = await tx.loyaltyEntry.findUnique({
    where: { orderId },
  });

  if (!entry || entry.userId !== userId) {
    throw new Error("Original loyalty entry is missing or inconsistent.");
  }

  // Đã hoàn điểm thì không trừ lần nữa.
  if (entry.reversedAt !== null) {
    return;
  }

  const updated = await tx.user.updateMany({
    where: {
      id: userId,
      loyaltyPoints: { gte: entry.points },
    },
    data: {
      loyaltyPoints: { decrement: entry.points },
    },
  });

  if (updated.count !== 1) {
    throw new Error("Loyalty balance is inconsistent.");
  }

  const reversed = await tx.loyaltyEntry.updateMany({
    where: {
      id: entry.id,
      userId,
      reversedAt: null,
    },
    data: { reversedAt: at },
  });

  if (reversed.count !== 1) {
    throw new Error("Loyalty entry changed during reversal.");
  }
}
