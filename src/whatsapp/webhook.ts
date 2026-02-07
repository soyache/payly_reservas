import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env";
import { parseWebhookPayload } from "./webhookParser";
import { handleIncomingMessage } from "../bot/router";
import { prisma } from "../database/prisma";

export const webhookRouter = Router();

// GET - Meta webhook verification
webhookRouter.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;

  if (mode === "subscribe" && token === env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified by Meta");
    res.status(200).send(challenge);
    return;
  }

  console.warn("Webhook verification failed");
  res.sendStatus(403);
});

// POST - Receive messages from Meta
webhookRouter.post("/webhook/whatsapp", (req, res) => {
  // 1. Verify HMAC signature
  const signature = req.headers["x-hub-signature-256"] as string | undefined;

  if (!signature) {
    console.warn("Webhook POST without signature");
    res.sendStatus(401);
    return;
  }

  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    console.error("rawBody not available - check express.json verify setup");
    res.sendStatus(500);
    return;
  }

  const expectedSig =
    "sha256=" +
    crypto
      .createHmac("sha256", env.META_APP_SECRET)
      .update(rawBody)
      .digest("hex");

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSig)
      )
    ) {
      console.warn("Webhook signature mismatch");
      res.sendStatus(401);
      return;
    }
  } catch {
    console.warn("Webhook signature comparison error");
    res.sendStatus(401);
    return;
  }

  // 2. Return 200 immediately (Meta requires fast response)
  res.sendStatus(200);

  // 3. Process events asynchronously
  const events = parseWebhookPayload(req.body);
  console.log(`[Webhook] Parsed ${events.length} event(s): ${events.map(e => e.kind).join(", ")}`);

  for (const event of events) {
    if (event.kind === "message") {
      console.log(`[Webhook] Message from ${event.data.from}, type: ${event.data.content.type}, phoneNumberId: ${event.data.phoneNumberId}`);
      handleIncomingMessage(event.data).catch((err) => {
        console.error("[Webhook] Error processing inbound message:", err);
      });
    }

    if (event.kind === "status") {
      console.log(`[Webhook] Status update: ${event.data.status} for msgId: ${event.data.messageId}`);
      handleStatusUpdate(event.data.messageId, event.data.status).catch(
        (err) => {
          console.error("[Webhook] Error processing status update:", err);
        }
      );
    }
  }
});

async function handleStatusUpdate(
  metaMessageId: string,
  status: string
): Promise<void> {
  if (status === "failed") {
    console.warn(`Meta reported message ${metaMessageId} as failed`);
  }
  // Optionally track delivery/read status on outbound messages
  // For now just log it
}
