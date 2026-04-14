-- Add payment actor attribution to orders
ALTER TABLE "orders" ADD COLUMN "payment_actors" JSONB;

-- Per-user order pins
CREATE TABLE "order_pins" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_created_at" TIMESTAMP(3) NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_pins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_pins_user_id_order_id_order_created_at_key"
ON "order_pins"("user_id", "order_id", "order_created_at");

CREATE INDEX "order_pins_user_id_business_id_idx"
ON "order_pins"("user_id", "business_id");

CREATE INDEX "order_pins_business_id_idx"
ON "order_pins"("business_id");

ALTER TABLE "order_pins"
ADD CONSTRAINT "order_pins_order_id_order_created_at_fkey"
FOREIGN KEY ("order_id", "order_created_at") REFERENCES "orders"("id", "created_at")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_pins"
ADD CONSTRAINT "order_pins_business_id_fkey"
FOREIGN KEY ("business_id") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_pins"
ADD CONSTRAINT "order_pins_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
