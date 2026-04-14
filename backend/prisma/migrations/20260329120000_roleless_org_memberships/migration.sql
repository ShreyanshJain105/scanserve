-- AlterTable
ALTER TABLE "org_memberships" DROP COLUMN "role";

-- AlterTable
ALTER TABLE "org_invites" DROP COLUMN "role";

-- DropEnum
DROP TYPE "OrgRole";
