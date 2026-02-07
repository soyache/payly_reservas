import { prisma } from "../src/database/prisma";

const BUSINESS_PHONE_NUMBER_ID = "1051813381340844";
const BUSINESS_WABA_ID = "769024315770642";

// Granular 1-hour slots from 08:00 to 17:00
const HOUR_SLOTS = [
  { start: "08:00", end: "09:00" },
  { start: "09:00", end: "10:00" },
  { start: "10:00", end: "11:00" },
  { start: "11:00", end: "12:00" },
  { start: "12:00", end: "13:00" },
  { start: "13:00", end: "14:00" },
  { start: "14:00", end: "15:00" },
  { start: "15:00", end: "16:00" },
  { start: "16:00", end: "17:00" },
];

async function main(): Promise<void> {
  const business = await prisma.business.upsert({
    where: { phoneNumberId: BUSINESS_PHONE_NUMBER_ID },
    update: {
      name: "Barberia Demo Payly",
      timezone: "America/Tegucigalpa",
      phoneNumber: "+50400000000",
      wabaId: BUSINESS_WABA_ID,
      ownerName: "Demo Owner",
      ownerPhone: "+50499990000",
      bankAccounts: {
        accounts: [
          { bank: "Banco Atlantida", account: "1234-5678-90", holder: "Demo Owner" },
          { bank: "BAC", account: "0987-6543-21", holder: "Demo Owner" },
        ],
      },
      workingDays: [1, 2, 3, 4, 5, 6],
      isActive: true,
    },
    create: {
      name: "Barberia Demo Payly",
      timezone: "America/Tegucigalpa",
      phoneNumber: "+50400000000",
      wabaId: BUSINESS_WABA_ID,
      phoneNumberId: BUSINESS_PHONE_NUMBER_ID,
      ownerName: "Demo Owner",
      ownerPhone: "+50499990000",
      bankAccounts: {
        accounts: [
          { bank: "Banco Atlantida", account: "1234-5678-90", holder: "Demo Owner" },
          { bank: "BAC", account: "0987-6543-21", holder: "Demo Owner" },
        ],
      },
      workingDays: [1, 2, 3, 4, 5, 6],
      isActive: true,
    },
  });

  const services: Array<{ name: string; durationMinutes: number; price: string }> = [
    { name: "Corte clasico", durationMinutes: 45, price: "150.00" },
    { name: "Corte + barba", durationMinutes: 60, price: "200.00" },
    { name: "Solo barba", durationMinutes: 30, price: "100.00" },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: {
        id: `${business.id}-${service.name}`.toLowerCase().replace(/\s+/g, "-"),
      },
      update: {
        durationMinutes: service.durationMinutes,
        price: service.price,
        isActive: true,
      },
      create: {
        id: `${business.id}-${service.name}`.toLowerCase().replace(/\s+/g, "-"),
        businessId: business.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
        isActive: true,
      },
    });
  }

  // Delete old time slots and create granular 1-hour slots
  await prisma.timeSlot.deleteMany({
    where: { businessId: business.id },
  });

  for (const dayOfWeek of [1, 2, 3, 4, 5, 6]) {
    for (const slot of HOUR_SLOTS) {
      await prisma.timeSlot.create({
        data: {
          businessId: business.id,
          dayOfWeek,
          startTime: slot.start,
          endTime: slot.end,
          maxAppointments: 1,
          isActive: true,
        },
      });
    }
  }

  console.log(
    `Seed complete: ${services.length} services, ${6 * HOUR_SLOTS.length} time slots`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
