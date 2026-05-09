import { projects as seedProjects } from "../data/projects.js";
import { getPrisma } from "../lib/prisma.js";

const legacyStatusMap = {
  Deployed: "已部署",
  "In Use": "正在使用",
  Saved: "收藏备用",
  "To Research": "待研究"
};

const memoryProjects = seedProjects.map(project => ({
  ...project,
  features: [...project.features],
  tags: [...project.tags]
}));

const quickFilterMap = {
  recommended: project => project.recommended,
  deployed: project => project.status === "已部署",
  using: project => project.status === "正在使用",
  research: project => project.status === "待研究"
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

async function readProjects() {
  const prisma = getPrisma();

  if (!prisma) {
    return memoryProjects;
  }

  try {
    const projects = await prisma.project.findMany({
      orderBy: { id: "asc" }
    });

    if (!projects.length) {
      return memoryProjects;
    }

    return projects.map(normalizeProject);
  } catch {
    return memoryProjects;
  }
}

function sanitizePayload(payload) {
  const features = Array.isArray(payload.features)
    ? payload.features
    : String(payload.features || "")
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean);

  const tags = Array.isArray(payload.tags)
    ? payload.tags
    : String(payload.tags || "")
        .split(/[,\n]/)
        .map(item => item.trim())
        .filter(Boolean);

  return {
    name: String(payload.name || "").trim(),
    author: String(payload.author || "").trim(),
    category: String(payload.category || "").trim(),
    categorySource: String(payload.categorySource || "manual").trim() || "manual",
    status: legacyStatusMap[payload.status] || String(payload.status || "").trim(),
    language: String(payload.language || "").trim(),
    stars: Number(payload.stars || 0),
    updatedAt: String(payload.updatedAt || "").trim(),
    recommended: Boolean(payload.recommended),
    description: String(payload.description || "").trim(),
    features,
    tags,
    github: String(payload.github || "").trim(),
    demo: String(payload.demo || "").trim(),
    docs: String(payload.docs || "").trim(),
    note: String(payload.note || "").trim(),
    aiCategory: payload.aiCategory ? String(payload.aiCategory).trim() : null,
    aiConfidence: payload.aiConfidence === null || payload.aiConfidence === undefined || payload.aiConfidence === ""
      ? null
      : Number(payload.aiConfidence),
    aiReason: payload.aiReason ? String(payload.aiReason).trim() : "",
    aiModel: payload.aiModel ? String(payload.aiModel).trim() : "",
    aiClassifiedAt: payload.aiClassifiedAt ? new Date(payload.aiClassifiedAt) : null,
    latestReleaseAt: payload.latestReleaseAt !== undefined ? payload.latestReleaseAt ? new Date(payload.latestReleaseAt) : null : null,
    latestCommitAt: payload.latestCommitAt !== undefined ? payload.latestCommitAt ? new Date(payload.latestCommitAt) : null : null,
    activityCheckedAt: payload.activityCheckedAt !== undefined ? payload.activityCheckedAt ? new Date(payload.activityCheckedAt) : null : null
  };
}

function validateProjectInput(payload) {
  const requiredFields = [
    "name",
    "author",
    "category",
    "status",
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

  if (payload.aiConfidence !== null && (!Number.isFinite(payload.aiConfidence) || payload.aiConfidence < 0 || payload.aiConfidence > 1)) {
    return "aiConfidence must be between 0 and 1";
  }

  return null;
}

export async function getMeta() {
  const projects = await readProjects();
  const categories = ["全部项目", ...new Set(projects.map(item => item.category))];
  const statusOptions = ["全部状态", ...new Set(projects.map(item => item.status))];
  const languageOptions = ["全部语言", ...new Set(projects.map(item => item.language))];

  const categoryCounts = categories.reduce((result, category) => {
    result[category] = category === "全部项目"
      ? projects.length
      : projects.filter(item => item.category === category).length;
    return result;
  }, {});

  return {
    categories,
    statusOptions,
    languageOptions,
    categoryCounts
  };
}

export async function listProjects(filters) {
  const projects = await readProjects();
  const keyword = (filters.keyword || "").trim().toLowerCase();

  const items = projects
    .filter(project => {
      const matchCategory = !filters.category || filters.category === "全部项目" || project.category === filters.category;
      const matchStatus = !filters.status || filters.status === "全部状态" || project.status === filters.status;
      const matchLanguage = !filters.language || filters.language === "全部语言" || project.language === filters.language;
      const searchBase = [project.name, project.author, project.description, project.tags.join(" ")].join(" ").toLowerCase();
      const matchKeyword = !keyword || searchBase.includes(keyword);
      const quickFilter = quickFilterMap[filters.quick];
      const matchQuick = quickFilter ? quickFilter(project) : true;

      return matchCategory && matchStatus && matchLanguage && matchKeyword && matchQuick;
    })
    .sort((a, b) => {
      if (filters.sort === "stars-asc") return a.stars - b.stars;
      if (filters.sort === "updated-desc") return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (filters.sort === "name-asc") return a.name.localeCompare(b.name);
      return b.stars - a.stars;
    });

  const stats = [
    { label: "项目总数", value: projects.length },
    { label: "当前筛中", value: items.length },
    { label: "推荐项目", value: projects.filter(item => item.recommended).length },
    { label: "已部署或在用", value: projects.filter(item => ["已部署", "正在使用"].includes(item.status)).length }
  ];

  return { items, stats };
}

export async function getProjectById(id) {
  const projects = await readProjects();
  return projects.find(project => project.id === Number(id)) || null;
}

export async function createProject(payload) {
  const prisma = getPrisma();
  const input = sanitizePayload(payload);
  const error = validateProjectInput(input);

  if (error) {
    throw new Error(error);
  }

  const projects = await readProjects();
  const nextId = projects.length ? Math.max(...projects.map(project => project.id)) + 1 : 1;

  if (!prisma) {
    const created = { id: nextId, ...input };
    memoryProjects.push(created);
    return created;
  }

  const created = await prisma.project.create({
    data: {
      id: nextId,
      ...input,
      features: JSON.stringify(input.features),
      tags: JSON.stringify(input.tags)
    }
  });

  return normalizeProject(created);
}

export async function updateProject(id, payload) {
  const prisma = getPrisma();
  const input = sanitizePayload(payload);
  const error = validateProjectInput(input);

  if (error) {
    throw new Error(error);
  }

  if (!prisma) {
    const index = memoryProjects.findIndex(project => project.id === Number(id));

    if (index === -1) {
      return null;
    }

    const existing = normalizeProject(memoryProjects[index]);
    memoryProjects[index] = {
      id: Number(id),
      ...input,
      aiCategory: payload.aiCategory !== undefined ? input.aiCategory : existing.aiCategory,
      aiConfidence: payload.aiConfidence !== undefined ? input.aiConfidence : existing.aiConfidence,
      aiReason: payload.aiReason !== undefined ? input.aiReason : existing.aiReason,
      aiModel: payload.aiModel !== undefined ? input.aiModel : existing.aiModel,
      aiClassifiedAt: payload.aiClassifiedAt !== undefined ? input.aiClassifiedAt : existing.aiClassifiedAt,
      categorySource: payload.categorySource !== undefined ? input.categorySource : "manual",
      latestReleaseAt: payload.latestReleaseAt !== undefined ? input.latestReleaseAt : existing.latestReleaseAt,
      latestCommitAt: payload.latestCommitAt !== undefined ? input.latestCommitAt : existing.latestCommitAt,
      activityCheckedAt: payload.activityCheckedAt !== undefined ? input.activityCheckedAt : existing.activityCheckedAt
    };

    return memoryProjects[index];
  }

  try {
    const existing = await prisma.project.findUnique({
      where: { id: Number(id) }
    });

    if (!existing) {
      return null;
    }

    const updated = await prisma.project.update({
      where: { id: Number(id) },
      data: {
        ...input,
        categorySource: payload.categorySource !== undefined ? input.categorySource : "manual",
        aiCategory: payload.aiCategory !== undefined ? input.aiCategory : existing.aiCategory,
        aiConfidence: payload.aiConfidence !== undefined ? input.aiConfidence : existing.aiConfidence,
        aiReason: payload.aiReason !== undefined ? input.aiReason : existing.aiReason,
        aiModel: payload.aiModel !== undefined ? input.aiModel : existing.aiModel,
        aiClassifiedAt: payload.aiClassifiedAt !== undefined ? input.aiClassifiedAt : existing.aiClassifiedAt,
        latestReleaseAt: payload.latestReleaseAt !== undefined ? input.latestReleaseAt : existing.latestReleaseAt,
        latestCommitAt: payload.latestCommitAt !== undefined ? input.latestCommitAt : existing.latestCommitAt,
        activityCheckedAt: payload.activityCheckedAt !== undefined ? input.activityCheckedAt : existing.activityCheckedAt,
        features: JSON.stringify(input.features),
        tags: JSON.stringify(input.tags)
      }
    });

    return normalizeProject(updated);
  } catch {
    return null;
  }
}

export async function updateProjectAiClassification(id, classification) {
  const prisma = getPrisma();

  if (!prisma) {
    const index = memoryProjects.findIndex(project => project.id === Number(id));

    if (index === -1) {
      return null;
    }

    memoryProjects[index] = {
      ...memoryProjects[index],
      category: classification.category,
      categorySource: "ai",
      aiCategory: classification.category,
      aiConfidence: classification.confidence,
      aiReason: classification.reason,
      aiModel: classification.model,
      aiClassifiedAt: classification.classifiedAt
    };

    return normalizeProject(memoryProjects[index]);
  }

  const updated = await prisma.project.update({
    where: { id: Number(id) },
    data: {
      category: classification.category,
      categorySource: "ai",
      aiCategory: classification.category,
      aiConfidence: classification.confidence,
      aiReason: classification.reason,
      aiModel: classification.model,
      aiClassifiedAt: classification.classifiedAt
    }
  });

  return normalizeProject(updated);
}

export async function updateProjectActivity(id, activityData) {
  if (!activityData || (!activityData.latestReleaseAt && !activityData.latestCommitAt && !activityData.activityCheckedAt)) {
    return null;
  }

  const prisma = getPrisma();

  if (!prisma) {
    const index = memoryProjects.findIndex(project => project.id === Number(id));

    if (index === -1) {
      return null;
    }

    memoryProjects[index] = {
      ...memoryProjects[index],
      latestReleaseAt: activityData.latestReleaseAt || memoryProjects[index].latestReleaseAt || null,
      latestCommitAt: activityData.latestCommitAt || memoryProjects[index].latestCommitAt || null,
      activityCheckedAt: activityData.activityCheckedAt || new Date().toISOString()
    };

    return normalizeProject(memoryProjects[index]);
  }

  try {
    const data = {};
    if (activityData.latestReleaseAt !== undefined) data.latestReleaseAt = activityData.latestReleaseAt instanceof Date ? activityData.latestReleaseAt : new Date(activityData.latestReleaseAt);
    if (activityData.latestCommitAt !== undefined) data.latestCommitAt = activityData.latestCommitAt instanceof Date ? activityData.latestCommitAt : new Date(activityData.latestCommitAt);
    data.activityCheckedAt = activityData.activityCheckedAt instanceof Date ? activityData.activityCheckedAt : new Date();

    const updated = await prisma.project.update({
      where: { id: Number(id) },
      data
    });

    return normalizeProject(updated);
  } catch {
    return null;
  }
}

export async function deleteProject(id) {
  const prisma = getPrisma();

  if (!prisma) {
    const index = memoryProjects.findIndex(project => project.id === Number(id));

    if (index === -1) {
      return false;
    }

    memoryProjects.splice(index, 1);
    return true;
  }

  try {
    await prisma.project.delete({
      where: { id: Number(id) }
    });
    return true;
  } catch {
    return false;
  }
}
