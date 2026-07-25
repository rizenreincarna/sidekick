import { describe, it, expect } from "vitest";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

describe("label HTML escaping", () => {
  it("neutralizes script injection", () => {
    const out = escapeHtml(`<img src=x onerror=alert(1)>`);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("escapes quotes for attribute contexts", () => {
    expect(escapeHtml(`" onmouseover="x`)).not.toContain('"');
  });

  it("escapes ampersands first", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});
