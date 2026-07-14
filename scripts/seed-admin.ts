import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (existingAdmin) {
    console.log("Admin user already exists, updating role and password...");
    const hashedPassword = await bcrypt.hash("@liBABA1122", 10);
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        role: "ADMIN",
        password: hashedPassword,
        isActive: true,
        isApproved: true,
      },
    });
    console.log("Admin user updated successfully.");

    // Ensure AI settings exist for existing admin
    const aiSettings = [
      { key: "ai_enabled", value: "true" },
      { key: "ai_api_key", value: "sk-de012656bfc641d7b0f52195020299df" },
      { key: "ai_base_url", value: "https://api.deepseek.com" },
      { key: "ai_model", value: "deepseek-chat" },
      { key: "ai_system_prompt", value: "" },
    ];
    for (const s of aiSettings) {
      await prisma.setting.upsert({
        where: { userId_key: { userId: existingAdmin.id, key: s.key } },
        update: {},
        create: { userId: existingAdmin.id, key: s.key, value: s.value },
      });
    }
    console.log("AI settings ensured for admin.");
  } else {
    const hashedPassword = await bcrypt.hash("@liBABA1122", 10);
    const admin = await prisma.user.create({
      data: {
        username: "admin",
        password: hashedPassword,
        displayName: "Administrator",
        role: "ADMIN",
        isActive: true,
        isApproved: true,
      },
    });
    console.log("Admin user created:", admin.username, admin.role);

    // Seed default Malaysian holidays for admin
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
      { date: "2026-05-26", name: "Hari Raya Haja" },
      { date: "2026-06-01", name: "Yang di-Pertuan Agong Birthday" },
      { date: "2026-08-31", name: "National Day" },
      { date: "2026-09-16", name: "Malaysia Day" },
      { date: "2026-11-08", name: "Deepavali" },
      { date: "2026-12-25", name: "Christmas" },
    ];

    for (const h of holidays) {
      await prisma.holiday.create({
        data: { date: h.date, name: h.name, userId: admin.id },
      });
    }
    console.log("Holidays seeded for admin.");

    // Seed default AI settings for admin
    const aiSettings = [
      { key: "ai_enabled", value: "true" },
      { key: "ai_api_key", value: "sk-de012656bfc641d7b0f52195020299df" },
      { key: "ai_base_url", value: "https://api.deepseek.com" },
      { key: "ai_model", value: "deepseek-chat" },
      { key: "ai_system_prompt", value: "" },
    ];
    for (const s of aiSettings) {
      await prisma.setting.upsert({
        where: { userId_key: { userId: admin.id, key: s.key } },
        update: { value: s.value },
        create: { userId: admin.id, key: s.key, value: s.value },
      });
    }
    console.log("AI settings seeded for admin.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
