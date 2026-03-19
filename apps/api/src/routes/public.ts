import express from "express";
import { prisma } from "../prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendError, sendSuccess } from "../utils/response";

const router: express.Router = express.Router();

router.get(
  "/qr/:qrToken",
  asyncHandler(async (req, res) => {
    const qrToken = req.params.qrToken;
    if (!qrToken || qrToken.length < 12) {
      sendError(res, "Invalid QR token", 400, "INVALID_QR_TOKEN");
      return;
    }

    let qrCode = await prisma.qrCode.findUnique({
      where: { uniqueCode: qrToken },
      include: {
        business: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
          },
        },
        table: {
          select: {
            id: true,
            tableNumber: true,
            isActive: true,
          },
        },
      },
    });

    let isGraceToken = false;
    if (!qrCode) {
      const rotation = await prisma.qrCodeRotation.findFirst({
        where: {
          oldToken: qrToken,
          graceExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        include: {
          qrCode: {
            include: {
              business: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  status: true,
                },
              },
              table: {
                select: {
                  id: true,
                  tableNumber: true,
                  isActive: true,
                },
              },
            },
          },
        },
      });
      if (rotation) {
        qrCode = rotation.qrCode;
        isGraceToken = true;
      }
    }

    if (!qrCode) {
      sendError(res, "QR token not found", 404, "QR_NOT_FOUND");
      return;
    }

    if (qrCode.business.status !== "approved") {
      sendError(res, "Business is not available", 403, "BUSINESS_NOT_AVAILABLE");
      return;
    }

    if (!qrCode.table.isActive) {
      sendError(res, "Table is inactive", 403, "TABLE_INACTIVE");
      return;
    }

    sendSuccess(res, {
      qr: {
        token: qrCode.uniqueCode,
        business: {
          id: qrCode.business.id,
          slug: qrCode.business.slug,
          name: qrCode.business.name,
        },
        table: {
          id: qrCode.table.id,
          number: qrCode.table.tableNumber,
        },
        isGraceToken,
      },
    });
  })
);

export default router;
