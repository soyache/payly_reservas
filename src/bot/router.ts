import type { Prisma } from "@prisma/client";
import type { ParsedMessage } from "../whatsapp/types";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { dispatch } from "./stateMachine";
import { enqueueMessages } from "./sendMessage";
import { buildButtonMessage, buildTextMessage } from "../whatsapp/messageBuilder";
import { formatDateSpanish } from "./helpers/dateUtils";

type AdminDecision = "approve" | "reject_select_reason" | "reject_with_reason";
type RejectReasonCode = "no_payment" | "partial_payment" | "service_unavailable_refund";

const REJECT_REASONS: Record<RejectReasonCode, string> = {
  no_payment: "No se recibio el pago",
  partial_payment: "Pago incompleto",
  service_unavailable_refund: "Servicio no disponible, se aplicara devolucion.",
};

function getAdminDecisionFromButton(
  buttonId: string
):
  | { decision: "approve"; appointmentId: string }
  | { decision: "reject_select_reason"; appointmentId: string }
  | { decision: "reject_with_reason"; appointmentId: string; reasonCode: RejectReasonCode }
  | null {
  if (buttonId.startsWith("admin_approve:")) {
    return { decision: "approve", appointmentId: buttonId.replace("admin_approve:", "") };
  }

  if (buttonId.startsWith("admin_reject:")) {
    return {
      decision: "reject_select_reason",
      appointmentId: buttonId.replace("admin_reject:", ""),
    };
  }

  if (buttonId.startsWith("admin_reject_reason:")) {
    const raw = buttonId.replace("admin_reject_reason:", "");
    const [appointmentId, reasonCodeRaw] = raw.split(":");
    if (!appointmentId || !reasonCodeRaw) return null;

    const reasonCode = reasonCodeRaw as RejectReasonCode;
    if (!Object.hasOwn(REJECT_REASONS, reasonCode)) return null;

    return {
      decision: "reject_with_reason",
      appointmentId,
      reasonCode,
    };
  }

  return null;
}

export async function handleIncomingMessage(
  msg: ParsedMessage
): Promise<void> {
  // 1. Look up business by phoneNumberId
  console.log(`[Router] Looking up business for phoneNumberId: ${msg.phoneNumberId}`);
  const business = await prisma.business.findUnique({
    where: { phoneNumberId: msg.phoneNumberId },
  });

  if (!business || !business.isActive) {
    console.warn(
      `[Router] No active business for phoneNumberId: ${msg.phoneNumberId}`
    );
    return;
  }
  console.log(`[Router] Business found: ${business.name} (id: ${business.id})`);

  // 2. Idempotency check
  const eventKey = msg.messageId;
  const existing = await prisma.processedWebhookEvent.findUnique({
    where: {
      businessId_eventKey: { businessId: business.id, eventKey },
    },
  });

  if (existing) {
    console.log(`Duplicate webhook event ignored: ${eventKey}`);
    return;
  }

  // 3. Record the event
  await prisma.processedWebhookEvent.create({
    data: { businessId: business.id, eventKey },
  });

  // 4. Normalize phone to E.164
  const clientPhoneE164 = msg.from.startsWith("+")
    ? msg.from
    : `+${msg.from}`;

  // 5. Read existing conversation (for timeout check)
  const existingConversation = await prisma.conversation.findUnique({
    where: {
      businessId_clientPhoneE164: {
        businessId: business.id,
        clientPhoneE164,
      },
    },
  });

  // 6. Check timeout
  const timeoutMs = env.CONVERSATION_TIMEOUT_MINUTES * 60 * 1000;
  const isTimedOut = existingConversation
    ? Date.now() - existingConversation.lastMessageAt.getTime() > timeoutMs
    : false;

  // 7. Upsert conversation (update timestamps)
  const now = new Date();
  const serviceWindowExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_clientPhoneE164: {
        businessId: business.id,
        clientPhoneE164,
      },
    },
    update: {
      lastMessageAt: now,
      serviceWindowExpiresAt: serviceWindowExpiry,
    },
    create: {
      businessId: business.id,
      clientPhone: msg.from,
      clientPhoneE164,
      currentStep: "greeting",
      lastMessageAt: now,
      serviceWindowExpiresAt: serviceWindowExpiry,
    },
  });

  const adminPhoneE164 = env.ADMIN_NOTIFICATION_PHONE.startsWith("+")
    ? env.ADMIN_NOTIFICATION_PHONE
    : `+${env.ADMIN_NOTIFICATION_PHONE}`;
  const isAdminSender = clientPhoneE164 === adminPhoneE164;
  const adminAction =
    msg.content.type === "button_reply"
      ? getAdminDecisionFromButton(msg.content.buttonId)
      : null;

  if (isAdminSender && adminAction) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: adminAction.appointmentId },
      include: { service: true, business: true, timeSlot: true },
    });

    if (!appointment || appointment.businessId !== business.id) {
      await enqueueMessages(business.id, [
        {
          toPhoneE164: clientPhoneE164,
          payload: buildTextMessage(
            clientPhoneE164,
            "No se encontro la cita para procesar esta accion."
          ),
        },
      ]);
      return;
    }

    if (appointment.status !== "pending_approval") {
      await enqueueMessages(business.id, [
        {
          toPhoneE164: clientPhoneE164,
          payload: buildTextMessage(
            clientPhoneE164,
            `Esta cita ya no esta pendiente. Estado actual: ${appointment.status}.`
          ),
        },
      ]);
      return;
    }

    if (adminAction.decision === "approve") {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "confirmed",
          approvedAt: new Date(),
          approvedBy: "whatsapp_admin",
        },
      });

      await prisma.adminAuditLog.create({
        data: {
          businessId: appointment.businessId,
          action: "approve_appointment",
          actor: "whatsapp_admin",
          targetId: appointment.id,
          metadataJson: { source: "whatsapp_button" },
        },
      });

      const dateStr = appointment.date.toISOString().split("T")[0];
      await enqueueMessages(business.id, [
        {
          toPhoneE164: appointment.clientPhoneE164,
          appointmentId: appointment.id,
          payload: buildTextMessage(
            appointment.clientPhoneE164,
            `Tu cita ha sido confirmada!\n\n` +
              `Servicio: ${appointment.service.name}\n` +
              `Fecha: ${formatDateSpanish(dateStr)}\n` +
              `Hora: ${appointment.timeSlot.startTime} - ${appointment.timeSlot.endTime}\n` +
              (appointment.business.address
                ? `Direccion: ${appointment.business.address}\n`
                : "") +
              `\nTe esperamos!`
          ),
        },
        {
          toPhoneE164: clientPhoneE164,
          appointmentId: appointment.id,
          payload: buildTextMessage(
            clientPhoneE164,
            `Cita aprobada correctamente.\nID: ${appointment.id}`
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
      return;
    }

    if (adminAction.decision === "reject_select_reason") {
      await enqueueMessages(business.id, [
        {
          toPhoneE164: clientPhoneE164,
          appointmentId: appointment.id,
          payload: buildButtonMessage(
            clientPhoneE164,
            `Selecciona el motivo de rechazo para la cita ${appointment.id}:`,
            [
              {
                id: `admin_reject_reason:${appointment.id}:no_payment`,
                title: "No se recibio",
              },
              {
                id: `admin_reject_reason:${appointment.id}:partial_payment`,
                title: "Pago incompleto",
              },
              {
                id: `admin_reject_reason:${appointment.id}:service_unavailable_refund`,
                title: "Sin disponibilidad",
              },
            ]
          ),
        },
      ]);
      return;
    }

    const rejectReason =
      adminAction.decision === "reject_with_reason"
        ? REJECT_REASONS[adminAction.reasonCode]
        : "Pago no aprobado";

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: "cancelled",
        rejectedAt: new Date(),
        rejectedBy: "whatsapp_admin",
      },
    });

    await prisma.adminAuditLog.create({
      data: {
        businessId: appointment.businessId,
        action: "reject_appointment",
        actor: "whatsapp_admin",
        targetId: appointment.id,
        metadataJson: { source: "whatsapp_button", reason: rejectReason },
      },
    });

    await enqueueMessages(business.id, [
      {
        toPhoneE164: appointment.clientPhoneE164,
        appointmentId: appointment.id,
        payload: buildTextMessage(
          appointment.clientPhoneE164,
          `Lo sentimos, tu pago no fue aprobado.\n` +
            `Motivo: ${rejectReason}\n\n` +
            `Puedes intentar de nuevo enviando "inicio".`
        ),
      },
      {
        toPhoneE164: clientPhoneE164,
        appointmentId: appointment.id,
        payload: buildTextMessage(
          clientPhoneE164,
          `Cita rechazada correctamente.\nMotivo: ${rejectReason}\nID: ${appointment.id}`
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
    return;
  }

  // 8. Determine current step
  const currentStep = isTimedOut ? "greeting" : conversation.currentStep;

  // 9. Run state machine
  console.log(`[Router] Dispatching step: ${currentStep}, content type: ${msg.content.type}`);
  const result = await dispatch(business, conversation, currentStep, msg.content);
  console.log(`[Router] Step result: nextStep=${result.nextStep}, messages=${result.messages.length}`);

  // 10. Merge tempData
  const existingTemp =
    (conversation.tempData as Record<string, unknown>) || {};
  const newTempData = result.tempData !== undefined
    ? { ...existingTemp, ...result.tempData }
    : existingTemp;

  // 11. Update conversation
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      currentStep: result.nextStep,
      tempData: newTempData as Prisma.InputJsonValue,
    },
  });

  // 12. Handle step transitions that need immediate follow-up messages
  // Some steps return nextStep without messages (e.g., selectService → selectDate)
  // In these cases, we need to "enter" the next step to generate the initial UI
  if (result.messages.length === 0 && result.nextStep !== currentStep) {
    const followUp = await dispatch(
      business,
      { ...conversation, currentStep: result.nextStep, tempData: newTempData } as typeof conversation,
      result.nextStep,
      { type: "unknown" }
    );

    // If follow-up generated messages, update step again
    if (followUp.messages.length > 0) {
      const followTempData = followUp.tempData !== undefined
        ? { ...newTempData, ...followUp.tempData }
        : newTempData;

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentStep: followUp.nextStep,
          tempData: followTempData as Prisma.InputJsonValue,
        },
      });

      await enqueueMessages(business.id, followUp.messages);
    }
  }

  // 13. Enqueue outbound messages from the original step
  if (result.messages.length > 0) {
    await enqueueMessages(business.id, result.messages);
    console.log(`[Router] Enqueued ${result.messages.length} outbound message(s)`);
  }
}
