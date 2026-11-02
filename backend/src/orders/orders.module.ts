import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
