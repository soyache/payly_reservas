import { Router } from "express";
import { prisma } from "../../database/prisma";
import { env } from "../../config/env";
import { adminAuth } from "../middleware/adminAuth";
import { createAdminSessionToken } from "../auth/adminSession";

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== env.ADMIN_PANEL_USERNAME ||
    password !== env.ADMIN_PANEL_PASSWORD
  ) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const business = await prisma.business.findUnique({
    where: { id: env.ADMIN_PANEL_BUSINESS_ID },
    select: { id: true, name: true },
  });

  if (!business) {
    res.status(500).json({ error: "Admin business is not configured" });
    return;
  }

  const session = createAdminSessionToken(username, business.id);
  res.json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    business,
  });
});

adminAuthRouter.get("/me", adminAuth, async (req, res) => {
  const businessId = req.adminContext?.businessId || env.ADMIN_PANEL_BUSINESS_ID;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, timezone: true },
  });

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({
    ok: true,
    user: {
      username: req.adminContext?.username || "admin",
      authType: req.adminContext?.authType || "api_token",
    },
    business,
  });
});
