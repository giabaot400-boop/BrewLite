import "reflect-metadata";
import "dotenv/config";

import { NestFactory } from "@nestjs/core";
import { ValidationPipe, BadRequestException } from "@nestjs/common";
import { json } from "express";

import { AppModule } from "./app.module.js";
import type { Request, Response, NextFunction } from "express";
import type { ValidationError } from "class-validator";

function collectFieldErrors(
  errors: ValidationError[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  function visit(error: ValidationError, parentPath = ""): void {
    const property = error.property;

    // Bieu dien chi so mang bang [index]
    const path = /^\d+$/.test(property)
      ? `${parentPath}[${property}]`
      : parentPath
        ? `${parentPath}.${property}`
        : property;

    // Luu cac thong bao loi duoi dang mang chuoi
    if (error.constraints) {
      const messages = Object.values(error.constraints);

      fieldErrors[path] = [...(fieldErrors[path] ?? []), ...messages];
    }

    // Duyet cac thuoc tinh con
    for (const child of error.children ?? []) {
      visit(child, path);
    }
  }

  for (const error of errors) {
    visit(error);
  }

  return fieldErrors;
}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  // Giới hạn JSON request body tối đa 32 KiB.
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

  // Kiểm tra dữ liệu DTO trước khi vào controller.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      exceptionFactory: (errors) =>
        new BadRequestException({
          error: {
            code: "VALIDATION_ERROR",
            message: "Dữ liệu gửi lên không hợp lệ.",
            fieldErrors: collectFieldErrors(errors),
          },
        }),
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
