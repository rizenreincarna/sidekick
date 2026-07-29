import { cleanupCompletedDuitNowQrs, DUITNOW_QR_DIR } from "../src/lib/marie-duitnow-qr";
import { db } from "../src/lib/db";

/**
 * Nightly DuitNow QR sweep.
 *
 * Removes stored QR images for orders that are COMPLETED, since the reward has been paid
 * and the payment identifier is no longer needed. Orders in any other state keep their QR.
 * Prints only counts and file names, never QR contents.
 */
try {
  const completed = await db.order.findMany({
    where: { status: "COMPLETED" },
    select: { orderId: true },
  });

  const result = await cleanupCompletedDuitNowQrs({
    completedOrderIds: completed.map(order => order.orderId),
    directory: DUITNOW_QR_DIR,
  });

  console.log(JSON.stringify({
    ranAt: new Date().toISOString(),
    directory: DUITNOW_QR_DIR,
    completedOrders: completed.length,
    removed: result.removed.length,
    retained: result.skipped.length,
  }));
} finally {
  await db.$disconnect();
}
