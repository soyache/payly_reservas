import { Router } from "express";
import { prisma } from "../../database/prisma";
import { adminAuth } from "../middleware/adminAuth";
import { enqueueMessages } from "../../bot/sendMessage";
import { buildTextMessage } from "../../whatsapp/messageBuilder";
import { formatDateSpanish } from "../../bot/helpers/dateUtils";
import { resolveBusinessScope } from "../helpers/adminBusinessScope";

export const appointmentsRouter = Router();

function buildClientGreeting(name: string | null | undefined, fallback: string): string {
  const normalized = name?.trim();
  return normalized ? `Hola ${normalized}! ${fallback}` : fallback;
}

// List appointments with optional filters
appointmentsRouter.get("/", adminAuth, async (req, res) => {
  const { status, dateFrom, dateTo, businessId } = req.query;
  const scopedBusinessId = resolveBusinessScope(req, res);
  if (!scopedBusinessId) return;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (businessId && businessId !== scopedBusinessId) {
    res.status(403).json({ error: "Forbidden: invalid business scope" });
    return;
  }
  where.businessId = scopedBusinessId;
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom as string);
    if (dateTo) dateFilter.lte = new Date(dateTo as string);
    where.date = dateFilter;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: { service: true, business: true, timeSlot: true },
    orderBy: { date: "desc" },
    take: 50,
  });

  res.json({ data: appointments });
});

// Approve an appointment
appointmentsRouter.post("/:id/approve", adminAuth, async (req, res) => {
  const { id } = req.params;
  const scopedBusinessId = resolveBusinessScope(req, res);
  if (!scopedBusinessId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true, business: true, timeSlot: true },
  });

  if (!appointment || appointment.businessId !== scopedBusinessId) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (appointment.status !== "pending_approval") {
    res
      .status(400)
      .json({
        error: `Cannot approve appointment with status: ${appointment.status}`,
      });
    return;
  }

  await prisma.appointment.update({
    where: { id },
    data: {
      status: "confirmed",
      approvedAt: new Date(),
      approvedBy: "admin",
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      businessId: appointment.businessId,
      action: "approve_appointment",
      actor: "admin",
      actorIp: req.ip ?? null,
      targetId: id,
      metadataJson: { previousStatus: appointment.status },
    },
  });

  const dateStr = appointment.date.toISOString().split("T")[0];

  await enqueueMessages(appointment.businessId, [
    {
      toPhoneE164: appointment.clientPhoneE164,
      appointmentId: id,
      payload: buildTextMessage(
        appointment.clientPhoneE164,
        buildClientGreeting(appointment.clientName, "Tu cita ha sido confirmada!") +
          `\n\n` +
          `Servicio: ${appointment.service.name}\n` +
          `Fecha: ${formatDateSpanish(dateStr)}\n` +
          `Hora: ${appointment.timeSlot.startTime} - ${appointment.timeSlot.endTime}\n` +
          (appointment.business.address
            ? `Direccion: ${appointment.business.address}\n`
            : "") +
          `\nTe esperamos!`
      ),
    },
  ]);

  await prisma.conversation.updateMany({
    where: {
      businessId: appointment.businessId,
      clientPhoneE164: appointment.clientPhoneE164,
      currentStep: "awaiting_approval",
    },
    data: { currentStep: "completed" },
  });

  res.json({ ok: true, appointment: { id, status: "confirmed" } });
});

// Reject an appointment
appointmentsRouter.post("/:id/reject", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const scopedBusinessId = resolveBusinessScope(req, res);
  if (!scopedBusinessId) return;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { service: true, business: true },
  });

  if (!appointment || appointment.businessId !== scopedBusinessId) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  if (appointment.status !== "pending_approval") {
    res
      .status(400)
      .json({
        error: `Cannot reject appointment with status: ${appointment.status}`,
      });
    return;
  }

  await prisma.appointment.update({
    where: { id },
    data: {
      status: "cancelled",
      rejectedAt: new Date(),
      rejectedBy: "admin",
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      businessId: appointment.businessId,
      action: "reject_appointment",
      actor: "admin",
      actorIp: req.ip ?? null,
      targetId: id,
      metadataJson: { reason: reason ?? null },
    },
  });

  await enqueueMessages(appointment.businessId, [
    {
      toPhoneE164: appointment.clientPhoneE164,
      appointmentId: id,
      payload: buildTextMessage(
        appointment.clientPhoneE164,
        buildClientGreeting(appointment.clientName, "Lo sentimos, tu pago no fue aprobado.") +
          `\n` +
          (reason ? `Motivo: ${reason}\n\n` : "\n") +
          `Puedes intentar de nuevo enviando "inicio".`
      ),
    },
  ]);

  await prisma.conversation.updateMany({
    where: {
      businessId: appointment.businessId,
      clientPhoneE164: appointment.clientPhoneE164,
      currentStep: "awaiting_approval",
    },
    data: { currentStep: "greeting" },
  });

  res.json({ ok: true, appointment: { id, status: "cancelled" } });
});
