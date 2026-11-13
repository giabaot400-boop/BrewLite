/*
  Warnings:

  - A unique constraint covering the columns `[id,user_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `subtotal` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('WALLET', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('FAILED', 'SUCCEEDED');

-- CreateEnum
CREATE TYPE "StockReservationState" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'RETURNED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "OrderStatus" ADD VALUE 'PAID';
ALTER TYPE "OrderStatus" ADD VALUE 'PREPARING';
ALTER TYPE "OrderStatus" ADD VALUE 'READY';
ALTER TYPE "OrderStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "checkout_policy_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "discount_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loyalty_points_expected" INTEGER,
ADD COLUMN     "loyalty_policy_snapshot" JSONB,
ADD COLUMN     "paid_at" TIMESTAMPTZ(3),
ADD COLUMN     "payment_deadline" TIMESTAMPTZ(3),
ADD COLUMN     "promotion_evaluated_at" TIMESTAMPTZ(3),
ADD COLUMN     "promotion_id" TEXT,
ADD COLUMN     "promotion_snapshot" JSONB,
ADD COLUMN     "subtotal" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
-- Bao toan don Sprint 2: subtotal bang total, policy giu mac dinh 1.
UPDATE "orders"
SET "subtotal" = "total"
WHERE "subtotal" IS NULL;

ALTER TABLE "orders"
ALTER COLUMN "subtotal" SET NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "reserved_stock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "loyalty_points" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "minimum_subtotal" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "max_discount_amount" INTEGER,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "canonical_version" INTEGER NOT NULL DEFAULT 1,
    "gateway_key" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "failure_code" TEXT,
    "refunded_amount" INTEGER NOT NULL DEFAULT 0,
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "state" "StockReservationState" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_gateway_key_key" ON "payment_attempts"("gateway_key");

-- CreateIndex
CREATE INDEX "payment_attempts_order_id_created_at_id_idx" ON "payment_attempts"("order_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_user_id_request_key_key" ON "payment_attempts"("user_id", "request_key");

-- CreateIndex
CREATE INDEX "stock_reservations_order_id_state_idx" ON "stock_reservations"("order_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_order_id_product_id_key" ON "stock_reservations"("order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_entries_order_id_key" ON "loyalty_entries"("order_id");

-- CreateIndex
CREATE INDEX "loyalty_entries_user_id_idx" ON "loyalty_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_entries_order_id_user_id_key" ON "loyalty_entries"("order_id", "user_id");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_id_idx" ON "orders"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "orders_checkout_policy_version_status_payment_deadline_id_idx" ON "orders"("checkout_policy_version", "status", "payment_deadline", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_user_id_key" ON "orders"("id", "user_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_user_id_fkey" FOREIGN KEY ("order_id", "user_id") REFERENCES "orders"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_order_id_user_id_fkey" FOREIGN KEY ("order_id", "user_id") REFERENCES "orders"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Sprint 3: ton kho Product va diem
ALTER TABLE "products"
ADD CONSTRAINT "products_stock_valid"
CHECK (
  "stock" >= 0
  AND "reserved_stock" >= 0
  AND "reserved_stock" <= "stock"
  AND "stock_version" >= 0
);

ALTER TABLE "users"
ADD CONSTRAINT "users_loyalty_points_nonnegative"
CHECK ("loyalty_points" >= 0);

-- Tong tien va policy cua don
ALTER TABLE "orders"
ADD CONSTRAINT "orders_amounts_valid"
CHECK (
  "subtotal" >= 0
  AND "discount_total" >= 0
  AND "discount_total" <= "subtotal"
  AND "subtotal"::bigint - "discount_total"::bigint = "total"::bigint
),
ADD CONSTRAINT "orders_version_valid"
CHECK ("version" >= 0),
ADD CONSTRAINT "orders_checkout_policy_valid"
CHECK ("checkout_policy_version" IN (1, 2)),
ADD CONSTRAINT "orders_policy2_required_fields"
CHECK (
  "checkout_policy_version" <> 2
  OR (
    "total" >= 1
    AND "payment_deadline" IS NOT NULL
    AND "loyalty_policy_snapshot" IS NOT NULL
    AND "loyalty_points_expected" IS NOT NULL
    AND "loyalty_points_expected" >= 0
  )
),
ADD CONSTRAINT "orders_promotion_fields_valid"
CHECK (
  (
    "promotion_id" IS NULL
    AND "promotion_snapshot" IS NULL
    AND "promotion_evaluated_at" IS NULL
  )
  OR (
    "promotion_id" IS NOT NULL
    AND "promotion_snapshot" IS NOT NULL
    AND "promotion_evaluated_at" IS NOT NULL
  )
);

-- Mo rong canonical ledger, khong sua migration Sprint 2
ALTER TABLE "order_requests"
DROP CONSTRAINT "order_requests_canonical_version_valid";

ALTER TABLE "order_requests"
ADD CONSTRAINT "order_requests_canonical_version_valid"
CHECK ("canonical_version" IN (1, 2));

-- Khuyen mai
ALTER TABLE "promotions"
ADD CONSTRAINT "promotions_policy_valid"
CHECK (
  "starts_at" < "ends_at"
  AND "minimum_subtotal" >= 0
  AND "type" = 'PERCENT'
  AND "value" BETWEEN 1 AND 100
  AND ("max_discount_amount" IS NULL OR "max_discount_amount" >= 0)
);

-- Thanh toan
ALTER TABLE "payment_attempts"
ADD CONSTRAINT "payment_attempts_amount_version_valid"
CHECK (
  "amount" >= 1
  AND "version" >= 0
  AND "canonical_version" = 1
  AND "refunded_amount" >= 0
  AND "refunded_amount" <= "amount"
),
ADD CONSTRAINT "payment_attempts_result_valid"
CHECK (
  (
    "status" = 'FAILED'
    AND "failure_code" IS NOT NULL
    AND "failure_code" = 'PAYMENT_DECLINED'
    AND "refunded_amount" = 0
    AND "refunded_at" IS NULL
  )
  OR (
    "status" = 'SUCCEEDED'
    AND "failure_code" IS NULL
    AND (
      ("refunded_amount" = 0 AND "refunded_at" IS NULL)
      OR
      ("refunded_amount" = "amount" AND "refunded_at" IS NOT NULL)
    )
  )
);

CREATE UNIQUE INDEX "payment_attempts_one_success_per_order"
ON "payment_attempts" ("order_id")
WHERE "status" = 'SUCCEEDED';

-- Giu kho
ALTER TABLE "stock_reservations"
ADD CONSTRAINT "stock_reservations_qty_positive"
CHECK ("qty" > 0),
ADD CONSTRAINT "stock_reservations_resolution_valid"
CHECK (
  ("state" = 'ACTIVE' AND "resolved_at" IS NULL)
  OR
  ("state" IN ('CONSUMED', 'RELEASED', 'RETURNED')
    AND "resolved_at" IS NOT NULL)
);

ALTER TABLE "loyalty_entries"
ADD CONSTRAINT "loyalty_entries_points_nonnegative"
CHECK ("points" >= 0);
-- Sprint 3: ton kho Product va diem