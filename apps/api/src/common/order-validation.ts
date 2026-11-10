import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

// Gom loi validation theo ten truong.
export function collectFieldErrors(
  errors: ValidationError[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  function visit(error: ValidationError, parentPath = ""): void {
    const property = error.property;

    const path = /^\d+$/.test(property)
      ? `${parentPath}[${property}]`
      : parentPath
        ? `${parentPath}.${property}`
        : property;

    if (error.constraints) {
      const messages = Object.values(error.constraints);

      fieldErrors[path] = [...(fieldErrors[path] ?? []), ...messages];
    }

    for (const child of error.children ?? []) {
      visit(child, path);
    }
  }

  for (const error of errors) {
    visit(error);
  }

  return fieldErrors;
}

// Tao response loi giong ValidationPipe trong main.ts.
export function createOrderValidationException(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    error: {
      code: "VALIDATION_ERROR",
      message: "Dữ liệu gửi lên không hợp lệ.",
      fieldErrors: collectFieldErrors(errors),
    },
  });
}
