import { getPrisma } from "../lib/prisma.js";

const legacyStatusMap = {
  Deployed: "已部署",
  "In Use": "正在使用",
  Saved: "收藏备用",
  "To Research": "待研究"
};

const sharedProjectSelect = {
  id: true,
  name: true,
  author: true,
  language: true,
  stars: true,
  updatedAt: true,
  description: true,
  github: true,
  latestReleaseAt: true,
  latestCommitAt: true,
  activityCheckedAt: true
};

function normalizeProject(project) {
  return {
    ...project,
    categorySource: project.categorySource || "manual",
    status: legacyStatusMap[project.status] || project.status,
    features: Array.isArray(project.features) ? project.features : JSON.parse(project.features || "[]"),
    tags: Array.isArray(project.tags) ? project.tags : JSON.parse(project.tags || "[]"),
    aiCategory: project.aiCategory || null,
    aiConfidence: project.aiConfidence ?? null,
    aiReason: project.aiReason || "",
    aiModel: project.aiModel || "",
    aiClassifiedAt: project.aiClassifiedAt || null
  };
}

export function normalizeGithubRepositoryUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.hostname.toLowerCase() !== "github.com") return raw;
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.replace(/\.git$/i, "").toLowerCase());
    if (parts.length !== 2 || parts.some(part => !part)) return raw;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return raw;
  }
}

export function toPublicProject(project) {
  if (!project) return project;

  return {
    id: project.id,
    name: project.name,
    author: project.author,
    language: project.language,
    stars: project.stars,
    updatedAt: project.updatedAt,
    description: project.description,
    github: project.github,
    latestReleaseAt: project.latestReleaseAt || null,
    latestCommitAt: project.latestCommitAt || null,
    activityCheckedAt: project.activityCheckedAt || null
  };
}

async function readProjects() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database not available");
  const projects = await prisma.project.findMany({
    where: { publicVisible: true },
    orderBy: { id: "asc" }
  });
  return projects.map(normalizeProject);
}

function sanitizeSharedPayload(payload, { partial = false } = {}) {
  const stringFields = ["name", "author", "language", "updatedAt", "description", "github"];
  const dateFields = ["latestReleaseAt", "latestCommitAt", "activityCheckedAt"];
  const input = {};

  for (const field of stringFields) {
    if (!partial || payload[field] !== undefined) {
      input[field] = String(payload[field] || "").trim();
    }
  }

  if (input.github !== undefined) {
    input.github = normalizeGithubRepositoryUrl(input.github);
  }

  if (!partial || payload.stars !== undefined) {
    input.stars = Number(payload.stars || 0);
  }

  for (const field of dateFields) {
    if (payload[field] !== undefined) {
      input[field] = payload[field] ? new Date(payload[field]) : null;
    }
  }

  return input;
}

function validateProjectInput(payload) {
  const requiredFields = [
    "name",
    "author",
    "language",
    "github"
  ];

  for (const field of requiredFields) {
    if (!payload[field]) {
      return `${field} is required`;
    }
  }

  if (!Number.isFinite(payload.stars) || payload.stars < 0) {
    return "stars must be a non-negative number";
  }

  return null;
}

export async function getMeta() {
  const projects = await readProjects();
  const categories = ["全部项目"];
  const statusOptions = ["全部状态", "收藏备用", "待研究", "正在使用", "已部署"];
  const languageOptions = ["全部语言", ...new Set(projects.map(item => item.language))];

  return {
    categories,
    statusOptions,
    languageOptions,
    categoryCounts: { "全部项目": projects.length }
  };
}

export async function listProjects(filters) {
  const projects = await readProjects();
  const keyword = (filters.keyword || "").trim().toLowerCase();

  const items = projects
    .map(toPublicProject)
    .filter(project => {
      const matchLanguage = !filters.language || filters.language === "全部语言" || project.language === filters.language;
      const searchBase = [project.name, project.author, project.description].join(" ").toLowerCase();
      const matchKeyword = !keyword || searchBase.includes(keyword);

      return matchLanguage && matchKeyword;
    })
    .sort((a, b) => {
      if (filters.sort === "stars-asc") return a.stars - b.stars;
      if (filters.sort === "updated-desc") return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (filters.sort === "name-asc") return a.name.localeCompare(b.name);
      return b.stars - a.stars;
    });

  const stats = [
    { label: "项目总数", value: projects.length },
    { label: "当前筛中", value: items.length }
  ];

  return { items, stats };
}

export async function getProjectById(id) {
  const projects = await readProjects();
  return toPublicProject(projects.find(project => project.id === Number(id)) || null);
}

export async function createProject(payload) {
  return upsertProjectByGithub(payload, { updateExisting: false });
}

function buildProjectCreateData(input, visibilityData = {}) {
  return {
    ...input,
    ...visibilityData,
    category: "未分类 / 待整理",
    categorySource: "uncategorized",
    status: "收藏备用",
    recommended: false,
    features: "[]",
    tags: "[]",
    demo: "",
    docs: "",
    note: ""
  };
}

async function findProjectsByCanonicalGithub(prisma, canonicalGithub) {
  const candidates = await prisma.project.findMany({
    select: { id: true, github: true }
  });

  return candidates
    .filter(project => normalizeGithubRepositoryUrl(project.github) === canonicalGithub)
    .sort((left, right) => left.id - right.id);
}

export async function upsertProjectByGithub(payload, options = {}) {
  const prisma = options.client || getPrisma();
  const input = sanitizeSharedPayload(payload);
  const error = validateProjectInput(input);

  if (error) {
    throw new Error(error);
  }

  if (!prisma) throw new Error("Database not available");
  const visibilityData = options.verifiedPublic
    ? { publicVisible: true, visibilityVerifiedAt: new Date() }
    : {};

  const canonicalMatches = await findProjectsByCanonicalGithub(prisma, input.github);
  if (canonicalMatches.length > 1) {
    const projectIds = canonicalMatches.map(project => project.id).join(",");
    throw new Error(`Canonical GitHub URL collision for project IDs [${projectIds}]: ${input.github}`);
  }

  if (canonicalMatches.length === 1) {
    const existing = canonicalMatches[0];
    let refreshBeforeRepublishing = false;
    let visibility = null;
    if (options.verifiedPublic) {
      visibility = await prisma.project.findUnique({
        where: { id: existing.id },
        select: { publicVisible: true, visibilityVerifiedAt: true }
      });
      refreshBeforeRepublishing = !visibility.publicVisible;
    }
    const activityData = refreshBeforeRepublishing
      ? { latestReleaseAt: null, latestCommitAt: null, activityCheckedAt: null }
      : {};
    const data = options.updateExisting || refreshBeforeRepublishing
      ? { ...activityData, ...input, ...visibilityData }
      : { github: input.github, ...visibilityData };
    if (options.verifiedPublic && options.verifiedPublicBefore instanceof Date) {
      const result = await prisma.project.updateMany({
        where: {
          id: existing.id,
          OR: [
            { publicVisible: true },
            { visibilityVerifiedAt: null },
            { visibilityVerifiedAt: { lt: options.verifiedPublicBefore } }
          ]
        },
        data
      });
      if (result.count === 0) return null;
    } else {
      await prisma.project.update({
        where: { id: existing.id },
        data,
        select: { id: true }
      });
    }
    const updated = await prisma.project.findUnique({
      where: { id: existing.id },
      select: sharedProjectSelect
    });
    return toPublicProject(updated);
  }

  const created = await prisma.project.upsert({
    where: { github: input.github },
    update: options.updateExisting ? { ...input, ...visibilityData } : visibilityData,
    create: buildProjectCreateData(input, visibilityData),
    select: sharedProjectSelect
  });

  return toPublicProject(created);
}

export async function setProjectPublicVisibilityByGithub(github, publicVisible, options = {}) {
  const prisma = options.client || getPrisma();
  if (!prisma) throw new Error("Database not available");

  const canonicalGithub = normalizeGithubRepositoryUrl(github);
  if (!canonicalGithub) return 0;
  const matches = await findProjectsByCanonicalGithub(prisma, canonicalGithub);
  if (!matches.length) return 0;

  const result = await prisma.project.updateMany({
    where: {
      id: { in: matches.map(project => project.id) },
      ...(options.onlyIfAlreadyVisible ? { publicVisible: true } : {})
    },
    data: {
      publicVisible: Boolean(publicVisible),
      visibilityVerifiedAt: new Date(),
      ...(!publicVisible ? {
        latestReleaseAt: null,
        latestCommitAt: null,
        activityCheckedAt: null
      } : {})
    }
  });
  return result.count;
}

export async function updateProject(id, payload) {
  const prisma = getPrisma();
  const input = sanitizeSharedPayload(payload, { partial: true });

  if (input.stars !== undefined && (!Number.isFinite(input.stars) || input.stars < 0)) {
    throw new Error("stars must be a non-negative number");
  }

  if (!prisma) throw new Error("Database not available");

  try {
    const updated = await prisma.project.update({
      where: { id: Number(id) },
      data: input
    });

    return toPublicProject(updated);
  } catch (error) {
    if (error?.code === "P2025") return null;
    throw error;
  }
}

export async function updateProjectActivity(id, activityData, options = {}) {
  if (!activityData || (!activityData.latestReleaseAt && !activityData.latestCommitAt && !activityData.activityCheckedAt)) {
    return null;
  }

  const prisma = options.client || getPrisma();

  if (!prisma) throw new Error("Database not available");

  try {
    const data = {};
    if (activityData.latestReleaseAt !== undefined) data.latestReleaseAt = activityData.latestReleaseAt instanceof Date ? activityData.latestReleaseAt : new Date(activityData.latestReleaseAt);
    if (activityData.latestCommitAt !== undefined) data.latestCommitAt = activityData.latestCommitAt instanceof Date ? activityData.latestCommitAt : new Date(activityData.latestCommitAt);
    data.activityCheckedAt = activityData.activityCheckedAt instanceof Date ? activityData.activityCheckedAt : new Date();

    const updated = await prisma.project.updateMany({
      where: { id: Number(id), publicVisible: true },
      data
    });

    return updated.count > 0;
  } catch (error) {
    if (error?.code === "P2025") return null;
    throw error;
  }
}
