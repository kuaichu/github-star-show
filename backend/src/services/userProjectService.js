import { getPrisma } from "../lib/prisma.js";
import { parseOptionalHttpUrl } from "../lib/externalUrl.js";
import { PublicHttpError } from "../lib/publicHttpError.js";

const overlaySnapshots = new WeakMap();

const USER_PROJECT_FIELDS = [
  "category",
  "categorySource",
  "categoryReason",
  "status",
  "recommended",
  "note",
  "demo",
  "docs",
  "tags",
  "features",
  "aiCategory",
  "aiConfidence",
  "aiReason",
  "aiModel",
  "aiClassifiedAt",
  "remoteStatus",
  "remoteStatusNote",
  "remoteCheckedAt",
  "starredAt",
  "lastSyncedAt"
];

const SHARED_PROJECT_FIELDS = [
  "id",
  "name",
  "author",
  "language",
  "stars",
  "updatedAt",
  "description",
  "github",
  "latestReleaseAt",
  "latestCommitAt",
  "activityCheckedAt"
];

export const USER_EDITABLE_PROJECT_FIELDS = [
  "category",
  "status",
  "recommended",
  "note",
  "demo",
  "docs",
  "tags",
  "features"
];

function parseArrayValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();

    if (!raw || raw === "[]") {
      return [];
    }

    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(item => String(item).trim()).filter(Boolean);
        }
      } catch {
        // Fall through to plain-text parsing.
      }
    }
  }

  return String(value || "")
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function pickDefined(source, fields) {
  return fields.reduce((result, field) => {
    if (source && source[field] !== undefined) {
      result[field] = source[field];
    }
    return result;
  }, {});
}

export function pickUserEditableProjectFields(source) {
  return normalizeUserProjectExternalUrls(pickDefined(source, USER_EDITABLE_PROJECT_FIELDS));
}

function normalizeUserProjectExternalUrls(source) {
  const normalized = { ...source };
  for (const field of ["demo", "docs"]) {
    if (!Object.hasOwn(normalized, field)) continue;
    const result = parseOptionalHttpUrl(normalized[field]);
    if (!result.ok) {
      throw new PublicHttpError(
        "INVALID_PROJECT_URL",
        400,
        `${field} must be empty or a valid HTTP(S) URL.`
      );
    }
    normalized[field] = result.value;
  }
  return normalized;
}

function serializeUserProjectPatch(source) {
  const patch = pickDefined(source, USER_PROJECT_FIELDS);

  if (patch.tags !== undefined) {
    patch.tags = JSON.stringify(parseArrayValue(patch.tags));
  }
  if (patch.features !== undefined) {
    patch.features = JSON.stringify(parseArrayValue(patch.features));
  }

  return patch;
}

export function pickSharedProjectFields(project) {
  return pickDefined(project, SHARED_PROJECT_FIELDS);
}

export function mergeUserProject(project, overrides = {}) {
  const sharedProject = pickSharedProjectFields(project);
  const valueOrDefault = (field, defaultValue) => Object.hasOwn(overrides, field)
    ? overrides[field]
    : defaultValue;

  return {
    ...sharedProject,
    category: valueOrDefault("category", "未分类 / 待整理"),
    categorySource: valueOrDefault("categorySource", "uncategorized"),
    categoryReason: valueOrDefault("categoryReason", "uncategorized:no-rule-matched"),
    status: valueOrDefault("status", "收藏备用"),
    recommended: valueOrDefault("recommended", false),
    note: valueOrDefault("note", ""),
    demo: valueOrDefault("demo", ""),
    docs: valueOrDefault("docs", ""),
    tags: overrides.tags !== undefined ? parseArrayValue(overrides.tags) : [],
    features: overrides.features !== undefined ? parseArrayValue(overrides.features) : [],
    aiCategory: valueOrDefault("aiCategory", null),
    aiConfidence: valueOrDefault("aiConfidence", null),
    aiReason: valueOrDefault("aiReason", ""),
    aiModel: valueOrDefault("aiModel", ""),
    aiClassifiedAt: valueOrDefault("aiClassifiedAt", null),
    remoteStatus: valueOrDefault("remoteStatus", "active"),
    remoteStatusNote: valueOrDefault("remoteStatusNote", ""),
    remoteCheckedAt: valueOrDefault("remoteCheckedAt", null),
    starredAt: valueOrDefault("starredAt", null),
    lastSyncedAt: valueOrDefault("lastSyncedAt", null)
  };
}

function mergePersistedUserProject(record) {
  const sharedProject = record.project?.publicVisible === false
    ? {
        ...record.project,
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null
      }
    : record.project;
  const project = mergeUserProject(sharedProject, {
    category: record.category,
    categorySource: record.categorySource,
    categoryReason: record.categoryReason,
    status: record.status,
    recommended: record.recommended,
    note: record.note,
    demo: record.demo,
    docs: record.docs,
    tags: record.tags,
    features: record.features,
    aiCategory: record.aiCategory,
    aiConfidence: record.aiConfidence,
    aiReason: record.aiReason,
    aiModel: record.aiModel,
    aiClassifiedAt: record.aiClassifiedAt,
    remoteStatus: record.remoteStatus,
    remoteStatusNote: record.remoteStatusNote,
    remoteCheckedAt: record.remoteCheckedAt,
    starredAt: record.starredAt,
    lastSyncedAt: record.lastSyncedAt
  });
  overlaySnapshots.set(project, { id: record.id, updatedAt: record.updatedAt });
  return project;
}

export function getUserProjectOverlaySnapshot(project) {
  return project && typeof project === "object" ? overlaySnapshots.get(project) || null : null;
}

export async function listUserProjects(user) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");

  const records = await prisma.userProject.findMany({
    where: {
      userId: user.dbUserId || Number(user.id)
    },
    include: {
      project: true
    },
    orderBy: [
      { starredAt: "desc" },
      { updatedAt: "desc" }
    ]
  });

  return records.map(mergePersistedUserProject);
}

export async function getUserProjectByProjectId(user, projectId, options = {}) {
  const targetProjectId = Number(projectId);
  const prisma = options.client || getPrisma();

  if (!prisma) throw new Error("Database not available");

  const record = await prisma.userProject.findUnique({
    where: {
      userId_projectId: {
        userId: user.dbUserId || Number(user.id),
        projectId: targetProjectId
      }
    },
    include: {
      project: true
    }
  });

  return record ? mergePersistedUserProject(record) : null;
}

export async function saveUserProject(user, project, overrides = {}, options = {}) {
  const targetProjectId = Number(project.id);
  const prisma = options.client || getPrisma();
  const overridePatch = normalizeUserProjectExternalUrls(pickDefined(overrides, USER_PROJECT_FIELDS));
  const createOnlyFields = new Set(options.createOnlyFields || []);

  if (!prisma) throw new Error("Database not available");

  const mergedForCreate = mergeUserProject(project, overridePatch);
  const updateData = serializeUserProjectPatch(Object.fromEntries(
    Object.entries(overridePatch).filter(([field]) => !createOnlyFields.has(field))
  ));

  await prisma.userProject.upsert({
    where: {
      userId_projectId: {
        userId: user.dbUserId || Number(user.id),
        projectId: targetProjectId
      }
    },
    update: updateData,
    create: {
      userId: user.dbUserId || Number(user.id),
      projectId: targetProjectId,
      category: mergedForCreate.category,
      categorySource: mergedForCreate.categorySource,
      categoryReason: mergedForCreate.categoryReason,
      status: mergedForCreate.status,
      recommended: mergedForCreate.recommended,
      note: mergedForCreate.note,
      demo: mergedForCreate.demo,
      docs: mergedForCreate.docs,
      tags: JSON.stringify(mergedForCreate.tags),
      features: JSON.stringify(mergedForCreate.features),
      aiCategory: mergedForCreate.aiCategory,
      aiConfidence: mergedForCreate.aiConfidence,
      aiReason: mergedForCreate.aiReason,
      aiModel: mergedForCreate.aiModel,
      aiClassifiedAt: mergedForCreate.aiClassifiedAt,
      remoteStatus: mergedForCreate.remoteStatus,
      remoteStatusNote: mergedForCreate.remoteStatusNote,
      remoteCheckedAt: mergedForCreate.remoteCheckedAt,
      starredAt: mergedForCreate.starredAt,
      lastSyncedAt: Object.hasOwn(overridePatch, "lastSyncedAt")
        ? mergedForCreate.lastSyncedAt
        : new Date()
    }
  });

  return getUserProjectByProjectId(user, targetProjectId, options);
}

export async function saveUserProjectIfUnchanged(user, project, overrides = {}, options = {}) {
  const targetProjectId = Number(project.id);
  const userId = user.dbUserId || Number(user.id);
  const prisma = options.client || getPrisma();
  const expectedProject = options.expectedProject || project;
  const overlaySnapshot = getUserProjectOverlaySnapshot(expectedProject);
  const overridePatch = normalizeUserProjectExternalUrls(pickDefined(overrides, USER_PROJECT_FIELDS));
  const createOnlyFields = new Set(options.createOnlyFields || []);

  if (!prisma) throw new Error("Database not available");
  if (!overlaySnapshot) return null;

  const updateData = serializeUserProjectPatch(Object.fromEntries(
    Object.entries(overridePatch).filter(([field]) => !createOnlyFields.has(field))
  ));
  const result = await prisma.userProject.updateMany({
    where: {
      id: overlaySnapshot.id,
      userId,
      projectId: targetProjectId,
      updatedAt: overlaySnapshot.updatedAt
    },
    data: updateData
  });

  if (result.count !== 1) return null;
  return getUserProjectByProjectId(user, targetProjectId, options);
}

export async function saveAutomaticClassificationIfUnchanged(user, project, overrides = {}, options = {}) {
  const targetProjectId = Number(project.id);
  const userId = user.dbUserId || Number(user.id);
  const prisma = options.client || getPrisma();

  if (!prisma) throw new Error("Database not available");
  const overlaySnapshot = getUserProjectOverlaySnapshot(project);
  if (!overlaySnapshot) return null;

  const result = await prisma.userProject.updateMany({
    where: {
      id: overlaySnapshot.id,
      userId,
      projectId: targetProjectId,
      updatedAt: overlaySnapshot.updatedAt,
      category: project.category,
      categorySource: project.categorySource,
      categoryReason: project.categoryReason
    },
    data: serializeUserProjectPatch(overrides)
  });

  if (result.count !== 1) return null;
  return getUserProjectByProjectId(user, targetProjectId, options);
}

export async function deleteUserProject(user, projectId) {
  const targetProjectId = Number(projectId);
  const prisma = getPrisma();

  if (!prisma) throw new Error("Database not available");

  const result = await prisma.userProject.deleteMany({
    where: {
      userId: user.dbUserId || Number(user.id),
      projectId: targetProjectId
    }
  });

  return result.count > 0;
}
