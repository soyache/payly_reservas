import type { Business, Conversation } from "@prisma/client";
import type {
  ParsedMessageContent,
  StepResult,
  QueuedMessage,
} from "../../whatsapp/types";
import {
  buildButtonMessage,
  buildImageMessageById,
  buildTextMessage,
} from "../../whatsapp/messageBuilder";
import { downloadAndSavePaymentProof } from "../../whatsapp/mediaHandler";
import { prisma } from "../../database/prisma";
import { env } from "../../config/env";
import { formatDateSpanish } from "../helpers/dateUtils";

const PAYMENT_PROOF_RETENTION_DAYS = 90;

export async function handleAwaitingPayment(
  business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;
  const tempData = (conversation.tempData as Record<string, unknown>) || {};
  const appointmentId = tempData.appointmentId as string;

  if (!appointmentId) {
    return {
      nextStep: "greeting",
      tempData: {},
      messages: [
        {
          toPhoneE164: to,
          payload: buildTextMessage(
            to,
            "Ocurrio un error. Escribe cualquier mensaje para iniciar de nuevo."
          ),
        },
      ],
    };
  }

  // Client sent an image → save as payment proof
  if (content.type === "image") {
    const savedPath = await downloadAndSavePaymentProof(
      content.mediaId,
      content.mimeType,
      business.id,
      appointmentId
    );

    const expiresAt = new Date(
      Date.now() + PAYMENT_PROOF_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "pending_approval",
        paymentProofUrl: savedPath,
        paymentProofExpiresAt: expiresAt,
      },
    });
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, timeSlot: true },
    });
    const dateIso = appointment?.date.toISOString().split("T")[0];
    const serviceName = appointment?.service.name ?? "N/D";
    const amount = appointment?.service.price?.toString() ?? "N/D";
    const timeRange = appointment
      ? `${appointment.timeSlot.startTime} - ${appointment.timeSlot.endTime}`
      : "N/D";

    // Notify admin phone (test number allowed in Meta)
    const adminNotifications: QueuedMessage[] = [];
    adminNotifications.push({
      toPhoneE164: env.ADMIN_NOTIFICATION_PHONE,
      appointmentId,
      payload: buildImageMessageById(
        env.ADMIN_NOTIFICATION_PHONE,
        content.mediaId,
        "Comprobante de pago recibido"
      ),
    });
    adminNotifications.push({
      toPhoneE164: env.ADMIN_NOTIFICATION_PHONE,
      appointmentId,
      payload: buildButtonMessage(
        env.ADMIN_NOTIFICATION_PHONE,
        `Nueva reserva pendiente de aprobacion.\n` +
          `Cliente: ${conversation.clientPhoneE164}\n` +
          `Servicio: ${serviceName}\n` +
          `Monto: L ${amount}\n` +
          `Fecha: ${dateIso ? formatDateSpanish(dateIso) : "N/D"}\n` +
          `Hora: ${timeRange}\n` +
          `Cita ID: ${appointmentId}\n\n` +
          `Elige una opcion:`,
        [
          { id: `admin_approve:${appointmentId}`, title: "Aprobar" },
          { id: `admin_reject:${appointmentId}`, title: "Rechazar" },
        ]
      ),
    });

    return {
      nextStep: "awaiting_approval",
      messages: [
        {
          toPhoneE164: to,
          appointmentId,
          payload: buildTextMessage(
            to,
            "Comprobante recibido! Tu pago esta siendo revisado.\nTe notificaremos cuando sea aprobado."
          ),
        },
        ...adminNotifications,
      ],
    };
  }

  // Any other message → remind to send image
  return {
    nextStep: "awaiting_payment",
    messages: [
      {
        toPhoneE164: to,
        payload: buildTextMessage(
          to,
          "Por favor envia una foto de tu comprobante de pago."
        ),
      },
    ],
  };
}
