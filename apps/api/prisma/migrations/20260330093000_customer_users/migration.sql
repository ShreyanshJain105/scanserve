-- Customer users table
CREATE TABLE IF NOT EXISTS "customer_users" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_users_email_key" ON "customer_users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_users_phone_key" ON "customer_users"("phone");

-- Customer refresh tokens
CREATE TABLE IF NOT EXISTS "customer_refresh_tokens" (
  "id" TEXT NOT NULL,
  "customer_user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_refresh_tokens_token_hash_key" ON "customer_refresh_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "customer_refresh_tokens_customer_user_id_idx" ON "customer_refresh_tokens"("customer_user_id");

ALTER TABLE "customer_refresh_tokens"
  ADD CONSTRAINT "customer_refresh_tokens_customer_user_id_fkey"
  FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Orders: add customer_user_id
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_user_id" TEXT;
CREATE INDEX IF NOT EXISTS "orders_customer_user_id_idx" ON "orders"("customer_user_id");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_user_id_fkey"
  FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
