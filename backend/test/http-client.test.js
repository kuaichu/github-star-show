import assert from "node:assert/strict";
import {
  NetworkRequestError,
  requestEmpty,
  requestJson,
  requestText
} from "../src/lib/httpClient.js";
import { afterEach, test } from "node:test";

const nativeFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

test("timeout covers a response body that stalls after headers", async () => {
  let bodyCancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
    },
    cancel() {
      bodyCancelled = true;
    }
  }));

  await assert.rejects(
    requestText("https://upstream.example.test/stalled-body", {}, {
      service: "test upstream",
      timeoutMs: 50,
      maxRetries: 0
    }),
    error => error instanceof NetworkRequestError && error.code === "REQUEST_TIMEOUT"
  );
  assert.equal(bodyCancelled, true);
});

test("timeout covers fetch before response headers arrive", async () => {
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });

  await assert.rejects(
    requestJson("https://upstream.example.test/stalled-fetch", {}, {
      service: "test upstream",
      timeoutMs: 20,
      maxRetries: 0
    }),
    error => error instanceof NetworkRequestError && error.code === "REQUEST_TIMEOUT"
  );
});

test("external lease cancellation aborts body reading and cancels the body", async () => {
  const lease = new AbortController();
  const leaseLost = new Error("operation lease lost");
  let bodyCancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
      setImmediate(() => lease.abort(leaseLost));
    },
    cancel() {
      bodyCancelled = true;
    }
  }));

  await assert.rejects(
    requestText("https://upstream.example.test/lease", { signal: lease.signal }, {
      service: "test upstream",
      timeoutMs: 1000,
      maxRetries: 0
    }),
    error => error === leaseLost
  );
  assert.equal(bodyCancelled, true);
});

test("response bodies are bounded and errors do not expose URL or body content", async () => {
  let bodyCancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode("secret-response-fragment"));
    },
    cancel() {
      bodyCancelled = true;
    }
  }));

  await assert.rejects(
    requestText("https://user:token@upstream.example.test/private", {}, {
      service: "test upstream",
      maxBodyBytes: 8,
      maxRetries: 0
    }),
    error => {
      assert.equal(error.code, "RESPONSE_TOO_LARGE");
      assert.equal(JSON.stringify(error).includes("token"), false);
      assert.equal(JSON.stringify(error).includes("secret-response-fragment"), false);
      return true;
    }
  );
  assert.equal(bodyCancelled, true);
});

test("normal JSON, text, and 204 responses use one consumed response API", async () => {
  globalThis.fetch = async url => {
    if (String(url).endsWith("/json")) return Response.json({ ok: true });
    if (String(url).endsWith("/text")) return new Response("hello");
    return new Response(null, { status: 204 });
  };

  assert.deepEqual((await requestJson("https://upstream.example.test/json", {}, { maxRetries: 0 })).data, { ok: true });
  assert.equal((await requestText("https://upstream.example.test/text", {}, { maxRetries: 0 })).data, "hello");
  const empty = await requestEmpty("https://upstream.example.test/empty", {}, { maxRetries: 0 });
  assert.equal(empty.status, 204);
  assert.equal(empty.data, null);
});

test("successful requests clear their timeout and external abort listener", async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set();
  const external = new AbortController();
  let added = 0;
  let removed = 0;
  const nativeAdd = external.signal.addEventListener.bind(external.signal);
  const nativeRemove = external.signal.removeEventListener.bind(external.signal);
  external.signal.addEventListener = (...args) => {
    added += 1;
    return nativeAdd(...args);
  };
  external.signal.removeEventListener = (...args) => {
    removed += 1;
    return nativeRemove(...args);
  };
  globalThis.setTimeout = (...args) => {
    const timer = nativeSetTimeout(...args);
    activeTimers.add(timer);
    return timer;
  };
  globalThis.clearTimeout = timer => {
    activeTimers.delete(timer);
    return nativeClearTimeout(timer);
  };
  globalThis.fetch = async () => Response.json({ ok: true });

  try {
    await requestJson("https://upstream.example.test/cleanup", { signal: external.signal }, {
      timeoutMs: 1000,
      maxRetries: 0
    });
    assert.equal(added, 1);
    assert.equal(removed, 1);
    assert.equal(activeTimers.size, 0);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  }
});

test("retry cancels the previous body before the next idempotent attempt", async () => {
  let calls = 0;
  let cancelled = false;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("temporary failure"));
        },
        cancel() {
          cancelled = true;
        }
      }), { status: 503 });
    }
    assert.equal(cancelled, true);
    return new Response("recovered");
  };

  const response = await requestText("https://upstream.example.test/retry", {}, {
    maxRetries: 1,
    retryBaseMs: 0
  });
  assert.equal(response.data, "recovered");
  assert.equal(calls, 2);
});

test("non-idempotent POST does not retry and returns a structured sanitized HTTP error", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("sensitive upstream body", { status: 503 });
  };

  await assert.rejects(
    requestJson("https://user:secret@upstream.example.test/create", { method: "POST" }, {
      service: "test upstream",
      maxRetries: 2
    }),
    error => {
      assert.equal(error.code, "HTTP_ERROR");
      assert.equal(error.status, 503);
      assert.equal(JSON.stringify(error).includes("secret"), false);
      assert.equal(JSON.stringify(error).includes("sensitive upstream body"), false);
      return true;
    }
  );
  assert.equal(calls, 1);
});

test("GitHub 403 is rate limited only with valid retry evidence or the official secondary-limit structure", async t => {
  await t.test("valid Retry-After preserves retry metadata and stops retries", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({ message: "temporarily forbidden" }, {
        status: 403,
        headers: { "Retry-After": "45" }
      });
    };

    await assert.rejects(
      requestJson("https://api.github.com/user/starred", {}, { service: "GitHub", maxRetries: 2 }),
      error => error.code === "RATE_LIMITED" && error.status === 403 && error.retryAfterSeconds === 45
    );
    assert.equal(calls, 1);
  });

  await t.test("Remaining zero is rate limited and preserves reset metadata", async () => {
    const reset = Math.ceil(Date.now() / 1000) + 60;
    globalThis.fetch = async () => new Response("primary limit", {
      status: 403,
      headers: {
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(reset)
      }
    });

    await assert.rejects(
      requestJson("https://api.github.com/user/starred", {}, { service: "GitHub", maxRetries: 0 }),
      error => error.code === "RATE_LIMITED" && error.retryAfterSeconds >= 59
    );
  });

  await t.test("ordinary 403 remains an HTTP error", async () => {
    globalThis.fetch = async () => Response.json({
      message: "Resource not accessible by personal access token",
      documentation_url: "https://docs.github.com/rest/repos/repos#get-a-repository"
    }, { status: 403 });

    await assert.rejects(
      requestJson("https://api.github.com/repos/owner/repo", {}, { service: "GitHub", maxRetries: 0 }),
      error => error.code === "HTTP_ERROR" && error.status === 403 && error.rateLimited === false
    );
  });

  await t.test("invalid Retry-After does not turn an ordinary 403 into a rate limit", async () => {
    for (const value of ["not-a-delay", "1.5", "+10", "1e2"]) {
      globalThis.fetch = async () => new Response("forbidden", {
        status: 403,
        headers: { "Retry-After": value }
      });

      await assert.rejects(
        requestJson("https://api.github.com/repos/owner/repo", {}, { service: "GitHub", maxRetries: 0 }),
        error => error.code === "HTTP_ERROR" && error.rateLimited === false
      );
    }
  });

  await t.test("official secondary-rate response is recognized without trusting arbitrary message text", async () => {
    globalThis.fetch = async () => Response.json({
      message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
      documentation_url: "https://docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits"
    }, { status: 403 });

    await assert.rejects(
      requestJson("https://api.github.com/user/starred", {}, { service: "GitHub", maxRetries: 0 }),
      error => error.code === "RATE_LIMITED" && error.status === 403
    );
  });
});

test("GitHub 429 is always rate limited and preserves Retry-After", async () => {
  globalThis.fetch = async () => new Response("slow down", {
    status: 429,
    headers: { "Retry-After": "12" }
  });

  await assert.rejects(
    requestJson("https://api.github.com/user/starred", {}, { service: "GitHub", maxRetries: 2 }),
    error => error.code === "RATE_LIMITED" && error.retryAfterSeconds === 12
  );
});
