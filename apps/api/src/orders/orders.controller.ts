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
  ValidationPipe,
} from "@nestjs/common";

import type { ArgumentMetadata } from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthGuard } from "../auth/auth.guard.js";
import { createOrderValidationException } from "../common/order-validation.js";
import { OrdersService } from "./orders.service.js";
import { OrdersReaderService } from "./orders-reader.service.js";
import { CreateOrderDto } from "./dto/create-order.dto.js";
import { CreateOrderV2Dto } from "./dto/create-order-v2.dto.js";

type AuthRequest = Request & {
  user?: {
    id?: string;
    userId?: string;
  };
};

// Su dung cung cau hinh voi global ValidationPipe trong main.ts.
const orderValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: false,
  },
  exceptionFactory: createOrderValidationException,
});

// Chon va validate DTO theo phien ban request.
async function validateOrderBody<T extends CreateOrderDto | CreateOrderV2Dto>(
  body: unknown,
  dtoType: new () => T,
): Promise<T> {
  const metadata: ArgumentMetadata = {
    type: "body",
    metatype: dtoType,
    data: undefined,
  };

  return (await orderValidationPipe.transform(body, metadata)) as T;
}

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

  // Dat /me truoc /:id de tranh nhan nham route.
  @Get("me")
  @UseGuards(AuthGuard)
  async getMyOrders(@Req() req: Request) {
    const userId = this.getUserId(req as AuthRequest);
    if (Object.keys(req.query ?? {}).length) throw new BadRequestException({ error: {
      code: "VALIDATION_ERROR", message: "Lịch sử không hỗ trợ tham số lọc hoặc phân trang.",
    } });
    return this.ordersReader.getMyOrders(userId);
  }

  @Get(":id")
  @UseGuards(AuthGuard)
  async getOrderDetail(@Param("id") id: string, @Req() req: Request) {
    return this.ordersReader.getOrderDetail(
      this.getUserId(req as AuthRequest),
      id,
    );
  }

  // Endpoint thong nhat cho Orders V1 va V2.
  @Post()
  @UseGuards(AuthGuard)
  async createOrder(
    @Body() body: unknown,
    @Headers("idempotency-key") requestKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = this.getUserId(req as AuthRequest);

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

    // Request phai la JSON object, khong phai array/null.
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Dữ liệu gửi lên không hợp lệ.",
          fieldErrors: {
            body: ["Request body phải là một JSON object."],
          },
        },
      });
    }

    const payload = body as Record<string, unknown>;

    // V1: Khong co schemaVersion.
    if (!Object.prototype.hasOwnProperty.call(payload, "schemaVersion")) {
      const dto = await validateOrderBody(body, CreateOrderDto);

      const result = await this.ordersService.createOrder(
        userId,
        requestKey,
        dto,
      );

      return res.status(result.httpStatus).json(result.body);
    }

    // V2: schemaVersion phai la number 2.
    if (payload.schemaVersion === 2) {
      const dto = await validateOrderBody(body, CreateOrderV2Dto);

      const result = await this.ordersService.createOrderV2(
        userId,
        requestKey,
        dto,
      );

      return res.status(result.httpStatus).json(result.body);
    }

    // Khong tu dong chuyen "2" thanh 2.
    throw new BadRequestException({
      error: {
        code: "VALIDATION_ERROR",
        message: "schemaVersion không được hỗ trợ.",
        fieldErrors: {
          schemaVersion: ["schemaVersion phải bằng 2 hoặc không được gửi."],
        },
      },
    });
  }
}
