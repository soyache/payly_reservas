import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import { buildTextMessage } from "../../whatsapp/messageBuilder";
import { getClientName } from "../helpers/clientName";

export async function handleAwaitingApproval(
  _business: Business,
  conversation: Conversation,
  _content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;
  const clientName = getClientName(conversation);

  return {
    nextStep: "awaiting_approval",
    messages: [
      {
        toPhoneE164: to,
        payload: buildTextMessage(
          to,
          `${clientName ? `${clientName}, ` : ""}tu pago esta siendo revisado. Te notificaremos pronto.\nGracias por tu paciencia.`
        ),
      },
    ],
  };
}
