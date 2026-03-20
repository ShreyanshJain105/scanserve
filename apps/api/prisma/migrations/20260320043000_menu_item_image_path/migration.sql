ALTER TABLE "menu_items"
  DROP COLUMN IF EXISTS "image_url",
  ADD COLUMN "image_path" TEXT;
