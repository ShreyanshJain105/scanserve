-- Add unpaid status to payment_status enum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'unpaid';

-- Create payment method enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMethod') THEN
    CREATE TYPE "PaymentMethod" AS ENUM ('razorpay', 'cash');
  END IF;
END$$;

-- Add payment_method column with default
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" "PaymentMethod" NOT NULL DEFAULT 'razorpay';
