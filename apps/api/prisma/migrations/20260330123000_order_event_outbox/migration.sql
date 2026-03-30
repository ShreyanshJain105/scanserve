-- CreateEnum
CREATE TYPE "OrderEventOutboxStatus" AS ENUM ('pending', 'processing', 'failed', 'done');

-- CreateTable
CREATE TABLE "order_event_outbox" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "event_created_at" TIMESTAMP(3) NOT NULL,
    "status" "OrderEventOutboxStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_event_outbox_event_id_key" ON "order_event_outbox"("event_id");

-- CreateIndex
CREATE INDEX "order_event_outbox_status_next_attempt_at_created_at_idx" ON "order_event_outbox"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "order_event_outbox_order_id_idx" ON "order_event_outbox"("order_id");

-- CreateIndex
CREATE INDEX "order_event_outbox_business_id_idx" ON "order_event_outbox"("business_id");
