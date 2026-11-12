import { HttpException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { StockConflict } from "../database/stock.js";

const uniqueConstraints = new Set([
  "payment_attempts_user_id_request_key_key",
  "payment_attempts_one_success_per_order",
]);

export function isRetryableWorkflowError(error: unknown): boolean {
  if (error instanceof StockConflict) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  const adapter = error.meta?.driverAdapterError as { cause?: { originalCode?: string; originalMessage?: string } } | undefined;
  if (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code ?? adapter?.cause?.originalCode))) return true;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (typeof target === "string" && uniqueConstraints.has(target)) return true;
  if (error.meta?.modelName === "PaymentAttempt" && Array.isArray(target)) {
    const fields = target.map(String).sort().join(",");
    if (["request_key,user_id", "requestKey,userId", "order_id", "orderId"].includes(fields)) return true;
  }
  if (adapter?.cause?.originalCode !== "23505") return false;
  return [...uniqueConstraints].some(name => adapter.cause?.originalMessage?.includes(`violates unique constraint "${name}"`));
}

export async function runWorkflowTransaction<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const started = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0 && Date.now() - started >= 8000) break;
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 1000, timeout: 2000,
      });
    } catch (error) {
      if (!isRetryableWorkflowError(error)) throw error;
    }
  }
  throw new HttpException({ error: { code: "TRANSACTION_RETRY_EXHAUSTED", message: "Chưa thể xử lý yêu cầu. Vui lòng thử lại cùng yêu cầu đã lưu." } }, 503);
}
