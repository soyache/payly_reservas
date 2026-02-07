import { prisma } from "../database/prisma";
import { sendMessage } from "../whatsapp/graphApi";
import type { MetaOutboundPayload } from "../whatsapp/types";

const MAX_ATTEMPTS = 5;
const BACKOFF_DELAYS_MS = [15_000, 45_000, 120_000, 360_000, 900_000];
const BATCH_SIZE = 10;

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

  for (const msg of messages) {
    try {
      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: { status: "sending" },
      });

      const payload = msg.payloadJson as unknown as MetaOutboundPayload;
      const result = await sendMessage(msg.business.phoneNumberId, payload);

      await prisma.outboundMessage.update({
        where: { id: msg.id },
        data: {
          status: "sent",
          metaMessageId: result.messageId,
          sentAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      const newAttemptCount = msg.attemptCount + 1;

      if (newAttemptCount >= MAX_ATTEMPTS) {
        await prisma.outboundMessage.update({
          where: { id: msg.id },
          data: {
            status: "dead_letter",
            attemptCount: newAttemptCount,
            lastError: errorMsg,
          },
        });
        console.error(
          `Message ${msg.id} moved to dead_letter after ${MAX_ATTEMPTS} attempts: ${errorMsg}`
        );
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
      }
    }
  }
}
