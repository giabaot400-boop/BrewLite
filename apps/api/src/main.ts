import "reflect-metadata";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";

import { AppModule } from "./app.module.js";
import { createOrderValidationException } from "./common/order-validation.js";

import type { Request, Response, NextFunction } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Gioi han JSON request body toi da 32 KiB.
  app.use(json({ limit: "32kb" }));

  app.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      const bodyError = error as {
        type?: string;
        status?: number;
      };

      if (bodyError?.type === "entity.too.large" && bodyError.status === 413) {
        return res.status(413).json({
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Dữ liệu đơn hàng vượt quá 32 KiB.",
          },
        });
      }

      next(error);
    },
  );

  // Kiem tra DTO truoc khi vao controller.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      exceptionFactory: createOrderValidationException,
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
  });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT phải là số nguyên trong khoảng 1 đến 65535.");
  }

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
