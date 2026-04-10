-- Add reviews and review likes
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_created_at" TIMESTAMP(3) NOT NULL,
    "business_id" TEXT NOT NULL,
    "customer_user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(250),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reviews_order_id_order_created_at_key" ON "reviews"("order_id", "order_created_at");
CREATE INDEX "reviews_business_id_created_at_idx" ON "reviews"("business_id", "created_at");
CREATE INDEX "reviews_business_id_rating_idx" ON "reviews"("business_id", "rating");
CREATE INDEX "reviews_customer_user_id_idx" ON "reviews"("customer_user_id");

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_order_created_at_fkey"
  FOREIGN KEY ("order_id", "order_created_at") REFERENCES "orders"("id", "created_at") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_user_id_fkey"
  FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "review_likes" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "customer_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_likes_review_id_customer_user_id_key" ON "review_likes"("review_id", "customer_user_id");
CREATE INDEX "review_likes_review_id_idx" ON "review_likes"("review_id");
CREATE INDEX "review_likes_customer_user_id_idx" ON "review_likes"("customer_user_id");

ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_review_id_fkey"
  FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_likes" ADD CONSTRAINT "review_likes_customer_user_id_fkey"
  FOREIGN KEY ("customer_user_id") REFERENCES "customer_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
