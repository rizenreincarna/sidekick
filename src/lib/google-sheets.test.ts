import { describe, expect, it } from "vitest";
import { parseSheetOrderRow, parseSheetOrderStatus } from "./google-sheets";

describe("Google Sheets status import", () => {
  it("normalizes legacy CONFIRMED to CONTACTED", () => {
    expect(parseSheetOrderStatus("CONFIRMED")).toBe("CONTACTED");
    expect(parseSheetOrderRow(["123", "Name", "0123", "Address", "City", "M", "No", "1", "", "CONFIRMED"])?.status).toBe("CONTACTED");
  });

  it("defaults blank status and rejects unknown status", () => {
    expect(parseSheetOrderStatus("")).toBe("PENDING");
    expect(() => parseSheetOrderStatus("DELIVERED")).toThrow("Invalid order status");
  });
});
