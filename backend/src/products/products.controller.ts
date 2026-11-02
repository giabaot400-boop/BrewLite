
import { Controller, Get, Param } from '@nestjs/common';
import { ProductsPrismaService } from './products-prisma.service.js';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsPrismaService,
  ) {}

  @Get()
  getProducts() {
    return this.productsService.getProducts();
  }

  @Get(':id')
  getProductById(@Param('id') id: string) {
    return this.productsService.getProductById(id);
  }
}
