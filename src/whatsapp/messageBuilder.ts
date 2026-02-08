import type {
  MetaTextPayload,
  MetaInteractiveButtonPayload,
  MetaInteractiveListPayload,
  MetaTemplatePayload,
  MetaImagePayload,
} from "./types";

export function buildTextMessage(to: string, body: string): MetaTextPayload {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body },
  };
}

export function buildButtonMessage(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
): MetaInteractiveButtonPayload {
  if (buttons.length < 1 || buttons.length > 3) {
    throw new Error(`Button count must be 1-3, got ${buttons.length}`);
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply" as const,
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
}

export function buildListMessage(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): MetaInteractiveListPayload {
  const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows > 10) {
    throw new Error(`List rows must be <= 10, got ${totalRows}`);
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: sections.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.map((r) => ({
            id: r.id.slice(0, 200),
            title: r.title.slice(0, 24),
            description: r.description?.slice(0, 72),
          })),
        })),
      },
    },
  };
}

export function buildTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  variables?: string[]
): MetaTemplatePayload {
  const payload: MetaTemplatePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (variables && variables.length > 0) {
    payload.template.components = [
      {
        type: "body",
        parameters: variables.map((v) => ({ type: "text", text: v })),
      },
    ];
  }

  return payload;
}

export function buildImageMessageById(
  to: string,
  mediaId: string,
  caption?: string
): MetaImagePayload {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: {
      id: mediaId,
      ...(caption ? { caption } : {}),
    },
  };
}
