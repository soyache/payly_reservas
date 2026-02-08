import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import { buildListMessage } from "../../whatsapp/messageBuilder";
import { getClientName } from "../helpers/clientName";
import { getNextWorkingDays } from "../helpers/dateUtils";

function buildDateList(
  business: Business,
  conversation: Conversation,
  to: string
): StepResult {
  const clientName = getClientName(conversation);
  const days = getNextWorkingDays(business, 7);

  return {
    nextStep: "select_date",
    messages: [
      {
        toPhoneE164: to,
        payload: buildListMessage(to, `${clientName ? `${clientName}, ` : ""}elige una fecha:`, "Ver fechas", [
          {
            title: "Fechas disponibles",
            rows: days.map((d) => ({
              id: `date_${d.iso}`,
              title: d.display,
              description: d.relative,
            })),
          },
        ]),
      },
    ],
  };
}

export async function handleSelectDate(
  business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;

  if (content.type === "list_reply" && content.listId.startsWith("date_")) {
    const dateIso = content.listId.replace("date_", "");

    return {
      nextStep: "select_time",
      tempData: { selectedDate: dateIso },
      messages: [],
    };
  }

  return buildDateList(business, conversation, to);
}
