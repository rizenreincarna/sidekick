import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning database for production...\n");

  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!adminUser) {
    console.log("❌ Admin user not found! Run seed-admin.ts first.");
    return;
  }

  // Delete in order of dependencies
  await prisma.auditLog.deleteMany({});
  console.log("✓ Audit logs cleared");

  await prisma.notification.deleteMany({});
  console.log("✓ Notifications cleared");

  await prisma.chatMessage.deleteMany({});
  console.log("✓ Chat messages cleared");

  await prisma.sOSRequest.deleteMany({});
  console.log("✓ SOS requests cleared");

  await prisma.order.deleteMany({});
  console.log("✓ Orders cleared");

  await prisma.zoneConfig.deleteMany({});
  console.log("✓ Zone configs cleared");

  await prisma.userZone.deleteMany({});
  console.log("✓ User zones cleared");

  await prisma.holiday.deleteMany({});
  console.log("✓ Holidays cleared");

  await prisma.offDay.deleteMany({});
  console.log("✓ Off days cleared");

  await prisma.setting.deleteMany({});
  console.log("✓ Settings cleared");

  // Delete all users except admin
  const deletedUsers = await prisma.user.deleteMany({
    where: { username: { not: "admin" } },
  });
  console.log(`✓ ${deletedUsers.count} non-admin users deleted`);

  // Re-seed Malaysian public holidays for admin
  const holidays = [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-01-29", name: "Thaipusam" },
    { date: "2025-01-31", name: "Chinese New Year" },
    { date: "2025-02-01", name: "Chinese New Year (2nd day)" },
    { date: "2025-03-31", name: "Hari Raya Aidilfitri" },
    { date: "2025-04-01", name: "Hari Raya Aidilfitri (2nd day)" },
    { date: "2025-05-01", name: "Labour Day" },
    { date: "2025-05-12", name: "Vesak Day" },
    { date: "2025-06-02", name: "Yang di-Pertuan Agong Birthday" },
    { date: "2025-08-31", name: "National Day" },
    { date: "2025-09-16", name: "Malaysia Day" },
    { date: "2025-10-20", name: "Deepavali" },
    { date: "2025-12-25", name: "Christmas" },
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-17", name: "Chinese New Year" },
    { date: "2026-03-20", name: "Hari Raya Aidilfitri" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-26", name: "Hari Raya Haji" },
    { date: "2026-06-01", name: "Yang di-Pertuan Agong Birthday" },
    { date: "2026-08-31", name: "National Day" },
    { date: "2026-09-16", name: "Malaysia Day" },
    { date: "2026-11-08", name: "Deepavali" },
    { date: "2026-12-25", name: "Christmas" },
  ];

  for (const h of holidays) {
    await prisma.holiday.upsert({
      where: { userId_date: { userId: adminUser.id, date: h.date } },
      update: { name: h.name },
      create: { ...h, userId: adminUser.id },
    });
  }
  console.log("✓ Malaysian public holidays re-seeded (2025-2026)");

  console.log("\n✅ Database cleaned! Only admin account with holidays remains.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
