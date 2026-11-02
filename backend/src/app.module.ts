import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsPrismaService } from './products/products-prisma.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, ProductsController],
  providers: [ProductsPrismaService],
})
export class AppModule {}
