-- CreateTable
CREATE TABLE "qr_code_rotations" (
    "id" TEXT NOT NULL,
    "qr_code_id" TEXT NOT NULL,
    "old_token" TEXT NOT NULL,
    "new_token" TEXT NOT NULL,
    "rotated_by_user_id" TEXT,
    "reason" TEXT,
    "grace_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_code_rotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_code_rotations_old_token_key" ON "qr_code_rotations"("old_token");

-- CreateIndex
CREATE INDEX "qr_code_rotations_qr_code_id_created_at_idx" ON "qr_code_rotations"("qr_code_id", "created_at");

-- CreateIndex
CREATE INDEX "qr_code_rotations_grace_expires_at_idx" ON "qr_code_rotations"("grace_expires_at");

-- AddForeignKey
ALTER TABLE "qr_code_rotations" ADD CONSTRAINT "qr_code_rotations_qr_code_id_fkey" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
