CREATE TYPE "DeletedAssetType" AS ENUM ('menu_item_image');

CREATE TYPE "DeletedAssetCleanupStatus" AS ENUM ('pending', 'processing', 'failed', 'done');

CREATE TABLE "deleted_asset_cleanups" (
    "id" TEXT NOT NULL,
    "asset_type" "DeletedAssetType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "s3_path" TEXT NOT NULL,
    "status" "DeletedAssetCleanupStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deleted_asset_cleanups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deleted_asset_cleanups_status_next_attempt_at_created_at_idx"
ON "deleted_asset_cleanups"("status", "next_attempt_at", "created_at");

CREATE INDEX "deleted_asset_cleanups_asset_type_entity_id_idx"
ON "deleted_asset_cleanups"("asset_type", "entity_id");
