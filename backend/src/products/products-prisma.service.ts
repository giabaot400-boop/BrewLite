import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

// Dữ liệu demo chỉ dùng khi backend/.env có DEMO_MODE=true.
// Khi PostgreSQL của nhóm sẵn sàng, đặt DEMO_MODE=false để dùng Prisma.
const DEMO_PRODUCTS = [
  {
    id: 'coffee-milk',
    name: 'Cà phê sữa',
    description: 'Cà phê đậm vị kết hợp sữa.',
    price: 35000,
    imageUrl: '/images/coffee-milk.svg',
    toppings: [
      { id: 'cream', name: 'Kem', price: 7000 },
      { id: 'pearl', name: 'Trân châu', price: 5000 },
    ],
  },
  {
    id: 'americano',
    name: 'Americano',
    description: 'Espresso kết hợp nước nóng, giữ hương cà phê nguyên bản.',
    price: 40000,
    imageUrl: '/images/americano.svg',
    toppings: [],
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    description: 'Espresso, sữa nóng và lớp bọt sữa mềm.',
    price: 45000,
    imageUrl: '/images/cappuccino.svg',
    toppings: [],
  },
  {
    id: 'peach-tea',
    name: 'Trà đào',
    description: 'Trà thơm kết hợp vị đào thanh mát.',
    price: 39000,
    imageUrl: '/images/peach-tea.svg',
    toppings: [],
  },
] as const;

const SIZES = [
  { code: 'S', extraPrice: 0 },
  { code: 'M', extraPrice: 5000 },
  { code: 'L', extraPrice: 10000 },
] as const;

@Injectable()
export class ProductsPrismaService {
  private readonly logger = new Logger(ProductsPrismaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProducts() {
    if (process.env.DEMO_MODE === 'true') {
      return DEMO_PRODUCTS.map(({ id, name, price, imageUrl }) => ({
        id,
        name,
        price,
        imageUrl,
      }));
    }

    try {
      return await this.prisma.product.findMany({
        select: { id: true, name: true, price: true, imageUrl: true },
        orderBy: { id: 'asc' },
      });
    } catch (error) {
      this.logDatabaseError('GET /products', error);
      throw new InternalServerErrorException('Không thể tải danh sách sản phẩm.');
    }
  }

  async getProductById(id: string) {
    if (process.env.DEMO_MODE === 'true') {
      const product = DEMO_PRODUCTS.find((item) => item.id === id);
      if (!product) throw new NotFoundException('Product not found');

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        sizes: SIZES,
        toppings: product.toppings,
      };
    }

    try {
      const product = await this.prisma.product.findUnique({
        where: { id },
        include: { toppings: { include: { topping: true } } },
      });

      if (!product) throw new NotFoundException('Product not found');

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        sizes: SIZES,
        toppings: product.toppings.map(({ topping }) => ({
          id: topping.id,
          name: topping.name,
          price: topping.price,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logDatabaseError(`GET /products/${id}`, error);
      throw new InternalServerErrorException('Không thể tải chi tiết sản phẩm.');
    }
  }

  private logDatabaseError(operation: string, error: unknown) {
    const details = error instanceof Error ? error.stack ?? error.message : String(error);
    this.logger.error(`${operation} failed: ${details}`);
  }
}
