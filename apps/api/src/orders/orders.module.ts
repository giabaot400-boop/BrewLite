import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";
import { OrdersReaderService } from "./orders-reader.service.js";
import { OrderWorkflowService } from "./order-workflow.service.js";
import { MockPaymentService } from "./mock-payment.service.js";
import { OrderExpiryService } from "./order-expiry.service.js";
import { OrderActionsController, PaymentsController } from "./order-actions.controller.js";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrdersController, PaymentsController, OrderActionsController],
  providers: [OrdersService, OrdersReaderService, OrderWorkflowService, MockPaymentService, OrderExpiryService],
})
export class OrdersModule {}
