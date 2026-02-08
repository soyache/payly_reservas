import express from "express";
import fs from "node:fs";
import path from "node:path";
import morgan from "morgan";
import { env } from "./config/env";
import { webhookRouter } from "./whatsapp/webhook";
import { appointmentsRouter } from "./api/routes/appointments";
import { startScheduler } from "./jobs/scheduler";
import { adminAuthRouter } from "./api/routes/adminAuth";
import { adminServicesRouter } from "./api/routes/adminServices";
import { adminTimeSlotsRouter } from "./api/routes/adminTimeSlots";

async function bootstrap(): Promise<void> {
  if (!fs.existsSync(env.UPLOAD_DIR)) {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  }

  const app = express();

  // JSON parser with raw body capture for HMAC verification
  app.use(
    express.json({
      limit: "2mb",
      verify: (req: express.Request, _res, buf: Buffer) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    })
  );

  app.use(morgan("dev"));

  // Health check
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // WhatsApp webhook routes
  app.use(webhookRouter);

  // Legacy Admin API routes (token-based)
  app.use("/api/appointments", appointmentsRouter);
  // Admin panel API routes
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin/appointments", appointmentsRouter);
  app.use("/api/admin/services", adminServicesRouter);
  app.use("/api/admin/time-slots", adminTimeSlotsRouter);
  app.use("/admin", express.static(path.join(process.cwd(), "public", "admin")));

  // Start outbound message worker
  startScheduler();

  app.listen(env.PORT, () => {
    console.log(`Payly Reservas API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
