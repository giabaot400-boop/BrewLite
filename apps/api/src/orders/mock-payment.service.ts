import { Injectable } from "@nestjs/common";
import type { PaymentMethod, PaymentStatus } from "../generated/prisma/client.js";
import { evaluateMock } from "./order-workflow.js";

@Injectable()
export class MockPaymentService {
  private readonly configured: PaymentStatus;
  constructor() {
    const value = process.env.MOCK_PAYMENT_OUTCOME ?? "SUCCEEDED";
    if (value !== "SUCCEEDED" && value !== "FAILED") throw new Error("MOCK_PAYMENT_OUTCOME must be SUCCEEDED or FAILED.");
    this.configured = value;
  }
  evaluate(method: PaymentMethod): PaymentStatus { return evaluateMock(method, this.configured); }
}
