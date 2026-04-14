DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'BusinessStatus' AND e.enumlabel = 'archived'
  ) THEN
    ALTER TYPE "BusinessStatus" ADD VALUE 'archived';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'DeletedAssetType' AND e.enumlabel = 'business_logo'
  ) THEN
    ALTER TYPE "DeletedAssetType" ADD VALUE 'business_logo';
  END IF;
END $$;

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archived_previous_status" "BusinessStatus";

CREATE INDEX IF NOT EXISTS "businesses_status_archived_at_idx"
  ON "businesses"("status", "archived_at");

CREATE TABLE IF NOT EXISTS "archived_business_deletion_audits" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retention_days" INTEGER NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "archived_business_deletion_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "archived_business_deletion_audits_deleted_at_idx"
  ON "archived_business_deletion_audits"("deleted_at");

CREATE INDEX IF NOT EXISTS "archived_business_deletion_audits_user_id_deleted_at_idx"
  ON "archived_business_deletion_audits"("user_id", "deleted_at");
