import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { ProductsModule } from "./products/products.module.js";
import { OrdersModule } from "./orders/orders.module.js";

@Module({
  imports: [ProductsModule, OrdersModule],
  controllers: [HealthController],
})
export class AppModule {}
