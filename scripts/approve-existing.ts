import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  // Approve all existing users (they were created before the approval flow)
  const result = await prisma.user.updateMany({
    where: { isApproved: false, isActive: true },
    data: { isApproved: true },
  });
  console.log(`Approved ${result.count} existing users`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
