import { beforeEach, describe, expect, it, vi } from "vitest";

type CleanupRecord = {
  id: string;
  s3Path: string;
  status: "pending" | "processing" | "failed" | "done";
  attemptCount: number;
  nextAttemptAt: Date | null;
  processedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

const { deleteImageObjectMock, records } = vi.hoisted(() => ({
  deleteImageObjectMock: vi.fn(),
  records: [] as CleanupRecord[],
}));

vi.mock("../src/services/objectStorage", () => ({
  deleteImageObject: deleteImageObjectMock,
}));

vi.mock("../src/prisma", () => ({
  prisma: {
    deletedAssetCleanup: {
      create: vi.fn(async ({ data }) => {
        const record: CleanupRecord = {
          id: `c_${records.length + 1}`,
          s3Path: data.s3Path,
          status: data.status ?? "pending",
          attemptCount: data.attemptCount ?? 0,
          nextAttemptAt: data.nextAttemptAt ?? null,
          processedAt: null,
          lastError: null,
          createdAt: new Date(),
        };
        records.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where, take }) => {
        let list = [...records];
        if (where?.status?.in) list = list.filter((r) => where.status.in.includes(r.status));
        if (where?.attemptCount?.lt !== undefined) {
          list = list.filter((r) => r.attemptCount < where.attemptCount.lt);
        }
        if (where?.OR) {
          const now = where.OR.find((c: any) => c.nextAttemptAt?.lte)?.nextAttemptAt?.lte;
          if (now) {
            list = list.filter((r) => r.nextAttemptAt === null || r.nextAttemptAt <= now);
          }
        }
        return typeof take === "number" ? list.slice(0, take) : list;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of records) {
          const matchesId = where?.id ? row.id === where.id : true;
          const matchesStatus = where?.status?.in ? where.status.in.includes(row.status) : true;
          if (matchesId && matchesStatus) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }) => {
        const index = records.findIndex((r) => r.id === where.id);
        records[index] = {
          ...records[index],
          ...data,
        };
        return records[index];
      }),
    },
  },
}));

import {
  enqueueDeletedMenuItemImage,
  runDeletedAssetCleanupOnce,
} from "../src/services/deletedAssetCleanup";

describe("deleted asset cleanup worker", () => {
  beforeEach(() => {
    records.length = 0;
    deleteImageObjectMock.mockReset();
  });

  it("marks job done when object delete succeeds", async () => {
    deleteImageObjectMock.mockResolvedValue(undefined);

    await enqueueDeletedMenuItemImage({
      entityId: "item_1",
      s3Path: "business/b1/menu-items/item_1/old.jpg",
    });

    await runDeletedAssetCleanupOnce();

    expect(deleteImageObjectMock).toHaveBeenCalledWith(
      "business/b1/menu-items/item_1/old.jpg"
    );
    expect(records[0].status).toBe("done");
    expect(records[0].processedAt).toBeTruthy();
  });

  it("marks job failed and increments attempts when object delete fails", async () => {
    deleteImageObjectMock.mockRejectedValue(new Error("network down"));

    await enqueueDeletedMenuItemImage({
      entityId: "item_2",
      s3Path: "business/b1/menu-items/item_2/old.jpg",
    });

    await runDeletedAssetCleanupOnce();

    expect(records[0].status).toBe("failed");
    expect(records[0].attemptCount).toBe(1);
    expect(records[0].nextAttemptAt).toBeTruthy();
    expect(records[0].lastError).toContain("network down");
  });
});
