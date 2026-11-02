import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import { OrdersService } from "./orders.service.js";
import { CreateOrderDto } from "./dto/create-order.dto.js";

// TODO: Import JWT guard thực tế của thành viên C.

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(AuthGuard)
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Headers("idempotency-key") requestKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // TODO: Chỉ sử dụng userId do JWT guard xác thực.
    // Tuyệt đối không lấy userId từ request body.

    const userId = (
      req as Request & {
        user?: { id?: string; userId?: string };
      }
    ).user?.id;

    if (!userId) {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Bạn chưa đăng nhập.",
        },
      });
    }

    const uuidV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!requestKey || !uuidV4.test(requestKey)) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Idempotency-Key phải là UUID v4.",
        },
      });
    }

    const result = await this.ordersService.createOrder(
      userId,
      requestKey,
      dto,
    );

    return res.status(result.httpStatus).json(result.body);
  }
}
