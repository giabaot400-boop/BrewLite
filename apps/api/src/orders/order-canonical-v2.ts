import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

export type OrderV2Item = {
  productId: string;
  size: "S" | "M" | "L";
  toppingIds: string[];
  qty: number;
  expectedUnitPrice: number;
};

export type OrderV2Input = {
  schemaVersion: 2;
  items: OrderV2Item[];
  promotionCode: string | null;
  expectedTotal: number;
};

function validationError(message: string): never {
  throw new BadRequestException({
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  });
}

function compareUtf16(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function normalizePromotionCode(code: string | null): string | null {
  if (code === null) return null;

  if (typeof code !== "string") {
    return validationError("Mã khuyến mãi không hợp lệ.");
  }

  const trimmed = code.trim();

  if (trimmed === "") return null;

  // Chỉ chuyển ký tự ASCII a-z sang A-Z.
  const normalized = trimmed.replace(/[a-z]/g, (char) => char.toUpperCase());

  if (!/^[A-Z0-9_-]{1,32}$/.test(normalized)) {
    return validationError("Mã khuyến mãi không hợp lệ.");
  }

  return normalized;
}

export function canonicalizeOrderV2(dto: OrderV2Input) {
  if (dto.schemaVersion !== 2) {
    return validationError("schemaVersion phải bằng 2.");
  }

  if (
    !Number.isInteger(dto.expectedTotal) ||
    dto.expectedTotal < 1 ||
    dto.expectedTotal > 2147483647
  ) {
    return validationError("expectedTotal không hợp lệ.");
  }

  if (
    !Array.isArray(dto.items) ||
    dto.items.length < 1 ||
    dto.items.length > 20
  ) {
    return validationError("Số dòng sản phẩm không hợp lệ.");
  }

  const promotionCode = normalizePromotionCode(dto.promotionCode);

  const items = dto.items.map((item, originalIndex) => {
    if (
      typeof item.productId !== "string" ||
      item.productId.length === 0 ||
      !["S", "M", "L"].includes(item.size) ||
      !Array.isArray(item.toppingIds) ||
      !Number.isInteger(item.qty) ||
      item.qty < 1 ||
      item.qty > 20 ||
      !Number.isInteger(item.expectedUnitPrice) ||
      item.expectedUnitPrice < 0 ||
      item.expectedUnitPrice > 2147483647
    ) {
      return validationError("Dòng sản phẩm không hợp lệ.");
    }

    if (
      !item.toppingIds.every((id) => typeof id === "string" && id.length > 0)
    ) {
      return validationError("Danh sách topping không hợp lệ.");
    }

    const toppingIds = [...item.toppingIds].sort(compareUtf16);

    for (let i = 1; i < toppingIds.length; i++) {
      if (toppingIds[i] === toppingIds[i - 1]) {
        return validationError("Topping bị trùng.");
      }
    }

    return {
      productId: item.productId,
      size: item.size,
      toppingIds,
      qty: item.qty,
      expectedUnitPrice: item.expectedUnitPrice,
      originalIndex,
    };
  });

  items.sort(
    (a, b) =>
      compareUtf16(a.productId, b.productId) ||
      compareUtf16(a.size, b.size) ||
      compareUtf16(JSON.stringify(a.toppingIds), JSON.stringify(b.toppingIds)),
  );

  for (let i = 1; i < items.length; i++) {
    const previous = items[i - 1];
    const current = items[i];

    if (
      previous.productId === current.productId &&
      previous.size === current.size &&
      JSON.stringify(previous.toppingIds) === JSON.stringify(current.toppingIds)
    ) {
      throw new BadRequestException({
        error: {
          code: "VALIDATION_ERROR",
          message: "Đơn hàng có cấu hình món bị trùng.",
          fieldErrors: {
            [`items[${current.originalIndex}]`]: [
              "Cấu hình sản phẩm đã xuất hiện trong đơn hàng.",
            ],
          },
        },
      });
    }
  }

  const canonicalItems = items.map((item) => ({
    productId: item.productId,
    size: item.size,
    toppingIds: item.toppingIds,
    qty: item.qty,
    expectedUnitPrice: item.expectedUnitPrice,
  }));

  const canonicalJson = JSON.stringify({
    version: 2,
    items: canonicalItems,
    promotionCode,
    expectedTotal: dto.expectedTotal,
  });

  const requestHash = createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");

  return {
    items,
    promotionCode,
    expectedTotal: dto.expectedTotal,
    canonicalJson,
    requestHash,
    canonicalVersion: 2 as const,
  };
}
