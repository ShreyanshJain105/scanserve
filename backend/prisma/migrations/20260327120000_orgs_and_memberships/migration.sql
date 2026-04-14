-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('owner', 'manager', 'staff');

-- CreateEnum
CREATE TYPE "OrgInviteStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "BusinessRole" AS ENUM ('owner', 'manager', 'staff');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "org_id" TEXT;

-- CreateTable
CREATE TABLE "orgs" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_invites" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL,
    "status" "OrgInviteStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_memberships" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orgs_owner_user_id_idx" ON "orgs"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_memberships_org_id_user_id_key" ON "org_memberships"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "org_memberships_user_id_idx" ON "org_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_invites_org_id_user_id_key" ON "org_invites"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "org_invites_user_id_idx" ON "org_invites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_memberships_business_id_user_id_key" ON "business_memberships"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "business_memberships_user_id_idx" ON "business_memberships"("user_id");

-- CreateIndex
CREATE INDEX "businesses_org_id_idx" ON "businesses"("org_id");

-- AddForeignKey
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
