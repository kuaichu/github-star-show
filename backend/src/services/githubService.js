import { NetworkRequestError, requestEmpty, requestJson, requestText } from "../lib/httpClient.js";
import { PublicHttpError } from "../lib/publicHttpError.js";
import { parseOptionalHttpUrl } from "../lib/externalUrl.js";

function parseRepoInput(repoInput) {
  const value = typeof repoInput === "string" ? repoInput.trim() : "";
  let identity = null;
  if (value && !/[\\%\u0000-\u001F\u007F]/.test(value) && /^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com" &&
          !parsed.username && !parsed.password && !parsed.port && !parsed.search && !parsed.hash &&
          parts.length === 2 && parsed.pathname === `/${parts[0]}/${parts[1]}`) {
        const repository = parts[1].endsWith(".git") ? parts[1].slice(0, -4) : parts[1];
        identity = { owner: parts[0], repo: repository };
      }
    } catch {
      identity = null;
    }
  } else if (value && !/[\\%?\#\u0000-\u001F\u007F]/.test(value)) {
    const match = value.match(/^([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    if (match) identity = { owner: match[1], repo: match[2] };
  }

  if (!identity || !isValidGithubOwner(identity.owner) || !isValidGithubRepositoryName(identity.repo)) {
    throw new PublicHttpError(
      "INVALID_REPOSITORY_FORMAT",
      400,
      "Invalid repository format. Use owner/repo."
    );
  }

  return {
    owner: identity.owner,
    repo: identity.repo
  };
}

export function parseGithubRepositoryUrl(githubUrl) {
  return parseRepoInput(githubUrl);
}

export function isPublicGithubRepository(repo) {
  return repo?.private === false && repo?.visibility === "public";
}

function invalidRepositoryResponse() {
  return new PublicHttpError(
    "INVALID_RESPONSE",
    422,
    "GitHub repository response was incomplete or invalid."
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const GITHUB_OWNER_PATTERN = /^(?=.{1,39}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function isValidGithubOwner(value) {
  return typeof value === "string" && GITHUB_OWNER_PATTERN.test(value);
}

function isValidGithubRepositoryName(value) {
  return typeof value === "string" &&
    GITHUB_REPOSITORY_PATTERN.test(value) &&
    value !== "." && value !== "..";
}

function parseGithubUtcTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = value.match(GITHUB_UTC_TIMESTAMP_PATTERN);
  if (!match) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const [, year, month, day, hour, minute, second] = match;
  if (date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() + 1 !== Number(month) ||
      date.getUTCDate() !== Number(day) ||
      date.getUTCHours() !== Number(hour) ||
      date.getUTCMinutes() !== Number(minute) ||
      date.getUTCSeconds() !== Number(second)) {
    return null;
  }
  return date;
}

function parseGithubHtmlUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\\%\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com" ||
        parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash ||
        parts.length !== 2 || parsed.pathname !== `/${parts[0]}/${parts[1]}` ||
        !isValidGithubOwner(parts[0]) || !isValidGithubRepositoryName(parts[1])) {
      return null;
    }
    return {
      owner: parts[0],
      repo: parts[1],
      url: `https://github.com/${parts[0]}/${parts[1]}`
    };
  } catch {
    return null;
  }
}

function parseGithubFullName(value) {
  if (typeof value !== "string") return null;
  const parts = value.trim().split("/");
  if (parts.length !== 2 || !isValidGithubOwner(parts[0]) || !isValidGithubRepositoryName(parts[1])) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

function sameGithubIdentity(left, right) {
  return left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repo.toLowerCase() === right.repo.toLowerCase();
}

function normalizeGithubRepositoryIdentity(repo) {
  if (!isObject(repo) || !isValidGithubRepositoryName(repo.name) ||
      !isObject(repo.owner) || !isValidGithubOwner(repo.owner.login)) {
    throw invalidRepositoryResponse();
  }
  const identity = { owner: repo.owner.login.trim(), repo: repo.name.trim() };
  const parsedUrl = parseGithubHtmlUrl(repo.html_url);
  if (!parsedUrl || !sameGithubIdentity(identity, parsedUrl)) throw invalidRepositoryResponse();
  if (Object.hasOwn(repo, "full_name")) {
    const parsedFullName = parseGithubFullName(repo.full_name);
    if (!parsedFullName || !sameGithubIdentity(identity, parsedFullName)) throw invalidRepositoryResponse();
  }
  return {
    owner: identity.owner,
    repo: identity.repo,
    fullName: `${identity.owner}/${identity.repo}`,
    github: `https://github.com/${identity.owner}/${identity.repo}`
  };
}

export function normalizePublicGithubRepository(repo) {
  if (!isObject(repo) || !isPublicGithubRepository(repo)) throw invalidRepositoryResponse();
  const identity = normalizeGithubRepositoryIdentity(repo);
  if (!Object.hasOwn(repo, "description") || (repo.description !== null && typeof repo.description !== "string")) {
    throw invalidRepositoryResponse();
  }
  if (!Object.hasOwn(repo, "language") || (repo.language !== null && typeof repo.language !== "string")) {
    throw invalidRepositoryResponse();
  }
  if (!Object.hasOwn(repo, "pushed_at") ||
      (repo.pushed_at !== null && !parseGithubUtcTimestamp(repo.pushed_at))) {
    throw invalidRepositoryResponse();
  }
  if (!Number.isSafeInteger(repo.stargazers_count) || repo.stargazers_count < 0) {
    throw invalidRepositoryResponse();
  }
  if (Object.hasOwn(repo, "topics") && !Array.isArray(repo.topics)) throw invalidRepositoryResponse();
  const topics = Object.hasOwn(repo, "topics") ? repo.topics : [];
  if (topics.length > 20 || topics.some(topic =>
    typeof topic !== "string" || topic.trim().length > 50 || /[\u0000-\u001F\u007F]/.test(topic)
  )) throw invalidRepositoryResponse();
  const normalizedTopics = [...new Set(topics.map(topic => topic.trim()).filter(Boolean))];
  if (Object.hasOwn(repo, "homepage") && repo.homepage !== null && typeof repo.homepage !== "string") {
    throw invalidRepositoryResponse();
  }
  const homepageResult = parseOptionalHttpUrl(repo.homepage);
  if (Object.hasOwn(repo, "full_name") && !isNonEmptyString(repo.full_name)) {
    throw invalidRepositoryResponse();
  }
  if (Object.hasOwn(repo, "archived") && typeof repo.archived !== "boolean") {
    throw invalidRepositoryResponse();
  }

  const pushedAt = repo.pushed_at === null ? null : parseGithubUtcTimestamp(repo.pushed_at).toISOString();
  return {
    name: identity.repo,
    full_name: identity.fullName,
    owner: { login: identity.owner },
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    pushed_at: pushedAt,
    html_url: identity.github,
    topics: normalizedTopics,
    homepage: homepageResult.ok ? homepageResult.value : "",
    archived: repo.archived ?? false,
    private: false,
    visibility: "public"
  };
}

export function normalizeGithubStarItem(starItem, options = {}) {
  const mode = options.mode === "incremental" ? "incremental" : "full";
  if (!isObject(starItem)) throw invalidRepositoryResponse();
  const hasWrapper = Object.hasOwn(starItem, "repo");
  if (mode === "incremental" && !hasWrapper) throw invalidRepositoryResponse();
  const repo = hasWrapper ? starItem.repo : starItem;
  if (!isObject(repo)) throw invalidRepositoryResponse();

  const starredAtValue = hasWrapper ? starItem.starred_at : undefined;
  if (mode === "incremental" && (starredAtValue === undefined || starredAtValue === null)) {
    throw invalidRepositoryResponse();
  }
  const starredAt = starredAtValue === undefined || starredAtValue === null
    ? null
    : parseGithubUtcTimestamp(starredAtValue);
  if (starredAtValue !== undefined && starredAtValue !== null && !starredAt) {
    throw invalidRepositoryResponse();
  }

  const identity = normalizeGithubRepositoryIdentity(repo);
  const isPublic = repo.private === false && repo.visibility === "public";
  const isNonPublic = repo.private === true &&
    (repo.visibility === "private" || repo.visibility === "internal");
  if (!isPublic && !isNonPublic) throw invalidRepositoryResponse();
  if (!isPublic) {
    return {
      public: false,
      github: identity.github,
      owner: identity.owner,
      name: identity.repo,
      starredAt
    };
  }
  return {
    public: true,
    github: identity.github,
    owner: identity.owner,
    name: identity.repo,
    repo: normalizePublicGithubRepository(repo),
    starredAt
  };
}

export function hasCompleteSharedRepositoryData(repo) {
  try {
    normalizePublicGithubRepository(repo);
    return true;
  } catch {
    return false;
  }
}

export const GITHUB_TOKEN_POLICY = Object.freeze({
  explicitOnly: "explicit-only",
  serverFallback: "server-fallback"
});

function buildGithubHeaders(accessToken = "", {
  tokenPolicy = GITHUB_TOKEN_POLICY.serverFallback
} = {}) {
  if (!Object.values(GITHUB_TOKEN_POLICY).includes(tokenPolicy)) {
    throw new Error("Unknown GitHub token policy.");
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-star-show"
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (tokenPolicy === GITHUB_TOKEN_POLICY.serverFallback && process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

export async function fetchRepository(repoInput, accessToken = "") {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}`;

  const headers = {
    ...buildGithubHeaders(accessToken)
  };

  const response = await requestJson(url, { headers }, {
    service: "GitHub",
    allowedStatuses: [404]
  });

  if (response.status === 404) {
    throw new PublicHttpError("REPOSITORY_NOT_FOUND", 404, "GitHub repository not found.");
  }

  if (response.status === 403) {
    throw new Error("GitHub API rate limited or token access is insufficient.");
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }

  const data = response.data;
  if (!isPublicGithubRepository(data)) {
    throw new PublicHttpError(
      "REPOSITORY_NOT_PUBLIC",
      422,
      "Only verified public GitHub repositories can be added."
    );
  }
  const normalized = normalizePublicGithubRepository(data);
  let readme = "";

  try {
    const readmeResponse = await requestText(`${baseUrl}/repos/${owner}/${repo}/readme`, {
      headers: {
        ...headers,
        Accept: "application/vnd.github.raw+json"
      }
    }, {
      service: "GitHub",
      allowedStatuses: [404]
    });

    if (readmeResponse.ok) {
      readme = readmeResponse.data.slice(0, 4000);
    }
  } catch (error) {
    if (error?.rateLimited) throw error;
    readme = "";
  }

  return {
    owner: normalized.owner.login,
    repo: normalized.name,
    fullName: normalized.full_name,
    description: normalized.description ?? "",
    language: normalized.language ?? "",
    stars: normalized.stargazers_count,
    updatedAt: normalized.pushed_at
      ? normalized.pushed_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    github: normalized.html_url,
    tags: normalized.topics,
    homepage: normalized.homepage,
    archived: normalized.archived,
    private: false,
    visibility: "public",
    readme
  };
}

export async function fetchRepositoryReadme(repoInput, accessToken = "", options = {}) {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/readme`;
  const response = await requestText(url, {
    headers: {
      ...buildGithubHeaders(accessToken, options),
      Accept: "application/vnd.github.raw+json"
    }
  }, {
    service: "GitHub",
    allowedStatuses: [404]
  });

  if (response.status === 404) {
    return "";
  }

  if (!response.ok) {
    throw new Error(`GitHub README request failed with status ${response.status}.`);
  }

  return response.data.slice(0, 24000);
}

export async function inspectRepositoryState(repoInput, accessToken = "") {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}`;
  const response = await requestJson(url, {
    headers: buildGithubHeaders(accessToken, { tokenPolicy: GITHUB_TOKEN_POLICY.explicitOnly })
  }, {
    service: "GitHub",
    allowedStatuses: [404]
  });

  if (response.status === 404) {
    return {
      exists: false,
      archived: false,
      publicVisible: false
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub repository check failed with status ${response.status}.`);
  }

  const data = response.data;
  if (!isObject(data) || !Object.hasOwn(data, "full_name") || !isNonEmptyString(data.full_name) ||
      typeof data.archived !== "boolean" || typeof data.private !== "boolean" ||
      typeof data.visibility !== "string") {
    throw invalidRepositoryResponse();
  }
  const identity = normalizeGithubRepositoryIdentity(data);
  if (!sameGithubIdentity(identity, { owner, repo })) throw invalidRepositoryResponse();
  const isPublic = data.private === false && data.visibility === "public";
  const isNonPublic = data.private === true &&
    (data.visibility === "private" || data.visibility === "internal");
  if (!isPublic && !isNonPublic) throw invalidRepositoryResponse();
  return {
    exists: true,
    archived: data.archived,
    publicVisible: isPublic
  };
}

export async function fetchLatestRelease(owner, repo, accessToken = "", options = {}) {
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/releases/latest`;

  const response = await requestJson(url, {
    signal: options.signal,
    headers: buildGithubHeaders("", { tokenPolicy: GITHUB_TOKEN_POLICY.explicitOnly })
  }, {
    service: "GitHub",
    allowedStatuses: [404]
  });

  if (response.status === 404) {
    return null;
  }

  const data = response.data;
  return data.published_at || null;
}

export async function fetchLatestCommit(owner, repo, accessToken = "", options = {}) {
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/commits?per_page=1`;

  const response = await requestJson(url, {
    signal: options.signal,
    headers: buildGithubHeaders("", { tokenPolicy: GITHUB_TOKEN_POLICY.explicitOnly })
  }, {
    service: "GitHub",
    allowedStatuses: [404]
  });

  if (response.status === 404) {
    return null;
  }

  const data = response.data;
  if (!Array.isArray(data) || data.length === 0) return null;

  const commitDate = data[0]?.commit?.author?.date || data[0]?.commit?.committer?.date;
  return commitDate || null;
}

export async function isRepositoryStarred(accessToken, repoInput) {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/user/starred/${owner}/${repo}`;
  const response = await requestEmpty(url, {
    headers: buildGithubHeaders(accessToken)
  }, {
    service: "GitHub",
    allowedStatuses: [204, 404]
  });

  if (response.status === 204) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`GitHub star relationship check failed with status ${response.status}.`);
  }

  return false;
}

export async function unstarRepository(accessToken, repoInput) {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/user/starred/${owner}/${repo}`;

  let response;
  try {
    response = await requestEmpty(url, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "github-star-show"
      }
    }, {
      service: "GitHub",
      allowedStatuses: [204, 401, 404, 422],
      idempotent: true
    });
  } catch (error) {
    if (error instanceof NetworkRequestError && error.status === 403 && !error.rateLimited) {
      throw new PublicHttpError(
        "GITHUB_UNSTAR_FORBIDDEN",
        403,
        "GitHub authorization does not allow unstarring. Please re-authorize."
      );
    }
    throw error;
  }

  if (response.status === 204 || response.status === 404) {
    return;
  }

  if (response.status === 401) {
    throw new PublicHttpError(
      "GITHUB_AUTH_EXPIRED",
      401,
      "GitHub authorization expired. Please log in again."
    );
  }

  if (response.status === 422) {
    throw new PublicHttpError(
      "GITHUB_UNSTAR_REJECTED",
      422,
      "GitHub could not remove the star."
    );
  }

  throw new Error(`GitHub unstar request failed with status ${response.status}.`);
}
