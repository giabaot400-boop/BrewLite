
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class ProductsPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /products
  async getProducts() {
    return this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        imageUrl: true,
      },
    });
  }

  // GET /products/:id
  async getProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        toppings: {
          include: {
            topping: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      imageUrl: product.imageUrl,
      sizes: [
        { code: 'S', extraPrice: 0 },
        { code: 'M', extraPrice: 5000 },
        { code: 'L', extraPrice: 10000 },
      ],
      toppings: product.toppings.map(({ topping }) => ({
        id: topping.id,
        name: topping.name,
        price: topping.price,
      })),
    };
  }
}
