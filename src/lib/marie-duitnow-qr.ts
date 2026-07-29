import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

/**
 * DuitNow QR storage for contactless pickups.
 *
 * These images are customer payment identifiers, so they are deliberately stored OUTSIDE
 * the Next.js `public/` web root: nothing here is ever served statically. Files are named
 * by order ID so a driver or admin can find the right QR, and are removed by the nightly
 * sweep once the order is COMPLETED and the reward has been paid.
 */

/** Private, non-web-served directory. Override with MARIE_DUITNOW_QR_DIR. */
export const DUITNOW_QR_DIR = process.env.MARIE_DUITNOW_QR_DIR
  ? resolve(process.env.MARIE_DUITNOW_QR_DIR)
  : resolve(process.cwd(), "private/duitnow-qr");

const ALLOWED_MIME: Record<string, "jpg" | "png"> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/** 2 MB ceiling: a QR screenshot never legitimately exceeds this. */
export const MAX_QR_BYTES = 2 * 1024 * 1024;

/**
 * Order IDs come from customer-linked records, so they are treated as untrusted input and
 * reduced to a strict charset. This prevents path traversal (`../`) and absolute paths.
 */
export function safeOrderFileStem(orderId: string): string | null {
  const cleaned = orderId.trim().replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned.length === 0 || cleaned.length > 64 ? null : cleaned;
}

export function qrFileName(orderId: string, mimeType: string): string | null {
  const stem = safeOrderFileStem(orderId);
  const extension = ALLOWED_MIME[mimeType.toLowerCase()];
  return stem && extension ? `${stem}.${extension}` : null;
}

/** Resolves a QR path and refuses anything that escapes the storage directory. */
export function resolveQrPath(fileName: string, directory = DUITNOW_QR_DIR): string | null {
  if (fileName.includes("/") || fileName.includes("\\") || isAbsolute(fileName)) return null;
  const target = resolve(join(directory, fileName));
  const root = `${resolve(directory)}/`;
  return target.startsWith(root) ? target : null;
}

export interface StoredQr {
  path: string;
  fileName: string;
  bytes: number;
  sha256: string;
}

/**
 * Stores (or replaces) the DuitNow QR for one order. Writing by order ID means a customer
 * resending their QR overwrites the old file instead of accumulating duplicates.
 */
export async function storeDuitNowQr(input: {
  orderId: string;
  mimeType: string;
  data: Buffer;
  directory?: string;
}): Promise<StoredQr> {
  const directory = input.directory ?? DUITNOW_QR_DIR;
  const fileName = qrFileName(input.orderId, input.mimeType);
  if (!fileName) throw new Error("Unsupported DuitNow QR file type or invalid order reference");
  if (input.data.byteLength === 0) throw new Error("DuitNow QR payload is empty");
  if (input.data.byteLength > MAX_QR_BYTES) throw new Error("DuitNow QR exceeds the maximum allowed size");

  const path = resolveQrPath(fileName, directory);
  if (!path) throw new Error("Refusing to write DuitNow QR outside the storage directory");

  await mkdir(directory, { recursive: true, mode: 0o700 });
  // 0o600: readable only by the service account.
  await writeFile(path, input.data, { mode: 0o600 });
  return {
    path,
    fileName,
    bytes: input.data.byteLength,
    sha256: createHash("sha256").update(input.data).digest("hex"),
  };
}

export async function duitNowQrExists(orderId: string, directory = DUITNOW_QR_DIR): Promise<boolean> {
  const stem = safeOrderFileStem(orderId);
  if (!stem) return false;
  for (const extension of ["jpg", "png"]) {
    const path = resolveQrPath(`${stem}.${extension}`, directory);
    if (!path) continue;
    try {
      if ((await stat(path)).isFile()) return true;
    } catch {
      // Missing file is a normal negative result.
    }
  }
  return false;
}

/**
 * Nightly cleanup. Deletes QR files belonging to COMPLETED orders only: the QR is still
 * needed while an order is pending, scheduled, or awaiting payment. Returns what it
 * removed so the caller can audit the sweep without logging payment data.
 */
export async function cleanupCompletedDuitNowQrs(input: {
  completedOrderIds: readonly string[];
  directory?: string;
}): Promise<{ removed: string[]; skipped: string[] }> {
  const directory = input.directory ?? DUITNOW_QR_DIR;
  const removed: string[] = [];
  const skipped: string[] = [];

  let present: string[];
  try {
    present = await readdir(directory);
  } catch {
    return { removed, skipped };
  }

  const completed = new Set(
    input.completedOrderIds
      .map(safeOrderFileStem)
      .filter((stem): stem is string => stem !== null),
  );

  for (const fileName of present) {
    const stem = fileName.replace(/\.(jpg|png)$/i, "");
    if (!completed.has(stem)) {
      skipped.push(fileName);
      continue;
    }
    const path = resolveQrPath(fileName, directory);
    if (!path) {
      skipped.push(fileName);
      continue;
    }
    await rm(path, { force: true });
    removed.push(fileName);
  }

  return { removed, skipped };
}
