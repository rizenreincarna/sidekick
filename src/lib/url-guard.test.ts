import { describe, it, expect } from "vitest";
import { validateOutboundUrl } from "./url-guard";

describe("SSRF outbound URL guard", () => {
  it("allows normal https URLs", () => {
    expect(validateOutboundUrl("https://api.deepseek.com")).toBeNull();
    expect(validateOutboundUrl("https://example.com:8443/path?q=1")).toBeNull();
  });

  it("blocks loopback", () => {
    expect(validateOutboundUrl("http://127.0.0.1")).not.toBeNull();
    expect(validateOutboundUrl("http://localhost")).not.toBeNull();
    expect(validateOutboundUrl("http://[::1]")).not.toBeNull();
  });

  it("blocks private ranges", () => {
    expect(validateOutboundUrl("http://10.0.0.5")).not.toBeNull();
    expect(validateOutboundUrl("http://172.16.1.1")).not.toBeNull();
    expect(validateOutboundUrl("http://192.168.1.1")).not.toBeNull();
    expect(validateOutboundUrl("http://169.254.169.254/latest/meta-data")).not.toBeNull();
  });

  it("blocks embedded credentials and bad schemes", () => {
    expect(validateOutboundUrl("https://user:pass@example.com")).not.toBeNull();
    expect(validateOutboundUrl("file:///etc/passwd")).not.toBeNull();
    expect(validateOutboundUrl("gopher://example.com")).not.toBeNull();
  });

  it("blocks garbage", () => {
    expect(validateOutboundUrl("not a url")).not.toBeNull();
    expect(validateOutboundUrl("")).not.toBeNull();
  });
});
