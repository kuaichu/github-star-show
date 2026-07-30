import { classifyRepositoryDetailed, CATEGORY_SOURCE } from "./classificationService.js";
import { normalizeGithubRepositoryUrl, setProjectPublicVisibilityByGithub } from "./projectService.js";
import { getUserRules } from "./ruleService.js";
import { getPrisma } from "../lib/prisma.js";
import { inspectRepositoryState, isRepositoryStarred, fetchLatestRelease, fetchLatestCommit, normalizeGithubStarItem, parseGithubRepositoryUrl } from "./githubService.js";
import {
  getUserProjectOverlaySnapshot,
  listUserProjects,
  saveAutomaticClassificationIfUnchanged,
  saveUserProjectIfUnchanged
} from "./userProjectService.js";
import { updateProjectActivity } from "./projectService.js";
import { upsertProjectForUser } from "./projectWriteService.js";
import {
  OperationLeaseLostError,
  withOperationLease,
  withSharedProjectCatalogLease,
  withOperationLeaseTransaction
} from "./operationLeaseService.js";
import { NetworkRequestError, requestJson } from "../lib/httpClient.js";
import { mapWithConcurrency } from "../lib/concurrency.js";
import { PublicHttpError } from "../lib/publicHttpError.js";

export const SYNC_MODE_FULL = "full";
export const SYNC_MODE_INCREMENTAL = "incremental";
export const REMOTE_STATUS_ACTIVE = "active";
export const REMOTE_STATUS_UNSTARRED = "unstarred";
export const REMOTE_STATUS_MISSING = "missing";
export const REMOTE_STATUS_ARCHIVED = "archived";

const SYNC_OVERLAY_CREATE_ONLY_FIELDS = [
  "category",
  "categorySource",
  "categoryReason",
  "status",
  "recommended",
  "note",
  "demo",
  "docs",
  "tags",
  "features"
];

function toActivitySafeResponseItem(item) {
  return {
    ...item,
    latestReleaseAt: null,
    latestCommitAt: null,
    activityCheckedAt: null
  };
}

function missingOverlayConflictItem(item) {
  return toActivitySafeResponseItem({
    id: item?.id ?? null,
    github: item?.github || "",
    skipped: true,
    conflicted: true,
    overlayUpdateSkipped: true,
    classificationSkipped: true,
    classificationConflicted: true
  });
}

async function fetchStarPage(accessToken, page, signal) {
  const baseUrl = process.env.GITHUB_API_BASE_URL || "https://api.github.com";
  const response = await requestJson(`${baseUrl}/user/starred?per_page=100&page=${page}`, {
    signal,
    headers: {
      Accept: "application/vnd.github.star+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-star-show"
    }
  }, {
    service: "GitHub"
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch starred repositories. Status ${response.status}.`);
  }

  if (!Array.isArray(response.data)) {
    throw new PublicHttpError(
      "INVALID_RESPONSE",
      422,
      "GitHub starred repositories response was invalid."
    );
  }

  return response.data;
}

async function fetchStarredRepositories(accessToken, options = {}) {
  const { mode = SYNC_MODE_FULL, starredAfter = null } = options;
  const items = [];
  const seenByGithub = new Map();
  let page = 1;
  let reachedCutoff = false;

  while (true) {
    options.signal?.throwIfAborted();
    const pageItems = await fetchStarPage(accessToken, page, options.signal);
    if (!pageItems.length) {
      break;
    }

    const normalizedPageItems = pageItems.map(pageItem => normalizeGithubStarItem(pageItem, { mode }));
    const uniquePageItems = [];
    for (const item of normalizedPageItems) {
      const key = item.github.toLowerCase();
      const signature = JSON.stringify(item);
      const existingSignature = seenByGithub.get(key);
      if (existingSignature !== undefined) {
        if (existingSignature !== signature) {
          throw new PublicHttpError(
            "INVALID_RESPONSE",
            422,
            "GitHub starred repositories response was invalid."
          );
        }
        continue;
      }
      seenByGithub.set(key, signature);
      uniquePageItems.push(item);
    }

    // A page is authoritative once every item on it has been validated. Hide
    // non-public repositories immediately; a failure on a later page must not
    // undo privacy facts already confirmed by GitHub.
    await options.onValidatedPage?.(uniquePageItems);

    if (mode === SYNC_MODE_INCREMENTAL && starredAfter) {
      for (const pageItem of uniquePageItems) {
        if (pageItem.starredAt < starredAfter) {
          reachedCutoff = true;
          break;
        }

        items.push(pageItem);
      }
    } else {
      items.push(...uniquePageItems);
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

const EXPECTED_ACTIVITY_FAILURE_CODES = new Set([
  "HTTP_ERROR",
  "INVALID_RESPONSE",
  "NETWORK_ERROR",
  "REQUEST_TIMEOUT",
  "RESPONSE_TOO_LARGE"
]);

function activityWarning(error, project, scope) {
  if (!(error instanceof NetworkRequestError || error instanceof PublicHttpError)) return null;
  if (!EXPECTED_ACTIVITY_FAILURE_CODES.has(error?.code)) return null;
  const summaries = {
    HTTP_ERROR: "GitHub returned an unsuccessful activity response.",
    INVALID_RESPONSE: "GitHub returned an invalid activity response.",
    NETWORK_ERROR: "GitHub activity data could not be reached.",
    REQUEST_TIMEOUT: "GitHub activity data timed out.",
    RESPONSE_TOO_LARGE: "GitHub activity data exceeded the response limit."
  };
  return {
    code: error.code,
    scope,
    projectId: project.id,
    summary: summaries[error.code]
  };
}

async function refreshActivityForProject(project, lease, signal) {
  if (!project?.github) return [];
  const parsed = parseGithubRepositoryUrl(project.github);
  if (!parsed) return [];

  const warnings = [];
  let release = null;
  let commit = null;
  try {
    release = await fetchLatestRelease(parsed.owner, parsed.repo, "", { signal });
  } catch (error) {
    if ((error instanceof NetworkRequestError && error.rateLimited) ||
        error instanceof OperationLeaseLostError) throw error;
    const warning = activityWarning(error, project, "release_activity");
    if (!warning) throw error;
    warnings.push(warning);
  }
  try {
    commit = await fetchLatestCommit(parsed.owner, parsed.repo, "", { signal });
  } catch (error) {
    if ((error instanceof NetworkRequestError && error.rateLimited) ||
        error instanceof OperationLeaseLostError) throw error;
    const warning = activityWarning(error, project, "commit_activity");
    if (!warning) throw error;
    warnings.push(warning);
  }

  if (warnings.length > 0) return warnings;

  const activityData = { activityCheckedAt: new Date() };
  if (release) activityData.latestReleaseAt = new Date(release);
  if (commit) activityData.latestCommitAt = new Date(commit);

  const updated = await withOperationLeaseTransaction(lease, tx =>
    updateProjectActivity(project.id, activityData, { client: tx })
  );
  // Another user's sync may have hidden this shared Project while the remote
  // activity requests were in flight. The conditional write must then be a
  // harmless no-op instead of republishing private activity.
  if (!updated) return [];
  return [];
}

function activityConcurrency() {
  const value = Number(process.env.ACTIVITY_FETCH_CONCURRENCY ?? 2);
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 2;
}

async function resolveRemoteStatusForProject(user, project) {
  try {
    const repoRef = project.github || `${project.author}/${project.name}`;
    const existsState = await inspectRepositoryState(repoRef, user.accessToken);

    if (!existsState.exists) {
      return {
        remoteStatus: REMOTE_STATUS_MISSING,
        remoteStatusNote: "GitHub repository lookup returned 404. The repository may have been deleted or moved.",
        publicVisible: false
      };
    }

    if (!existsState.publicVisible) {
      return {
        remoteStatus: project.remoteStatus || REMOTE_STATUS_ACTIVE,
        remoteStatusNote: "GitHub no longer verifies this repository as public.",
        publicVisible: false
      };
    }

    if (existsState.archived) {
      return {
        remoteStatus: REMOTE_STATUS_ARCHIVED,
        remoteStatusNote: "GitHub reports this repository as archived.",
        publicVisible: true
      };
    }

    const starred = await isRepositoryStarred(user.accessToken, repoRef);
    if (!starred) {
      return {
        remoteStatus: REMOTE_STATUS_UNSTARRED,
        remoteStatusNote: "This repository is no longer present in your current GitHub stars.",
        publicVisible: true
      };
    }

    return {
      remoteStatus: REMOTE_STATUS_ACTIVE,
      remoteStatusNote: "",
      publicVisible: true
    };
  } catch (error) {
    if ((error instanceof NetworkRequestError && error.rateLimited) ||
        error instanceof OperationLeaseLostError) throw error;
    return {
      remoteStatus: project.remoteStatus || REMOTE_STATUS_ACTIVE,
      remoteStatusNote: "Remote status could not be verified; shared visibility was left unchanged."
    };
  }
}

async function performSyncUserStars(user, options = {}) {
  options.signal?.throwIfAborted();
  const existingUserProjects = await listUserProjects(user);
  const latestStarredAt = await getLatestUserStarredAt(user);
  const mode = normalizeSyncMode(options.mode, Boolean(latestStarredAt));
  const verifiedPublicBefore = new Date();
  const preparedStarred = await fetchStarredRepositories(user.accessToken, {
    mode,
    starredAfter: mode === SYNC_MODE_INCREMENTAL ? latestStarredAt : null,
    signal: options.signal,
    onValidatedPage: async pageItems => {
      for (const item of pageItems) {
        if (item.public) continue;
        await withOperationLeaseTransaction(options.catalogLease, tx =>
          setProjectPublicVisibilityByGithub(item.github, false, { client: tx })
        );
      }
    }
  });
  const importedProjects = [];
  const overlayWarnings = [];
  let skippedPrivate = 0;
  const persistedUserId = user.dbUserId || Number(user.id);
  const syncedGithubUrls = new Set();
  const nonPublicGithubUrls = new Set();
  const verifiedPublicGithubUrls = new Set();
  const userRules = getUserRules(persistedUserId);

  for (const starItem of preparedStarred) {
    options.signal?.throwIfAborted();
    const repo = starItem.repo;
    if (!starItem.public) {
      const github = starItem.github;
      nonPublicGithubUrls.add(normalizeGithubRepositoryUrl(github));
      await withOperationLeaseTransaction(options.catalogLease, tx =>
        setProjectPublicVisibilityByGithub(github, false, { client: tx })
      );
      skippedPrivate += 1;
      continue;
    }
    syncedGithubUrls.add(normalizeGithubRepositoryUrl(starItem.github));
    verifiedPublicGithubUrls.add(normalizeGithubRepositoryUrl(starItem.github));
    const classification = classifyRepositoryDetailed({
      name: repo.name,
      description: repo.description,
      language: repo.language,
      tags: repo.topics || []
    }, userRules);
    const normalized = {
      name: repo.name,
      author: repo.owner?.login || "",
      description: repo.description ?? "",
      language: repo.language ?? "Unknown",
      stars: repo.stargazers_count,
      updatedAt: repo.pushed_at ? repo.pushed_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      github: repo.html_url,
      demo: repo.homepage,
      docs: "",
      tags: Array.isArray(repo.topics) ? repo.topics : [],
      features: [],
      note: `Imported from GitHub Star sync: ${repo.full_name}`,
      category: classification.category,
      categorySource: "rule",
      status: "收藏备用",
      recommended: false
    };

    const sharedProjectPayload = {
      name: normalized.name,
      author: normalized.author,
      description: normalized.description,
      language: normalized.language,
      stars: normalized.stars,
      updatedAt: normalized.updatedAt,
      github: normalized.github
    };

    const normalizedGithub = normalizeGithubRepositoryUrl(sharedProjectPayload.github);
    const existingUserProject = existingUserProjects.find(item =>
      normalizeGithubRepositoryUrl(item.github) === normalizedGithub
    );
    const existingOverlaySnapshot = getUserProjectOverlaySnapshot(existingUserProject);
    const remoteState = buildRemoteState(repo);
    options.signal?.throwIfAborted();
    const savedUserProject = await upsertProjectForUser(user, sharedProjectPayload, {
      category: classification.category,
      categorySource: classification.categorySource,
      categoryReason: classification.categoryReason,
      status: normalized.status,
      recommended: normalized.recommended,
      note: normalized.note,
      demo: normalized.demo,
      docs: normalized.docs,
      tags: normalized.tags,
      features: normalized.features,
      remoteStatus: remoteState.remoteStatus,
      remoteStatusNote: remoteState.remoteStatusNote,
      remoteCheckedAt: new Date(),
      starredAt: starItem.starredAt ?? existingUserProject?.starredAt ?? null,
      lastSyncedAt: new Date()
    }, {
      updateShared: true,
      verifiedPublic: true,
      verifiedPublicBefore,
      lease: options.catalogLease,
      userCreateOnlyFields: SYNC_OVERLAY_CREATE_ONLY_FIELDS,
      existingUserProject
    });

    if (!savedUserProject) {
      verifiedPublicGithubUrls.delete(normalizedGithub);
      nonPublicGithubUrls.add(normalizedGithub);
      const conflictedItem = {
        ...existingUserProject,
        ...(!existingUserProject ? { github: sharedProjectPayload.github } : {}),
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null,
        skipped: true,
        conflicted: true,
        overlayUpdateSkipped: true,
        classificationSkipped: true,
        classificationConflicted: true
      };
      importedProjects.push(conflictedItem);
      overlayWarnings.push({
        code: "OVERLAY_CONFLICT",
        scope: "star_import",
        projectId: existingUserProject?.id ?? null,
        summary: "A concurrent user project change prevented an automatic overlay update."
      });
      continue;
    }

    const savedOverlaySnapshot = getUserProjectOverlaySnapshot(savedUserProject);
    const overlayIdentityConflicted = Boolean(existingUserProject) && (
      !existingOverlaySnapshot ||
      !savedOverlaySnapshot ||
      savedOverlaySnapshot.id !== existingOverlaySnapshot.id
    );
    if (overlayIdentityConflicted || (!existingUserProject && (
      savedUserProject.category !== classification.category ||
      savedUserProject.categorySource !== classification.categorySource ||
      savedUserProject.categoryReason !== classification.categoryReason
    ))) {
      savedUserProject.classificationSkipped = true;
      savedUserProject.classificationConflicted = true;
    }

    importedProjects.push(savedUserProject);
  }

  if (mode === SYNC_MODE_FULL) {
    for (const localItem of existingUserProjects) {
      options.signal?.throwIfAborted();
      if (syncedGithubUrls.has(normalizeGithubRepositoryUrl(localItem.github))) {
        continue;
      }
      if (nonPublicGithubUrls.has(normalizeGithubRepositoryUrl(localItem.github))) {
        continue;
      }

      let remoteState;
      try {
        remoteState = await resolveRemoteStatusForProject(user, localItem);
      } catch (error) {
        if (error instanceof OperationLeaseLostError) throw error;
        if (!(error instanceof NetworkRequestError && error.rateLimited)) throw error;
        throw error;
      }
      const normalizedGithub = normalizeGithubRepositoryUrl(localItem.github);
      if (remoteState.publicVisible === false) {
        nonPublicGithubUrls.add(normalizedGithub);
      }
      const nextRemoteStatus = remoteState.remoteStatus;
      const nextRemoteStatusNote = remoteState.remoteStatusNote;

      const visibilityResult = await withOperationLeaseTransaction(options.catalogLease, async tx => {
        let publicVisibilityConfirmed = remoteState.publicVisible === false;
        if (typeof remoteState.publicVisible === "boolean") {
          const updatedCount = await setProjectPublicVisibilityByGithub(localItem.github, remoteState.publicVisible, {
            client: tx,
            onlyIfAlreadyVisible: remoteState.publicVisible
          });
          if (remoteState.publicVisible) publicVisibilityConfirmed = updatedCount > 0;
        }
        const saved = await saveUserProjectIfUnchanged(user, localItem, {
          remoteStatus: nextRemoteStatus,
          remoteStatusNote: nextRemoteStatusNote,
          remoteCheckedAt: new Date(),
          starredAt: localItem.starredAt,
          lastSyncedAt: new Date()
        }, { client: tx });
        return { saved, publicVisibilityConfirmed };
      });
      const { saved, publicVisibilityConfirmed } = visibilityResult;
      if (remoteState.publicVisible === true) {
        if (publicVisibilityConfirmed) verifiedPublicGithubUrls.add(normalizedGithub);
        else nonPublicGithubUrls.add(normalizedGithub);
      }
      if (!saved) {
        overlayWarnings.push({
          code: "OVERLAY_CONFLICT",
          scope: "remote_status",
          projectId: localItem.id,
          summary: "A concurrent user project change prevented a remote-status overlay update."
        });
      }
    }
  } else {
    // Incremental star pagination stops at the last-seen starred_at value, so
    // visibility changes on older stars would otherwise never be observed.
    // Recheck only the shared visibility fact here; leave overlay/star status
    // and SyncRun semantics to their existing workflows.
    for (const localItem of existingUserProjects) {
      options.signal?.throwIfAborted();
      const normalizedGithub = normalizeGithubRepositoryUrl(localItem.github);
      if (syncedGithubUrls.has(normalizedGithub) || nonPublicGithubUrls.has(normalizedGithub)) continue;

      let remoteState;
      try {
        remoteState = await inspectRepositoryState(localItem.github, user.accessToken);
      } catch (error) {
        if (error instanceof OperationLeaseLostError) throw error;
        if (error instanceof NetworkRequestError && error.rateLimited) throw error;
        continue;
      }

      await withOperationLeaseTransaction(options.catalogLease, tx =>
        setProjectPublicVisibilityByGithub(
          localItem.github,
          remoteState.exists && remoteState.publicVisible,
          {
            client: tx,
            onlyIfAlreadyVisible: remoteState.exists && remoteState.publicVisible
          }
        )
      );
    }
  }

  const activityProjects = importedProjects.filter(item =>
    verifiedPublicGithubUrls.has(normalizeGithubRepositoryUrl(item.github))
  );
  if (mode === SYNC_MODE_FULL) {
    for (const item of existingUserProjects) {
      if (verifiedPublicGithubUrls.has(normalizeGithubRepositoryUrl(item.github)) &&
          !activityProjects.some(p => p.id === item.id)) {
        activityProjects.push(item);
      }
    }
  }
  const activityStop = new AbortController();
  const activitySignal = options.signal
    ? AbortSignal.any([options.signal, activityStop.signal])
    : activityStop.signal;
  const activityResults = await mapWithConcurrency(
    activityProjects,
    activityConcurrency(),
    project => {
      activitySignal.throwIfAborted();
      return refreshActivityForProject(project, options.catalogLease, activitySignal);
    },
    {
      stopOn: error => {
        if (!activityStop.signal.aborted) activityStop.abort(error);
        return true;
      }
    }
  );
  const warnings = [...overlayWarnings, ...activityResults.flat()];
  options.signal?.throwIfAborted();
  await withOperationLeaseTransaction(options.lease, tx => tx.user.update({
    where: { id: persistedUserId },
    data: { lastStarSyncAt: new Date() }
  }));
  const authoritativeItems = new Map(
    (await listUserProjects(user)).map(item => [item.id, item])
  );
  const responseItems = importedProjects.map(item => {
    const authoritative = authoritativeItems.get(item.id);
    return authoritative
      ? toActivitySafeResponseItem({ ...item, ...authoritative })
      : missingOverlayConflictItem(item);
  });

  return {
    mode,
    total: importedProjects.length,
    skippedPrivate,
    warnings,
    cutoffStarredAt: latestStarredAt,
    items: responseItems
  };
}

function safeSyncFailure(error) {
  const allowedCodes = new Set(["REQUEST_TIMEOUT", "RATE_LIMITED", "NETWORK_ERROR", "HTTP_ERROR"]);
  const code = error instanceof NetworkRequestError && allowedCodes.has(error.code)
    ? error.code
    : "SYNC_FAILED";
  const summaries = {
    REQUEST_TIMEOUT: "An upstream request timed out.",
    RATE_LIMITED: "GitHub rate limit reached.",
    NETWORK_ERROR: "GitHub could not be reached.",
    HTTP_ERROR: "GitHub returned an unsuccessful response."
  };
  return { code, summary: summaries[code] || "GitHub star sync failed." };
}

export async function syncUserStars(user, options = {}) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  const userId = Number(user.dbUserId || user.id);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("A positive userId is required");

  return withOperationLease({
    key: `sync:${userId}`,
    userId,
    kind: "sync"
  }, async (lease, signal) => withSharedProjectCatalogLease(async (catalogLease, catalogSignal) => {
    const requestedMode = options.mode === SYNC_MODE_INCREMENTAL ? SYNC_MODE_INCREMENTAL : SYNC_MODE_FULL;
    const run = await withOperationLeaseTransaction(lease, tx => tx.syncRun.create({
      data: {
        userId,
        source: getSyncRunSource(requestedMode),
        status: "running"
      }
    }));

    try {
      const combinedSignal = AbortSignal.any([signal, catalogSignal]);
      const result = await performSyncUserStars(user, { ...options, signal: combinedSignal, lease, catalogLease });
      const status = result.warnings.length > 0 ? "succeeded_with_warnings" : "succeeded";
      await withOperationLeaseTransaction(lease, tx => tx.syncRun.update({
        where: { id: run.id },
        data: {
          source: getSyncRunSource(result.mode),
          status,
          total: result.total,
          skippedPrivate: result.skippedPrivate,
          completedAt: new Date()
        }
      }));
      return { ...result, status, runId: run.id };
    } catch (error) {
      const failure = safeSyncFailure(error);
      try {
        await withOperationLeaseTransaction(lease, tx => tx.syncRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorCode: failure.code,
            errorSummary: failure.summary,
            completedAt: new Date()
          }
        }));
      } catch {
        console.error(`[sync] Failed to record terminal state for run ${run.id}.`);
      }
      throw error;
    }
  }));
}

export async function getProjectsForUser(user) {
  return listUserProjects(user);
}

export async function rerunRuleClassificationForUser(user) {
  const userId = Number(user.dbUserId || user.id);
  return withOperationLease({
    key: `classification:${userId}`,
    userId,
    kind: "ai"
  }, async (lease, signal) => {
    const userProjects = await listUserProjects(user);
    const updatedItems = [];
    const conflictedItems = [];
    const userRules = getUserRules(userId);

    for (const item of userProjects) {
      signal.throwIfAborted();
      if (item.categorySource === CATEGORY_SOURCE.manual) continue;

      const nextClassification = classifyRepositoryDetailed({
        name: item.name,
        description: item.description,
        language: item.language,
        tags: item.tags || []
      }, userRules);

      const saved = await withOperationLeaseTransaction(lease, tx =>
        saveAutomaticClassificationIfUnchanged(user, item, {
          category: nextClassification.category,
          categorySource: nextClassification.categorySource,
          categoryReason: nextClassification.categoryReason,
          lastSyncedAt: new Date()
        }, { client: tx })
      );

      if (saved) {
        updatedItems.push(saved);
      } else {
        conflictedItems.push({
          id: item.id,
          name: item.name,
          skipped: true,
          conflicted: true
        });
      }
    }

    return {
      total: userProjects.length,
      updated: updatedItems.length,
      skipped: userProjects.length - updatedItems.length,
      items: [...updatedItems, ...conflictedItems]
    };
  });
}

export async function recheckRemoteStatusForUser(user, projectIds = []) {
  const userId = Number(user.dbUserId || user.id);
  return withOperationLease({
    key: `sync:${userId}`,
    userId,
    kind: "sync"
  }, async (lease, signal) => withSharedProjectCatalogLease(async (catalogLease, catalogSignal) => {
    signal = AbortSignal.any([signal, catalogSignal]);
    const userProjects = await listUserProjects(user);
    const targetIds = new Set((projectIds || []).map(value => Number(value)).filter(Number.isFinite));
    const targets = targetIds.size
      ? userProjects.filter(item => targetIds.has(Number(item.id)))
      : userProjects.filter(item => item.remoteStatus && item.remoteStatus !== REMOTE_STATUS_ACTIVE);

    const updatedItems = [];
    const conflictedItems = [];

    for (const item of targets) {
      signal.throwIfAborted();
      let remoteState;
      try {
        remoteState = await resolveRemoteStatusForProject(user, item);
      } catch (error) {
        if (error instanceof OperationLeaseLostError) throw error;
        if (!(error instanceof NetworkRequestError && error.rateLimited)) throw error;
        throw error;
      }
      const saved = await withOperationLeaseTransaction(catalogLease, async tx => {
        if (typeof remoteState.publicVisible === "boolean") {
          await setProjectPublicVisibilityByGithub(item.github, remoteState.publicVisible, {
            client: tx,
            onlyIfAlreadyVisible: remoteState.publicVisible
          });
        }
        return saveUserProjectIfUnchanged(user, item, {
          remoteStatus: remoteState.remoteStatus,
          remoteStatusNote: remoteState.remoteStatusNote,
          remoteCheckedAt: new Date(),
          starredAt: item.starredAt,
          lastSyncedAt: item.lastSyncedAt
        }, { client: tx });
      });

      if (saved) {
        updatedItems.push(saved);
      } else {
        conflictedItems.push({
          projectId: item.id,
          skipped: true,
          conflicted: true
        });
      }
    }

    const authoritativeItems = new Map(
      (await listUserProjects(user)).map(item => [item.id, item])
    );
    const missingOverlayConflicts = [];
    const responseItems = [];
    for (const item of updatedItems) {
      const authoritative = authoritativeItems.get(item.id);
      if (authoritative) {
        responseItems.push(toActivitySafeResponseItem(authoritative));
      } else {
        missingOverlayConflicts.push({
          projectId: item.id,
          skipped: true,
          conflicted: true
        });
      }
    }
    const responseConflicts = [...conflictedItems, ...missingOverlayConflicts];

    return {
      total: targets.length,
      updated: responseItems.length,
      skipped: responseConflicts.length,
      conflicted: responseConflicts.length,
      items: responseItems,
      conflicts: responseConflicts
    };
  }));
}
