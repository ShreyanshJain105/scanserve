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
const extraCustomerSeeds = [
  { email: "guest1@samplebiz.com", name: "Asha", phone: "555-1001" },
  { email: "guest2@samplebiz.com", name: "Ravi", phone: "555-1002" },
  { email: "guest3@samplebiz.com", name: "Maya", phone: "555-1003" },
  { email: "guest4@samplebiz.com", name: "Noah", phone: "555-1004" },
  { email: "guest5@samplebiz.com", name: "Lina", phone: "555-1005" },
  { email: "guest6@samplebiz.com", name: "Arjun", phone: "555-1006" },
  { email: "guest7@samplebiz.com", name: "Isha", phone: "555-1007" },
  { email: "guest8@samplebiz.com", name: "Omar", phone: "555-1008" },
];
const reviewComments = [
  "Loved the vibe and the coffee.",
  "Quick service and the food was hot.",
  "Solid option, will order again.",
  "Great flavors, portion size was generous.",
  "Service was friendly and fast.",
  "Nice presentation and tasty.",
  "Could be warmer, but overall good.",
  "Perfect for a quick lunch.",
  "Amazing dessert!",
  "Coffee was smooth and rich.",
];

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
  await execClickhouse(`
    CREATE TABLE IF NOT EXISTS ${database}.reviews (
      review_id String,
      order_id String,
      business_id String,
      customer_user_id String,
      rating UInt8,
      comment Nullable(String),
      likes_count UInt32,
      created_at DateTime,
      ingested_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree
    ORDER BY (business_id, created_at, review_id)
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

const seedClickhouseReviews = async (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const database = getClickhouseDatabase();
  const auth = resolveClickhouseAuth();
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  await execClickhouse(
    `INSERT INTO ${database}.reviews FORMAT JSONEachRow\n${payload}`,
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

const buildPaymentActors = (input: {
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentMethod: "razorpay" | "cash";
  paidAt: Date;
  actor: { id: string; email: string };
}) => {
  if (input.paymentStatus !== "paid" || input.paymentMethod !== "cash") {
    return null;
  }

  return {
    paidBy: { userId: input.actor.id, email: input.actor.email },
    paidAt: input.paidAt.toISOString(),
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

  const extraCustomers = await Promise.all(
    extraCustomerSeeds.map((seed) =>
      prisma.customerUser.upsert({
        where: { email: seed.email },
        update: {},
        create: {
          email: seed.email,
          passwordHash: customerHash,
        },
      })
    )
  );

  const customerPool = [customerUser, ...extraCustomers].map((user, index) => ({
    ...user,
    name: extraCustomerSeeds[index - 1]?.name ?? "Sample Guest",
    phone: extraCustomerSeeds[index - 1]?.phone ?? "555-1234",
  }));

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
      { businessId: cafe.id, name: "Sandwiches", sortOrder: 3 },
      { businessId: cafe.id, name: "Bakery", sortOrder: 4 },
    ],
    skipDuplicates: true,
  });

  const bistroCategories = await prisma.category.createMany({
    data: [
      { businessId: bistro.id, name: "Starters", sortOrder: 0 },
      { businessId: bistro.id, name: "Mains", sortOrder: 1 },
      { businessId: bistro.id, name: "Drinks", sortOrder: 2 },
      { businessId: bistro.id, name: "Salads", sortOrder: 3 },
      { businessId: bistro.id, name: "Desserts", sortOrder: 4 },
    ],
    skipDuplicates: true,
  });

  const cafeCategoryList = await prisma.category.findMany({
    where: { businessId: cafe.id },
  });
  const bistroCategoryList = await prisma.category.findMany({
    where: { businessId: bistro.id },
  });

  const cafeCategoryMap = new Map(cafeCategoryList.map((category) => [category.name, category.id]));
  const bistroCategoryMap = new Map(
    bistroCategoryList.map((category) => [category.name, category.id])
  );

  const cafeItemSeeds = [
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Breakfast") ?? cafeCategoryList[0].id,
      name: "Avocado Toast",
      description: "Sourdough with avocado and chili flakes.",
      price: new Prisma.Decimal("8.50"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Breakfast") ?? cafeCategoryList[0].id,
      name: "Berry Pancakes",
      description: "Fluffy pancakes with berry compote.",
      price: new Prisma.Decimal("7.95"),
      dietaryTags: ["vegetarian"],
      sortOrder: 1,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Coffee") ?? cafeCategoryList[1].id,
      name: "Latte",
      description: "Espresso with steamed milk.",
      price: new Prisma.Decimal("4.20"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Coffee") ?? cafeCategoryList[1].id,
      name: "Cold Brew",
      description: "Slow steeped, lightly sweet.",
      price: new Prisma.Decimal("4.60"),
      dietaryTags: ["vegan"],
      sortOrder: 1,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Dessert") ?? cafeCategoryList[2].id,
      name: "Berry Tart",
      description: "Seasonal berries with custard.",
      price: new Prisma.Decimal("6.75"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Dessert") ?? cafeCategoryList[2].id,
      name: "Chocolate Brownie",
      description: "Warm brownie with sea salt.",
      price: new Prisma.Decimal("5.95"),
      dietaryTags: ["vegetarian"],
      sortOrder: 1,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Sandwiches") ?? cafeCategoryList[0].id,
      name: "Pesto Chicken Panini",
      description: "Grilled panini with pesto chicken.",
      price: new Prisma.Decimal("9.50"),
      dietaryTags: [],
      sortOrder: 0,
    },
    {
      businessId: cafe.id,
      categoryId: cafeCategoryMap.get("Bakery") ?? cafeCategoryList[0].id,
      name: "Almond Croissant",
      description: "Buttery croissant with almond cream.",
      price: new Prisma.Decimal("4.75"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
  ];

  const bistroItemSeeds = [
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Starters") ?? bistroCategoryList[0].id,
      name: "Truffle Fries",
      description: "Crispy fries with truffle oil.",
      price: new Prisma.Decimal("7.25"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Starters") ?? bistroCategoryList[0].id,
      name: "Charred Broccolini",
      description: "Lemon, chili, toasted almonds.",
      price: new Prisma.Decimal("6.95"),
      dietaryTags: ["vegan"],
      sortOrder: 1,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Mains") ?? bistroCategoryList[1].id,
      name: "Herb Roasted Chicken",
      description: "Served with seasonal vegetables.",
      price: new Prisma.Decimal("14.95"),
      dietaryTags: [],
      sortOrder: 0,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Mains") ?? bistroCategoryList[1].id,
      name: "Seared Salmon",
      description: "Citrus glaze and wild rice.",
      price: new Prisma.Decimal("17.50"),
      dietaryTags: [],
      sortOrder: 1,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Drinks") ?? bistroCategoryList[2].id,
      name: "Citrus Spritz",
      description: "Sparkling citrus mocktail.",
      price: new Prisma.Decimal("5.50"),
      dietaryTags: ["vegan"],
      sortOrder: 0,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Drinks") ?? bistroCategoryList[2].id,
      name: "Smoked Old Fashioned",
      description: "Bourbon, bitters, orange peel.",
      price: new Prisma.Decimal("11.00"),
      dietaryTags: [],
      sortOrder: 1,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Salads") ?? bistroCategoryList[0].id,
      name: "Heirloom Tomato Salad",
      description: "Basil oil and burrata.",
      price: new Prisma.Decimal("9.25"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
    {
      businessId: bistro.id,
      categoryId: bistroCategoryMap.get("Desserts") ?? bistroCategoryList[0].id,
      name: "Olive Oil Cake",
      description: "Citrus glaze, whipped cream.",
      price: new Prisma.Decimal("7.50"),
      dietaryTags: ["vegetarian"],
      sortOrder: 0,
    },
  ];

  const existingCafeItems = await prisma.menuItem.findMany({ where: { businessId: cafe.id } });
  const existingCafeNames = new Set(existingCafeItems.map((item) => item.name.toLowerCase()));
  const cafeItemsToCreate = cafeItemSeeds.filter(
    (item) => !existingCafeNames.has(item.name.toLowerCase())
  );
  if (cafeItemsToCreate.length) {
    await prisma.menuItem.createMany({ data: cafeItemsToCreate, skipDuplicates: true });
  }

  const existingBistroItems = await prisma.menuItem.findMany({ where: { businessId: bistro.id } });
  const existingBistroNames = new Set(
    existingBistroItems.map((item) => item.name.toLowerCase())
  );
  const bistroItemsToCreate = bistroItemSeeds.filter(
    (item) => !existingBistroNames.has(item.name.toLowerCase())
  );
  if (bistroItemsToCreate.length) {
    await prisma.menuItem.createMany({ data: bistroItemsToCreate, skipDuplicates: true });
  }

  const cafeMenuItems = await prisma.menuItem.findMany({ where: { businessId: cafe.id } });
  const bistroMenuItems = await prisma.menuItem.findMany({ where: { businessId: bistro.id } });

  const cafeTableSeeds = [
    { tableNumber: 1, label: "Window" },
    { tableNumber: 2, label: "Bar" },
    { tableNumber: 3, label: "Patio" },
  ];
  const bistroTableSeeds = [
    { tableNumber: 10, label: "Patio" },
    { tableNumber: 11, label: "Booth" },
    { tableNumber: 12, label: "Garden" },
  ];

  await prisma.table.createMany({
    data: cafeTableSeeds.map((table) => ({
      businessId: cafe.id,
      tableNumber: table.tableNumber,
      label: table.label,
      isActive: true,
    })),
    skipDuplicates: true,
  });
  await prisma.table.createMany({
    data: bistroTableSeeds.map((table) => ({
      businessId: bistro.id,
      tableNumber: table.tableNumber,
      label: table.label,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  const cafeTables = await prisma.table.findMany({
    where: { businessId: cafe.id },
    orderBy: { tableNumber: "asc" },
  });
  const bistroTables = await prisma.table.findMany({
    where: { businessId: bistro.id },
    orderBy: { tableNumber: "asc" },
  });

  for (const table of cafeTables) {
    await prisma.qrCode.upsert({
      where: { uniqueCode: `sample-qr-cafe-${table.tableNumber}` },
      update: { businessId: cafe.id, tableId: table.id },
      create: {
        businessId: cafe.id,
        tableId: table.id,
        uniqueCode: `sample-qr-cafe-${table.tableNumber}`,
        qrImageUrl: null,
      },
    });
  }

  for (const table of bistroTables) {
    await prisma.qrCode.upsert({
      where: { uniqueCode: `sample-qr-bistro-${table.tableNumber}` },
      update: { businessId: bistro.id, tableId: table.id },
      create: {
        businessId: bistro.id,
        tableId: table.id,
        uniqueCode: `sample-qr-bistro-${table.tableNumber}`,
        qrImageUrl: null,
      },
    });
  }

  const makeOrder = async (input: {
    businessId: string;
    tableId: string;
    customerName: string;
    customerUserId: string | null;
    customerPhone: string | null;
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

    const paymentActors = buildPaymentActors({
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      paidAt: new Date(input.createdAt.getTime() + 30 * 60 * 1000),
      actor: managerUser,
    });

    const order = await prisma.order.create({
      data: {
        businessId: input.businessId,
        tableId: input.tableId,
        customerUserId: input.customerUserId,
        status: input.status,
        totalAmount: total,
        paymentStatus: input.paymentStatus,
        paymentMethod: input.paymentMethod,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? "555-1234",
        statusActors: input.statusActors,
        paymentActors,
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

  const seedReviewsForOrders = async (
    orders: Array<{ order: { id: string; createdAt: Date; status: string; orderCreatedAt?: Date } }>,
    businessId: string
  ) => {
    const completedOrders = orders.filter((entry) => entry.order.status === "completed");
    const reviewTargets = completedOrders.filter((_, index) => index % 2 === 0);
    const ratingCycle = [5, 4, 5, 3, 4, 2, 5, 1];

    for (let i = 0; i < reviewTargets.length; i += 1) {
      const entry = reviewTargets[i];
      const reviewer = customerPool[i % customerPool.length];
      const rating = ratingCycle[i % ratingCycle.length];
      const comment = reviewComments[i % reviewComments.length];
      const createdAt = new Date(entry.order.createdAt.getTime() + (i % 6) * 60 * 60 * 1000);

      const review = await prisma.review.upsert({
        where: {
          orderId_orderCreatedAt: {
            orderId: entry.order.id,
            orderCreatedAt: entry.order.createdAt,
          },
        },
        update: {
          rating,
          comment,
          customerUserId: reviewer.id,
          updatedAt: createdAt,
        },
        create: {
          orderId: entry.order.id,
          orderCreatedAt: entry.order.createdAt,
          businessId,
          customerUserId: reviewer.id,
          rating,
          comment,
          createdAt,
          updatedAt: createdAt,
        },
      });

      const likeCandidates = customerPool.filter((user) => user.id !== reviewer.id);
      const likeCount = i % 4;
      const likes = likeCandidates.slice(0, likeCount);
      if (likes.length) {
        await prisma.reviewLike.createMany({
          data: likes.map((user) => ({
            reviewId: review.id,
            customerUserId: user.id,
          })),
          skipDuplicates: true,
        });
      }
    }
  };

  const seedReviewsForExistingOrders = async (businessId: string) => {
    const completedOrders = await prisma.order.findMany({
      where: { businessId, status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    if (!completedOrders.length) return;

    const reviewTargets = completedOrders.filter((_, index) => index % 2 === 0);
    const ratingCycle = [5, 4, 5, 3, 4, 2, 5, 1];

    for (let i = 0; i < reviewTargets.length; i += 1) {
      const order = reviewTargets[i];
      const reviewer = customerPool[i % customerPool.length];
      const rating = ratingCycle[i % ratingCycle.length];
      const comment = reviewComments[i % reviewComments.length];
      const createdAt = new Date(order.createdAt.getTime() + (i % 6) * 60 * 60 * 1000);

      const review = await prisma.review.upsert({
        where: {
          orderId_orderCreatedAt: {
            orderId: order.id,
            orderCreatedAt: order.createdAt,
          },
        },
        update: {
          rating,
          comment,
          customerUserId: reviewer.id,
          updatedAt: createdAt,
        },
        create: {
          orderId: order.id,
          orderCreatedAt: order.createdAt,
          businessId,
          customerUserId: reviewer.id,
          rating,
          comment,
          createdAt,
          updatedAt: createdAt,
        },
      });

      const likeCandidates = customerPool.filter((user) => user.id !== reviewer.id);
      const likeCount = i % 4;
      const likes = likeCandidates.slice(0, likeCount);
      if (likes.length) {
        await prisma.reviewLike.createMany({
          data: likes.map((user) => ({
            reviewId: review.id,
            customerUserId: user.id,
          })),
          skipDuplicates: true,
        });
      }
    }
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
    tableIds: string[];
    menuItems: typeof cafeMenuItems;
    customerPrefix: string;
    customerPool: Array<{ id: string; name: string; phone: string }>;
  }) => {
    const existingCount = await prisma.order.count({ where: { businessId: input.businessId } });
    const targetCount = 160;

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
      { status: "cancelled", paymentStatus: "refunded", paymentMethod: "razorpay" },
    ];

    const orders = [];
    const addHours = (date: Date, hours: number) =>
      new Date(date.getTime() + hours * 60 * 60 * 1000);
    const baseSlots = [
      { make: () => hoursAgo(1) },
      { make: () => addHours(daysAgo(1), 2) },
      { make: () => addHours(daysAgo(2), 3) },
      { make: () => addHours(daysAgo(7), 4) },
    ];

    const pickCreatedAt = (index: number) => {
      if (index < baseSlots.length) return baseSlots[index].make();
      const offset = index - baseSlots.length;
      if (offset < 1) return hoursAgo(2);
      if (offset < 4) return addHours(daysAgo(1), (offset % 6) + 1);
      if (offset < 10) return addHours(daysAgo(2 + (offset % 5)), (offset % 6) + 1);
      if (offset < 16) return addHours(daysAgo(7 + (offset % 7)), (offset % 6) + 1);
      return addHours(daysAgo(14 + (offset % 120)), (offset % 6) + 1);
    };

    const ensureWindowCoverage = async () => {
      const ranges = [
        {
          label: "yesterday",
          start: daysAgo(1),
          end: new Date(),
          min: 3,
          pickDate: (index: number) => addHours(daysAgo(1), 10 + index),
        },
        {
          label: "currentWeek",
          start: daysAgo(6),
          end: daysAgo(1),
          min: 5,
          pickDate: (index: number) => addHours(daysAgo(2 + (index % 4)), 12 + index),
        },
        {
          label: "lastWeek",
          start: daysAgo(13),
          end: daysAgo(7),
          min: 5,
          pickDate: (index: number) => addHours(daysAgo(7 + (index % 6)), 14 + index),
        },
      ];

      for (const range of ranges) {
        const existing = await prisma.order.count({
          where: {
            businessId: input.businessId,
            createdAt: {
              gte: range.start,
              lt: range.end,
            },
          },
        });
        const needed = Math.max(0, range.min - existing);
        for (let i = 0; i < needed; i += 1) {
          const statusMeta = statuses[(orders.length + i) % statuses.length];
          const customer =
            input.customerPool[(orders.length + i + input.businessId.length) % input.customerPool.length];
          const tableId = input.tableIds[(orders.length + i) % input.tableIds.length];
          orders.push(
            await makeOrder({
              businessId: input.businessId,
              tableId,
              customerName: `${customer.name} · ${input.customerPrefix} ${orders.length + 1}`,
              customerUserId: customer.id,
              customerPhone: customer.phone,
              createdAt: range.pickDate(i),
              status: statusMeta.status,
              paymentStatus: statusMeta.paymentStatus,
              paymentMethod: statusMeta.paymentMethod,
              items: [
                { menuItemId: input.menuItems[(orders.length + i) % input.menuItems.length].id, quantity: 1 },
                {
                  menuItemId: input.menuItems[(orders.length + i + 1) % input.menuItems.length].id,
                  quantity: 1,
                },
              ],
              statusActors: pickStatusActors(statusMeta.status, ownerUser, managerUser),
            })
          );
        }
      }
    };

    await ensureWindowCoverage();

    const needed = Math.max(0, targetCount - existingCount - orders.length);
    for (let i = 0; i < needed; i += 1) {
      const statusMeta = statuses[i % statuses.length];
      const createdAt = pickCreatedAt(i);
      const customer = input.customerPool[(i + input.businessId.length) % input.customerPool.length];
      const tableId = input.tableIds[i % input.tableIds.length];
      orders.push(
        await makeOrder({
          businessId: input.businessId,
          tableId,
          customerName: `${customer.name} · ${input.customerPrefix} ${i + 1}`,
          customerUserId: customer.id,
          customerPhone: customer.phone,
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

  const ensurePaymentActors = async (businessId: string) => {
    const cashPaidOrders = await prisma.order.findMany({
      where: { businessId, paymentMethod: "cash", paymentStatus: "paid" },
    });

    for (const order of cashPaidOrders) {
      if (order.paymentActors) continue;
      const paidAt = new Date(order.createdAt.getTime() + 30 * 60 * 1000);
      await prisma.order.update({
        where: { id_createdAt: { id: order.id, createdAt: order.createdAt } },
        data: {
          paymentActors: {
            paidBy: { userId: managerUser.id, email: managerUser.email },
            paidAt: paidAt.toISOString(),
          },
        },
      });
    }
  };

  const seedOrderPins = async (businessId: string, userId: string) => {
    const recentOrders = await prisma.order.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    if (!recentOrders.length) return;

    await prisma.orderPin.createMany({
      data: recentOrders.map((order, index) => ({
        orderId: order.id,
        orderCreatedAt: order.createdAt,
        businessId,
        userId,
        pinnedAt: new Date(order.createdAt.getTime() + index * 2 * 60 * 1000),
      })),
      skipDuplicates: true,
    });
  };

  const cafeOrders = await seedOrdersForBusiness({
    businessId: cafe.id,
    tableIds: cafeTables.map((table) => table.id),
    menuItems: cafeMenuItems,
    customerPrefix: "Cafe Guest",
    customerPool,
  });

  const bistroOrders = await seedOrdersForBusiness({
    businessId: bistro.id,
    tableIds: bistroTables.map((table) => table.id),
    menuItems: bistroMenuItems,
    customerPrefix: "Bistro Guest",
    customerPool,
  });

  await ensurePaymentActors(cafe.id);
  await ensurePaymentActors(bistro.id);
  await seedOrderPins(cafe.id, ownerUser.id);
  await seedOrderPins(bistro.id, ownerUser.id);

  await seedReviewsForOrders(cafeOrders, cafe.id);
  await seedReviewsForOrders(bistroOrders, bistro.id);
  await seedReviewsForExistingOrders(cafe.id);
  await seedReviewsForExistingOrders(bistro.id);

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
    if (order.paymentStatus !== "pending") {
      events.push({
        event_id: `${order.orderId}-payment-${order.paymentStatus}`,
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
