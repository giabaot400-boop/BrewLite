import { Controller, Get, Param } from '@nestjs/common';
import { ProductsPrismaService } from './products-prisma.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsPrismaService) {}

  // GET /products — trả mảng sản phẩm trực tiếp theo API contract.
  @Get()
  getProducts() {
    return this.productsService.getProducts();
  }

  // GET /products/:id — trả chi tiết hoặc 404 nếu không tồn tại.
  @Get(':id')
  getProductById(@Param('id') id: string) {
    return this.productsService.getProductById(id);
  }
}
