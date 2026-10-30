-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING');

-- CreateEnum
CREATE TYPE "OrderRequestState" AS ENUM ('SUCCEEDED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "base_price" INTEGER NOT NULL,
    "size_extra_price" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_toppings" (
    "order_item_id" TEXT NOT NULL,
    "topping_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,

    CONSTRAINT "order_item_toppings_pkey" PRIMARY KEY ("order_item_id","topping_id")
);

-- CreateTable
CREATE TABLE "order_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "canonical_version" INTEGER NOT NULL DEFAULT 1,
    "state" "OrderRequestState" NOT NULL,
    "order_id" TEXT,
    "http_status" INTEGER NOT NULL,
    "response_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_user_id_request_key_key" ON "orders"("user_id", "request_key");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_item_toppings_topping_id_idx" ON "order_item_toppings"("topping_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_requests_order_id_key" ON "order_requests"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_requests_user_id_request_key_key" ON "order_requests"("user_id", "request_key");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_toppings" ADD CONSTRAINT "order_item_toppings_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_toppings" ADD CONSTRAINT "order_item_toppings_topping_id_fkey" FOREIGN KEY ("topping_id") REFERENCES "toppings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_requests" ADD CONSTRAINT "order_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Sprint 2: rang buoc gia va so luong
ALTER TABLE "orders"
ADD CONSTRAINT "orders_total_nonnegative"
CHECK ("total" >= 0);

ALTER TABLE "order_items"
ADD CONSTRAINT "order_items_prices_nonnegative"
CHECK (
    "base_price" >= 0
    AND "size_extra_price" >= 0
    AND "unit_price" >= 0
    AND "line_total" >= 0
),
ADD CONSTRAINT "order_items_qty_range"
CHECK ("qty" BETWEEN 1 AND 20),
ADD CONSTRAINT "order_items_size_valid"
CHECK ("size" IN ('S', 'M', 'L')),
ADD CONSTRAINT "order_items_line_total_valid"
CHECK (
    "line_total"::bigint = "unit_price"::bigint * "qty"::bigint
);

ALTER TABLE "order_item_toppings"
ADD CONSTRAINT "order_item_toppings_price_nonnegative"
CHECK ("price" >= 0);

-- Ledger: thanh cong co don, tu choi khong co don
ALTER TABLE "order_requests"
ADD CONSTRAINT "order_requests_state_order_valid"
CHECK (
    ("state" = 'SUCCEEDED' AND "order_id" IS NOT NULL)
    OR
    ("state" = 'REJECTED' AND "order_id" IS NULL)
),
ADD CONSTRAINT "order_requests_canonical_version_valid"
CHECK ("canonical_version" = 1),
ADD CONSTRAINT "order_requests_http_status_valid"
CHECK (
    ("state" = 'SUCCEEDED' AND "http_status" = 201)
    OR
    ("state" = 'REJECTED' AND "http_status" IN (400, 409))
);
