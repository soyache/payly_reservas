import type { Business, Conversation } from "@prisma/client";
import type {
  ParsedMessageContent,
  StepResult,
  QueuedMessage,
} from "../../whatsapp/types";
import { buildTextMessage } from "../../whatsapp/messageBuilder";
import { downloadAndSavePaymentProof } from "../../whatsapp/mediaHandler";
import { prisma } from "../../database/prisma";

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

    // Notify business owner if configured
    const adminNotifications: QueuedMessage[] = [];
    if (business.ownerPhone) {
      adminNotifications.push({
        toPhoneE164: business.ownerPhone.startsWith("+")
          ? business.ownerPhone
          : `+${business.ownerPhone}`,
        appointmentId,
        payload: buildTextMessage(
          business.ownerPhone,
          `Nueva reserva pendiente de aprobacion.\n` +
            `Cliente: ${conversation.clientPhoneE164}\n` +
            `Cita ID: ${appointmentId}\n\n` +
            `Aprueba o rechaza desde el panel.`
        ),
      });
    }

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
