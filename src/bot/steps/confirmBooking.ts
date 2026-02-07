import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import {
  buildButtonMessage,
  buildTextMessage,
} from "../../whatsapp/messageBuilder";
import { prisma } from "../../database/prisma";
import { formatDateSpanish } from "../helpers/dateUtils";
import { env } from "../../config/env";

async function showSummary(
  business: Business,
  conversation: Conversation,
  to: string
): Promise<StepResult> {
  const tempData = (conversation.tempData as Record<string, unknown>) || {};

  const service = await prisma.service.findUnique({
    where: { id: tempData.selectedServiceId as string },
  });

  const timeSlot = await prisma.timeSlot.findUnique({
    where: { id: tempData.selectedTimeSlotId as string },
  });

  const dateIso = tempData.selectedDate as string;

  return {
    nextStep: "confirm_booking",
    messages: [
      {
        toPhoneE164: to,
        payload: buildButtonMessage(
          to,
          `Resumen de tu cita:\n\n` +
            `Servicio: ${service?.name ?? "?"}\n` +
            `Fecha: ${formatDateSpanish(dateIso)}\n` +
            `Hora: ${timeSlot?.startTime ?? "?"} - ${timeSlot?.endTime ?? "?"}\n` +
            `Precio: L ${service?.price ?? "?"}\n\n` +
            `Confirmas tu cita?`,
          [
            { id: "confirm_yes", title: "Confirmar" },
            { id: "confirm_change", title: "Cambiar" },
            { id: "confirm_cancel", title: "Cancelar" },
          ]
        ),
      },
    ],
  };
}

export async function handleConfirmBooking(
  business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;
  const tempData = (conversation.tempData as Record<string, unknown>) || {};

  // First entry (from selectTime) → show summary
  if (content.type !== "button_reply") {
    return showSummary(business, conversation, to);
  }

  if (content.buttonId === "confirm_cancel") {
    return {
      nextStep: "greeting",
      tempData: {},
      messages: [
        {
          toPhoneE164: to,
          payload: buildTextMessage(
            to,
            "Reserva cancelada. Escribe cualquier mensaje para iniciar de nuevo."
          ),
        },
      ],
    };
  }

  if (content.buttonId === "confirm_change") {
    return {
      nextStep: "select_service",
      tempData: {},
      messages: [],
    };
  }

  if (content.buttonId === "confirm_yes") {
    const serviceId = tempData.selectedServiceId as string;
    const dateStr = tempData.selectedDate as string;
    const timeSlotId = tempData.selectedTimeSlotId as string;
    const expiresAt = new Date(
      Date.now() + env.RESERVATION_EXPIRY_MINUTES * 60 * 1000
    );

    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const timeSlot = await tx.timeSlot.findUnique({
          where: { id: timeSlotId },
        });
        if (!timeSlot) throw new Error("SLOT_NOT_FOUND");

        const activeStatuses = [
          "pending_payment",
          "pending_approval",
          "confirmed",
        ] as const;

        const existingCount = await tx.appointment.count({
          where: {
            businessId: business.id,
            timeSlotId,
            date: new Date(dateStr),
            status: { in: [...activeStatuses] },
          },
        });

        if (existingCount >= timeSlot.maxAppointments) {
          throw new Error("SLOT_FULL");
        }

        return tx.appointment.create({
          data: {
            businessId: business.id,
            serviceId,
            clientPhone: conversation.clientPhone,
            clientPhoneE164: conversation.clientPhoneE164,
            date: new Date(dateStr),
            timeSlotId,
            status: "pending_payment",
            expiresAt,
          },
        });
      });

      const bankAccounts = business.bankAccounts as {
        accounts: Array<{ bank: string; account: string; holder: string }>;
      } | null;

      let bankInfo = "";
      if (bankAccounts?.accounts) {
        bankInfo = "Cuentas para deposito:\n";
        for (const acct of bankAccounts.accounts) {
          bankInfo += `${acct.bank}: ${acct.account}\nA nombre de: ${acct.holder}\n\n`;
        }
      }

      const service = await prisma.service.findUnique({
        where: { id: serviceId },
      });

      return {
        nextStep: "awaiting_payment",
        tempData: { appointmentId: appointment.id },
        messages: [
          {
            toPhoneE164: to,
            appointmentId: appointment.id,
            payload: buildTextMessage(
              to,
              `Cita reservada!\n\n` +
                `Servicio: ${service?.name}\n` +
                `Monto: L ${service?.price}\n\n` +
                bankInfo +
                `Envia una foto de tu comprobante de pago.\n` +
                `Tienes ${env.RESERVATION_EXPIRY_MINUTES} minutos.`
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error";

      if (message === "SLOT_FULL" || message === "SLOT_NOT_FOUND") {
        return {
          nextStep: "select_date",
          tempData: { selectedServiceId: tempData.selectedServiceId },
          messages: [
            {
              toPhoneE164: to,
              payload: buildTextMessage(
                to,
                "Lo sentimos, ese horario ya no esta disponible. Elige otra fecha y hora."
              ),
            },
          ],
        };
      }
      throw err;
    }
  }

  return showSummary(business, conversation, to);
}
