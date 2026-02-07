import { prisma } from "../../database/prisma";

export interface AvailableSlot {
  timeSlotId: string;
  startTime: string;
  endTime: string;
}

const ACTIVE_STATUSES = [
  "pending_payment",
  "pending_approval",
  "confirmed",
] as const;

export async function getAvailableSlots(
  businessId: string,
  dateIso: string,
  dayOfWeek: number
): Promise<AvailableSlot[]> {
  const timeSlots = await prisma.timeSlot.findMany({
    where: { businessId, dayOfWeek, isActive: true },
    orderBy: { startTime: "asc" },
  });

  const results: AvailableSlot[] = [];

  for (const slot of timeSlots) {
    const count = await prisma.appointment.count({
      where: {
        businessId,
        timeSlotId: slot.id,
        date: new Date(dateIso),
        status: { in: [...ACTIVE_STATUSES] },
      },
    });

    if (count < slot.maxAppointments) {
      results.push({
        timeSlotId: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  return results;
}
