import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// ─── Global Middleware ──────────────────────────────────────
// helmet: sets security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// cors: allows requests from the Next.js frontend only
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

// Parse JSON bodies (Stripe webhooks need raw body, so that route will override this)
app.use(express.json());

// ─── Health Check ───────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes (to be added per feature) ───────────────────────
// app.use("/api/auth", authRoutes);
// app.use("/api/business", businessRoutes);
// app.use("/api/orders", orderRoutes);
// app.use("/api/payments", paymentRoutes);
// app.use("/api/admin", adminRoutes);

// ─── Error Handler ──────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err.message);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message,
    });
  }
);

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
});

export default app;
