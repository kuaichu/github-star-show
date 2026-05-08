import { getPrisma } from "../lib/prisma.js";

const memoryUserProjects = new Map();

function getUserKey(user) {
  return String(user.dbUserId || user.id);
}

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

function normalizeProject(project) {
  return {
    ...project,
    features: Array.isArray(project.features) ? project.features : parseArrayValue(project.features),
    tags: Array.isArray(project.tags) ? project.tags : parseArrayValue(project.tags)
  };
}

function mergeUserProject(project, overrides = {}) {
  const normalizedProject = normalizeProject(project);

  return {
    ...normalizedProject,
    category: overrides.category || normalizedProject.category,
    status: overrides.status || normalizedProject.status,
    recommended: overrides.recommended ?? normalizedProject.recommended,
    note: overrides.note || normalizedProject.note,
    demo: overrides.demo || normalizedProject.demo,
    docs: overrides.docs || normalizedProject.docs,
    tags: overrides.tags !== undefined ? parseArrayValue(overrides.tags) : normalizedProject.tags,
    features: overrides.features !== undefined ? parseArrayValue(overrides.features) : normalizedProject.features,
    remoteStatus: overrides.remoteStatus || "active",
    remoteStatusNote: overrides.remoteStatusNote || "",
    remoteCheckedAt: overrides.remoteCheckedAt || null,
    starredAt: overrides.starredAt || null,
    lastSyncedAt: overrides.lastSyncedAt || null
  };
}

function mergePersistedUserProject(record) {
  return mergeUserProject(record.project, {
    category: record.category,
    status: record.status,
    recommended: record.recommended,
    note: record.note,
    demo: record.demo,
    docs: record.docs,
    tags: record.tags,
    features: record.features,
    remoteStatus: record.remoteStatus,
    remoteStatusNote: record.remoteStatusNote,
    remoteCheckedAt: record.remoteCheckedAt,
    starredAt: record.starredAt,
    lastSyncedAt: record.lastSyncedAt
  });
}

export async function listUserProjects(user) {
  const prisma = getPrisma();

  if (!prisma) {
    return (memoryUserProjects.get(getUserKey(user)) || []).map(item => ({ ...item }));
  }

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

export async function getUserProjectByProjectId(user, projectId) {
  const targetProjectId = Number(projectId);
  const prisma = getPrisma();

  if (!prisma) {
    const items = memoryUserProjects.get(getUserKey(user)) || [];
    return items.find(item => item.id === targetProjectId) || null;
  }

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

export async function saveUserProject(user, project, overrides = {}) {
  const targetProjectId = Number(project.id);
  const userKey = getUserKey(user);
  const merged = mergeUserProject(project, overrides);
  const prisma = getPrisma();

  if (!prisma) {
    const items = memoryUserProjects.get(userKey) || [];
    const nextItems = items.filter(item => item.id !== targetProjectId);
    nextItems.unshift({
      ...merged,
      id: targetProjectId
    });
    memoryUserProjects.set(userKey, nextItems);
    return nextItems[0];
  }

  await prisma.userProject.upsert({
    where: {
      userId_projectId: {
        userId: user.dbUserId || Number(user.id),
        projectId: targetProjectId
      }
    },
    update: {
      category: merged.category,
      status: merged.status,
      recommended: merged.recommended,
      note: merged.note,
      demo: merged.demo,
      docs: merged.docs,
      tags: JSON.stringify(merged.tags),
      features: JSON.stringify(merged.features),
      remoteStatus: merged.remoteStatus,
      remoteStatusNote: merged.remoteStatusNote,
      remoteCheckedAt: merged.remoteCheckedAt,
      starredAt: merged.starredAt,
      lastSyncedAt: merged.lastSyncedAt || new Date()
    },
    create: {
      userId: user.dbUserId || Number(user.id),
      projectId: targetProjectId,
      category: merged.category,
      status: merged.status,
      recommended: merged.recommended,
      note: merged.note,
      demo: merged.demo,
      docs: merged.docs,
      tags: JSON.stringify(merged.tags),
      features: JSON.stringify(merged.features),
      remoteStatus: merged.remoteStatus,
      remoteStatusNote: merged.remoteStatusNote,
      remoteCheckedAt: merged.remoteCheckedAt,
      starredAt: merged.starredAt,
      lastSyncedAt: merged.lastSyncedAt || new Date()
    }
  });

  return getUserProjectByProjectId(user, targetProjectId);
}

export async function deleteUserProject(user, projectId) {
  const targetProjectId = Number(projectId);
  const prisma = getPrisma();

  if (!prisma) {
    const items = memoryUserProjects.get(getUserKey(user)) || [];
    const nextItems = items.filter(item => item.id !== targetProjectId);

    if (nextItems.length === items.length) {
      return false;
    }

    memoryUserProjects.set(getUserKey(user), nextItems);
    return true;
  }

  const result = await prisma.userProject.deleteMany({
    where: {
      userId: user.dbUserId || Number(user.id),
      projectId: targetProjectId
    }
  });

  return result.count > 0;
}
