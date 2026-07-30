const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUEST_TIMEOUT_MS = 15_000;
const RUNTIME_ORIGIN = typeof window === "undefined" ? "http://localhost" : window.location.origin;

function normalizeBase(value, fallbackPath, runtimeOrigin) {
  const raw = value?.trim() || fallbackPath;
  let url;
  try {
    url = new URL(raw, runtimeOrigin);
  } catch {
    return { error: "Frontend API URLs must be valid absolute or root-relative URLs." };
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    return { error: "Frontend API URLs must use http or https." };
  }

  return {
    absolute: url,
    value: value?.trim() ? url.toString().replace(/\/$/, "") : fallbackPath
  };
}

export function createApiConfiguration(env = {}, runtimeOrigin = RUNTIME_ORIGIN) {
  let page;
  try {
    page = new URL(runtimeOrigin);
  } catch {
    return { error: "Frontend runtime origin must be a valid http or https URL." };
  }
  if (!new Set(["http:", "https:"]).has(page.protocol)) {
    return { error: "Frontend runtime origin must use http or https." };
  }

  const configuredApi = env.VITE_API_BASE_URL?.trim() || "";
  const configuredAuth = env.VITE_AUTH_BASE_URL?.trim() || "";
  const api = normalizeBase(configuredApi, "/api", page.origin);
  const auth = normalizeBase(configuredAuth, "/auth", page.origin);

  if (api.error || auth.error) {
    return { error: api.error || auth.error };
  }

  if (page.protocol === "https:" && (api.absolute.protocol !== "https:" || auth.absolute.protocol !== "https:")) {
    return { error: "HTTPS pages require HTTPS API and authentication URLs." };
  }

  const apiIsCrossOrigin = api.absolute.origin !== page.origin;
  const authIsCrossOrigin = auth.absolute.origin !== page.origin;
  if ((apiIsCrossOrigin || authIsCrossOrigin) && (!configuredApi || !configuredAuth)) {
    return { error: "Cross-origin deployments must configure both VITE_API_BASE_URL and VITE_AUTH_BASE_URL." };
  }

  if (api.absolute.origin !== auth.absolute.origin) {
    return { error: "VITE_API_BASE_URL and VITE_AUTH_BASE_URL must use the same origin for credentialed requests." };
  }

  return { apiBase: api.value, authBase: auth.value, error: "" };
}

const configuration = createApiConfiguration(import.meta.env);
let csrfToken = "";
let authEpoch = 0;
let csrfRefresh = null;
const authInvalidationListeners = new Set();

export class ApiError extends Error {
  constructor(message, { status = 0, code = "REQUEST_FAILED" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function configuredBase(kind) {
  if (configuration.error) {
    throw new ApiError(configuration.error, { code: "CONFIGURATION_ERROR" });
  }
  return kind === "auth" ? configuration.authBase : configuration.apiBase;
}

async function parseError(response) {
  const raw = await response.text();
  if (!raw) return { message: `Request failed: ${response.status}`, code: "REQUEST_FAILED" };

  try {
    const parsed = JSON.parse(raw);
    return {
      message: parsed.message || parsed.error || raw,
      code: typeof parsed.code === "string" ? parsed.code : "REQUEST_FAILED"
    };
  } catch {
    return { message: raw, code: "REQUEST_FAILED" };
  }
}

function notifyAuthInvalidated() {
  authInvalidationListeners.forEach(listener => listener());
}

function clearAuthState({ notify = true } = {}) {
  csrfToken = "";
  authEpoch += 1;
  csrfRefresh = null;
  if (notify) notifyAuthInvalidated();
}

export function onAuthInvalidated(listener) {
  authInvalidationListeners.add(listener);
  return () => authInvalidationListeners.delete(listener);
}

async function performRequest(kind, path, options = {}, csrfTokenForRequest = csrfToken) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!SAFE_METHODS.has(method)) {
    headers.set("X-CSRF-Token", csrfTokenForRequest);
  }

  const timeoutController = new AbortController();
  const callerSignal = options.signal;
  const abortFromCaller = () => timeoutController.abort(callerSignal.reason);
  if (callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${configuredBase(kind)}${path}`, {
      ...options,
      method,
      credentials: "include",
      headers,
      signal: timeoutController.signal
    });
    if (response.status === 401) {
      clearAuthState();
    }
    if (!response.ok) {
      const error = await parseError(response);
      throw new ApiError(error.message, { status: response.status, code: error.code });
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError("The request timed out.", { code: "REQUEST_TIMEOUT" });
    }
    throw new ApiError("Unable to reach the backend.", { code: "NETWORK_ERROR" });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function refreshSessionAfterCsrfFailure(expectedEpoch, failedToken) {
  if (authEpoch !== expectedEpoch || csrfToken !== failedToken) {
    return authEpoch === expectedEpoch && Boolean(csrfToken);
  }

  if (!csrfRefresh || csrfRefresh.epoch !== expectedEpoch || csrfRefresh.failedToken !== failedToken) {
    const refresh = { epoch: expectedEpoch, failedToken, promise: null };
    refresh.promise = performRequest("auth", "/me")
      .then(result => {
        if (authEpoch !== expectedEpoch || csrfToken !== failedToken) {
          return authEpoch === expectedEpoch && Boolean(csrfToken);
        }
        const refreshedToken = typeof result?.csrfToken === "string" ? result.csrfToken : "";
        if (!result?.user || !refreshedToken) {
          clearAuthState();
          return false;
        }
        csrfToken = refreshedToken;
        return true;
      })
      .finally(() => {
        if (csrfRefresh === refresh) csrfRefresh = null;
      });
    csrfRefresh = refresh;
  }
  return csrfRefresh.promise;
}

async function requestFrom(kind, path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const csrfTokenAtSend = csrfToken;
  const authEpochAtSend = authEpoch;
  const returnIfAuthEpochIsCurrent = result => {
    if (!SAFE_METHODS.has(method) && authEpoch !== authEpochAtSend) {
      throw new ApiError("Your session is no longer valid.", { status: 401, code: "AUTH_REQUIRED" });
    }
    return result;
  };
  try {
    return returnIfAuthEpochIsCurrent(
      await performRequest(kind, path, options, csrfTokenAtSend)
    );
  } catch (error) {
    if (SAFE_METHODS.has(method) || error?.code !== "CSRF_INVALID") {
      throw error;
    }
    if (authEpoch !== authEpochAtSend) {
      throw new ApiError("Your session is no longer valid.", { status: 401, code: "AUTH_REQUIRED" });
    }

    const sessionIsValid = csrfToken !== csrfTokenAtSend
      ? Boolean(csrfToken)
      : await refreshSessionAfterCsrfFailure(authEpochAtSend, csrfTokenAtSend);
    if (!sessionIsValid || authEpoch !== authEpochAtSend) {
      throw new ApiError("Your session is no longer valid.", { status: 401, code: "AUTH_REQUIRED" });
    }
    // The original mutation is retried once, directly, so another CSRF error is never retried again.
    return returnIfAuthEpochIsCurrent(
      await performRequest(kind, path, options, csrfToken)
    );
  }
}

function request(path, options = {}) {
  return requestFrom("api", path, options);
}

function projectIdPath(id) {
  const normalized = Number(id);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new TypeError("project id must be a positive safe integer");
  }
  return normalized;
}

export function getGithubLoginUrl() {
  return `${configuredBase("auth")}/github/login`;
}

export function getProjects(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) params.set(key, value);
  });
  const query = params.toString();
  return request(`/projects${query ? `?${query}` : ""}`);
}

export function getProject(id) { return request(`/projects/${projectIdPath(id)}`); }
export function getMeta() { return request("/meta"); }
export function createProject(payload) { return request("/projects", { method: "POST", body: JSON.stringify(payload) }); }
export function updateProject(id, payload) { return request(`/projects/${projectIdPath(id)}`, { method: "PATCH", body: JSON.stringify(payload) }); }
export function deleteProject(id, payload = {}) { return request(`/projects/${projectIdPath(id)}`, { method: "DELETE", body: JSON.stringify(payload) }); }
export function importGithubRepo(payload) { return request("/github/import-repo", { method: "POST", body: JSON.stringify(payload) }); }

export async function getCurrentUser() {
  const requestAuthEpoch = authEpoch;
  const result = await requestFrom("auth", "/me");
  if (requestAuthEpoch !== authEpoch) {
    return { user: null, csrfToken: null };
  }
  if (!result?.user && csrfToken) {
    clearAuthState();
    return { ...result, user: null, csrfToken: null };
  }
  const nextToken = result?.user && typeof result.csrfToken === "string" ? result.csrfToken : "";
  if (result?.user && !nextToken) {
    clearAuthState();
    return { ...result, user: null, csrfToken: null };
  }
  csrfToken = nextToken;
  return result;
}

export async function logout() {
  try {
    const result = await requestFrom("auth", "/logout", { method: "POST" });
    clearAuthState();
    return result;
  } catch (error) {
    if (error?.status === 401) {
      return null;
    }
    throw error;
  }
}

export function syncGithubStars(payload = {}) { return request("/sync/github-stars", { method: "POST", body: JSON.stringify(payload) }); }
export function getMyProjects() { return request("/sync/me/projects"); }
export function getMySyncStatus() { return request("/sync/me/status"); }
export function rerunRuleClassification() { return request("/sync/reclassify-rules", { method: "POST" }); }
export function recheckRemoteStatus(payload = {}) { return request("/sync/recheck-remote-status", { method: "POST", body: JSON.stringify(payload) }); }
export function getAiClassificationConfig() { return request("/sync/ai-config"); }
export function runAiClassification(payload = {}) { return request("/sync/ai-classify", { method: "POST", body: JSON.stringify(payload) }); }
export function getAutoSyncConfig() { return request("/sync/auto-config"); }
export function updateAutoSyncConfig(payload = {}) { return request("/sync/auto-config", { method: "PUT", body: JSON.stringify(payload) }); }
export function getManagedCategories() { return request("/categories/managed"); }
export function createManagedCategory(name) { return request("/categories/managed", { method: "POST", body: JSON.stringify({ name }) }); }
export function renameManagedCategory(oldName, newName) { return request(`/categories/managed/${encodeURIComponent(oldName)}`, { method: "PUT", body: JSON.stringify({ newName }) }); }
export function deleteManagedCategory(name) { return request(`/categories/managed/${encodeURIComponent(name)}`, { method: "DELETE" }); }
export function getUserRules() { return request("/rules"); }
export function createRule(payload) { return request("/rules", { method: "POST", body: JSON.stringify(payload) }); }
export function updateRule(id, payload) { return request(`/rules/${id}`, { method: "PUT", body: JSON.stringify(payload) }); }
export function deleteRule(id) { return request(`/rules/${id}`, { method: "DELETE" }); }
