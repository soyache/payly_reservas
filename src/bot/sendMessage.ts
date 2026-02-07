import { v4 as uuidv4 } from "uuid";
import { prisma } from "../database/prisma";
import type { QueuedMessage, MetaOutboundPayload } from "../whatsapp/types";

function deriveMessageType(
  payload: MetaOutboundPayload
): "text" | "interactive" | "template" {
  if (payload.type === "text") return "text";
  if (payload.type === "template") return "template";
  return "interactive";
}

export async function enqueueMessages(
  businessId: string,
  messages: QueuedMessage[]
): Promise<void> {
  if (messages.length === 0) return;

  const records = messages.map((msg) => ({
    id: uuidv4(),
    businessId,
    appointmentId: msg.appointmentId ?? null,
    toPhoneE164: msg.toPhoneE164,
    messageType: deriveMessageType(msg.payload),
    payloadJson: msg.payload as object,
    idempotencyKey: uuidv4(),
    status: "queued" as const,
    attemptCount: 0,
  }));

  await prisma.outboundMessage.createMany({ data: records });
}
