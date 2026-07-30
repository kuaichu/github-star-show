import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createApiConfiguration,
  getCurrentUser,
  logout,
  onAuthInvalidated,
  updateProject
} from "./projects";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("API configuration", () => {
  it("uses relative same-origin URLs when production URLs are not configured", () => {
    const result = createApiConfiguration({}, "https://stars.example.com");
    expect(result).toEqual({ apiBase: "/api", authBase: "/auth", error: "" });
    expect(`${result.apiBase}${result.authBase}`).not.toContain("localhost");
  });

  it("requires complete, same-origin configuration for a cross-origin backend", () => {
    const incomplete = createApiConfiguration(
      { VITE_API_BASE_URL: "https://api.example.com/api" },
      "https://stars.example.com"
    );
    expect(incomplete.error).toMatch(/configure both/i);

    const split = createApiConfiguration(
      {
        VITE_API_BASE_URL: "https://api.example.com/api",
        VITE_AUTH_BASE_URL: "https://auth.example.com/auth"
      },
      "https://stars.example.com"
    );
    expect(split.error).toMatch(/same origin/i);
  });

  it.each([
    {
      name: "accepts relative endpoints on an HTTPS page",
      env: {},
      origin: "https://stars.example.com",
      valid: true
    },
    {
      name: "accepts matching HTTPS API and auth origins",
      env: {
        VITE_API_BASE_URL: "https://api.example.com/api",
        VITE_AUTH_BASE_URL: "https://api.example.com/auth"
      },
      origin: "https://stars.example.com",
      valid: true
    },
    {
      name: "rejects HTTP localhost endpoints on an HTTPS page",
      env: {
        VITE_API_BASE_URL: "http://localhost:3000/api",
        VITE_AUTH_BASE_URL: "http://localhost:3000/auth"
      },
      origin: "https://localhost:5173",
      valid: false
    },
    {
      name: "accepts HTTP localhost endpoints when the page is also HTTP",
      env: {
        VITE_API_BASE_URL: "http://localhost:3000/api",
        VITE_AUTH_BASE_URL: "http://localhost:3000/auth"
      },
      origin: "http://localhost:5173",
      valid: true
    }
  ])("$name", ({ env, origin, valid }) => {
    const result = createApiConfiguration(env, origin);
    expect(result.error === "").toBe(valid);
  });
});

describe("authenticated requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the /auth/me CSRF token in memory and sends it on mutations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "csrf-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7, name: "updated" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await updateProject(7, { name: "updated" });

    const [, mutationOptions] = fetchMock.mock.calls[1];
    expect(mutationOptions.credentials).toBe("include");
    expect(mutationOptions.headers.get("X-CSRF-Token")).toBe("csrf-1");
  });

  it("sends the CSRF token on logout and clears it afterward", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "csrf-logout" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await logout();
    await updateProject(7, {});

    expect(fetchMock.mock.calls[1][1].headers.get("X-CSRF-Token")).toBe("csrf-logout");
    expect(fetchMock.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("");
  });

  it("notifies auth invalidation before a successful logout promise continues", async () => {
    const events = [];
    const stop = onAuthInvalidated(() => events.push("invalidated"));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: 1 },
        csrfToken: "csrf-logout-order"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await getCurrentUser();
    await logout().then(() => events.push("continued"));

    expect(events).toEqual(["invalidated", "continued"]);
    stop();
  });

  it("retains the in-memory CSRF token when logout fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "csrf-retained" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporary failure" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(logout()).rejects.toMatchObject({ status: 503 });
    await updateProject(7, {});

    expect(fetchMock.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("csrf-retained");
  });

  it("preserves structured error codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      code: "VALIDATION_FAILED",
      message: "bad payload"
    }), {
      status: 422,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(updateProject(7, {})).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_FAILED",
      message: "bad payload"
    });
  });

  it("aborts a request at the ordinary request timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));

    try {
      const request = updateProject(7, { note: "timeout" });
      const rejection = expect(request).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the timeout active until the response body finishes parsing", async () => {
    vi.useFakeTimers();
    let bodyCancelled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"id":7'));
          options.signal.addEventListener("abort", () => {
            bodyCancelled = true;
            controller.error(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        }
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "application/json" } });
    });

    try {
      const request = updateProject(7, { note: "timeout while parsing" });
      const rejection = expect(request).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(bodyCancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "not-an-id"])(
    "rejects unsafe project id %s before fetch",
    async id => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      expect(() => updateProject(id, {})).toThrow(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("refreshes the session after CSRF_INVALID and retries a mutation exactly once", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "fresh" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(updateProject(7, {})).resolves.toEqual({ id: 7 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers.get("X-CSRF-Token")).toBe("fresh");
  });

  it("does not refresh or retry a second time when the retried mutation also has CSRF_INVALID", async () => {
    const csrfFailure = () => new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "old" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(csrfFailure())
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "new" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(csrfFailure());

    await getCurrentUser();
    await expect(updateProject(7, {})).rejects.toMatchObject({ code: "CSRF_INVALID", status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("shares one CSRF refresh across concurrent 403 responses", async () => {
    let meCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).endsWith("/auth/me")) {
        meCalls += 1;
        return new Response(JSON.stringify({
          user: { id: 1 },
          csrfToken: meCalls === 1 ? "shared-stale" : "shared-fresh"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (options.headers.get("X-CSRF-Token") !== "shared-fresh") {
        return new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    await getCurrentUser();
    await Promise.all([updateProject(1, {}), updateProject(2, {})]);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/me"));
    expect(refreshCalls).toHaveLength(2); // Initial session load plus one shared refresh.
  });

  it("reuses a refreshed token when another old-token 403 arrives after refresh completion", async () => {
    let meCalls = 0;
    let staleMutationCalls = 0;
    let releaseDelayed403;
    const delayed403 = new Promise(resolve => { releaseDelayed403 = resolve; });
    const csrfFailure = () => new Response(JSON.stringify({
      code: "CSRF_INVALID",
      message: "expired"
    }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).endsWith("/auth/me")) {
        meCalls += 1;
        return new Response(JSON.stringify({
          user: { id: 1 },
          csrfToken: meCalls === 1 ? "delayed-stale" : "delayed-fresh"
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      const token = options.headers.get("X-CSRF-Token");
      if (token === "delayed-stale") {
        staleMutationCalls += 1;
        return staleMutationCalls === 1 ? csrfFailure() : delayed403;
      }
      expect(token).toBe("delayed-fresh");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    await getCurrentUser();
    const first = updateProject(1, {});
    const second = updateProject(2, {});
    await first;
    releaseDelayed403(csrfFailure());
    await second;

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/me"));
    expect(refreshCalls).toHaveLength(2); // Initial load plus the only necessary refresh.
  });

  it("invalidates app auth when refresh finds no session and does not retry", async () => {
    const invalidated = vi.fn();
    const stop = onAuthInvalidated(invalidated);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null, csrfToken: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(updateProject(7, {})).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(invalidated).toHaveBeenCalledTimes(1);
    stop();
  });

  it.each([
    ["missing", {}],
    ["empty", { csrfToken: "" }]
  ])("invalidates app auth when refresh returns a user with a %s CSRF token", async (_label, tokenPayload) => {
    const invalidated = vi.fn();
    const stop = onAuthInvalidated(invalidated);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, ...tokenPayload }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(updateProject(7, {})).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(invalidated).toHaveBeenCalledTimes(1);
    stop();
  });

  it("normalizes a direct /auth/me user without a CSRF token to signed-out state", async () => {
    const invalidated = vi.fn();
    const stop = onAuthInvalidated(invalidated);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      user: { id: 1, login: "incomplete-session" }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(getCurrentUser()).resolves.toEqual({
      user: null,
      csrfToken: null
    });
    expect(invalidated).toHaveBeenCalledTimes(1);
    stop();
  });

  it("invalidates app auth when a direct /auth/me check finds a previously authenticated session gone", async () => {
    const invalidated = vi.fn();
    const stop = onAuthInvalidated(invalidated);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        user: { id: 1, login: "authenticated-user" },
        csrfToken: "active-session"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: null, csrfToken: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await expect(getCurrentUser()).resolves.toMatchObject({ user: { id: 1 } });
    await expect(getCurrentUser()).resolves.toEqual({ user: null, csrfToken: null });

    expect(invalidated).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not emit auth invalidation for an initial guest /auth/me response", async () => {
    const invalidated = vi.fn();
    const stop = onAuthInvalidated(invalidated);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      user: null,
      csrfToken: null
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(getCurrentUser()).resolves.toEqual({ user: null, csrfToken: null });

    expect(invalidated).not.toHaveBeenCalled();
    stop();
  });

  it("notifies on 401 but preserves auth state and CSRF on network errors", async () => {
    const invalidated = vi.fn();
    const stop = onAuthInvalidated(invalidated);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "retained" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "AUTH_REQUIRED", message: "signed out" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(updateProject(7, {})).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(invalidated).not.toHaveBeenCalled();
    await updateProject(7, {});
    expect(fetchMock.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("retained");
    await expect(updateProject(7, {})).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    expect(invalidated).toHaveBeenCalledTimes(1);
    stop();
  });

  it("refreshes and retries logout on CSRF_INVALID while treating 401 as logged out", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "logout-stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "logout-fresh" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "AUTH_REQUIRED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(logout()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers.get("X-CSRF-Token")).toBe("logout-fresh");
  });

  it("retains the refreshed CSRF token when the retried logout returns 503", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "logout-stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "logout-refreshed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(logout()).rejects.toMatchObject({ status: 503 });
    await updateProject(7, {});
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4][1].headers.get("X-CSRF-Token")).toBe("logout-refreshed");
  });

  it("retains the CSRF token when logout has a network failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "network-retained" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));

    await getCurrentUser();
    await expect(logout()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await updateProject(7, {});
    expect(fetchMock.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("network-retained");
  });

  it("does not restore a CSRF token from a refresh that completes after logout", async () => {
    const refreshStarted = deferred();
    const refreshResult = deferred();
    let meCalls = 0;
    const csrfFailure = new Response(JSON.stringify({ code: "CSRF_INVALID", message: "expired" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      const target = String(url);
      if (target.endsWith("/auth/me")) {
        meCalls += 1;
        if (meCalls === 1) {
          return new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "logout-race-stale" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        refreshStarted.resolve();
        return refreshResult.promise;
      }
      if (target.endsWith("/auth/logout")) return new Response(null, { status: 204 });
      if (target.endsWith("/api/projects/1")) return csrfFailure;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    await getCurrentUser();
    const mutation = updateProject(1, {});
    await refreshStarted.promise;
    await logout();
    refreshResult.resolve(new Response(JSON.stringify({
      user: { id: 1 },
      csrfToken: "must-not-be-restored"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(mutation).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    await updateProject(2, {});
    const lastMutationOptions = fetchMock.mock.calls.findLast(([url]) => String(url).endsWith("/api/projects/2"))[1];
    expect(lastMutationOptions.headers.get("X-CSRF-Token")).toBe("");
  });

  it("does not restore user or CSRF state from a normal /auth/me response after logout", async () => {
    const currentUserResponse = deferred();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      const target = String(url);
      if (target.endsWith("/auth/me")) return currentUserResponse.promise;
      if (target.endsWith("/auth/logout")) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    const pendingUser = getCurrentUser();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await logout();
    currentUserResponse.resolve(new Response(JSON.stringify({
      user: { id: 1, login: "stale-user" },
      csrfToken: "must-not-return"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(pendingUser).resolves.toEqual({ user: null, csrfToken: null });
    await updateProject(2, {});
    const mutationOptions = fetchMock.mock.calls.findLast(([url]) => String(url).endsWith("/api/projects/2"))[1];
    expect(mutationOptions.headers.get("X-CSRF-Token")).toBe("");
  });

  it("rejects a successful mutation response that arrives after logout", async () => {
    const mutationResponse = deferred();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
      const target = String(url);
      if (target.endsWith("/auth/me")) {
        return new Response(JSON.stringify({ user: { id: 1 }, csrfToken: "mutation-race" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (target.endsWith("/auth/logout")) return new Response(null, { status: 204 });
      if (target.endsWith("/api/projects/7")) return mutationResponse.promise;
      throw new Error(`Unexpected request: ${target}`);
    });

    await getCurrentUser();
    const mutation = updateProject(7, { note: "old session" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await logout();
    mutationResponse.resolve(new Response(JSON.stringify({ id: 7, note: "old session" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(mutation).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
  });
});
