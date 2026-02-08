import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import { buildListMessage, buildTextMessage } from "../../whatsapp/messageBuilder";
import { getClientName } from "../helpers/clientName";
import { getAvailableSlots } from "../helpers/slotAvailability";
import { formatDateSpanish, getNextWorkingDays } from "../helpers/dateUtils";

export async function handleSelectTime(
  business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;
  const clientName = getClientName(conversation);
  const tempData = (conversation.tempData as Record<string, unknown>) || {};
  const dateIso = tempData.selectedDate as string;

  if (!dateIso) {
    return {
      nextStep: "select_date",
      messages: [],
    };
  }

  // First entry into this step or invalid input → show available slots
  if (content.type !== "list_reply" || !content.listId.startsWith("slot_")) {
    return showTimeSlots(business, to, dateIso, clientName);
  }

  // Parse "slot_{timeSlotId}"
  const timeSlotId = content.listId.replace("slot_", "");

  return {
    nextStep: "confirm_booking",
    tempData: { selectedTimeSlotId: timeSlotId },
    messages: [],
  };
}

async function showTimeSlots(
  business: Business,
  to: string,
  dateIso: string,
  clientName: string | null
): Promise<StepResult> {
  const d = new Date(dateIso + "T12:00:00Z");
  const dayOfWeek = d.getUTCDay();

  const slots = await getAvailableSlots(business.id, dateIso, dayOfWeek);

  if (slots.length === 0) {
    const days = getNextWorkingDays(business, 7);
    return {
      nextStep: "select_date",
      messages: [
        {
          toPhoneE164: to,
          payload: buildTextMessage(
            to,
            `${clientName ? `${clientName}, ` : ""}no hay horarios disponibles para esa fecha. Elige otra:`
          ),
        },
        {
          toPhoneE164: to,
          payload: buildListMessage(to, `${clientName ? `${clientName}, ` : ""}elige una fecha:`, "Ver fechas", [
            {
              title: "Fechas disponibles",
              rows: days.map((dd) => ({
                id: `date_${dd.iso}`,
                title: dd.display,
                description: dd.relative,
              })),
            },
          ]),
        },
      ],
    };
  }

  return {
    nextStep: "select_time",
    messages: [
      {
        toPhoneE164: to,
        payload: buildListMessage(
          to,
          `Fecha: ${formatDateSpanish(dateIso)}\n${clientName ? `${clientName}, ` : ""}elige un horario:`,
          "Ver horarios",
          [
            {
              title: "Horarios disponibles",
              rows: slots.map((s) => ({
                id: `slot_${s.timeSlotId}`,
                title: `${s.startTime} - ${s.endTime}`,
              })),
            },
          ]
        ),
      },
    ],
  };
}
