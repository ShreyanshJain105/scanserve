/*
  Warnings:

  - You are about to drop the column `stripe_payment_id` on the `orders` table. All the data in the column will be lost.
*/

ALTER TABLE "orders" DROP COLUMN "stripe_payment_id";
ALTER TABLE "orders" ADD COLUMN "razorpay_order_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "razorpay_payment_id" TEXT;
