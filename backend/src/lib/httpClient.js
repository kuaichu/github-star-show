export class NetworkRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "NetworkRequestError";
    this.code = options.code || "NETWORK_ERROR";
    this.status = options.status || 0;
    this.service = options.service || "upstream";
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.rateLimited = this.code === "RATE_LIMITED";
    this.retryable = Boolean(options.retryable);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      service: this.service,
      retryAfterSeconds: this.retryAfterSeconds,
      rateLimited: this.rateLimited,
      retryable: this.retryable
    };
  }
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function retryAfterHeaderSeconds(response) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null && retryAfter.trim() !== "") {
    const value = retryAfter.trim();
    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      if (Number.isSafeInteger(seconds)) return seconds;
    }
    if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
      const date = Date.parse(value);
      if (Number.isFinite(date) && date > Date.now()) {
        return Math.max(1, Math.ceil((date - Date.now()) / 1000));
      }
    }
  }
  return null;
}

function retryAfterSeconds(response) {
  const fromRetryAfter = retryAfterHeaderSeconds(response);
  if (fromRetryAfter !== null) return fromRetryAfter;

  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(1, Math.ceil(reset - Date.now() / 1000));
  }
  return null;
}

function isOfficialGithubSecondaryRateLimit(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (typeof data.message !== "string" || !/\bsecondary rate limit\b/i.test(data.message)) return false;
  if (typeof data.documentation_url !== "string") return false;

  try {
    const docs = new URL(data.documentation_url);
    return docs.protocol === "https:" &&
      docs.hostname === "docs.github.com" &&
      docs.pathname.includes("/rest/using-the-rest-api/rate-limits-for-the-rest-api");
  } catch {
    return false;
  }
}

function isRateLimited(response, rejectedData, service) {
  if (response.status === 429) return true;
  if (response.status !== 403 || String(service).toLowerCase() !== "github") return false;
  return response.headers.get("x-ratelimit-remaining")?.trim() === "0" ||
    retryAfterHeaderSeconds(response) !== null ||
    isOfficialGithubSecondaryRateLimit(rejectedData);
}

function safelyParseJson(bytes) {
  if (!bytes?.byteLength) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

async function cancelBody(response, reason) {
  if (!response?.body) return;
  try {
    await response.body.cancel(reason);
  } catch {
    // A locked/already-finished body has either been cancelled by its reader or fully consumed.
  }
}

function abortReason(signal) {
  return signal.reason || new DOMException("The operation was aborted", "AbortError");
}

async function wait(ms, signal) {
  if (ms <= 0) {
    signal?.throwIfAborted();
    return;
  }

  await new Promise((resolve, reject) => {
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    timer.unref?.();
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readBoundedBody(response, { maxBodyBytes, service, signal }) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    await cancelBody(response, "response body too large");
    throw new NetworkRequestError(`${service} response body exceeded the size limit.`, {
      code: "RESPONSE_TOO_LARGE",
      status: response.status,
      service
    });
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let rejectOnAbort;
  const aborted = new Promise((_, reject) => {
    rejectOnAbort = () => reject(abortReason(signal));
    if (signal.aborted) rejectOnAbort();
    else signal.addEventListener("abort", rejectOnAbort, { once: true });
  });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        throw new NetworkRequestError(`${service} response body exceeded the size limit.`, {
          code: "RESPONSE_TOO_LARGE",
          status: response.status,
          service
        });
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", rejectOnAbort);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function decodeBody(bytes, responseType, { service, status }) {
  if (responseType === "empty") return null;
  const text = new TextDecoder().decode(bytes);
  if (responseType === "text") return text;
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new NetworkRequestError(`${service} returned an invalid JSON response.`, {
      code: "INVALID_RESPONSE",
      status,
      service
    });
  }
}

async function requestAttempt(url, options, config) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;
  const abortFromExternal = () => controller.abort(abortReason(externalSignal));
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("request timeout"));
  }, config.timeoutMs);
  timer.unref?.();

  let response;
  try {
    externalSignal?.throwIfAborted();
    response = await fetch(url, { ...options, signal: controller.signal });

    if (!response.ok && !config.allowedStatuses.has(response.status)) {
      const rejectedResponse = response;
      let rejectedData = null;
      if (response.status === 403 && String(config.service).toLowerCase() === "github") {
        const bytes = await readBoundedBody(response, {
          maxBodyBytes: config.maxBodyBytes,
          service: config.service,
          signal: controller.signal
        });
        rejectedData = safelyParseJson(bytes);
      } else {
        await cancelBody(response, "response status rejected");
      }
      response = undefined;
      if (isRateLimited(rejectedResponse, rejectedData, config.service)) {
        throw new NetworkRequestError(`${config.service} rate limit reached.`, {
          code: "RATE_LIMITED",
          status: rejectedResponse.status,
          service: config.service,
          retryAfterSeconds: retryAfterSeconds(rejectedResponse)
        });
      }

      const retryable = rejectedResponse.status >= 500 && rejectedResponse.status <= 599;
      throw new NetworkRequestError(`${config.service} returned HTTP ${rejectedResponse.status}.`, {
        code: "HTTP_ERROR",
        status: rejectedResponse.status,
        service: config.service,
        retryable
      });
    }

    const bytes = await readBoundedBody(response, {
      maxBodyBytes: config.maxBodyBytes,
      service: config.service,
      signal: controller.signal
    });
    const data = decodeBody(bytes, config.responseType, {
      service: config.service,
      status: response.status
    });
    return {
      data,
      headers: response.headers,
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    if (response) await cancelBody(response, error);
    if (externalSignal?.aborted) throw abortReason(externalSignal);
    if (timedOut) {
      throw new NetworkRequestError(`${config.service} request timed out.`, {
        code: "REQUEST_TIMEOUT",
        service: config.service,
        retryable: true
      });
    }
    if (error instanceof NetworkRequestError) throw error;
    throw new NetworkRequestError(`${config.service} network request failed.`, {
      code: "NETWORK_ERROR",
      service: config.service,
      retryable: true
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

async function request(url, options = {}, policy = {}, responseType) {
  const method = String(options.method || "GET").toUpperCase();
  const service = policy.service || "upstream";
  const timeoutMs = boundedInteger(
    policy.timeoutMs ?? process.env.HTTP_TIMEOUT_MS,
    10_000,
    1,
    120_000
  );
  const maxBodyBytes = boundedInteger(
    policy.maxBodyBytes ?? policy.maxResponseBytes ?? process.env.HTTP_MAX_BODY_BYTES ?? process.env.HTTP_MAX_RESPONSE_BYTES,
    1024 * 1024,
    1,
    10 * 1024 * 1024
  );
  const idempotent = policy.idempotent ?? ["GET", "HEAD"].includes(method);
  const maxRetries = idempotent
    ? boundedInteger(policy.maxRetries ?? process.env.HTTP_MAX_RETRIES, 1, 0, 2)
    : 0;
  const retryBaseMs = boundedInteger(
    policy.retryBaseMs ?? process.env.HTTP_RETRY_BASE_MS,
    100,
    0,
    5000
  );
  const config = {
    allowedStatuses: new Set(policy.allowedStatuses || []),
    maxBodyBytes,
    responseType,
    service,
    timeoutMs
  };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await requestAttempt(url, options, config);
    } catch (error) {
      if (!(error instanceof NetworkRequestError)) throw error;
      if (error.rateLimited || !error.retryable || attempt === maxRetries) throw error;
      await wait(retryBaseMs * (2 ** attempt), options.signal);
    }
  }

  throw new NetworkRequestError(`${service} request failed.`, { service });
}

export function requestJson(url, options = {}, policy = {}) {
  return request(url, options, policy, "json");
}

export function requestText(url, options = {}, policy = {}) {
  return request(url, options, policy, "text");
}

export function requestEmpty(url, options = {}, policy = {}) {
  return request(url, options, policy, "empty");
}
