import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execClickhouse, getClickhouseDatabase } from "../src/services/clickhouseClient";

const prisma = new PrismaClient();

const adminEmail = "admin@scan2serve.com";
const adminPassword = "admin123";

const ownerEmail = "owner@samplebiz.com";
const ownerPassword = "owner123";

const managerEmail = "manager@samplebiz.com";
const managerPassword = "manager123";

const customerEmail = "customer@samplebiz.com";
const customerPassword = "customer123";

const hashPassword = async (value: string) => bcrypt.hash(value, 10);

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const hoursAgo = (hours: number) => {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
};

const resolveClickhouseAuth = () => {
  const user =
    process.env.CLICKHOUSE_BOOTSTRAP_USER ||
    process.env.CLICKHOUSE_QUERY_USER ||
    process.env.CLICKHOUSE_USER;
  const password =
    process.env.CLICKHOUSE_BOOTSTRAP_PASSWORD ||
    process.env.CLICKHOUSE_QUERY_PASSWORD ||
    process.env.CLICKHOUSE_PASSWORD;
  return { user, password };
};

const createClickhouseSchema = async () => {
  const database = getClickhouseDatabase();
  const auth = resolveClickhouseAuth();
  await execClickhouse(`CREATE DATABASE IF NOT EXISTS ${database}`, auth);
  await execClickhouse(`
    CREATE TABLE IF NOT EXISTS ${database}.order_events (
      event_id String,
      event_type String,
      event_created_at DateTime,
      order_id String,
      business_id String,
      payload String,
      ingested_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree
    ORDER BY (order_id, event_id)
  `, auth);
};

const seedClickhouseEvents = async (events: Array<Record<string, unknown>>) => {
  if (!events.length) return;
  const database = getClickhouseDatabase();
  const auth = resolveClickhouseAuth();
  const payload = events.map((event) => JSON.stringify(event)).join("\n");
  await execClickhouse(
    `INSERT INTO ${database}.order_events FORMAT JSONEachRow\n${payload}`,
    auth
  );
};

const formatClickhouseDate = (date: Date) =>
  date.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

const pickStatusActors = (
  status: string,
  owner: { id: string; email: string },
  manager: { id: string; email: string }
) => {
  const actor = status === "pending" || status === "cancelled" ? owner : manager;
  return {
    [status]: { userId: actor.id, email: actor.email },
  };
};

const buildOrderPayload = (order: {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  paymentMethod: string;
}) =>
  JSON.stringify({
    order: {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
    },
  });

async function main() {
  await createClickhouseSchema();

  const [adminHash, ownerHash, managerHash, customerHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(ownerPassword),
    hashPassword(managerPassword),
    hashPassword(customerPassword),
  ]);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash: adminHash, role: "admin" },
  });

  const ownerUser = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { email: ownerEmail, passwordHash: ownerHash, role: "business" },
  });

  const managerUser = await prisma.user.upsert({
    where: { email: managerEmail },
    update: {},
    create: { email: managerEmail, passwordHash: managerHash, role: "business" },
  });

  const customerUser = await prisma.customerUser.upsert({
    where: { email: customerEmail },
    update: {},
    create: {
      email: customerEmail,
      passwordHash: customerHash,
    },
  });

  const existingOrg = await prisma.org.findFirst({
    where: { ownerUserId: ownerUser.id },
  });
  const org = existingOrg
    ? await prisma.org.update({
        where: { id: existingOrg.id },
        data: { name: "Sample Hospitality Group" },
      })
    : await prisma.org.create({
        data: {
          ownerUserId: ownerUser.id,
          name: "Sample Hospitality Group",
        },
      });

  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: ownerUser.id } },
    update: {},
    create: { orgId: org.id, userId: ownerUser.id },
  });

  await prisma.orgMembership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: managerUser.id } },
    update: {},
    create: { orgId: org.id, userId: managerUser.id },
  });

  const cafe = await prisma.business.upsert({
    where: { slug: "cafe-aurora" },
    update: { status: "approved", orgId: org.id },
    create: {
      userId: ownerUser.id,
      orgId: org.id,
      name: "Cafe Aurora",
      slug: "cafe-aurora",
      description: "Cozy cafe serving breakfast and coffee.",
      address: "101 Sunrise Lane",
      phone: "555-0101",
      status: "approved",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "Asia/Kolkata",
    },
  });

  const bistro = await prisma.business.upsert({
    where: { slug: "bistro-nova" },
    update: { status: "approved", orgId: org.id },
    create: {
      userId: ownerUser.id,
      orgId: org.id,
      name: "Bistro Nova",
      slug: "bistro-nova",
      description: "Modern bistro with seasonal plates.",
      address: "202 Moonlight Ave",
      phone: "555-0202",
      status: "approved",
      currencyCode: "USD",
      countryCode: "US",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.businessMembership.upsert({
    where: { businessId_userId: { businessId: cafe.id, userId: managerUser.id } },
    update: { role: "manager" },
    create: { businessId: cafe.id, userId: managerUser.id, role: "manager" },
  });

  const cafeCategories = await prisma.category.createMany({
    data: [
      { businessId: cafe.id, name: "Breakfast", sortOrder: 0 },
      { businessId: cafe.id, name: "Coffee", sortOrder: 1 },
      { businessId: cafe.id, name: "Dessert", sortOrder: 2 },
    ],
    skipDuplicates: true,
  });

  const bistroCategories = await prisma.category.createMany({
    data: [
      { businessId: bistro.id, name: "Starters", sortOrder: 0 },
      { businessId: bistro.id, name: "Mains", sortOrder: 1 },
      { businessId: bistro.id, name: "Drinks", sortOrder: 2 },
    ],
    skipDuplicates: true,
  });

  const cafeCategoryList = await prisma.category.findMany({
    where: { businessId: cafe.id },
  });
  const bistroCategoryList = await prisma.category.findMany({
    where: { businessId: bistro.id },
  });

  const cafeItems = await prisma.menuItem.createMany({
    data: [
      {
        businessId: cafe.id,
        categoryId: cafeCategoryList.find((c) => c.name === "Breakfast")?.id ?? cafeCategoryList[0].id,
        name: "Avocado Toast",
        description: "Sourdough with avocado and chili flakes.",
        price: new Prisma.Decimal("8.50"),
        dietaryTags: ["vegetarian"],
        sortOrder: 0,
      },
      {
        businessId: cafe.id,
        categoryId: cafeCategoryList.find((c) => c.name === "Coffee")?.id ?? cafeCategoryList[1].id,
        name: "Latte",
        description: "Espresso with steamed milk.",
        price: new Prisma.Decimal("4.20"),
        dietaryTags: ["vegetarian"],
        sortOrder: 0,
      },
      {
        businessId: cafe.id,
        categoryId: cafeCategoryList.find((c) => c.name === "Dessert")?.id ?? cafeCategoryList[2].id,
        name: "Berry Tart",
        description: "Seasonal berries with custard.",
        price: new Prisma.Decimal("6.75"),
        dietaryTags: ["vegetarian"],
        sortOrder: 0,
      },
    ],
    skipDuplicates: true,
  });

  const bistroItems = await prisma.menuItem.createMany({
    data: [
      {
        businessId: bistro.id,
        categoryId: bistroCategoryList.find((c) => c.name === "Starters")?.id ?? bistroCategoryList[0].id,
        name: "Truffle Fries",
        description: "Crispy fries with truffle oil.",
        price: new Prisma.Decimal("7.25"),
        dietaryTags: ["vegetarian"],
        sortOrder: 0,
      },
      {
        businessId: bistro.id,
        categoryId: bistroCategoryList.find((c) => c.name === "Mains")?.id ?? bistroCategoryList[1].id,
        name: "Herb Roasted Chicken",
        description: "Served with seasonal vegetables.",
        price: new Prisma.Decimal("14.95"),
        dietaryTags: [],
        sortOrder: 0,
      },
      {
        businessId: bistro.id,
        categoryId: bistroCategoryList.find((c) => c.name === "Drinks")?.id ?? bistroCategoryList[2].id,
        name: "Citrus Spritz",
        description: "Sparkling citrus mocktail.",
        price: new Prisma.Decimal("5.50"),
        dietaryTags: ["vegan"],
        sortOrder: 0,
      },
    ],
    skipDuplicates: true,
  });

  const cafeMenuItems = await prisma.menuItem.findMany({ where: { businessId: cafe.id } });
  const bistroMenuItems = await prisma.menuItem.findMany({ where: { businessId: bistro.id } });

  const cafeTable = await prisma.table.upsert({
    where: { businessId_tableNumber: { businessId: cafe.id, tableNumber: 1 } },
    update: { label: "Window" },
    create: { businessId: cafe.id, tableNumber: 1, label: "Window", isActive: true },
  });

  const bistroTable = await prisma.table.upsert({
    where: { businessId_tableNumber: { businessId: bistro.id, tableNumber: 10 } },
    update: { label: "Patio" },
    create: { businessId: bistro.id, tableNumber: 10, label: "Patio", isActive: true },
  });

  await prisma.qrCode.upsert({
    where: { uniqueCode: "sample-qr-cafe" },
    update: { businessId: cafe.id, tableId: cafeTable.id },
    create: {
      businessId: cafe.id,
      tableId: cafeTable.id,
      uniqueCode: "sample-qr-cafe",
      qrImageUrl: null,
    },
  });

  await prisma.qrCode.upsert({
    where: { uniqueCode: "sample-qr-bistro" },
    update: { businessId: bistro.id, tableId: bistroTable.id },
    create: {
      businessId: bistro.id,
      tableId: bistroTable.id,
      uniqueCode: "sample-qr-bistro",
      qrImageUrl: null,
    },
  });

  const makeOrder = async (input: {
    businessId: string;
    tableId: string;
    customerName: string;
    createdAt: Date;
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
    paymentStatus: "pending" | "paid" | "failed" | "refunded";
    paymentMethod: "razorpay" | "cash";
    items: Array<{ menuItemId: string; quantity: number }>
    statusActors: Record<string, { userId: string; email: string }>;
  }) => {
    const menuLookup = await prisma.menuItem.findMany({
      where: { id: { in: input.items.map((item) => item.menuItemId) } },
    });

    const total = input.items.reduce((sum, item) => {
      const menuItem = menuLookup.find((menu) => menu.id === item.menuItemId);
      const price = menuItem ? new Prisma.Decimal(menuItem.price) : new Prisma.Decimal(0);
      return sum.plus(price.mul(item.quantity));
    }, new Prisma.Decimal(0));

    const order = await prisma.order.create({
      data: {
        businessId: input.businessId,
        tableId: input.tableId,
        customerUserId: customerUser.id,
        status: input.status,
        totalAmount: total,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        customerName: input.customerName,
        customerPhone: "555-1234",
        statusActors: input.statusActors,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      },
    });

    await prisma.orderItem.createMany({
      data: input.items.map((item) => {
        const menuItem = menuLookup.find((menu) => menu.id === item.menuItemId);
        return {
          orderId: order.id,
          orderCreatedAt: order.createdAt,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: menuItem?.price ?? new Prisma.Decimal(0),
        };
      }),
    });

    return { order, total };
  };

  const createdOrders = [] as Array<{
    orderId: string;
    businessId: string;
    createdAt: Date;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    totalAmount: string;
  }>;

  const seedOrdersForBusiness = async (input: {
    businessId: string;
    tableId: string;
    menuItems: typeof cafeMenuItems;
    customerPrefix: string;
  }) => {
    const existingCount = await prisma.order.count({ where: { businessId: input.businessId } });
    const targetCount = 120;
    if (existingCount >= targetCount) return [];

    const statuses: Array<{
      status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
      paymentStatus: "pending" | "paid" | "failed" | "refunded";
      paymentMethod: "razorpay" | "cash";
    }> = [
      { status: "completed", paymentStatus: "paid", paymentMethod: "razorpay" },
      { status: "completed", paymentStatus: "paid", paymentMethod: "cash" },
      { status: "ready", paymentStatus: "paid", paymentMethod: "cash" },
      { status: "preparing", paymentStatus: "pending", paymentMethod: "cash" },
      { status: "pending", paymentStatus: "pending", paymentMethod: "cash" },
      { status: "cancelled", paymentStatus: "failed", paymentMethod: "razorpay" },
    ];

    const orders = [];
    const needed = targetCount - existingCount;
    for (let i = 0; i < needed; i += 1) {
      const statusMeta = statuses[i % statuses.length];
      const dayOffset = (i % 180) + 1;
      const createdAt = i < 8 ? hoursAgo(i + 1) : daysAgo(dayOffset);
      orders.push(
        await makeOrder({
          businessId: input.businessId,
          tableId: input.tableId,
          customerName: `${input.customerPrefix} ${i + 1}`,
          createdAt,
          status: statusMeta.status,
          paymentStatus: statusMeta.paymentStatus,
          paymentMethod: statusMeta.paymentMethod,
          items: [
            { menuItemId: input.menuItems[i % input.menuItems.length].id, quantity: 1 },
            { menuItemId: input.menuItems[(i + 1) % input.menuItems.length].id, quantity: 1 },
          ],
          statusActors: pickStatusActors(statusMeta.status, ownerUser, managerUser),
        })
      );
    }

    return orders;
  };

  const cafeOrders = await seedOrdersForBusiness({
    businessId: cafe.id,
    tableId: cafeTable.id,
    menuItems: cafeMenuItems,
    customerPrefix: "Cafe Guest",
  });

  const bistroOrders = await seedOrdersForBusiness({
    businessId: bistro.id,
    tableId: bistroTable.id,
    menuItems: bistroMenuItems,
    customerPrefix: "Bistro Guest",
  });

  [...cafeOrders, ...bistroOrders].forEach(({ order, total }) => {
    createdOrders.push({
      orderId: order.id,
      businessId: order.businessId,
      createdAt: order.createdAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: total.toString(),
    });
  });

  const clickhouseEvents = createdOrders.flatMap((order) => {
    const payload = buildOrderPayload(order);
    const base = {
      order_id: order.orderId,
      business_id: order.businessId,
      payload,
    };
    const events = [
      {
        event_id: `${order.orderId}-created`,
        event_type: "order_created",
        event_created_at: formatClickhouseDate(order.createdAt),
        ...base,
      },
    ];
    if (order.paymentStatus === "paid") {
      events.push({
        event_id: `${order.orderId}-paid`,
        event_type: "order_payment_updated",
        event_created_at: formatClickhouseDate(order.createdAt),
        ...base,
      });
    }
    events.push({
      event_id: `${order.orderId}-status-${order.status}`,
      event_type: "order_status_updated",
      event_created_at: formatClickhouseDate(order.createdAt),
      ...base,
    });
    return events;
  });

  await seedClickhouseEvents(clickhouseEvents);

  console.log("Sample seed complete:");
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`Owner: ${ownerEmail} / ${ownerPassword}`);
  console.log(`Manager: ${managerEmail} / ${managerPassword}`);
  console.log(`Customer: ${customerEmail} / ${customerPassword}`);
  console.log(`Businesses: ${cafe.name}, ${bistro.name}`);
}

main()
  .catch((error) => {
    console.error("Sample seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
