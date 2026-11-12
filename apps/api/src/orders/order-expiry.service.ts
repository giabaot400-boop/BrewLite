import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { OrderWorkflowService } from "./order-workflow.service.js";

@Injectable()
export class OrderExpiryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private active: Promise<{ scanned: number; expired: number; failed: number }> | null = null;
  constructor(private readonly prisma: PrismaService, private readonly workflow: OrderWorkflowService) {}
  async onApplicationBootstrap() {
    await this.runBatch().catch(() => this.logger.error("Expiry startup scan failed; the next tick will retry."));
    this.timer = setInterval(() => { void this.runBatch().catch(() => this.logger.error("Expiry scan failed; the next tick will retry.")); }, 60000);
    this.timer.unref();
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.active?.catch(() => {}); }
  runBatch() {
    if (this.active) return this.active;
    this.active = this.scan().finally(() => { this.active = null; });
    return this.active;
  }
  private async scan() {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE checkout_policy_version = 2
        AND status IN ('PENDING', 'PAYMENT_FAILED') AND payment_deadline <= clock_timestamp()
      ORDER BY payment_deadline, id LIMIT 50`;
    let expired = 0, failed = 0;
    for (const row of rows) {
      try { if (await this.workflow.expireOrder(row.id)) expired++; }
      catch { failed++; this.logger.error("An expired order could not be released; it remains eligible for retry."); }
    }
    return { scanned: rows.length, expired, failed };
  }
}
