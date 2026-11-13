import { BadRequestException, Body, Controller, Headers, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNotEmpty, IsString } from "class-validator";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import type { PaymentMethod } from "../generated/prisma/client.js";
import { OrderWorkflowService } from "./order-workflow.service.js";

export class PaymentDto {
  @IsString() @IsNotEmpty() orderId!: string;
  @IsIn(["WALLET", "CARD"]) method!: PaymentMethod;
}
function owner(req: Request): string { return (req as Request & { user: { id: string } }).user.id; }
function invalid(message: string): never { throw new BadRequestException({ error: { code: "VALIDATION_ERROR", message } }); }

@Controller("payments")
export class PaymentsController {
  constructor(private readonly workflow: OrderWorkflowService) {}
  @Post() @HttpCode(200) @UseGuards(AuthGuard)
  pay(@Req() req: Request, @Headers("idempotency-key") key: string, @Body() body: PaymentDto) {
    if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) invalid("Idempotency-Key phải là UUID v4.");
    return this.workflow.pay(owner(req), key, body);
  }
}

@Controller("orders")
export class OrderActionsController {
  constructor(private readonly workflow: OrderWorkflowService) {}
  @Post(":id/cancel") @HttpCode(200) @UseGuards(AuthGuard)
  cancel(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    if (body === null || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) invalid("Nội dung hủy đơn phải là JSON {}.");
    return this.workflow.cancel(owner(req), id);
  }
}
