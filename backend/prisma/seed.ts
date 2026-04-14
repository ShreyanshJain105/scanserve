import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminSeedEmail = process.env.ADMIN_SEED_EMAIL || "admin@scan2serve.com";
  const adminSeedPassword = process.env.ADMIN_SEED_PASSWORD || "admin123";

  // Create admin user
  const adminPassword = await bcrypt.hash(adminSeedPassword, 10);
  await prisma.user.upsert({
    where: { email: adminSeedEmail },
    update: {},
    create: {
      email: adminSeedEmail,
      passwordHash: adminPassword,
      role: "admin",
    },
  });

  // Create reproducible QR test context for local smoke checks.
  const seedBusinessPassword = await bcrypt.hash("business123", 10);
  const seedBusinessUser = await prisma.user.upsert({
    where: { email: "seedbiz@scan2serve.com" },
    update: {},
    create: {
      email: "seedbiz@scan2serve.com",
      passwordHash: seedBusinessPassword,
      role: "business",
    },
  });

  const seedBusiness = await prisma.business.upsert({
    where: { slug: "seed-qr-biz" },
    update: { status: "approved" },
    create: {
      userId: seedBusinessUser.id,
      name: "Seed QR Biz",
      slug: "seed-qr-biz",
      description: "Seed business for QR auth smoke tests",
      address: "Seed Address",
      phone: "9999999999",
      status: "approved",
    },
  });

  const seedTable = await prisma.table.upsert({
    where: {
      businessId_tableNumber: { businessId: seedBusiness.id, tableNumber: 1 },
    },
    update: { isActive: true, label: "Table 1" },
    create: {
      businessId: seedBusiness.id,
      tableNumber: 1,
      label: "Table 1",
      isActive: true,
    },
  });

  await prisma.qrCode.upsert({
    where: { uniqueCode: "valid-qr-live-token-123456" },
    update: {
      businessId: seedBusiness.id,
      tableId: seedTable.id,
    },
    create: {
      businessId: seedBusiness.id,
      tableId: seedTable.id,
      uniqueCode: "valid-qr-live-token-123456",
      qrImageUrl: null,
    },
  });

  console.log(`Seed complete: admin (${adminSeedEmail}) + QR seed context ready`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
