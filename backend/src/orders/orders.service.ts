import { ConflictException, HttpException, Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { tryLockOrderRequest } from "../database/order-request-lock.js";
import { CreateOrderDto, CreateOrderItemDto } from "./dto/create-order.dto.js";
import { canonicalizeOrder } from "./order-canonical.js";

const SIZE_EXTRA_PRICE = {
  S: 0,
  M: 5000,
  L: 10000,
} as const;

const MAX_MONEY = 2147483647;
type ProductSize = keyof typeof SIZE_EXTRA_PRICE;

type CanonicalItem = CreateOrderItemDto & {
  originalIndex: number;
};

type ItemSnapshot = {
  productId: string;
  productName: string;
  size: ProductSize;
  basePrice: number;
  sizeExtraPrice: number;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  toppings: {
    toppingId: string;
    name: string;
    price: number;
  }[];
};

type OrderResponse = {
  id: string;
  status: "PENDING";
  total: number;
};

type OrderErrorResponse = {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    details?: {
      items: {
        productId: string;
        size: string;
        toppingIds: string[];
        qty: number;
        expectedUnitPrice: number;
        currentUnitPrice: number;
        currentLineTotal: number;
      }[];
      currentTotal: number;
    };
  };
};

type OrderTransactionResult =
  | {
      kind: "SUCCEEDED";
      httpStatus: 200 | 201;
      body: OrderResponse;
    }
  | {
      kind: "REJECTED";
      httpStatus: 400 | 409;
      body: OrderErrorResponse;
    };

type ItemCheck =
  | { ok: true; snapshot: ItemSnapshot }
  | { ok: false; message: string };

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private isValidMoney(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= MAX_MONEY;
  }

  // Kiểm tra một món và tạo snapshot.
  // Lỗi nghiệp vụ được trả về dưới dạng dữ liệu,
  // không throw exception trong transaction.
  private async calculateItem(
    tx: Prisma.TransactionClient,
    item: CanonicalItem,
  ): Promise<ItemCheck> {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      include: {
        toppings: {
          include: { topping: true },
        },
      },
    });

    if (!product) {
      return {
        ok: false,
        message: "Sản phẩm không tồn tại.",
      };
    }

    if (!Object.prototype.hasOwnProperty.call(SIZE_EXTRA_PRICE, item.size)) {
      return {
        ok: false,
        message: "Size không hợp lệ.",
      };
    }

    const size = item.size as ProductSize;
    const sizeExtraPrice = SIZE_EXTRA_PRICE[size];

    const selectedToppings: ItemSnapshot["toppings"] = [];
    const invalidToppings: string[] = [];

    for (const toppingId of item.toppingIds) {
      const relation = product.toppings.find(
        (entry) => entry.toppingId === toppingId,
      );

      if (!relation) {
        invalidToppings.push(toppingId);
        continue;
      }

      selectedToppings.push({
        toppingId: relation.topping.id,
        name: relation.topping.name,
        price: relation.topping.price,
      });
    }

    if (invalidToppings.length > 0) {
      return {
        ok: false,
        message: `Topping không hợp lệ: ${invalidToppings.join(", ")}`,
      };
    }

    if (
      !this.isValidMoney(product.price) ||
      !this.isValidMoney(sizeExtraPrice) ||
      selectedToppings.some((topping) => !this.isValidMoney(topping.price))
    ) {
      return {
        ok: false,
        message: "Giá sản phẩm hoặc topping không hợp lệ.",
      };
    }

    const toppingTotal = selectedToppings.reduce(
      (sum, topping) => sum + topping.price,
      0,
    );

    const unitPrice = product.price + sizeExtraPrice + toppingTotal;

    const lineTotal = unitPrice * item.qty;

    if (
      !this.isValidMoney(toppingTotal) ||
      !this.isValidMoney(unitPrice) ||
      !this.isValidMoney(lineTotal)
    ) {
      return {
        ok: false,
        message: "Giá trị tiền vượt giới hạn cho phép.",
      };
    }

    return {
      ok: true,
      snapshot: {
        productId: product.id,
        productName: product.name,
        size,
        basePrice: product.price,
        sizeExtraPrice,
        unitPrice,
        qty: item.qty,
        lineTotal,
        toppings: selectedToppings,
      },
    };
  }

  // Kiểm tra tất cả món trước khi so sánh giá.
  // fieldErrors được lưu theo canonical index.
  private async checkOrderPrices(
    tx: Prisma.TransactionClient,
    items: CanonicalItem[],
  ): Promise<
    | { ok: false; body: OrderErrorResponse }
    | {
        ok: true;
        snapshots: ItemSnapshot[];
        total: number;
        priceChanged: boolean;
      }
  > {
    const snapshots: ItemSnapshot[] = [];
    const fieldErrors: Record<string, string[]> = {};

    for (let index = 0; index < items.length; index++) {
      const result = await this.calculateItem(tx, items[index]);

      if (!result.ok) {
        fieldErrors[`items[${index}]`] = [result.message];
      } else {
        snapshots.push(result.snapshot);
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Đơn hàng chứa sản phẩm không hợp lệ.",
            fieldErrors,
          },
        },
      };
    }

    const total = snapshots.reduce((sum, item) => sum + item.lineTotal, 0);

    if (!this.isValidMoney(total)) {
      return {
        ok: false,
        body: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Tổng tiền đơn hàng vượt giới hạn.",
          },
        },
      };
    }

    const priceChanged = snapshots.some(
      (snapshot, index) =>
        snapshot.unitPrice !== items[index].expectedUnitPrice,
    );

    return {
      ok: true,
      snapshots,
      total,
      priceChanged,
    };
  }

  private async saveRejectedRequest(
    tx: Prisma.TransactionClient,
    userId: string,
    requestKey: string,
    requestHash: string,
    httpStatus: 400 | 409,
    body: OrderErrorResponse,
  ): Promise<OrderTransactionResult> {
    await tx.orderRequest.create({
      data: {
        userId,
        requestKey,
        requestHash,
        canonicalVersion: 1,
        state: "REJECTED",
        orderId: null,
        httpStatus,
        responseJson: body as Prisma.InputJsonValue,
      },
    });

    return {
      kind: "REJECTED",
      httpStatus,
      body,
    };
  }

  // Đổi canonical index về vị trí ban đầu khi trả lỗi.
  private remapFieldErrors(
    body: OrderErrorResponse,
    items: CanonicalItem[],
  ): OrderErrorResponse {
    if (!body.error.fieldErrors) return body;

    const mapped: Record<string, string[]> = {};

    for (const [key, messages] of Object.entries(body.error.fieldErrors)) {
      const match = /^items\[(\d+)\](.*)$/.exec(key);

      if (!match) {
        mapped[key] = [...messages];
        continue;
      }

      const canonicalIndex = Number(match[1]);
      const originalIndex =
        items[canonicalIndex]?.originalIndex ?? canonicalIndex;

      mapped[`items[${originalIndex}]${match[2]}`] = [...messages];
    }

    return {
      error: {
        ...body.error,
        fieldErrors: mapped,
      },
    };
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    // Lỗi transaction conflict / deadlock.
    if (error.code === "P2034") {
      return true;
    }

    if (error.code !== "P2002") {
      return false;
    }

    // Trường hợp Prisma trả về meta.target.
    const target = error.meta?.target;

    const targetValue = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : "";

    const normalizedTarget = targetValue.replace(/[_"]/g, "").toLowerCase();

    const isIdempotencyTarget =
      normalizedTarget.includes("userid") &&
      normalizedTarget.includes("requestkey");

    if (isIdempotencyTarget) {
      return true;
    }

    // Prisma 7 + adapter-pg có thể trả thông tin
    // unique constraint trong driverAdapterError.
    const adapterError = error.meta?.driverAdapterError;

    if (
      typeof adapterError !== "object" ||
      adapterError === null ||
      !("cause" in adapterError)
    ) {
      return false;
    }

    const cause = adapterError.cause;

    if (typeof cause !== "object" || cause === null) {
      return false;
    }

    const originalCode =
      "originalCode" in cause ? cause.originalCode : undefined;

    const originalMessage =
      "originalMessage" in cause ? cause.originalMessage : undefined;

    if (originalCode !== "23505" || typeof originalMessage !== "string") {
      return false;
    }

    // Chỉ retry hai unique constraint liên quan
    // trực tiếp đến idempotency của Orders.
    const allowedConstraints = [
      "orders_user_id_request_key_key",
      "order_requests_user_id_request_key_key",
    ];

    return allowedConstraints.some((constraint) =>
      originalMessage.includes(`violates unique constraint "${constraint}"`),
    );
  }

  async createOrder(
    userId: string,
    requestKey: string,
    dto: CreateOrderDto,
  ): Promise<{
    httpStatus: 200 | 201;
    body: OrderResponse;
  }> {
    const canonical = canonicalizeOrder(dto);
    const requestHash = canonical.requestHash;
    const items: CanonicalItem[] = canonical.items;

    let result: OrderTransactionResult | undefined;

    // Tối đa 3 transaction độc lập.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await this.prisma.$transaction(
          async (tx): Promise<OrderTransactionResult> => {
            const acquired = await tryLockOrderRequest(tx, userId, requestKey);

            if (!acquired) {
              throw new ConflictException({
                error: {
                  code: "ORDER_REQUEST_IN_PROGRESS",
                  message: "Yêu cầu đang được xử lý.",
                },
              });
            }

            const existing = await tx.orderRequest.findUnique({
              where: {
                userId_requestKey: { userId, requestKey },
              },
            });

            if (existing) {
              if (existing.requestHash !== requestHash) {
                throw new ConflictException({
                  error: {
                    code: "IDEMPOTENCY_CONFLICT",
                    message: "Idempotency-Key đã dùng cho nội dung khác.",
                  },
                });
              }

              if (existing.state === "SUCCEEDED") {
                return {
                  kind: "SUCCEEDED",
                  httpStatus: 200,
                  body: existing.responseJson as OrderResponse,
                };
              }

              return {
                kind: "REJECTED",
                httpStatus: existing.httpStatus as 400 | 409,
                body: existing.responseJson as OrderErrorResponse,
              };
            }

            // 1. Kiểm tra toàn bộ cấu hình và giá.
            const checked = await this.checkOrderPrices(tx, items);

            if (!checked.ok) {
              return this.saveRejectedRequest(
                tx,
                userId,
                requestKey,
                requestHash,
                400,
                checked.body,
              );
            }

            // 2. Giá thay đổi: lưu REJECTED.
            if (checked.priceChanged) {
              const body: OrderErrorResponse = {
                error: {
                  code: "PRICE_CHANGED",
                  message: "Giá sản phẩm đã thay đổi.",
                  details: {
                    items: items.map((item, index) => ({
                      productId: item.productId,
                      size: item.size,
                      toppingIds: item.toppingIds,
                      qty: item.qty,
                      expectedUnitPrice: item.expectedUnitPrice,
                      currentUnitPrice: checked.snapshots[index].unitPrice,
                      currentLineTotal: checked.snapshots[index].lineTotal,
                    })),
                    currentTotal: checked.total,
                  },
                },
              };

              return this.saveRejectedRequest(
                tx,
                userId,
                requestKey,
                requestHash,
                409,
                body,
              );
            }

            // 3. Tạo Order và snapshot trong cùng transaction.
            const order = await tx.order.create({
              data: {
                userId,
                requestKey,
                requestHash,
                status: "PENDING",
                total: checked.total,
                items: {
                  create: checked.snapshots.map((item) => ({
                    productId: item.productId,
                    productName: item.productName,
                    size: item.size,
                    basePrice: item.basePrice,
                    sizeExtraPrice: item.sizeExtraPrice,
                    unitPrice: item.unitPrice,
                    qty: item.qty,
                    lineTotal: item.lineTotal,
                    toppings: {
                      create: item.toppings.map((topping) => ({
                        toppingId: topping.toppingId,
                        name: topping.name,
                        price: topping.price,
                      })),
                    },
                  })),
                },
              },
            });

            const body: OrderResponse = {
              id: order.id,
              status: "PENDING",
              total: order.total,
            };

            // 4. Lưu ledger SUCCEEDED.
            await tx.orderRequest.create({
              data: {
                userId,
                requestKey,
                requestHash,
                canonicalVersion: 1,
                state: "SUCCEEDED",
                orderId: order.id,
                httpStatus: 201,
                responseJson: body as Prisma.InputJsonValue,
              },
            });

            return {
              kind: "SUCCEEDED",
              httpStatus: 201,
              body,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 1000,
            timeout: 2000,
          },
        );

        break;
      } catch (error) {
        if (attempt === 3 || !this.shouldRetry(error)) {
          throw error;
        }
      }
    }

    if (!result) {
      throw new Error("Transaction không trả về kết quả.");
    }

    // Transaction đã commit ở thời điểm này.
    if (result.kind === "REJECTED") {
      throw new HttpException(
        this.remapFieldErrors(result.body, items),
        result.httpStatus,
      );
    }

    // Controller cần dùng httpStatus 201/200 tương ứng.
    return {
      httpStatus: result.httpStatus,
      body: result.body,
    };
  }
}
