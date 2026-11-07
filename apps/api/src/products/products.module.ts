import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsPrismaService } from './products-prisma.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsPrismaService],
})
export class ProductsModule {}