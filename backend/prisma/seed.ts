import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Thiếu DATABASE_URL.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const products = [
  { id: 'coffee-milk', name: 'Cà phê sữa', description: 'Cà phê đậm vị kết hợp sữa.', price: 35000, imageUrl: '/images/coffee-milk.svg' },
  { id: 'americano', name: 'Americano', description: 'Espresso kết hợp nước nóng, giữ hương cà phê nguyên bản.', price: 40000, imageUrl: '/images/americano.svg' },
  { id: 'cappuccino', name: 'Cappuccino', description: 'Espresso, sữa nóng và lớp bọt sữa mềm.', price: 45000, imageUrl: '/images/cappuccino.svg' },
  { id: 'peach-tea', name: 'Trà đào', description: 'Trà thơm kết hợp vị đào thanh mát.', price: 39000, imageUrl: '/images/peach-tea.svg' },
];

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const topping of [
      { id: 'cream', name: 'Kem', price: 7000 },
      { id: 'pearl', name: 'Trân châu', price: 5000 },
    ]) {
      await tx.topping.upsert({ where: { id: topping.id }, create: topping, update: topping });
    }
    for (const product of products) {
      await tx.product.upsert({ where: { id: product.id }, create: product, update: product });
    }
    // Chỉ liên kết topping với cà phê sữa; không xóa dữ liệu hiện có của nhóm.
    for (const toppingId of ['cream', 'pearl']) {
      const key = { productId: 'coffee-milk', toppingId };
      await tx.productTopping.upsert({ where: { productId_toppingId: key }, create: key, update: {} });
    }
  });
  console.log('Đã seed 4 sản phẩm và 2 topping mẫu.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
