import { classifyRepository, CATEGORY_LABELS } from "./classificationService.js";
import { createProject, listProjects, updateProject } from "./projectService.js";
import { getPrisma } from "../lib/prisma.js";
import { inspectRepositoryState, isRepositoryStarred } from "./githubService.js";
import { getUserProjectByProjectId, listUserProjects, saveUserProject } from "./userProjectService.js";

export const SYNC_MODE_FULL = "full";
export const SYNC_MODE_INCREMENTAL = "incremental";
export const REMOTE_STATUS_ACTIVE = "active";
export const REMOTE_STATUS_UNSTARRED = "unstarred";
export const REMOTE_STATUS_MISSING = "missing";
export const REMOTE_STATUS_ARCHIVED = "archived";

async function fetchStarPage(accessToken, page) {
  const response = await fetch(`https://api.github.com/user/starred?per_page=100&page=${page}`, {
    headers: {
      Accept: "application/vnd.github.star+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-star-show"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch starred repositories. Status ${response.status}.`);
  }

  return response.json();
}

async function fetchStarredRepositories(accessToken, options = {}) {
  const { mode = SYNC_MODE_FULL, starredAfter = null } = options;
  const items = [];
  let page = 1;
  let reachedCutoff = false;

  while (true) {
    const pageItems = await fetchStarPage(accessToken, page);
    if (!pageItems.length) {
      break;
    }

    if (mode === SYNC_MODE_INCREMENTAL && starredAfter) {
      for (const pageItem of pageItems) {
        const starredAt = pageItem?.starred_at ? new Date(pageItem.starred_at) : null;

        if (starredAt && starredAt <= starredAfter) {
          reachedCutoff = true;
          break;
        }

        items.push(pageItem);
      }
    } else {
      items.push(...pageItems);
    }

    if (reachedCutoff || pageItems.length < 100) {
      break;
    }

    page += 1;
  }

  return items;
}

async function getLatestUserStarredAt(user) {
  const projects = await listUserProjects(user);
  const timestamps = projects
    .map(item => item.starredAt)
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return timestamps[0] || null;
}

function normalizeSyncMode(mode, hasExistingSync) {
  if (mode === SYNC_MODE_FULL) {
    return SYNC_MODE_FULL;
  }

  if (mode === SYNC_MODE_INCREMENTAL && hasExistingSync) {
    return SYNC_MODE_INCREMENTAL;
  }

  return SYNC_MODE_FULL;
}

function getSyncRunSource(mode) {
  return mode === SYNC_MODE_INCREMENTAL ? "github_star_incremental" : "github_star_full";
}

function buildRemoteState(repo) {
  if (repo.archived) {
    return {
      remoteStatus: REMOTE_STATUS_ARCHIVED,
      remoteStatusNote: "GitHub reports this repository as archived."
    };
  }

  return {
    remoteStatus: REMOTE_STATUS_ACTIVE,
    remoteStatusNote: ""
  };
}

async function resolveRemoteStatusForProject(user, project) {
  try {
    const repoRef = project.github || `${project.author}/${project.name}`;
    const existsState = await inspectRepositoryState(repoRef, user.accessToken);

    if (!existsState.exists) {
      return {
        remoteStatus: REMOTE_STATUS_MISSING,
        remoteStatusNote: "GitHub repository lookup returned 404. The repository may have been deleted or moved."
      };
    }

    if (existsState.archived) {
      return {
        remoteStatus: REMOTE_STATUS_ARCHIVED,
        remoteStatusNote: "GitHub reports this repository as archived."
      };
    }

    const starred = await isRepositoryStarred(user.accessToken, repoRef);
    if (!starred) {
      return {
        remoteStatus: REMOTE_STATUS_UNSTARRED,
        remoteStatusNote: "This repository is no longer present in your current GitHub stars."
      };
    }

    return {
      remoteStatus: REMOTE_STATUS_ACTIVE,
      remoteStatusNote: ""
    };
  } catch {
    return {
      remoteStatus: project.remoteStatus || REMOTE_STATUS_ACTIVE,
      remoteStatusNote: project.remoteStatusNote || "Remote status could not be fully verified during this check."
    };
  }
}

export async function syncUserStars(user, options = {}) {
  const existingUserProjects = await listUserProjects(user);
  const latestStarredAt = await getLatestUserStarredAt(user);
  const mode = normalizeSyncMode(options.mode, Boolean(latestStarredAt));
  const starred = await fetchStarredRepositories(user.accessToken, {
    mode,
    starredAfter: mode === SYNC_MODE_INCREMENTAL ? latestStarredAt : null
  });
  const existingProjects = await listProjects({});
  const importedProjects = [];
  const prisma = getPrisma();
  const persistedUserId = user.dbUserId || Number(user.id);
  const syncedGithubUrls = new Set();

  for (const starItem of starred) {
    const repo = starItem.repo || starItem;
    syncedGithubUrls.add(String(repo.html_url || "").toLowerCase());
    const normalized = {
      name: repo.name,
      author: repo.owner?.login || "",
      description: repo.description || "",
      language: repo.language || "Unknown",
      stars: repo.stargazers_count || 0,
      updatedAt: repo.pushed_at ? repo.pushed_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      github: repo.html_url,
      demo: repo.homepage || "",
      docs: "",
      tags: Array.isArray(repo.topics) ? repo.topics : [],
      features: [],
      note: `Imported from GitHub Star sync: ${repo.full_name}`,
      category: classifyRepository({
        name: repo.name,
        description: repo.description,
        language: repo.language,
        tags: repo.topics || []
      }),
      categorySource: "rule",
      status: "收藏备用",
      recommended: false
    };

    const existing = existingProjects.items.find(item =>
      item.github.toLowerCase() === normalized.github.toLowerCase() ||
      `${item.author}/${item.name}`.toLowerCase() === repo.full_name.toLowerCase()
    );

    let project = null;

    if (existing) {
      project = await updateProject(existing.id, {
        ...normalized,
        category: existing.category || normalized.category,
        categorySource: existing.categorySource || normalized.categorySource,
        status: existing.status,
        recommended: existing.recommended,
        docs: existing.docs || normalized.docs,
        demo: existing.demo || normalized.demo,
        note: existing.note || normalized.note,
        features: existing.features,
        tags: existing.tags.length ? existing.tags : normalized.tags,
        aiCategory: existing.aiCategory || null,
        aiConfidence: existing.aiConfidence ?? null,
        aiReason: existing.aiReason || "",
        aiModel: existing.aiModel || "",
        aiClassifiedAt: existing.aiClassifiedAt || null
      });
    }

    if (!project) {
      project = await createProject(normalized);
    }

    const existingUserProject = await getUserProjectByProjectId(user, project.id);
    const remoteState = buildRemoteState(repo);
    const savedUserProject = await saveUserProject(user, project, {
      category: existingUserProject?.category || project.category,
      status: existingUserProject?.status || project.status,
      recommended: existingUserProject?.recommended ?? project.recommended,
      note: existingUserProject?.note || project.note,
      demo: existingUserProject?.demo || project.demo,
      docs: existingUserProject?.docs || project.docs,
      tags: existingUserProject?.tags || project.tags,
      features: existingUserProject?.features || project.features,
      remoteStatus: remoteState.remoteStatus,
      remoteStatusNote: remoteState.remoteStatusNote,
      remoteCheckedAt: new Date(),
      starredAt: starItem.starred_at ? new Date(starItem.starred_at) : existingUserProject?.starredAt || null,
      lastSyncedAt: new Date()
    });

    importedProjects.push(savedUserProject);
  }

  if (mode === SYNC_MODE_FULL) {
    for (const localItem of existingUserProjects) {
      if (syncedGithubUrls.has(String(localItem.github || "").toLowerCase())) {
        continue;
      }

      const remoteState = await resolveRemoteStatusForProject(user, localItem);
      const nextRemoteStatus = remoteState.remoteStatus;
      const nextRemoteStatusNote = remoteState.remoteStatusNote;

      const globalProject = await updateProject(localItem.id, {
        name: localItem.name,
        author: localItem.author,
        category: localItem.category,
        categorySource: localItem.categorySource || "rule",
        status: localItem.status,
        language: localItem.language,
        stars: localItem.stars,
        updatedAt: localItem.updatedAt,
        recommended: localItem.recommended,
        description: localItem.description,
        features: localItem.features,
        tags: localItem.tags,
        github: localItem.github,
        demo: localItem.demo,
        docs: localItem.docs,
        note: localItem.note,
        aiCategory: localItem.aiCategory,
        aiConfidence: localItem.aiConfidence,
        aiReason: localItem.aiReason,
        aiModel: localItem.aiModel,
        aiClassifiedAt: localItem.aiClassifiedAt
      });

      if (!globalProject) {
        continue;
      }

      await saveUserProject(user, globalProject, {
        category: localItem.category,
        status: localItem.status,
        recommended: localItem.recommended,
        note: localItem.note,
        demo: localItem.demo,
        docs: localItem.docs,
        tags: localItem.tags,
        features: localItem.features,
        remoteStatus: nextRemoteStatus,
        remoteStatusNote: nextRemoteStatusNote,
        remoteCheckedAt: new Date(),
        starredAt: localItem.starredAt,
        lastSyncedAt: new Date()
      });
    }
  }

  if (prisma) {
    await prisma.user.update({
      where: { id: persistedUserId },
      data: {
        lastStarSyncAt: new Date()
      }
    });

    await prisma.syncRun.create({
      data: {
        userId: persistedUserId,
        source: getSyncRunSource(mode),
        total: importedProjects.length
      }
    });
  }

  return {
    mode,
    total: importedProjects.length,
    cutoffStarredAt: latestStarredAt,
    items: importedProjects
  };
}

export async function getProjectsForUser(user) {
  return listUserProjects(user);
}

export async function rerunRuleClassificationForUser(user) {
  const userProjects = await listUserProjects(user);
  const updatedItems = [];

  for (const item of userProjects) {
    const nextCategory = classifyRepository({
      name: item.name,
      description: item.description,
      language: item.language,
      tags: item.tags || []
    });

    const projectPayload = {
      name: item.name,
      author: item.author,
      category: nextCategory,
      categorySource: "rule",
      status: item.status,
      language: item.language,
      stars: item.stars,
      updatedAt: item.updatedAt,
      recommended: item.recommended,
      description: item.description,
      features: item.features,
      tags: item.tags,
      github: item.github,
      demo: item.demo,
      docs: item.docs,
      note: item.note,
      aiCategory: item.aiCategory,
      aiConfidence: item.aiConfidence,
      aiReason: item.aiReason,
      aiModel: item.aiModel,
      aiClassifiedAt: item.aiClassifiedAt
    };

    const project = await updateProject(item.id, projectPayload);
    if (!project) {
      continue;
    }

    const shouldUpdateUserCategory = item.category === CATEGORY_LABELS.uncategorized;

    const saved = await saveUserProject(user, project, {
      category: shouldUpdateUserCategory ? nextCategory : item.category,
      status: item.status,
      recommended: item.recommended,
      note: item.note,
      demo: item.demo,
      docs: item.docs,
      tags: item.tags,
      features: item.features,
      starredAt: item.starredAt,
      lastSyncedAt: item.lastSyncedAt
    });

    updatedItems.push(saved);
  }

  return {
    total: userProjects.length,
    updated: updatedItems.length,
    items: updatedItems
  };
}

export async function recheckRemoteStatusForUser(user, projectIds = []) {
  const userProjects = await listUserProjects(user);
  const targetIds = new Set((projectIds || []).map(value => Number(value)).filter(Number.isFinite));
  const targets = targetIds.size
    ? userProjects.filter(item => targetIds.has(Number(item.id)))
    : userProjects.filter(item => item.remoteStatus && item.remoteStatus !== REMOTE_STATUS_ACTIVE);

  const updatedItems = [];

  for (const item of targets) {
    const remoteState = await resolveRemoteStatusForProject(user, item);
    const project = await updateProject(item.id, {
      name: item.name,
      author: item.author,
      category: item.category,
      categorySource: item.categorySource || "rule",
      status: item.status,
      language: item.language,
      stars: item.stars,
      updatedAt: item.updatedAt,
      recommended: item.recommended,
      description: item.description,
      features: item.features,
      tags: item.tags,
      github: item.github,
      demo: item.demo,
      docs: item.docs,
      note: item.note,
      aiCategory: item.aiCategory,
      aiConfidence: item.aiConfidence,
      aiReason: item.aiReason,
      aiModel: item.aiModel,
      aiClassifiedAt: item.aiClassifiedAt
    });

    if (!project) {
      continue;
    }

    const saved = await saveUserProject(user, project, {
      category: item.category,
      status: item.status,
      recommended: item.recommended,
      note: item.note,
      demo: item.demo,
      docs: item.docs,
      tags: item.tags,
      features: item.features,
      remoteStatus: remoteState.remoteStatus,
      remoteStatusNote: remoteState.remoteStatusNote,
      remoteCheckedAt: new Date(),
      starredAt: item.starredAt,
      lastSyncedAt: item.lastSyncedAt
    });

    updatedItems.push(saved);
  }

  return {
    total: targets.length,
    updated: updatedItems.length,
    items: updatedItems
  };
}
