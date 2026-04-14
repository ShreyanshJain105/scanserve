import { beforeEach, describe, expect, it, vi } from "vitest";

type BusinessRecord = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  status: "pending" | "approved" | "rejected" | "archived";
  archivedAt: Date | null;
  logoUrl: string | null;
};

type MenuItemRecord = {
  id: string;
  businessId: string;
  imagePath: string | null;
};

type AuditRecord = {
  businessId: string;
  userId: string;
  name: string;
  slug: string;
  archivedAt: Date;
  retentionDays: number;
  metadata: unknown;
};

type CleanupRecord = {
  assetType: "menu_item_image" | "business_logo";
  entityId: string;
  s3Path: string;
};

const { businesses, menuItems, audits, cleanupRows } = vi.hoisted(() => ({
  businesses: [] as BusinessRecord[],
  menuItems: [] as MenuItemRecord[],
  audits: [] as AuditRecord[],
  cleanupRows: [] as CleanupRecord[],
}));

vi.mock("../src/services/objectStorage", () => ({
  extractImagePathFromUrl: (imageUrl: string | null) => {
    if (!imageUrl) return null;
    const marker = "/scan2serve-menu-images/";
    const idx = imageUrl.indexOf(marker);
    if (idx < 0) return null;
    return imageUrl.slice(idx + marker.length);
  },
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    business: {
      findMany: vi.fn(async ({ where, take }) => {
        const cutoff: Date | undefined = where?.archivedAt?.lte;
        let list = businesses.filter((business) => business.status === "archived");
        if (cutoff) {
          list = list.filter(
            (business) => business.archivedAt && business.archivedAt <= cutoff
          );
        }
        return typeof take === "number" ? list.slice(0, take) : list;
      }),
      delete: vi.fn(async ({ where }) => {
        const index = businesses.findIndex((business) => business.id === where.id);
        if (index >= 0) businesses.splice(index, 1);
      }),
    },
    menuItem: {
      findMany: vi.fn(async ({ where }) =>
        menuItems
          .filter((item) => item.businessId === where.businessId)
          .filter((item) => (where.imagePath?.not === null ? item.imagePath !== null : true))
      ),
    },
    deletedAssetCleanup: {
      createMany: vi.fn(async ({ data }) => {
        cleanupRows.push(...data);
        return { count: data.length };
      }),
    },
    archivedBusinessDeletionAudit: {
      create: vi.fn(async ({ data }) => {
        audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (callback) =>
      callback({
        deletedAssetCleanup: {
          createMany: async ({ data }: { data: CleanupRecord[] }) => {
            cleanupRows.push(...data);
            return { count: data.length };
          },
        },
        archivedBusinessDeletionAudit: {
          create: async ({ data }: { data: AuditRecord }) => {
            audits.push(data);
            return data;
          },
        },
        business: {
          delete: async ({ where }: { where: { id: string } }) => {
            const index = businesses.findIndex((business) => business.id === where.id);
            if (index >= 0) businesses.splice(index, 1);
          },
        },
      })
    ),
  },
}));

import { runArchivedBusinessCleanupOnce } from "../src/services/archivedBusinessCleanup";

describe("archived business cleanup worker", () => {
  beforeEach(() => {
    businesses.length = 0;
    menuItems.length = 0;
    audits.length = 0;
    cleanupRows.length = 0;
  });

  it("deletes archived businesses older than retention and writes audit rows", async () => {
    businesses.push({
      id: "b_old",
      userId: "u_1",
      name: "Old Cafe",
      slug: "old-cafe",
      status: "archived",
      archivedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      logoUrl: "http://localhost:9000/scan2serve-menu-images/business/b_old/profile/logo/a.jpg",
    });
    menuItems.push({
      id: "i_1",
      businessId: "b_old",
      imagePath: "business/b_old/menu-items/i_1/old.jpg",
    });

    await runArchivedBusinessCleanupOnce();

    expect(businesses.find((business) => business.id === "b_old")).toBeUndefined();
    expect(audits).toHaveLength(1);
    expect(cleanupRows).toHaveLength(2);
  });

  it("keeps archived businesses that are still within retention", async () => {
    businesses.push({
      id: "b_recent",
      userId: "u_2",
      name: "Recent Cafe",
      slug: "recent-cafe",
      status: "archived",
      archivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      logoUrl: null,
    });

    await runArchivedBusinessCleanupOnce();

    expect(businesses.find((business) => business.id === "b_recent")).toBeTruthy();
    expect(audits).toHaveLength(0);
  });
});
