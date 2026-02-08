import { prisma } from "../database/prisma";
import { sendMessage } from "../whatsapp/graphApi";
import axios from "axios";
import type { MetaOutboundPayload } from "../whatsapp/types";

const MAX_ATTEMPTS = 5;
const BACKOFF_DELAYS_MS = [15_000, 45_000, 120_000, 360_000, 900_000];
const BATCH_SIZE = 10;
const NON_RETRIABLE_WHATSAPP_ERROR_CODES = new Set([131030]);

function serializeOutboundError(err: unknown): Record<string, unknown> {
  if (axios.isAxiosError(err)) {
    return {
      message: err.message,
      code: err.code,
      status: err.response?.status,
      method: err.config?.method,
      url: err.config?.url,
      responseData: err.response?.data,
    };
  }

  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }

  return { error: String(err) };
}

function getWhatsAppErrorCode(err: unknown): number | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const code = (err.response?.data as { error?: { code?: unknown } } | undefined)
    ?.error?.code;
  return typeof code === "number" ? code : undefined;
}

function shouldRetryOutboundError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return true;

  const whatsappCode = getWhatsAppErrorCode(err);
  if (
    whatsappCode !== undefined &&
    NON_RETRIABLE_WHATSAPP_ERROR_CODES.has(whatsappCode)
  ) {
    return false;
  }

  const status = err.response?.status;
  if (status === undefined) return true; // Network/timeout/etc
  if (status === 429) return true;
  if (status >= 500) return true;

  return false; // Most 4xx errors are invalid requests and should not be retried
}

export async function processOutboundQueue(): Promise<void> {
  const now = new Date();

  const messages = await prisma.outboundMessage.findMany({
    where: {
      OR: [
        { status: "queued" },
        {
          status: "failed",
          attemptCount: { lt: MAX_ATTEMPTS },
          nextRetryAt: { lte: now },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    include: { business: true },
  });

  if (messages.length > 0) {
    console.log(`[OutboundWorker] Processing ${messages.length} queued message(s)`);
  }

  for (const msg of messages) {
    try {
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: "sending" },
      });

      const payload = msg.payloadJson as unknown as MetaOutboundPayload;
      console.log(`[OutboundWorker] Sending message ${msg.id} to ${msg.toPhoneE164} via phoneNumberId ${msg.business.phoneNumberId}`);
      const result = await sendMessage(msg.business.phoneNumberId, payload);

      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: {
          status: "sent",
          metaMessageId: result.messageId,
          sentAt: new Date(),
        },
      });
      console.log(`[OutboundWorker] Message ${msg.id} sent OK (metaId: ${result.messageId})`);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      const canRetry = shouldRetryOutboundError(err);
      const newAttemptCount = msg.attemptCount + 1;
      const errorDetails = serializeOutboundError(err);

      if (!canRetry || newAttemptCount >= MAX_ATTEMPTS) {
        await prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: "dead_letter",
            attemptCount: newAttemptCount,
            lastError: errorMsg,
          },
        });
        console.error(
          !canRetry
            ? `Message ${msg.id} moved to dead_letter (non-retriable error): ${errorMsg}`
            : `Message ${msg.id} moved to dead_letter after ${MAX_ATTEMPTS} attempts: ${errorMsg}`
        );
        console.error("[OutboundWorker] Send error details:", {
          messageId: msg.id,
          attempt: newAttemptCount,
          maxAttempts: MAX_ATTEMPTS,
          ...errorDetails,
        });
      } else {
        const baseDelay =
          BACKOFF_DELAYS_MS[newAttemptCount - 1] ??
          BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1];
        const jitter = Math.random() * baseDelay * 0.3;
        const nextRetryAt = new Date(Date.now() + baseDelay + jitter);

        await prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: "failed",
            attemptCount: newAttemptCount,
            nextRetryAt,
            lastError: errorMsg,
          },
        });
        console.error("[OutboundWorker] Send failed, scheduling retry:", {
          messageId: msg.id,
          attempt: newAttemptCount,
          maxAttempts: MAX_ATTEMPTS,
          nextRetryAt: nextRetryAt.toISOString(),
          ...errorDetails,
        });
      }
    }
  }
}
