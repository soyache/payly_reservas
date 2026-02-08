import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import { buildButtonMessage, buildTextMessage } from "../../whatsapp/messageBuilder";
import { getClientName } from "../helpers/clientName";

export async function handleGreeting(
  business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;
  const clientName = getClientName(conversation);

  // User tapped "Info/Horarios"
  if (content.type === "button_reply" && content.buttonId === "info_horarios") {
    const workingDays = (business.workingDays as number[]) || [];
    const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
    const days = workingDays.map((d) => dayNames[d]).join(", ");

    return {
      nextStep: "greeting",
      messages: [
        {
          toPhoneE164: to,
          payload: buildTextMessage(
            to,
            `${clientName ? `Hola ${clientName}!\n` : ""}` +
              `${business.name}\n` +
              `Dias: ${days}\n` +
              (business.address ? `Direccion: ${business.address}\n` : "") +
              `\nEscribe cualquier mensaje para ver el menu.`
          ),
        },
      ],
    };
  }

  // User tapped "Agendar cita" → go to select_service
  if (content.type === "button_reply" && content.buttonId === "agendar_cita") {
    return {
      nextStep: "select_service",
      tempData: {},
      messages: [],
    };
  }

  // Default: show welcome with buttons
  return {
    nextStep: "greeting",
    tempData: {},
    messages: [
      {
        toPhoneE164: to,
        payload: buildButtonMessage(
          to,
          `${clientName ? `Hola ${clientName}!` : "Hola!"} Bienvenido a ${business.name}.\nComo te puedo ayudar?`,
          [
            { id: "agendar_cita", title: "Agendar cita" },
            { id: "info_horarios", title: "Info / Horarios" },
          ]
        ),
      },
    ],
  };
}
