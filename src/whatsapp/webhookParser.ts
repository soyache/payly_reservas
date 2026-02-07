import type {
  WebhookEvent,
  ParsedMessage,
  ParsedStatusUpdate,
  ParsedMessageContent,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseMessageContent(message: any): ParsedMessageContent {
  if (!message || !message.type) {
    return { type: "unknown" };
  }

  switch (message.type) {
    case "text":
      return {
        type: "text",
        body: message.text?.body ?? "",
      };

    case "interactive": {
      const interactive = message.interactive;
      if (!interactive) return { type: "unknown" };

      if (interactive.type === "button_reply" && interactive.button_reply) {
        return {
          type: "button_reply",
          buttonId: interactive.button_reply.id ?? "",
          buttonTitle: interactive.button_reply.title ?? "",
        };
      }

      if (interactive.type === "list_reply" && interactive.list_reply) {
        return {
          type: "list_reply",
          listId: interactive.list_reply.id ?? "",
          listTitle: interactive.list_reply.title ?? "",
          listDescription: interactive.list_reply.description,
        };
      }

      return { type: "unknown" };
    }

    case "image":
      return {
        type: "image",
        mediaId: message.image?.id ?? "",
        mimeType: message.image?.mime_type ?? "image/jpeg",
      };

    default:
      return { type: "unknown" };
  }
}

export function parseWebhookPayload(body: any): WebhookEvent[] {
  const events: WebhookEvent[] = [];

  if (body?.object !== "whatsapp_business_account") {
    return [{ kind: "unsupported" }];
  }

  const entries = body.entry;
  if (!Array.isArray(entries)) return [];

  for (const entry of entries) {
    const changes = entry.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Parse messages
      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          if (!msg.id || !msg.from) continue;

          const parsed: ParsedMessage = {
            messageId: msg.id,
            phoneNumberId,
            from: msg.from,
            timestamp: Number(msg.timestamp) || Math.floor(Date.now() / 1000),
            content: parseMessageContent(msg),
          };

          events.push({ kind: "message", data: parsed });
        }
      }

      // Parse status updates
      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          if (!status.id || !status.status) continue;

          const validStatuses = ["sent", "delivered", "read", "failed"];
          if (!validStatuses.includes(status.status)) continue;

          const parsed: ParsedStatusUpdate = {
            messageId: status.id,
            status: status.status,
            recipientId: status.recipient_id ?? "",
            timestamp: Number(status.timestamp) || Math.floor(Date.now() / 1000),
            phoneNumberId,
          };

          events.push({ kind: "status", data: parsed });
        }
      }
    }
  }

  return events.length > 0 ? events : [{ kind: "unsupported" }];
}
