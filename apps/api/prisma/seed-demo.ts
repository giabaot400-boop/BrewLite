import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing DATABASE_URL.');

if (
  process.env.DEMO_SEED_ENABLED !== 'true' ||
  new URL(connectionString).pathname !== '/brewlite_s3_demo'
) {
  throw new Error(
    'Demo seed requires DEMO_SEED_ENABLED=true and brewlite_s3_demo.',
  );
}

const initializeStock = process.env.INIT_DEMO_STOCK === 'true';
const productIds = [
  'coffee-milk',
  'americano',
  'cappuccino',
  'peach-tea',
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({
  connectionString,
  options: '-c timezone=UTC',
}),
});

async function main() {
  await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new Error('Run the catalog seed first.');
    }

    if (initializeStock) {
      const orders = await tx.order.count();
      const reservations = await tx.stockReservation.count();

      if (
        orders !== 0 ||
        reservations !== 0 ||
        products.some((product) =>
          product.stock !== 0 ||
          product.reservedStock !== 0 ||
          product.stockVersion !== 0
        )
      ) {
        throw new Error(
          'Stock initialization requires a fresh, unused demo fixture.',
        );
      }

      const result = await tx.product.updateMany({
        where: {
          id: { in: productIds },
          stock: 0,
          reservedStock: 0,
          stockVersion: 0,
        },
        data: {
          stock: 10,
          stockVersion: { increment: 1 },
        },
      });

      if (result.count !== productIds.length) {
        throw new Error('Stock initialization conflict.');
      }
    }

    // Fixed demo window: reruns do not silently extend validity.
    const promotion = {
      active: true,
      startsAt: new Date('2026-11-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
      minimumSubtotal: 50000,
      type: 'PERCENT',
      value: 10,
      maxDiscountAmount: 20000,
    };

    await tx.promotion.upsert({
      where: { code: 'DEMO10' },
      create: { code: 'DEMO10', ...promotion },
      update: promotion,
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  console.log(
    initializeStock
      ? 'Demo ready: stock initialized to 10; DEMO10 upserted.'
      : 'DEMO10 upserted; stock/reservations/points unchanged.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());