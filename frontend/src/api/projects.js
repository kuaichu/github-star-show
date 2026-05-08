const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";
const AUTH_BASE = import.meta.env.VITE_AUTH_BASE_URL || "http://localhost:3000/auth";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const parsed = JSON.parse(raw);
      message = parsed.message || raw;
    } catch {
      message = raw;
    }

    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function getProjects(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return request(`/projects${query ? `?${query}` : ""}`);
}

export function getProject(id) {
  return request(`/projects/${id}`);
}

export function getMeta() {
  return request("/meta");
}

export function createProject(payload) {
  return request("/projects", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateProject(id, payload) {
  return request(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteProject(id, payload = {}) {
  return request(`/projects/${id}`, {
    method: "DELETE",
    body: JSON.stringify(payload)
  });
}

export function importGithubRepo(payload) {
  return request("/github/import-repo", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getCurrentUser() {
  return fetch(`${AUTH_BASE}/me`, {
    credentials: "include"
  }).then(response => response.json());
}

export function logout() {
  return fetch(`${AUTH_BASE}/logout`, {
    method: "POST"
    ,
    credentials: "include"
  });
}

export function syncGithubStars(payload = {}) {
  return request("/sync/github-stars", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMyProjects() {
  return request("/sync/me/projects");
}

export function getMySyncStatus() {
  return request("/sync/me/status");
}

export function rerunRuleClassification() {
  return request("/sync/reclassify-rules", {
    method: "POST"
  });
}

export function recheckRemoteStatus(payload = {}) {
  return request("/sync/recheck-remote-status", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAiClassificationConfig() {
  return request("/sync/ai-config");
}

export function runAiClassification(payload = {}) {
  return request("/sync/ai-classify", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
