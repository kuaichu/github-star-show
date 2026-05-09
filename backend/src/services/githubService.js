function parseRepoInput(repoInput) {
  const value = String(repoInput || "").trim();
  const match = value.match(/^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git|\/)?$/i);

  if (!match) {
    throw new Error("Invalid repository format. Use owner/repo.");
  }

  return {
    owner: match[1],
    repo: match[2]
  };
}

export function parseGithubRepositoryUrl(githubUrl) {
  return parseRepoInput(githubUrl);
}

function buildGithubHeaders(accessToken = "") {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-star-show"
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

export async function fetchRepository(repoInput) {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}`;

  const headers = {
    ...buildGithubHeaders()
  };

  const response = await fetch(url, { headers });

  if (response.status === 404) {
    throw new Error("GitHub repository not found.");
  }

  if (response.status === 403) {
    throw new Error("GitHub API rate limited or token access is insufficient.");
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }

  const data = await response.json();
  let readme = "";

  try {
    const readmeResponse = await fetch(`${baseUrl}/repos/${owner}/${repo}/readme`, {
      headers: {
        ...headers,
        Accept: "application/vnd.github.raw+json"
      }
    });

    if (readmeResponse.ok) {
      readme = (await readmeResponse.text()).slice(0, 4000);
    }
  } catch {
    readme = "";
  }

  return {
    owner: data.owner?.login || owner,
    repo: data.name || repo,
    fullName: data.full_name || `${owner}/${repo}`,
    description: data.description || "",
    language: data.language || "",
    stars: data.stargazers_count || 0,
    updatedAt: data.pushed_at ? data.pushed_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    github: data.html_url || `https://github.com/${owner}/${repo}`,
    tags: Array.isArray(data.topics) ? data.topics : [],
    homepage: data.homepage || "",
    archived: Boolean(data.archived),
    readme
  };
}

export async function fetchRepositoryReadme(repoInput, accessToken = "") {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/readme`;
  const response = await fetch(url, {
    headers: {
      ...buildGithubHeaders(accessToken),
      Accept: "application/vnd.github.raw+json"
    }
  });

  if (response.status === 404) {
    return "";
  }

  if (!response.ok) {
    throw new Error(`GitHub README request failed with status ${response.status}.`);
  }

  return (await response.text()).slice(0, 24000);
}

export async function inspectRepositoryState(repoInput, accessToken = "") {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}`;
  const response = await fetch(url, {
    headers: buildGithubHeaders(accessToken)
  });

  if (response.status === 404) {
    return {
      exists: false,
      archived: false
    };
  }

  if (!response.ok) {
    throw new Error(`GitHub repository check failed with status ${response.status}.`);
  }

  const data = await response.json();
  return {
    exists: true,
    archived: Boolean(data.archived)
  };
}

export async function fetchLatestRelease(owner, repo, accessToken = "") {
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/releases/latest`;

  try {
    const response = await fetch(url, {
      headers: buildGithubHeaders(accessToken)
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.published_at || null;
  } catch {
    return null;
  }
}

export async function fetchLatestCommit(owner, repo, accessToken = "") {
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/repos/${owner}/${repo}/commits?per_page=1`;

  try {
    const response = await fetch(url, {
      headers: buildGithubHeaders(accessToken)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const commitDate = data[0]?.commit?.author?.date || data[0]?.commit?.committer?.date;
    return commitDate || null;
  } catch {
    return null;
  }
}

export async function isRepositoryStarred(accessToken, repoInput) {
  const { owner, repo } = parseRepoInput(repoInput);
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const url = `${baseUrl}/user/starred/${owner}/${repo}`;
  const response = await fetch(url, {
    headers: buildGithubHeaders(accessToken)
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

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-star-show"
    }
  });

  if (response.status === 204 || response.status === 404) {
    return;
  }

  if (response.status === 401) {
    throw new Error("GitHub authorization expired. Please log in again.");
  }

  if (response.status === 403) {
    throw new Error("GitHub authorization does not allow unstarring. Please re-authorize with the updated scope.");
  }

  throw new Error(`GitHub unstar request failed with status ${response.status}.`);
}
