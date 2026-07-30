const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

function containsControlCharacter(value) {
  if (CONTROL_CHARACTER.test(value)) return true;
  try {
    return CONTROL_CHARACTER.test(decodeURIComponent(value));
  } catch {
    return true;
  }
}

export function safeExternalHref(value) {
  if (typeof value !== "string" || !value.trim() || containsControlCharacter(value)) return "";

  const candidate = value.trim();
  if (candidate !== value ||
      !/^https?:\/\//i.test(candidate) ||
      /[\\\s]/u.test(candidate)) {
    return "";
  }

  const authority = candidate.match(/^https?:\/\/([^/?#]*)/i)?.[1] || "";
  if (!authority || authority.includes("@")) return "";

  try {
    const parsed = new URL(candidate);
    if (!new Set(["http:", "https:"]).has(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}
