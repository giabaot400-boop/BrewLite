import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ProductsModule } from './products/products.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [ProductsModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
