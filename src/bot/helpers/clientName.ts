import type { Conversation } from "@prisma/client";

export function getClientName(conversation: Conversation): string | null {
  const name = conversation.clientName?.trim();
  return name ? name : null;
}
