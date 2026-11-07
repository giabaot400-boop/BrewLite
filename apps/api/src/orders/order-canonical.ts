import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

import type { CreateOrderDto } from "./dto/create-order.dto.js";

// So sánh chuỗi theo UTF-16
function compareUtf16(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Chuẩn hóa đơn hàng và tạo requestHash
export function canonicalizeOrder(dto: CreateOrderDto) {
  // 1. Sao chép và sắp xếp topping của từng món
  const items = dto.items.map((item, originalIndex) => ({
    productId: item.productId,
    size: item.size,
    toppingIds: [...item.toppingIds].sort(compareUtf16),
    qty: item.qty,
    expectedUnitPrice: item.expectedUnitPrice,
    originalIndex,
  }));

  // 2. Sắp xếp các dòng món theo cấu hình
  items.sort((a, b) => {
    return (
      compareUtf16(a.productId, b.productId) ||
      compareUtf16(a.size, b.size) ||
      compareUtf16(JSON.stringify(a.toppingIds), JSON.stringify(b.toppingIds))
    );
  });

  // 3. Kiểm tra hai dòng món trùng cấu hình
  for (let i = 1; i < items.length; i++) {
    const previous = items[i - 1];
    const current = items[i];

    const sameConfiguration =
      previous.productId === current.productId &&
      previous.size === current.size &&
      JSON.stringify(previous.toppingIds) ===
        JSON.stringify(current.toppingIds);

    if (sameConfiguration) {
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

  // 4. Loại bỏ originalIndex trước khi tạo hash
  const canonicalItems = items.map((item) => ({
    productId: item.productId,
    size: item.size,
    toppingIds: item.toppingIds,
    qty: item.qty,
    expectedUnitPrice: item.expectedUnitPrice,
  }));

  // 5. Tạo JSON chuẩn hóa theo version 1
  const canonicalJson = JSON.stringify({
    version: 1,
    items: canonicalItems,
  });

  // 6. Tạo SHA-256 hash
  const requestHash = createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");

  // 7. Trả kết quả cho OrdersService
  return {
    items,
    canonicalJson,
    requestHash,
    canonicalVersion: 1,
  };
}
