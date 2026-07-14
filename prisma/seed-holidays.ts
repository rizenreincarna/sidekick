// Malaysian Public Holidays 2025-2026 seed script
// Run with: bun run prisma/seed-holidays.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const holidays = [
  // 2025
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-01-29", name: "Thaipusam" },
  { date: "2025-01-31", name: "Chinese New Year" },
  { date: "2025-02-01", name: "Chinese New Year (2nd day)" },
  { date: "2025-02-12", name: "Maulidur Rasul" },
  { date: "2025-03-31", name: "Hari Raya Aidilfitri" },
  { date: "2025-04-01", name: "Hari Raya Aidilfitri (2nd day)" },
  { date: "2025-05-01", name: "Labour Day" },
  { date: "2025-05-12", name: "Vesak Day" },
  { date: "2025-05-30", name: "Harvest Festival" },
  { date: "2025-06-02", name: "Yang di-Pertuan Agong Birthday" },
  { date: "2025-06-07", name: "Hari Raya Haji" },
  { date: "2025-06-27", name: "Awal Muharram" },
  { date: "2025-08-31", name: "National Day" },
  { date: "2025-09-16", name: "Malaysia Day" },
  { date: "2025-10-20", name: "Deepavali" },
  { date: "2025-12-25", name: "Christmas" },
  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-02", name: "Chinese New Year" },
  { date: "2026-01-03", name: "Chinese New Year (2nd day)" },
  { date: "2026-02-16", name: "Maulidur Rasul" },
  { date: "2026-03-20", name: "Hari Raya Aidilfitri" },
  { date: "2026-03-21", name: "Hari Raya Aidilfitri (2nd day)" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-01", name: "Vesak Day" },
  { date: "2026-05-26", name: "Hari Raya Haji" },
  { date: "2026-06-01", name: "Yang di-Pertuan Agong Birthday" },
  { date: "2026-06-15", name: "Awal Muharram" },
  { date: "2026-08-31", name: "National Day" },
  { date: "2026-09-16", name: "Malaysia Day" },
  { date: "2026-11-08", name: "Deepavali" },
  { date: "2026-12-25", name: "Christmas" },
];

async function main() {
  console.log("Seeding holidays...");
  for (const holiday of holidays) {
    try {
      await prisma.holiday.upsert({
        where: { date: holiday.date },
        update: { name: holiday.name },
        create: holiday,
      });
    } catch (e) {
      console.log(`Skipped duplicate: ${holiday.date}`);
    }
  }
  console.log(`Seeded ${holidays.length} holidays`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
