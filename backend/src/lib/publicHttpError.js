import { NetworkRequestError } from "./httpClient.js";

export class PublicHttpError extends Error {
  constructor(code, statusCode, publicMessage) {
    super(publicMessage);
    this.name = "PublicHttpError";
    this.code = code;
    this.statusCode = statusCode;
    this.expose = true;
    this.publicMessage = publicMessage;
  }
}

function safeRetryAfterSeconds(error) {
  const value = error?.retryAfterSeconds;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function trySendPublicHttpError(res, error) {
  if (error instanceof PublicHttpError && error.expose === true) {
    res.status(error.statusCode).json({ message: error.publicMessage });
    return true;
  }

  if (error instanceof NetworkRequestError) {
    if (error.rateLimited) {
      const retryAfterSeconds = safeRetryAfterSeconds(error);
      if (retryAfterSeconds !== null) {
        res.setHeader("Retry-After", String(retryAfterSeconds));
      }
      res.status(429).json({ message: "GitHub rate limit reached." });
      return true;
    }

    res.status(400).json({ message: "Unable to verify GitHub repository." });
    return true;
  }

  return false;
}
