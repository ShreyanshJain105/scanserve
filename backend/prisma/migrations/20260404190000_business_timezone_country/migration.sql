-- Add business country + timezone fields for analytics windowing
ALTER TABLE "businesses"
ADD COLUMN "country_code" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
