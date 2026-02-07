import type { Business, Conversation } from "@prisma/client";
import type { ParsedMessageContent, StepResult } from "../../whatsapp/types";
import { buildListMessage } from "../../whatsapp/messageBuilder";
import { prisma } from "../../database/prisma";

async function showServicesList(
  business: Business,
  to: string
): Promise<StepResult> {
  const services = await prisma.service.findMany({
    where: { businessId: business.id, isActive: true },
    orderBy: { name: "asc" },
  });

  if (services.length === 0) {
    return {
      nextStep: "greeting",
      messages: [],
    };
  }

  return {
    nextStep: "select_service",
    messages: [
      {
        toPhoneE164: to,
        payload: buildListMessage(
          to,
          "Estos son nuestros servicios. Elige uno:",
          "Ver servicios",
          [
            {
              title: "Servicios",
              rows: services.map((s) => ({
                id: s.id,
                title: s.name,
                description: `L ${s.price} - ${s.durationMinutes} min`,
              })),
            },
          ]
        ),
      },
    ],
  };
}

export async function handleSelectService(
  business: Business,
  conversation: Conversation,
  content: ParsedMessageContent
): Promise<StepResult> {
  const to = conversation.clientPhoneE164;

  if (content.type === "list_reply") {
    const serviceId = content.listId;

    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId: business.id, isActive: true },
    });

    if (!service) {
      return showServicesList(business, to);
    }

    return {
      nextStep: "select_date",
      tempData: {
        selectedServiceId: service.id,
        selectedServiceName: service.name,
        selectedServicePrice: service.price.toString(),
      },
      messages: [],
    };
  }

  return showServicesList(business, to);
}
