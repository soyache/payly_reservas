import type { Business, Conversation } from "@prisma/client";
import type {
  ConversationStep,
  ParsedMessageContent,
  StepResult,
} from "../whatsapp/types";
import { handleGreeting } from "./steps/greeting";
import { handleSelectService } from "./steps/selectService";
import { handleSelectDate } from "./steps/selectDate";
import { handleSelectTime } from "./steps/selectTime";
import { handleConfirmBooking } from "./steps/confirmBooking";
import { handleAwaitingPayment } from "./steps/awaitingPayment";
import { handleAwaitingApproval } from "./steps/awaitingApproval";

const RESET_COMMANDS = ["cancelar", "inicio", "menu", "reiniciar", "salir"];

export async function dispatch(
  business: Business,
  conversation: Conversation,
  currentStep: ConversationStep,
  content: ParsedMessageContent
): Promise<StepResult> {
  // Global reset: text commands that restart the flow
  if (content.type === "text") {
    const lower = content.body.toLowerCase().trim();
    if (RESET_COMMANDS.includes(lower)) {
      return handleGreeting(business, conversation, content);
    }
  }

  switch (currentStep) {
    case "greeting":
      return handleGreeting(business, conversation, content);

    case "select_service":
      return handleSelectService(business, conversation, content);

    case "select_date":
      return handleSelectDate(business, conversation, content);

    case "select_time":
      return handleSelectTime(business, conversation, content);

    case "confirm_booking":
      return handleConfirmBooking(business, conversation, content);

    case "awaiting_payment":
      return handleAwaitingPayment(business, conversation, content);

    case "awaiting_approval":
      return handleAwaitingApproval(business, conversation, content);

    case "completed":
      return handleGreeting(business, conversation, content);

    default:
      return handleGreeting(business, conversation, content);
  }
}
