import { ConversationStep } from "@prisma/client";

// ── Inbound (parsed from Meta webhook) ──────────────────────────

export interface ParsedTextMessage {
  type: "text";
  body: string;
}

export interface ParsedButtonReply {
  type: "button_reply";
  buttonId: string;
  buttonTitle: string;
}

export interface ParsedListReply {
  type: "list_reply";
  listId: string;
  listTitle: string;
  listDescription?: string;
}

export interface ParsedImageMessage {
  type: "image";
  mediaId: string;
  mimeType: string;
}

export interface ParsedUnknownMessage {
  type: "unknown";
}

export type ParsedMessageContent =
  | ParsedTextMessage
  | ParsedButtonReply
  | ParsedListReply
  | ParsedImageMessage
  | ParsedUnknownMessage;

export interface ParsedMessage {
  messageId: string;
  phoneNumberId: string;
  from: string;
  timestamp: number;
  content: ParsedMessageContent;
}

export interface ParsedStatusUpdate {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipientId: string;
  timestamp: number;
  phoneNumberId: string;
}

export type WebhookEvent =
  | { kind: "message"; data: ParsedMessage }
  | { kind: "status"; data: ParsedStatusUpdate }
  | { kind: "unsupported" };

// ── Outbound (payloads for Meta Graph API) ──────────────────────

export interface MetaTextPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { preview_url: boolean; body: string };
}

export interface MetaButtonAction {
  type: "reply";
  reply: { id: string; title: string };
}

export interface MetaInteractiveButtonPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    body: { text: string };
    action: { buttons: MetaButtonAction[] };
  };
}

export interface MetaListRow {
  id: string;
  title: string;
  description?: string;
}

export interface MetaListSection {
  title: string;
  rows: MetaListRow[];
}

export interface MetaInteractiveListPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    body: { text: string };
    action: { button: string; sections: MetaListSection[] };
  };
}

export interface MetaTemplatePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: string;
      parameters: Array<{ type: string; text?: string }>;
    }>;
  };
}

export type MetaOutboundPayload =
  | MetaTextPayload
  | MetaInteractiveButtonPayload
  | MetaInteractiveListPayload
  | MetaTemplatePayload;

// ── Step handler contract ───────────────────────────────────────

export interface QueuedMessage {
  toPhoneE164: string;
  payload: MetaOutboundPayload;
  appointmentId?: string;
}

export interface StepResult {
  nextStep: ConversationStep;
  tempData?: Record<string, unknown>;
  messages: QueuedMessage[];
}

export { ConversationStep };
