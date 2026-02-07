import type { Prisma } from "@prisma/client";
import type { ParsedMessage } from "../whatsapp/types";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { dispatch } from "./stateMachine";
import { enqueueMessages } from "./sendMessage";

export async function handleIncomingMessage(
  msg: ParsedMessage
): Promise<void> {
  // 1. Look up business by phoneNumberId
  const business = await prisma.business.findUnique({
    where: { phoneNumberId: msg.phoneNumberId },
  });

  if (!business || !business.isActive) {
    console.warn(
      `No active business for phoneNumberId: ${msg.phoneNumberId}`
    );
    return;
  }

  // 2. Idempotency check
  const eventKey = msg.messageId;
  const existing = await prisma.processedWebhookEvent.findUnique({
    where: {
      businessId_eventKey: { businessId: business.id, eventKey },
    },
  });

  if (existing) {
    console.log(`Duplicate webhook event ignored: ${eventKey}`);
    return;
  }

  // 3. Record the event
  await prisma.processedWebhookEvent.create({
    data: { businessId: business.id, eventKey },
  });

  // 4. Normalize phone to E.164
  const clientPhoneE164 = msg.from.startsWith("+")
    ? msg.from
    : `+${msg.from}`;

  // 5. Read existing conversation (for timeout check)
  const existingConversation = await prisma.conversation.findUnique({
    where: {
      businessId_clientPhoneE164: {
        businessId: business.id,
        clientPhoneE164,
      },
    },
  });

  // 6. Check timeout
  const timeoutMs = env.CONVERSATION_TIMEOUT_MINUTES * 60 * 1000;
  const isTimedOut = existingConversation
    ? Date.now() - existingConversation.lastMessageAt.getTime() > timeoutMs
    : false;

  // 7. Upsert conversation (update timestamps)
  const now = new Date();
  const serviceWindowExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const conversation = await prisma.conversation.upsert({
    where: {
      businessId_clientPhoneE164: {
        businessId: business.id,
        clientPhoneE164,
      },
    },
    update: {
      lastMessageAt: now,
      serviceWindowExpiresAt: serviceWindowExpiry,
    },
    create: {
      businessId: business.id,
      clientPhone: msg.from,
      clientPhoneE164,
      currentStep: "greeting",
      lastMessageAt: now,
      serviceWindowExpiresAt: serviceWindowExpiry,
    },
  });

  // 8. Determine current step
  const currentStep = isTimedOut ? "greeting" : conversation.currentStep;

  // 9. Run state machine
  const result = await dispatch(business, conversation, currentStep, msg.content);

  // 10. Merge tempData
  const existingTemp =
    (conversation.tempData as Record<string, unknown>) || {};
  const newTempData = result.tempData !== undefined
    ? { ...existingTemp, ...result.tempData }
    : existingTemp;

  // 11. Update conversation
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      currentStep: result.nextStep,
      tempData: newTempData as Prisma.InputJsonValue,
    },
  });

  // 12. Handle step transitions that need immediate follow-up messages
  // Some steps return nextStep without messages (e.g., selectService → selectDate)
  // In these cases, we need to "enter" the next step to generate the initial UI
  if (result.messages.length === 0 && result.nextStep !== currentStep) {
    const followUp = await dispatch(
      business,
      { ...conversation, currentStep: result.nextStep, tempData: newTempData } as typeof conversation,
      result.nextStep,
      { type: "unknown" }
    );

    // If follow-up generated messages, update step again
    if (followUp.messages.length > 0) {
      const followTempData = followUp.tempData !== undefined
        ? { ...newTempData, ...followUp.tempData }
        : newTempData;

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentStep: followUp.nextStep,
          tempData: followTempData as Prisma.InputJsonValue,
        },
      });

      await enqueueMessages(business.id, followUp.messages);
    }
  }

  // 13. Enqueue outbound messages from the original step
  if (result.messages.length > 0) {
    await enqueueMessages(business.id, result.messages);
  }
}
