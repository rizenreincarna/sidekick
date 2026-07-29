import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupCompletedDuitNowQrs,
  duitNowQrExists,
  MAX_QR_BYTES,
  qrFileName,
  resolveQrPath,
  safeOrderFileStem,
  storeDuitNowQr,
} from "./marie-duitnow-qr";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "marie-qr-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("DuitNow QR naming and path safety", () => {
  it("names files by order ID with the correct extension", () => {
    expect(qrFileName("26176", "image/jpeg")).toBe("26176.jpg");
    expect(qrFileName("G3-abc", "image/png")).toBe("G3-abc.png");
  });

  it("rejects unsupported media types", () => {
    expect(qrFileName("26176", "application/pdf")).toBeNull();
    expect(qrFileName("26176", "text/html")).toBeNull();
  });

  it("strips traversal characters from untrusted order references", () => {
    expect(safeOrderFileStem("../../etc/passwd")).toBe("etcpasswd");
    expect(safeOrderFileStem("   ")).toBeNull();
    expect(safeOrderFileStem("a".repeat(65))).toBeNull();
  });

  it("refuses paths that escape the storage directory", () => {
    expect(resolveQrPath("../escape.jpg", directory)).toBeNull();
    expect(resolveQrPath("nested/file.jpg", directory)).toBeNull();
    expect(resolveQrPath("/etc/passwd", directory)).toBeNull();
    expect(resolveQrPath("26176.jpg", directory)).toContain("26176.jpg");
  });

  it("never stores QR data under the public web root", () => {
    expect(resolveQrPath("26176.jpg", directory)).not.toContain("/public/");
  });
});

describe("DuitNow QR storage", () => {
  it("stores a QR named after the order and reports its digest", async () => {
    const stored = await storeDuitNowQr({
      orderId: "26176", mimeType: "image/jpeg", data: Buffer.from("qr-bytes"), directory,
    });
    expect(stored.fileName).toBe("26176.jpg");
    expect(stored.bytes).toBe(8);
    expect(stored.sha256).toHaveLength(64);
    await expect(readdir(directory)).resolves.toEqual(["26176.jpg"]);
  });

  it("replaces an earlier QR for the same order instead of duplicating", async () => {
    await storeDuitNowQr({ orderId: "26176", mimeType: "image/jpeg", data: Buffer.from("first"), directory });
    await storeDuitNowQr({ orderId: "26176", mimeType: "image/jpeg", data: Buffer.from("second"), directory });
    await expect(readdir(directory)).resolves.toEqual(["26176.jpg"]);
  });

  it("rejects empty and oversized payloads", async () => {
    await expect(storeDuitNowQr({ orderId: "26176", mimeType: "image/png", data: Buffer.alloc(0), directory }))
      .rejects.toThrow("empty");
    await expect(storeDuitNowQr({ orderId: "26176", mimeType: "image/png", data: Buffer.alloc(MAX_QR_BYTES + 1), directory }))
      .rejects.toThrow("maximum allowed size");
  });

  it("detects whether an order already has a QR", async () => {
    await expect(duitNowQrExists("26176", directory)).resolves.toBe(false);
    await storeDuitNowQr({ orderId: "26176", mimeType: "image/png", data: Buffer.from("x"), directory });
    await expect(duitNowQrExists("26176", directory)).resolves.toBe(true);
  });
});

describe("nightly DuitNow QR cleanup", () => {
  it("removes only QRs for completed orders", async () => {
    writeFileSync(join(directory, "26176.jpg"), "done");
    writeFileSync(join(directory, "26181.jpg"), "still-active");
    writeFileSync(join(directory, "26183.png"), "done-too");

    const result = await cleanupCompletedDuitNowQrs({
      completedOrderIds: ["26176", "26183"], directory,
    });

    expect(result.removed.sort()).toEqual(["26176.jpg", "26183.png"]);
    expect(result.skipped).toEqual(["26181.jpg"]);
    await expect(readdir(directory)).resolves.toEqual(["26181.jpg"]);
  });

  it("keeps QRs for orders that are not yet completed", async () => {
    writeFileSync(join(directory, "26181.jpg"), "active");
    const result = await cleanupCompletedDuitNowQrs({ completedOrderIds: [], directory });
    expect(result.removed).toEqual([]);
    await expect(readdir(directory)).resolves.toEqual(["26181.jpg"]);
  });

  it("cannot be tricked into deleting outside the directory", async () => {
    writeFileSync(join(directory, "26181.jpg"), "active");
    const result = await cleanupCompletedDuitNowQrs({
      completedOrderIds: ["../../etc/passwd"], directory,
    });
    expect(result.removed).toEqual([]);
    await expect(readdir(directory)).resolves.toEqual(["26181.jpg"]);
  });

  it("is a no-op when the directory does not exist", async () => {
    await expect(cleanupCompletedDuitNowQrs({
      completedOrderIds: ["26176"], directory: join(directory, "missing"),
    })).resolves.toEqual({ removed: [], skipped: [] });
  });
});
