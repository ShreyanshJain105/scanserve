import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@scan2serve.com" },
    update: {},
    create: {
      email: "admin@scan2serve.com",
      passwordHash: adminPassword,
      role: "admin",
    },
  });

  console.log("Seed complete: admin user created (admin@scan2serve.com)");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
