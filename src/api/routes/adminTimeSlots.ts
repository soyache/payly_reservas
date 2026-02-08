import { Router } from "express";
import { prisma } from "../../database/prisma";
import { adminAuth } from "../middleware/adminAuth";
import { resolveBusinessScope } from "../helpers/adminBusinessScope";

export const adminTimeSlotsRouter = Router();

adminTimeSlotsRouter.get("/", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const dayOfWeek =
    typeof req.query.dayOfWeek === "string" ? Number(req.query.dayOfWeek) : null;
  const where: { businessId: string; dayOfWeek?: number } = { businessId };
  if (dayOfWeek !== null && Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
    where.dayOfWeek = dayOfWeek;
  }

  const slots = await prisma.timeSlot.findMany({
    where,
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  res.json({ data: slots });
});

adminTimeSlotsRouter.post("/", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const { dayOfWeek, startTime, endTime, maxAppointments, isActive } = req.body || {};

  const day = Number(dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    res.status(400).json({ error: "dayOfWeek must be 0-6" });
    return;
  }
  if (typeof startTime !== "string" || typeof endTime !== "string") {
    res.status(400).json({ error: "startTime and endTime are required" });
    return;
  }

  const max = maxAppointments !== undefined ? Number(maxAppointments) : 1;
  if (!Number.isInteger(max) || max <= 0) {
    res.status(400).json({ error: "maxAppointments must be a positive integer" });
    return;
  }

  const created = await prisma.timeSlot.create({
    data: {
      businessId,
      dayOfWeek: day,
      startTime,
      endTime,
      maxAppointments: max,
      isActive: isActive !== false,
    },
  });

  res.status(201).json({ ok: true, timeSlot: created });
});

adminTimeSlotsRouter.patch("/:id", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const { id } = req.params;
  const existing = await prisma.timeSlot.findUnique({ where: { id } });
  if (!existing || existing.businessId !== businessId) {
    res.status(404).json({ error: "Time slot not found" });
    return;
  }

  const { dayOfWeek, startTime, endTime, maxAppointments, isActive } = req.body || {};
  const data: Record<string, unknown> = {};

  if (dayOfWeek !== undefined) {
    const day = Number(dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      res.status(400).json({ error: "dayOfWeek must be 0-6" });
      return;
    }
    data.dayOfWeek = day;
  }
  if (typeof startTime === "string") data.startTime = startTime;
  if (typeof endTime === "string") data.endTime = endTime;
  if (maxAppointments !== undefined) {
    const max = Number(maxAppointments);
    if (!Number.isInteger(max) || max <= 0) {
      res.status(400).json({ error: "maxAppointments must be a positive integer" });
      return;
    }
    data.maxAppointments = max;
  }
  if (typeof isActive === "boolean") data.isActive = isActive;

  const updated = await prisma.timeSlot.update({
    where: { id },
    data,
  });

  res.json({ ok: true, timeSlot: updated });
});

adminTimeSlotsRouter.delete("/:id", adminAuth, async (req, res) => {
  const businessId = resolveBusinessScope(req, res);
  if (!businessId) return;

  const { id } = req.params;
  const existing = await prisma.timeSlot.findUnique({ where: { id } });
  if (!existing || existing.businessId !== businessId) {
    res.status(404).json({ error: "Time slot not found" });
    return;
  }

  const appointmentsCount = await prisma.appointment.count({
    where: { timeSlotId: id },
  });
  if (appointmentsCount > 0) {
    await prisma.timeSlot.update({
      where: { id },
      data: { isActive: false },
    });
    res.json({
      ok: true,
      softDeleted: true,
      message: "Time slot has appointments; marked as inactive.",
    });
    return;
  }

  await prisma.timeSlot.delete({ where: { id } });
  res.json({ ok: true, deleted: true });
});
