import { Router } from "express";
import { prisma } from "../../database/prisma";
import { adminAuth } from "../middleware/adminAuth";
import { resolveBusinessScope } from "../helpers/adminBusinessScope";

export const adminServicesRouter = Router();

adminServicesRouter.get("/", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const services = await prisma.service.findMany({
    where: { businessId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  res.json({ data: services });
});

adminServicesRouter.post("/", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const { name, durationMinutes, price, isActive } = req.body || {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    res.status(400).json({ error: "durationMinutes must be a positive number" });
    return;
  }

  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    res.status(400).json({ error: "price must be a positive number" });
    return;
  }

  const created = await prisma.service.create({
    data: {
      businessId,
      name: name.trim(),
      durationMinutes: duration,
      price: numericPrice,
      isActive: isActive !== false,
    },
  });

  res.status(201).json({ ok: true, service: created });
});

adminServicesRouter.put("/:id", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const { id } = req.params;
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing || existing.businessId !== businessId) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const { name, durationMinutes, price, isActive } = req.body || {};
  const data: Record<string, unknown> = {};

  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (durationMinutes !== undefined) {
    const duration = Number(durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) {
      res.status(400).json({ error: "durationMinutes must be a positive number" });
      return;
    }
    data.durationMinutes = duration;
  }
  if (price !== undefined) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      res.status(400).json({ error: "price must be a positive number" });
      return;
    }
    data.price = numericPrice;
  }
  if (typeof isActive === "boolean") data.isActive = isActive;

  const updated = await prisma.service.update({
    where: { id },
    data,
  });

  res.json({ ok: true, service: updated });
});

adminServicesRouter.delete("/:id", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const { id } = req.params;
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing || existing.businessId !== businessId) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const appointmentsCount = await prisma.appointment.count({
    where: { serviceId: id },
  });
  if (appointmentsCount > 0) {
    await prisma.service.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({
      ok: true,
      softDeleted: true,
      message: "Service has appointments; marked as inactive.",
    });
    return;
  }

  await prisma.service.delete({ where: { id } });
  res.json({ ok: true, deleted: true });
});
