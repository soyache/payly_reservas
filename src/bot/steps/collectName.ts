import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import { buildButtonMessage, buildTextMessage } from "../../whatsapp/messageBuilder";

const NAME_PREFIXES = [/^mi nombre es\s+/i, /^me llamo\s+/i, /^soy\s+/i];
const GENERIC_WORDS = new Set(["hola", "buenas", "ok", "si", "no", "menu", "inicio", "reiniciar"]);

function parseName(raw: string): string {
  let name = raw.trim();
  for (const prefix of NAME_PREFIXES) {
    name = name.replace(prefix, "");
  }

  const sanitized = name
    .replace(/[.,!?;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return "";

  return sanitized
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isValidName(name: string): boolean {
  if (name.length < 2 || name.length > 60) return false;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/.test(name)) return false;

  const normalized = name.toLowerCase().trim();
  if (GENERIC_WORDS.has(normalized)) return false;

  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(name);
}

function askForName(to: string, prompt?: string): StepResult {
  return {
    nextStep: "collect_name",
    messages: [
      {
        toPhoneE164: to,
        payload: buildTextMessage(
          to,
          prompt ?? "Para personalizar tu experiencia, como te llamas?"
        ),
      },
    ],
  };
}

function askNameConfirmation(to: string, name: string): StepResult {
  return {
    nextStep: "collect_name",
    tempData: { pendingName: name, nameStep: "confirm" },
    messages: [
      {
        toPhoneE164: to,
        payload: buildButtonMessage(to, `Tu nombre es ${name}?`, [
          { id: "confirm_name_yes", title: "Si" },
          { id: "confirm_name_no", title: "No, corregir" },
        ]),
      },
    ],
  };
}

export async function handleCollectName(
  _business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;
  const tempData = (conversation.tempData as Record<string, unknown>) || {};
  const pendingName = typeof tempData.pendingName === "string" ? tempData.pendingName.trim() : "";

  if (content.type === "button_reply") {
    if (content.buttonId === "confirm_name_yes" && pendingName) {
      return {
        nextStep: "greeting",
        tempData: { confirmedName: pendingName },
        messages: [],
      };
    }

    if (content.buttonId === "confirm_name_no") {
      return askForName(to, "Perfecto, escribeme tu nombre como te gustaria que te llame.");
    }
  }

  if (content.type === "text") {
    const parsed = parseName(content.body);

    if (!isValidName(parsed)) {
      return askForName(to, "No logre entender tu nombre. Escribelo de nuevo, por favor.");
    }

    return askNameConfirmation(to, parsed);
  }

  if (pendingName) {
    return askNameConfirmation(to, pendingName);
  }

  return askForName(to);
}
