/*
  Warnings:

  - The primary key for the `order_items` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `orders` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- CreateEnum
CREATE TYPE "BusinessUpdateRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_partitioned_menu_item_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_partitioned_order_id_order_created_at_fkey";

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_partitioned_pkey",
ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id", "order_created_at");

-- AlterTable
ALTER TABLE "orders" DROP CONSTRAINT "orders_partitioned_pkey",
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "payment_status" SET DEFAULT 'pending',
ALTER COLUMN "payment_method" SET DEFAULT 'razorpay',
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id", "created_at");

-- CreateTable
CREATE TABLE "business_update_requests" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BusinessUpdateRequestStatus" NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_update_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "business_id" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_inbox" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_update_requests_business_id_status_idx" ON "business_update_requests"("business_id", "status");

-- CreateIndex
CREATE INDEX "notification_events_user_id_created_at_idx" ON "notification_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_inbox_user_id_created_at_idx" ON "notification_inbox"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "business_update_requests" ADD CONSTRAINT "business_update_requests_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_inbox" ADD CONSTRAINT "notification_inbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_inbox" ADD CONSTRAINT "notification_inbox_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_order_created_at_fkey" FOREIGN KEY ("order_id", "order_created_at") REFERENCES "orders"("id", "created_at") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "order_items_order_idx" RENAME TO "order_items_order_id_order_created_at_idx";

-- RenameIndex
ALTER INDEX "orders_business_created_at_idx" RENAME TO "orders_business_id_created_at_idx";

-- RenameIndex
ALTER INDEX "orders_business_status_idx" RENAME TO "orders_business_id_status_idx";

-- RenameIndex
ALTER INDEX "orders_customer_user_idx" RENAME TO "orders_customer_user_id_idx";
