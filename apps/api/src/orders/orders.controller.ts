import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthGuard } from "../auth/auth.guard.js";
import { OrdersService } from "./orders.service.js";
import { OrdersReaderService } from "./orders-reader.service.js";
import { CreateOrderDto } from "./dto/create-order.dto.js";

type AuthRequest = Request & {
  user?: { id?: string; userId?: string };
};

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersReader: OrdersReaderService,
  ) {}

  private getUserId(req: AuthRequest): string {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException();
    }

    return userId;
  }

  // Đặt /me trước /:id để tránh route động bắt nhầm.
  @Get("me")
  @UseGuards(AuthGuard)
  async getMyOrders(@Req() req: Request) {
    return this.ordersReader.getMyOrders(
      this.getUserId(req as AuthRequest),
    );
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  async getOrderDetail(
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    return this.ordersReader.getOrderDetail(
      this.getUserId(req as AuthRequest),
      id,
    );
  }

  @Post()
  @UseGuards(AuthGuard)
  async createOrder(
    @Body() dto: CreateOrderDto,
    @Headers("idempotency-key") requestKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
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