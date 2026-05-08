<template>
  <div class="layout">
    <SidebarPanel
      :categories="sidebarCategories"
      :counts="sidebarCategoryCounts"
      :remote-statuses="sidebarRemoteStatuses"
      :remote-counts="sidebarRemoteStatusCounts"
      :quick-filters="localizedQuickFilters"
      :model-value="filters"
      @update:category="updateCategory"
      @update:remote-status="updateRemoteStatus"
      @toggle-quick="toggleQuick"
      @open-changelog="openChangelog"
    />

    <main class="main">
      <div class="locale-switcher">
        <span class="locale-switcher-label">{{ t("language") }}</span>
        <div class="locale-switcher-group">
          <button
            v-for="item in localeOptions"
            :key="item.key"
            class="locale-button"
            :class="{ active: locale === item.key }"
            type="button"
            @click="setLocale(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <Transition name="main-view" mode="out-in" appear>
        <div v-if="adminMode" key="admin-view">
          <AdminPanel
            :projects="projects"
            :categories="sidebarCategories"
            :selected-project="selectedProject"
            :draft="draft"
            :is-create-mode="!selectedProjectId"
            :can-manage-stars="Boolean(currentUser?.canManageStars)"
            :status-options="statusOptions.filter(item => item !== ALL_STATUS)"
            :features-text="featuresText"
            :tags-text="tagsText"
            :message="adminMessage"
            :import-repo="importRepo"
            :import-message="importMessage"
            @close="closeAdmin"
            @create="startCreateProject"
            @select="selectProjectForEdit"
            @save="saveProject"
            @delete="removeProject"
            @import-repo="runGithubImport"
            @reset="resetDraft"
            @cancel-create="cancelCreateProject"
            @update:import-repo="importRepo = $event"
            @update:features-text="featuresText = $event"
            @update:tags-text="tagsText = $event"
          />
        </div>

        <div v-else-if="!isAuthenticated" key="guest-view">
          <section class="hero-panel">
            <div class="hero-copy">
              <div class="eyebrow hero-eyebrow">{{ t("login.eyebrow") }}</div>
              <h2 class="hero-title">
                {{ t("login.titlePrefix") }} <span>{{ t("login.titleAccent") }}</span>
              </h2>
              <p class="hero-subtitle">{{ t("login.subtitle") }}</p>
            </div>
            <div class="hero-controls">
              <button class="button" type="button" @click="loginWithGithub">{{ t("login.loginButton") }}</button>
              <button class="ghost-button" type="button" @click="openAdmin">{{ t("login.adminButton") }}</button>
            </div>
          </section>

          <section class="summary-grid">
            <article class="summary-card">
              <h3>{{ t("summary.blankTitle") }}</h3>
              <p>{{ t("summary.blankCopy") }}</p>
            </article>
            <article class="summary-card">
              <h3>{{ t("summary.userTitle") }}</h3>
              <p>{{ t("summary.userCopy") }}</p>
            </article>
            <article class="summary-card">
              <h3>{{ t("summary.hybridTitle") }}</h3>
              <p>{{ t("summary.hybridCopy") }}</p>
            </article>
          </section>
        </div>

        <div v-else key="user-view">
          <section class="hero-panel">
            <div class="hero-head">
              <div class="hero-copy">
                <div class="eyebrow hero-eyebrow">{{ t("signedIn.eyebrow") }}</div>
                <h2 class="hero-title">{{ t("signedIn.welcome", { name: currentUser.name }) }}</h2>
                <p class="hero-subtitle">{{ t("signedIn.subtitle") }}</p>
              </div>
              <div class="hero-controls">
                <button class="button" type="button" :disabled="syncing" @click="runStarSync">
                  {{ syncing ? t("signedIn.sync") : primarySyncLabel }}
                </button>
                <button
                  v-if="syncStatus.lastStarSyncAt"
                  class="ghost-button"
                  type="button"
                  :disabled="syncing"
                  @click="runStarSync('full')"
                >
                  {{ t("signedIn.fullResync") }}
                </button>
                <button
                  class="ghost-button"
                  type="button"
                  :disabled="reclassifyingRules"
                  @click="runRuleReclassification"
                >
                  {{ reclassifyingRules ? t("signedIn.reclassifying") : t("signedIn.rerunRules") }}
                </button>
                <button
                  v-if="aiClassificationConfig.enabled"
                  class="ghost-button"
                  type="button"
                  :disabled="classifyingAi"
                  @click="runAiClassificationForProjects"
                >
                  {{ classifyingAi ? t("common.loadingShort") : aiButtonLabel }}
                </button>
                <button class="ghost-button" type="button" @click="openAdmin">{{ t("signedIn.openAdmin") }}</button>
                <button class="ghost-button" type="button" @click="handleLogout">{{ t("signedIn.logout") }}</button>
              </div>
            </div>
            <p class="toolbar-tip">{{ aiSummaryText }}</p>
            <p class="toolbar-tip">{{ syncStatusText }}</p>
            <div v-if="syncStatus.recentRuns.length" class="chip-row">
              <span v-for="run in syncStatus.recentRuns" :key="run.id" class="chip">
                {{ formatSyncRun(run) }}
              </span>
            </div>
            <p v-if="syncMessage" class="toolbar-tip">{{ syncMessage }}</p>
          </section>

          <section v-if="isRemoteFilterActive && filteredProjects.length" class="toolbar remote-ops">
            <div class="admin-head">
              <div>
                <div class="eyebrow">{{ t("remoteOps.title") }}</div>
                <p class="toolbar-tip">{{ t("remoteOps.copy", { count: filteredProjects.length }) }}</p>
              </div>
              <div class="admin-actions">
                <button class="ghost-button" type="button" :disabled="recheckingRemote" @click="recheckVisibleRemoteIssues">
                  {{ recheckingRemote ? t("remoteOps.rechecking") : t("remoteOps.recheck") }}
                </button>
                <button class="danger-button" type="button" :disabled="removingVisible" @click="removeVisibleProjects">
                  {{ removingVisible ? t("remoteOps.removing") : t("remoteOps.remove") }}
                </button>
              </div>
            </div>
          </section>

          <template v-if="filteredProjects.length">
            <StatsGrid :stats="stats" />

            <section class="toolbar pagination-toolbar">
              <div class="pagination-summary">
                <div class="eyebrow">{{ t("pagination.title") }}</div>
                <p class="toolbar-tip">{{ t("pagination.showingRange", { start: pageStart, end: pageEnd, total: filteredProjects.length }) }}</p>
              </div>
              <div class="pagination-settings">
                <label class="pagination-size-label" for="page-size">{{ t("pagination.perPage") }}</label>
                <select id="page-size" v-model.number="pageSize" class="select pagination-size-select">
                  <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
                </select>
              </div>
            </section>

            <Transition name="project-surface" mode="out-in">
              <div :key="`${filters.category}-${filters.remoteStatus}-${filters.quick}-${currentPage}-${pageSize}-${filteredProjects.length}`">
                <ProjectGrid
                  :projects="paginatedProjects"
                  :total-count="filteredProjects.length"
                  :range-label="paginationRangeLabel"
                  :title="t('projects.title')"
                  :format-date="formatDate"
                  :format-number="formatNumber"
                  @detail="openDetail"
                />
              </div>
            </Transition>

            <section v-if="totalPages > 1" class="pagination-bar">
              <button class="ghost-button page-nav-button" type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
                {{ t("pagination.previous") }}
              </button>

              <div class="pagination-pages">
                <template v-for="item in paginationItems" :key="item.key">
                  <span v-if="item.type === 'ellipsis'" class="page-ellipsis">...</span>
                  <button
                    v-else
                    class="page-button"
                    :class="{ active: item.page === currentPage }"
                    type="button"
                    @click="goToPage(item.page)"
                  >
                    {{ item.page }}
                  </button>
                </template>
              </div>

              <button class="ghost-button page-nav-button" type="button" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
                {{ t("pagination.next") }}
              </button>
            </section>
          </template>

          <section v-else class="empty">
            <h3>{{ t("projects.noResultsTitle") }}</h3>
            <p>{{ t("projects.noResultsCopy") }}</p>
            <div class="admin-actions">
              <button class="ghost-button" type="button" @click="resetBrowseFilters">{{ t("common.resetFilters") }}</button>
            </div>
          </section>
        </div>
      </Transition>
    </main>
  </div>

  <ProjectDrawer
    :visible="drawerOpen"
    :project="activeProject"
    :format-date="formatDate"
    :format-number="formatNumber"
    @close="closeDetail"
  />

  <ChangelogDrawer :visible="changelogOpen" @close="closeChangelog" />
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  createProject,
  deleteProject,
  getAiClassificationConfig,
  getCurrentUser,
  getMeta,
  getMyProjects,
  getMySyncStatus,
  getProject,
  getProjects,
  importGithubRepo,
  logout,
  recheckRemoteStatus,
  rerunRuleClassification,
  runAiClassification,
  syncGithubStars,
  updateProject
} from "./api/projects";
import AdminPanel from "./components/AdminPanel.vue";
import ChangelogDrawer from "./components/ChangelogDrawer.vue";
import ProjectDrawer from "./components/ProjectDrawer.vue";
import ProjectGrid from "./components/ProjectGrid.vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import StatsGrid from "./components/StatsGrid.vue";
import { locale, localeOptions, setLocale, t } from "./i18n";

const ALL_PROJECTS = "__all_projects__";
const ALL_STATUS = "__all_status__";
const ALL_LANGUAGES = "__all_languages__";
const ALL_REMOTE_STATUS = "all";
const DEFAULT_STATUS = "收藏备用";
const UNCATEGORIZED = "未分类 / 待整理";
const PAGE_SIZE_OPTIONS = [12, 24, 36, 48];
const AUTH_BASE = import.meta.env.VITE_AUTH_BASE_URL || "http://localhost:3000/auth";

const quickFilters = [
  { key: "recommended", badge: "HOT" },
  { key: "deployed", badge: "RUN" },
  { key: "using", badge: "LIVE" },
  { key: "research", badge: "TODO" }
];

const filters = reactive({
  category: ALL_PROJECTS,
  remoteStatus: ALL_REMOTE_STATUS,
  keyword: "",
  status: ALL_STATUS,
  language: ALL_LANGUAGES,
  quick: "",
  sort: "stars-desc"
});

const projects = ref([]);
const categories = ref([]);
const statusOptions = ref([]);
const categoryCounts = ref({});
const stats = ref([]);
const changelogOpen = ref(false);
const drawerOpen = ref(false);
const activeProject = ref(null);
const adminMode = ref(false);
const adminMessage = ref("");
const importMessage = ref("");
const importRepo = ref("");
const currentUser = ref(null);
const syncMessage = ref("");
const syncing = ref(false);
const reclassifyingRules = ref(false);
const recheckingRemote = ref(false);
const removingVisible = ref(false);
const aiClassificationConfig = ref({ enabled: false, model: "", maxPerRun: 25, includeReadme: false });
const classifyingAi = ref(false);
const syncStatus = ref({ lastStarSyncAt: null, recentRuns: [] });
const selectedProjectId = ref(null);
const previousSelectedProjectId = ref(null);
const featuresText = ref("");
const tagsText = ref("");
const currentPage = ref(1);
const pageSize = ref(24);
const draft = reactive(createEmptyDraft());

function createEmptyDraft() {
  return {
    name: "",
    author: "",
    category: "",
    status: DEFAULT_STATUS,
    language: "",
    stars: 0,
    updatedAt: "",
    recommended: false,
    description: "",
    github: "",
    demo: "",
    docs: "",
    note: ""
  };
}

function buildPaginationItems(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => ({
      key: `page-${index + 1}`,
      type: "page",
      page: index + 1
    }));
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sortedPages = [...pages].filter(item => item >= 1 && item <= totalPages).sort((a, b) => a - b);
  const items = [];

  sortedPages.forEach((item, index) => {
    if (index > 0 && item - sortedPages[index - 1] > 1) {
      items.push({ key: `ellipsis-${sortedPages[index - 1]}-${item}`, type: "ellipsis" });
    }

    items.push({ key: `page-${item}`, type: "page", page: item });
  });

  return items;
}

function uiMessage(zh, en) {
  return locale.value === "zh-CN" ? zh : en;
}

const isAuthenticated = computed(() => Boolean(currentUser.value));

const localizedQuickFilters = computed(() =>
  quickFilters.map(item => ({
    ...item,
    label: t(`quickFilters.${item.key}`)
  }))
);

const sidebarCategories = computed(() => {
  const projectCategories = [...new Set(projects.value.map(item => item.category).filter(Boolean))];
  const defaultCategories = (categories.value || []).filter(item => item && item !== ALL_PROJECTS);
  const orderedDefaults = defaultCategories.filter(item => projectCategories.includes(item));
  const customCategories = projectCategories
    .filter(item => !defaultCategories.includes(item))
    .sort((left, right) => left.localeCompare(right, locale.value));

  return [ALL_PROJECTS, ...orderedDefaults, ...customCategories];
});

const sidebarCategoryCounts = computed(() => {
  return sidebarCategories.value.reduce((result, category) => {
    result[category] = category === ALL_PROJECTS
      ? projects.value.length
      : projects.value.filter(item => item.category === category).length;
    return result;
  }, {});
});

const sidebarRemoteStatuses = computed(() => {
  if (!isAuthenticated.value) {
    return [];
  }

  const options = [{ key: ALL_REMOTE_STATUS, label: t("states.allRemote") }];
  if (projects.value.some(item => item.remoteStatus === "unstarred")) options.push({ key: "unstarred", label: t("states.remoteUnstarred") });
  if (projects.value.some(item => item.remoteStatus === "missing")) options.push({ key: "missing", label: t("states.remoteMissing") });
  if (projects.value.some(item => item.remoteStatus === "archived")) options.push({ key: "archived", label: t("states.remoteArchived") });
  return options;
});

const sidebarRemoteStatusCounts = computed(() => {
  if (!isAuthenticated.value) {
    return {};
  }

  return sidebarRemoteStatuses.value.reduce((result, item) => {
    result[item.key] = item.key === ALL_REMOTE_STATUS
      ? projects.value.length
      : projects.value.filter(project => project.remoteStatus === item.key).length;
    return result;
  }, {});
});

const selectedProject = computed(() => projects.value.find(item => item.id === selectedProjectId.value) || null);

const filteredProjects = computed(() => {
  if (!isAuthenticated.value) {
    return projects.value;
  }

  return projects.value.filter(item => {
    const matchCategory = filters.category === ALL_PROJECTS || item.category === filters.category;
    const matchRemoteStatus = filters.remoteStatus === ALL_REMOTE_STATUS || item.remoteStatus === filters.remoteStatus;
    const matchQuick =
      !filters.quick ||
      (filters.quick === "recommended" && item.recommended) ||
      (filters.quick === "deployed" && item.status === "已部署") ||
      (filters.quick === "using" && item.status === "正在使用") ||
      (filters.quick === "research" && item.status === "待研究");

    return matchCategory && matchRemoteStatus && matchQuick;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredProjects.value.length / pageSize.value)));
const safeCurrentPage = computed(() => Math.min(currentPage.value, totalPages.value));
const pageStart = computed(() => (filteredProjects.value.length ? (safeCurrentPage.value - 1) * pageSize.value + 1 : 0));
const pageEnd = computed(() => Math.min(safeCurrentPage.value * pageSize.value, filteredProjects.value.length));
const paginatedProjects = computed(() => {
  const start = (safeCurrentPage.value - 1) * pageSize.value;
  return filteredProjects.value.slice(start, start + pageSize.value);
});

const paginationRangeLabel = computed(() => {
  if (!filteredProjects.value.length) {
    return t("projects.noResultsTitle");
  }

  return t("projects.showingRange", {
    start: pageStart.value,
    end: pageEnd.value,
    total: filteredProjects.value.length
  });
});

const paginationItems = computed(() => buildPaginationItems(safeCurrentPage.value, totalPages.value));
const isRemoteFilterActive = computed(() => filters.remoteStatus !== ALL_REMOTE_STATUS);
const aiPendingCount = computed(() => projects.value.filter(item => !item.aiCategory).length);
const aiClassifiedCount = computed(() => projects.value.filter(item => item.aiCategory).length);
const primarySyncMode = computed(() => (syncStatus.value.lastStarSyncAt ? "incremental" : "full"));
const primarySyncLabel = computed(() => (primarySyncMode.value === "incremental" ? t("signedIn.syncNew") : t("signedIn.syncInitial")));
const aiButtonLabel = computed(() => aiPendingCount.value > 0 ? t("signedIn.aiButtonPending", { count: aiPendingCount.value }) : t("signedIn.aiButtonRerun"));

const aiSummaryText = computed(() => {
  if (!isAuthenticated.value) {
    return "";
  }

  if (!aiClassificationConfig.value.enabled) {
    return t("sync.aiDisabled");
  }

  return t("sync.aiEnabled", {
    classified: aiClassifiedCount.value,
    pending: aiPendingCount.value
  });
});

const syncStatusText = computed(() => {
  if (!isAuthenticated.value) {
    return "";
  }

  if (!syncStatus.value.lastStarSyncAt) {
    return t("sync.neverSynced");
  }

  return t("sync.lastSync", { time: formatDateTime(syncStatus.value.lastStarSyncAt) });
});

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale.value, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat(locale.value === "zh-CN" ? "zh-CN" : "en-US").format(value);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale.value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatSyncRun(run) {
  const label = run.mode === "incremental"
    ? uiMessage("增量", "Incremental")
    : uiMessage("全量", "Full");
  const repoLabel = uiMessage("个项目", "repos");
  return `${label} / ${formatDateTime(run.createdAt)} / ${run.total} ${repoLabel}`;
}

async function loadMeta() {
  const meta = await getMeta();
  categories.value = meta.categories || [];
  statusOptions.value = meta.statusOptions || [];
  categoryCounts.value = meta.categoryCounts || {};
}

function refreshStats() {
  stats.value = [
    { label: t("stats.total"), value: projects.value.length },
    { label: t("stats.recommended"), value: projects.value.filter(item => item.recommended).length },
    { label: t("stats.review"), value: projects.value.filter(item => item.category === UNCATEGORIZED).length },
    { label: t("stats.remoteIssues"), value: projects.value.filter(item => item.remoteStatus && item.remoteStatus !== "active").length }
  ];
}

async function loadProjects() {
  if (isAuthenticated.value) {
    const result = await getMyProjects();
    projects.value = result.items || [];
    refreshStats();
  } else {
    const result = await getProjects({
      category: filters.category,
      keyword: filters.keyword,
      status: filters.status,
      language: filters.language,
      quick: filters.quick,
      sort: filters.sort
    });
    projects.value = result.items || [];
    stats.value = result.stats || [];
  }

  if (!selectedProjectId.value && projects.value.length) {
    selectedProjectId.value = projects.value[0].id;
  }
}

async function loadCurrentUser() {
  const result = await getCurrentUser();
  currentUser.value = result.user;
}

async function loadAiConfig() {
  aiClassificationConfig.value = await getAiClassificationConfig();
}

async function loadSyncStatus() {
  if (!isAuthenticated.value) {
    syncStatus.value = { lastStarSyncAt: null, recentRuns: [] };
    return;
  }

  syncStatus.value = await getMySyncStatus();
}

async function openDetail(id) {
  activeProject.value = await getProject(id);
  drawerOpen.value = true;
}

function closeDetail() {
  drawerOpen.value = false;
}

function openChangelog() {
  changelogOpen.value = true;
}

function closeChangelog() {
  changelogOpen.value = false;
}

function syncDraft(project) {
  const source = project || createEmptyDraft();
  draft.name = source.name || "";
  draft.author = source.author || "";
  draft.category = source.category || "";
  draft.status = source.status || DEFAULT_STATUS;
  draft.language = source.language || "";
  draft.stars = source.stars || 0;
  draft.updatedAt = source.updatedAt || "";
  draft.recommended = Boolean(source.recommended);
  draft.description = source.description || "";
  draft.github = source.github || "";
  draft.demo = source.demo || "";
  draft.docs = source.docs || "";
  draft.note = source.note || "";
  featuresText.value = Array.isArray(source.features) ? source.features.join("\n") : "";
  tagsText.value = Array.isArray(source.tags) ? source.tags.join(", ") : "";
}

function resetDraft() {
  syncDraft(selectedProject.value);
}

function openAdmin() {
  adminMode.value = true;
  adminMessage.value = "";
  importMessage.value = "";
  syncDraft(selectedProject.value);
}

function closeAdmin() {
  if (!selectedProjectId.value) {
    cancelCreateProject();
  }
  adminMode.value = false;
  adminMessage.value = "";
  importMessage.value = "";
}

function startCreateProject() {
  previousSelectedProjectId.value = selectedProjectId.value;
  selectedProjectId.value = null;
  adminMessage.value = "";
  importMessage.value = "";
  syncDraft(null);
}

function cancelCreateProject() {
  const fallbackId = previousSelectedProjectId.value && projects.value.some(item => item.id === previousSelectedProjectId.value)
    ? previousSelectedProjectId.value
    : projects.value[0]?.id || null;

  selectedProjectId.value = fallbackId;
  adminMessage.value = "";
  importMessage.value = "";

  if (fallbackId) {
    const project = projects.value.find(item => item.id === fallbackId);
    syncDraft(project);
    return;
  }

  syncDraft(null);
}

function selectProjectForEdit(id) {
  selectedProjectId.value = id;
  previousSelectedProjectId.value = id;
  adminMessage.value = "";
  const project = projects.value.find(item => item.id === id);
  syncDraft(project);
}

async function saveProject() {
  const payload = {
    ...draft,
    features: featuresText.value,
    tags: tagsText.value
  };

  try {
    if (selectedProjectId.value) {
      const updated = await updateProject(selectedProjectId.value, payload);
      adminMessage.value = uiMessage(`已更新：${updated.name}`, `Updated: ${updated.name}`);
    } else {
      const created = await createProject(payload);
      selectedProjectId.value = created.id;
      previousSelectedProjectId.value = created.id;
      adminMessage.value = uiMessage(`已创建：${created.name}`, `Created: ${created.name}`);
    }

    await loadMeta();
    await loadProjects();
    if (selectedProjectId.value) {
      selectProjectForEdit(selectedProjectId.value);
    }
  } catch (error) {
    adminMessage.value = error.message || uiMessage("保存失败", "Save failed");
  }
}

async function removeProject(id) {
  const payload = typeof id === "object" && id !== null ? id : { id, unstarOnGithub: false };

  try {
    const result = await deleteProject(payload.id, {
      unstarOnGithub: payload.unstarOnGithub
    });

    if (result?.githubUnstar?.attempted) {
      adminMessage.value = result.githubUnstar.success
        ? uiMessage("项目已从本地移除，并已在 GitHub 上取消 Star。", "Project removed locally and GitHub star was removed.")
        : uiMessage(
          `项目已从本地移除，但 GitHub 取消 Star 未完成：${result.githubUnstar.message}`,
          `Project removed locally, but GitHub unstar was not completed: ${result.githubUnstar.message}`
        );
    } else {
      adminMessage.value = uiMessage("项目已从你的本地项目库移除。", "Project removed from your local library.");
    }

    selectedProjectId.value = null;
    await loadMeta();
    await loadProjects();
    syncDraft(null);
  } catch (error) {
    adminMessage.value = error.message || uiMessage("删除失败", "Delete failed");
  }
}

async function runGithubImport() {
  if (!importRepo.value.trim()) {
    importMessage.value = uiMessage("必须填写仓库地址。", "Repository input is required.");
    return;
  }

  importMessage.value = uiMessage("正在导入仓库...", "Importing repository...");

  try {
    const result = await importGithubRepo({ repo: importRepo.value });
    importMessage.value = uiMessage(`已导入：${result.project.name}`, `Imported: ${result.project.name}`);
    selectedProjectId.value = result.project.id;
    previousSelectedProjectId.value = result.project.id;
    await loadMeta();
    await loadProjects();
    selectProjectForEdit(result.project.id);
  } catch (error) {
    importMessage.value = error.message || uiMessage("导入失败", "Import failed");
  }
}

async function runStarSync(mode = primarySyncMode.value) {
  const resolvedMode = mode === "full" ? "full" : "incremental";
  syncMessage.value = resolvedMode === "incremental" ? t("sync.syncingNew") : t("sync.syncingFull");
  syncing.value = true;

  try {
    const result = await syncGithubStars({ mode: resolvedMode });
    syncMessage.value = result.mode === "incremental"
      ? t("sync.incrementalDone", { total: result.total })
      : t("sync.fullDone", { total: result.total });
    await loadMeta();
    await loadProjects();
    await loadSyncStatus();
  } catch (error) {
    syncMessage.value = error.message || uiMessage("同步失败", "Sync failed");
  } finally {
    syncing.value = false;
  }
}

async function runAiClassificationForProjects() {
  if (!aiClassificationConfig.value.enabled) {
    syncMessage.value = t("sync.aiUnavailable");
    return;
  }

  syncMessage.value = t("sync.aiRunning", { model: aiClassificationConfig.value.model });
  classifyingAi.value = true;

  try {
    const result = await runAiClassification({ force: false });
    syncMessage.value = t("sync.aiDone", { updated: result.updated, skipped: result.skipped });
    await loadProjects();
    if (drawerOpen.value && activeProject.value?.id) {
      activeProject.value = await getProject(activeProject.value.id);
    }
  } catch (error) {
    syncMessage.value = error.message || uiMessage("AI 分类失败", "AI classification failed");
  } finally {
    classifyingAi.value = false;
  }
}

async function runRuleReclassification() {
  syncMessage.value = t("sync.rerunRules");
  reclassifyingRules.value = true;

  try {
    const result = await rerunRuleClassification();
    syncMessage.value = t("sync.rerunRulesDone", { total: result.total, updated: result.updated });
    await loadMeta();
    await loadProjects();
    if (drawerOpen.value && activeProject.value?.id) {
      activeProject.value = await getProject(activeProject.value.id);
    }
  } catch (error) {
    syncMessage.value = error.message || uiMessage("规则重分类失败", "Rule reclassification failed");
  } finally {
    reclassifyingRules.value = false;
  }
}

async function recheckVisibleRemoteIssues() {
  recheckingRemote.value = true;
  syncMessage.value = t("remoteOps.copy", { count: filteredProjects.value.length });

  try {
    const result = await recheckRemoteStatus({
      projectIds: filteredProjects.value.map(item => item.id)
    });
    syncMessage.value = t("sync.remoteRecheckDone", { updated: result.updated });
    await loadProjects();
    if (drawerOpen.value && activeProject.value?.id) {
      activeProject.value = await getProject(activeProject.value.id);
    }
  } catch (error) {
    syncMessage.value = error.message || uiMessage("远端状态检查失败", "Remote status recheck failed");
  } finally {
    recheckingRemote.value = false;
  }
}

async function removeVisibleProjects() {
  const count = filteredProjects.value.length;
  if (!count) {
    return;
  }

  const shouldRemove = window.confirm(t("sync.batchRemoveConfirm", { count }));
  if (!shouldRemove) {
    return;
  }

  removingVisible.value = true;

  try {
    for (const item of [...filteredProjects.value]) {
      await deleteProject(item.id, { unstarOnGithub: false });
    }

    syncMessage.value = t("sync.removedVisibleDone", { count });
    selectedProjectId.value = null;
    await loadMeta();
    await loadProjects();
    if (!filteredProjects.value.length) {
      resetBrowseFilters();
    }
  } catch (error) {
    syncMessage.value = error.message || uiMessage("批量移除失败", "Batch removal failed");
  } finally {
    removingVisible.value = false;
  }
}

function loginWithGithub() {
  window.location.href = `${AUTH_BASE}/github/login`;
}

async function handleLogout() {
  await logout();
  currentUser.value = null;
  projects.value = [];
  stats.value = [];
  syncMessage.value = "";
  syncStatus.value = { lastStarSyncAt: null, recentRuns: [] };
  resetBrowseFilters();
}

function updateCategory(value) {
  filters.category = value;
  filters.quick = "";
}

function updateRemoteStatus(value) {
  filters.remoteStatus = value;
}

function toggleQuick(value) {
  filters.quick = filters.quick === value ? "" : value;
}

function resetBrowseFilters() {
  filters.category = ALL_PROJECTS;
  filters.remoteStatus = ALL_REMOTE_STATUS;
  filters.quick = "";
  currentPage.value = 1;
}

function goToPage(page) {
  currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
}

watch(
  () => ({ ...filters }),
  async () => {
    currentPage.value = 1;
    if (isAuthenticated.value) {
      return;
    }
    await loadProjects();
  },
  { deep: true }
);

watch(pageSize, () => {
  currentPage.value = 1;
});

watch(
  () => filteredProjects.value.length,
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value;
    }
  }
);

watch(selectedProject, value => {
  if (adminMode.value && value) {
    syncDraft(value);
  }
});

watch(locale, () => {
  if (isAuthenticated.value) {
    refreshStats();
  }
});

onMounted(async () => {
  await loadCurrentUser();
  await loadAiConfig();
  await loadMeta();
  if (isAuthenticated.value) {
    await loadProjects();
    await loadSyncStatus();
  }
});
</script>
