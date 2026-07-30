import { describe, expect, it } from "vitest";

import { safeExternalHref } from "./externalUrl";

describe("safeExternalHref", () => {
  it.each([
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,unsafe"],
    ["file scheme", "file:///tmp/unsafe"],
    ["vbscript scheme", "vbscript:msgbox(1)"],
    ["HTTP userinfo", "https://user:password@github.com/owner/repo"],
    ["empty HTTP userinfo", "https://@github.com/owner/repo"],
    ["missing authority slash", "https:/evil.example/path"],
    ["backslash authority", "https:\\evil.example/path"],
    ["malformed URL", "https://[invalid"],
    ["literal control character", "https://github.com/owner/\nrepo"],
    ["encoded control character", "https://github.com/owner/%00repo"]
  ])("rejects %s", (_label, value) => {
    expect(safeExternalHref(value)).toBe("");
  });

  it("preserves a valid absolute GitHub HTTPS URL", () => {
    expect(safeExternalHref("https://github.com/owner/repo"))
      .toBe("https://github.com/owner/repo");
  });
});
