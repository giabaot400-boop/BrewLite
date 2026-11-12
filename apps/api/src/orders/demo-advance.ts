import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { OrderWorkflowService } from "./order-workflow.service.js";

async function main() {
  const [, , orderId, target] = process.argv;
  if (!orderId || !["PREPARING", "READY", "COMPLETED"].includes(target ?? "") || process.argv.length !== 4) {
    throw new Error("Usage: npm run demo:advance --workspace apps/api -- <orderId> PREPARING|READY|COMPLETED");
  }
  if (process.env.DEMO_WORKFLOW_ENABLED !== "true") throw new Error("DEMO_WORKFLOW_ENABLED must be true.");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  try { console.log(JSON.stringify(await app.get(OrderWorkflowService).advanceDemoOrder(orderId, target as "PREPARING" | "READY" | "COMPLETED"))); }
  finally { await app.close(); }
}
main().catch(() => { console.error("Demo advance stopped. Check arguments, flag, order policy and current state."); process.exitCode = 1; });
