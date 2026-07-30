export const MAX_EXTERNAL_URL_LENGTH = 2048;

export function parseOptionalHttpUrl(value, options = {}) {
  const maxLength = options.maxLength ?? MAX_EXTERNAL_URL_LENGTH;
  if (value === null || value === undefined) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, reason: "type" };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: "" };
  if (trimmed.length > maxLength) return { ok: false, reason: "length" };

  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        parsed.username || parsed.password) {
      return { ok: false, reason: "scheme" };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, reason: "format" };
  }
}
