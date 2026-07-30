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

      <div v-if="loading" class="view-shell">
        <section class="hero-panel sk-hero">
          <div class="hero-head">
            <div class="hero-copy">
              <div class="eyebrow sk-eyebrow">&nbsp;</div>
              <h2 class="hero-title sk-title">&nbsp;</h2>
              <p class="hero-subtitle sk-subtitle">&nbsp;</p>
            </div>
            <div class="hero-controls">
              <span class="button sk-btn">&nbsp;</span>
              <span class="button sk-btn sk-btn-ghost">&nbsp;</span>
            </div>
          </div>
        </section>
        <div class="stats sk-stats">
          <div class="stat-card sk-stat"><div class="stat-label">&nbsp;</div><div class="stat-value">&nbsp;</div></div>
          <div class="stat-card sk-stat"><div class="stat-label">&nbsp;</div><div class="stat-value">&nbsp;</div></div>
          <div class="stat-card sk-stat"><div class="stat-label">&nbsp;</div><div class="stat-value">&nbsp;</div></div>
          <div class="stat-card sk-stat"><div class="stat-label">&nbsp;</div><div class="stat-value">&nbsp;</div></div>
        </div>
        <section class="toolbar search-toolbar sk-toolbar">
          <span class="input sk-search">&nbsp;</span>
          <span class="select sk-sort">&nbsp;</span>
        </section>
        <div class="grid sk-grid">
          <div class="card sk-card"><div class="card-body"><div class="sk-card-line sk-card-title">&nbsp;</div><div class="sk-card-line sk-card-meta">&nbsp;</div><div class="sk-card-line sk-card-desc">&nbsp;</div><div class="sk-card-line sk-card-desc sk-card-desc-short">&nbsp;</div></div></div>
          <div class="card sk-card"><div class="card-body"><div class="sk-card-line sk-card-title">&nbsp;</div><div class="sk-card-line sk-card-meta">&nbsp;</div><div class="sk-card-line sk-card-desc">&nbsp;</div><div class="sk-card-line sk-card-desc sk-card-desc-short">&nbsp;</div></div></div>
          <div class="card sk-card"><div class="card-body"><div class="sk-card-line sk-card-title">&nbsp;</div><div class="sk-card-line sk-card-meta">&nbsp;</div><div class="sk-card-line sk-card-desc">&nbsp;</div><div class="sk-card-line sk-card-desc sk-card-desc-short">&nbsp;</div></div></div>
          <div class="card sk-card"><div class="card-body"><div class="sk-card-line sk-card-title">&nbsp;</div><div class="sk-card-line sk-card-meta">&nbsp;</div><div class="sk-card-line sk-card-desc">&nbsp;</div><div class="sk-card-line sk-card-desc sk-card-desc-short">&nbsp;</div></div></div>
        </div>
      </div>

      <div v-else-if="initializationError" class="view-shell">
        <EmptyState icon="remote">
          <template #title>{{ initializationErrorTitle }}</template>
          {{ initializationErrorMessage }}
          <template #action>
            <button class="button" type="button" @click="initializeApp">{{ t("initialization.retry") }}</button>
          </template>
        </EmptyState>
      </div>

      <Transition v-else name="admin-surface" mode="out-in">
        <div v-if="adminMode && isAuthenticated" key="admin">
          <AdminPanel
            :projects="projects"
            :categories="sidebarCategories"
            :selected-project="selectedProject"
            :draft="draft"
            :is-create-mode="!selectedProjectId"
            :can-manage-stars="canManageStars"
            :status-options="editableStatusOptions"
            :features-text="featuresText"
            :tags-text="tagsText"
            :message="adminMessage"
            :saving="adminSaving"
            :import-repo="importRepo"
            :import-message="importMessage"
            :managed-categories="categoryList"
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
            @refresh-categories="loadCategories"
          />
        </div>
        <div v-else-if="!isAuthenticated" key="guest">
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
        <div v-else key="dashboard">
          <section class="hero-panel">
          <div class="hero-head">
            <div class="hero-copy">
              <div class="eyebrow hero-eyebrow">{{ t("signedIn.eyebrow") }}</div>
              <h2 class="hero-title">{{ t("signedIn.welcome", { name: currentUser.name }) }}</h2>
              <p class="hero-subtitle">{{ t("signedIn.subtitle") }}</p>
              <p class="toolbar-tip">{{ aiSummaryText }}</p>
              <button
                v-if="aiConfigState === 'error'"
                data-test="retry-ai-config"
                class="ghost-button"
                type="button"
                @click="retryAiConfig"
              >
                {{ t("sync.retryAiConfig") }}
              </button>
              <p class="toolbar-tip">{{ syncStatusText }}</p>
              <button
                v-if="syncStatusState === 'error'"
                data-test="retry-sync-status"
                class="ghost-button"
                type="button"
                @click="retrySyncStatus"
              >
                {{ t("sync.retryStatus") }}
              </button>
              <details v-if="syncStatus.recentRuns.length" class="sync-history">
                <summary class="sync-history-summary">
                  <span class="chip">{{ formatSyncRun(syncStatus.recentRuns[0]) }}</span>
                  <span class="sync-history-badge">{{ syncStatus.recentRuns.length }} records</span>
                </summary>
                <div class="chip-row sync-history-chips">
                  <span v-for="run in syncStatus.recentRuns" :key="run.id" class="chip">
                    {{ formatSyncRun(run) }}
                  </span>
                </div>
              </details>
              <p v-if="syncMessage" class="toolbar-tip">{{ syncMessage }}</p>
            </div>
            <div class="hero-controls">
              <button
                data-test="primary-sync"
                class="button"
                type="button"
                :disabled="syncing || syncStatusState !== 'loaded'"
                @click="runStarSync()"
              >
                {{ syncing ? t("signedIn.sync") : primarySyncLabel }}
              </button>
                <div ref="moreActionsRef" class="more-actions" :class="{ open: showMore }">
                  <button class="more-actions-trigger" type="button" @click="showMore = !showMore"><span>{{ t("signedIn.moreActions") }}</span><span class="more-actions-arrow">▾</span></button>
                  <div v-if="showMore" class="more-actions-dropdown">
                    <button
                      data-test="manual-sync-full"
                      class="more-actions-item"
                      type="button"
                      :disabled="syncing"
                      @click="runStarSync('full')"
                    >
                      {{ t("signedIn.fullResync") }}
                    </button>
                    <button
                      data-test="manual-sync-incremental"
                      class="more-actions-item"
                      type="button"
                      :disabled="syncing"
                      @click="runStarSync('incremental')"
                    >
                      {{ t("signedIn.syncNew") }}
                    </button>
                    <button
                      class="more-actions-item"
                      type="button"
                      :disabled="reclassifyingRules"
                      @click="runRuleReclassification"
                    >
                      {{ reclassifyingRules ? t("signedIn.reclassifying") : t("signedIn.rerunRules") }}
                    </button>
                    <button
                      v-if="aiConfigState === 'loaded' && aiClassificationConfig.enabled"
                      class="more-actions-item"
                      type="button"
                      :disabled="classifyingAi"
                      @click="runAiClassificationForProjects"
                    >
                      {{ classifyingAi ? t("common.loadingShort") : aiButtonLabel }}
                    </button>
                    <div class="more-actions-divider"></div>
                    <button class="more-actions-item" type="button" @click="openAdmin">{{ t("signedIn.openAdmin") }}</button>
                    <button
                      class="more-actions-item more-actions-item-danger"
                      type="button"
                      :disabled="loggingOut"
                      @click="handleLogout"
                    >{{ t("signedIn.logout") }}</button>
                  </div>
                </div>
              </div>
            </div>
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
                <button class="danger-button" type="button" :disabled="batchOperationBusy" @click="removeVisibleProjects">
                  {{ removingVisible ? t("remoteOps.removing") : t("remoteOps.remove") }}
                </button>
              </div>
            </div>
            <div v-if="batchSelectedIds.size > 0" data-test="delete-failure-bar" class="batch-bar">
              <span class="batch-bar-label">
                {{ t("remoteOps.failedSelection", { count: batchSelectedIds.size }) }}
              </span>
              <button
                data-test="retry-failed-deletes"
                class="danger-button"
                type="button"
                :disabled="batchOperationBusy"
                @click="retryFailedDeletes"
              >
                {{ removingVisible ? t("remoteOps.retryingFailed") : t("remoteOps.retryFailed") }}
              </button>
            </div>
          </section>

          <section v-if="isUncategorizedWorkspace" class="toolbar triage-workspace">
            <div class="triage-workspace-head">
              <div>
                <div class="eyebrow">{{ t("triage.title") }}</div>
                <p class="triage-workspace-title">{{ t("triage.subtitle") }}</p>
                <p class="toolbar-tip">
                  {{ filteredProjects.length ? t("triage.remaining", { count: filteredProjects.length }) : t("triage.cleared") }}
                </p>
              </div>
              <div class="admin-actions">
                <button class="ghost-button" type="button" @click="resetBrowseFilters">{{ t("triage.exit") }}</button>
                <button class="button" type="button" @click="openAdmin">{{ t("triage.openAdmin") }}</button>
              </div>
            </div>
            <div v-if="triageCategories.length" class="triage-workspace-body">
              <p class="toolbar-tip">{{ t("triage.quickPick") }}</p>
              <div class="chip-row">
                <span v-for="category in triageCategories" :key="`triage-${category}`" class="chip brand">
                  {{ translateCategory(category) }}
                </span>
              </div>
            </div>
            <div v-if="filteredProjects.length" class="batch-bar">
              <div class="batch-bar-left">
                <input
                  id="batch-select-all"
                  class="card-checkbox"
                  type="checkbox"
                  :aria-label="t('batch.selectCurrentPage')"
                  :title="t('batch.selectCurrentPage')"
                  :checked="batchAllSelected"
                  :indeterminate="batchIndeterminate"
                  :disabled="batchOperationBusy"
                  @change="toggleSelectAll"
                />
                <label class="batch-bar-label" for="batch-select-all">{{ t("batch.selectCurrentPage") }}</label>
                <span class="batch-bar-label">
                  {{ t("batch.selected", { count: batchSelectedIds.size }) }}
                </span>
                <button
                  class="triage-chip triage-chip-muted"
                  type="button"
                  :disabled="batchOperationBusy"
                  @click="toggleSelectAllFiltered"
                >
                  {{ batchAllFilteredSelected
                    ? t("batch.clearFiltered", { count: filteredProjects.length })
                    : t("batch.selectFiltered", { count: filteredProjects.length }) }}
                </button>
              </div>
              <div v-if="batchSelectedIds.size > 0" class="batch-bar-actions">
                <button
                  v-for="category in triageCategories"
                  :key="`batch-${category}`"
                  class="triage-chip"
                  type="button"
                  :disabled="batchOperationBusy"
                  @click="batchCategorize(category)"
                >
                  {{ translateCategory(category) }}
                </button>
                <button
                  class="triage-chip triage-chip-muted"
                  type="button"
                  :disabled="batchOperationBusy"
                  @click="batchMarkResearch"
                >
                  {{ batchSaving ? t("common.loadingShort") : t("triage.markResearch") }}
                </button>
              </div>
            </div>
          </section>

          <template v-if="filteredProjects.length">
            <StatsGrid :stats="stats" />

            <section class="toolbar search-toolbar">
              <input
                v-model="filters.keyword"
                class="input search-input"
                type="search"
                :placeholder="t('projects.searchPlaceholder')"
              />
              <select v-model="filters.sort" class="select sort-select">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </section>

            <section class="toolbar pagination-toolbar">
              <div class="pagination-summary">
                <div class="eyebrow">{{ t("pagination.title") }}</div>
                <p class="toolbar-tip">{{ t("pagination.showingRange", { start: pageStart, end: pageEnd, total: filteredProjects.length }) }}</p>
              </div>
              <div class="pagination-settings">
                <label class="pagination-size-label">{{ t("pagination.perPage") }}</label>
                <div ref="pageSizeRef" class="select pagination-size-select page-size-dropdown" :class="{ open: showPageSize }">
                  <button class="page-size-trigger" type="button" @click="showPageSize = !showPageSize">
                    <span>{{ pageSize }}</span><span class="more-actions-arrow">▾</span>
                  </button>
                  <div v-if="showPageSize" class="page-size-menu">
                    <button v-for="size in PAGE_SIZE_OPTIONS" :key="size" type="button" class="page-size-option" :class="{ active: pageSize === size }" @click="selectPageSize(size)">{{ size }}</button>
                  </div>
                </div>
              </div>
            </section>

            <Transition name="project-surface" mode="out-in">
              <div :key="`${filters.category}-${filters.remoteStatus}-${filters.quick}-${currentPage}-${pageSize}-${filteredProjects.length}`">
                <ProjectGrid
                  :projects="paginatedProjects"
                  :total-count="filteredProjects.length"
                  :range-label="paginationRangeLabel"
                  :title="t('projects.title')"
                  :show-triage="isUncategorizedWorkspace"
                  :triage-categories="triageCategories"
                  :triage-saving-id="triageSavingId"
                  :batch-busy="batchOperationBusy"
                  :busy-project-ids="busyProjectIds"
                  :selected-ids="batchSelectedIds"
                  :format-date="formatDate"
                  :format-number="formatNumber"
                  @detail="openDetail"
                  @quick-category="quickCategorizeProject"
                  @mark-research="markProjectResearch"
                  @update:selected-ids="handleBatchSelectionUpdate"
                />
                <div v-if="detailLoadError" data-test="detail-load-error" class="batch-bar">
                  <span class="batch-bar-label">{{ t("drawer.loadFailed") }}</span>
                  <button class="ghost-button" type="button" @click="retryDetailLoad">
                    {{ t("common.retry") }}
                  </button>
                </div>
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

          <EmptyState v-else icon="search">
            <template #title>{{ t("projects.noResultsTitle") }}</template>
            {{ t("projects.noResultsCopy") }}
            <template #action>
              <button class="ghost-button" type="button" @click="resetBrowseFilters">{{ t("common.resetFilters") }}</button>
            </template>
          </EmptyState>
        </div>
      </Transition>
    </main>
  </div>

  <ProjectDrawer
    :visible="drawerOpen"
    :project="activeProject"
    :categories="sidebarCategories"
    :mutation-blocked="batchOperationBusy"
    :format-date="formatDate"
    :format-number="formatNumber"
    @close="closeDetail"
    @saved="handleDrawerSaved"
  />

  <ChangelogDrawer :visible="changelogOpen" @close="closeChangelog" />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  createProject,
  getAiClassificationConfig,
  getCurrentUser,
  getGithubLoginUrl,
  getMeta,
  getMyProjects,
  getMySyncStatus,
  getProject,
  getProjects,
  importGithubRepo,
  logout,
  onAuthInvalidated,
  recheckRemoteStatus,
  rerunRuleClassification,
  getManagedCategories,
  runAiClassification,
  syncGithubStars
} from "./api/projects";
import AdminPanel from "./components/AdminPanel.vue";
import ChangelogDrawer from "./components/ChangelogDrawer.vue";
import EmptyState from "./components/EmptyState.vue";
import ProjectDrawer from "./components/ProjectDrawer.vue";
import ProjectGrid from "./components/ProjectGrid.vue";
import SidebarPanel from "./components/SidebarPanel.vue";
import StatsGrid from "./components/StatsGrid.vue";
import { locale, localeOptions, setLocale, t, translateCategory } from "./i18n";
import {
  busyProjectIds,
  hasBusyProjectMutations,
  invalidateProjectMutations,
  isLatestProjectMutation,
  isProjectMutationBusy,
  queueProjectDelete,
  queueProjectUpdate,
  reserveProjectMutations
} from "./lib/projectMutationQueue";

const ALL_PROJECTS = "__all_projects__";
const ALL_STATUS = "__all_status__";
const ALL_LANGUAGES = "__all_languages__";
const ALL_REMOTE_STATUS = "all";
const DEFAULT_STATUS = "收藏备用";
const UNCATEGORIZED = "未分类 / 待整理";
const PAGE_SIZE_OPTIONS = [12, 24, 36, 48];

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
  sort: "starred-desc"
});

const projects = ref([]);
const authResolved = ref(false);
const initializationError = ref(null);
const categories = ref([]);
const statusOptions = ref([]);
const categoryCounts = ref({});
const stats = ref([]);
const changelogOpen = ref(false);
const drawerOpen = ref(false);
const activeProject = ref(null);
const adminMode = ref(false);
const adminMessage = ref("");
const adminSaving = ref(false);
const importMessage = ref("");
const importRepo = ref("");
const currentUser = ref(null);
const loading = ref(true);
const syncMessage = ref("");
const syncing = ref(false);
const showMore = ref(false);
const loggingOut = ref(false);
const moreActionsRef = ref(null);
const showPageSize = ref(false);
const pageSizeRef = ref(null);
const reclassifyingRules = ref(false);
const recheckingRemote = ref(false);
const removingVisible = ref(false);
const triageSavingId = ref(null);
const batchSelectedIds = ref(new Set());
const batchSaving = ref(false);
const batchOperationBusy = ref(false);
const aiClassificationConfig = ref({ enabled: false, model: "", maxPerRun: 25, includeReadme: false });
const aiConfigState = ref("unavailable");
const classifyingAi = ref(false);
const syncStatus = ref({ lastStarSyncAt: null, recentRuns: [] });
const syncStatusState = ref("unavailable");
const detailLoadError = ref(null);
const selectedProjectId = ref(null);
const previousSelectedProjectId = ref(null);
const featuresText = ref("");
const tagsText = ref("");
const categoryList = ref([]);
const currentPage = ref(1);
const pageSize = ref(24);
const draft = reactive(createEmptyDraft());
const draftBaseline = ref({});
let authEpoch = 0;
let metaRequestGeneration = 0;
let categoriesRequestGeneration = 0;
let projectsRequestGeneration = 0;
let syncStatusRequestGeneration = 0;
let aiConfigRequestGeneration = 0;
let detailRequestGeneration = 0;
let projectStateRevision = 0;
const projectRevisions = new Map();

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
const canManageStars = computed(() => Boolean(currentUser.value?.canManageStars));
const editableStatusOptions = computed(() => statusOptions.value.filter(item => item !== ALL_STATUS));
const initializationErrorTitle = computed(() => t(`initialization.${initializationError.value?.stage || "backend"}Title`));
const initializationErrorMessage = computed(() => t(`initialization.${initializationError.value?.stage || "backend"}Message`));

const localizedQuickFilters = computed(() =>
  quickFilters.map(item => ({
    ...item,
    label: t(`quickFilters.${item.key}`)
  }))
);

const sidebarCategories = computed(() => {
  const projectCategories = [...new Set(projects.value.map(item => item.category).filter(Boolean))];
  const configuredCategories = [...new Set([...(categories.value || []), ...(categoryList.value || [])])]
    .filter(item => item && item !== ALL_PROJECTS && item !== "全部项目");
  const customCategories = projectCategories
    .filter(item => !configuredCategories.includes(item))
    .sort((left, right) => left.localeCompare(right, locale.value));

  return [ALL_PROJECTS, ...configuredCategories, ...customCategories];
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
const isUncategorizedWorkspace = computed(() => isAuthenticated.value && filters.category === UNCATEGORIZED);
const triageCategories = computed(() => {
  const preferred = [
    "AI / LLM",
    "自动化 / 效率工具",
    "前端 UI / 可视化",
    "运维 / 自建服务",
    "网络 / NAS / 虚拟化",
    "媒体 / 下载 / 图床",
    "安全 / CTF"
  ];
  const available = sidebarCategories.value.filter(category =>
    category &&
    category !== ALL_PROJECTS &&
    category !== UNCATEGORIZED
  );
  const preferredAvailable = preferred.filter(category => available.includes(category));
  const remaining = available.filter(category => !preferredAvailable.includes(category));
  return [...preferredAvailable, ...remaining].slice(0, 6);
});

const filteredProjects = computed(() => {
  if (!isAuthenticated.value) {
    return projects.value;
  }

  let items = projects.value.filter(item => {
    const matchCategory = filters.category === ALL_PROJECTS || item.category === filters.category;
    const matchRemoteStatus = filters.remoteStatus === ALL_REMOTE_STATUS || item.remoteStatus === filters.remoteStatus;
    const matchQuick =
      !filters.quick ||
      (filters.quick === "recommended" && item.recommended) ||
      (filters.quick === "deployed" && item.status === "已部署") ||
      (filters.quick === "using" && item.status === "正在使用") ||
      (filters.quick === "research" && item.status === "待研究");

    const kw = (filters.keyword || "").toLowerCase().trim();
    const matchKeyword = !kw ||
      item.name.toLowerCase().includes(kw) ||
      item.author.toLowerCase().includes(kw) ||
      (item.description || "").toLowerCase().includes(kw) ||
      (Array.isArray(item.tags) && item.tags.some(t => t.toLowerCase().includes(kw)));

    return matchCategory && matchRemoteStatus && matchQuick && matchKeyword;
  });

  const sort = filters.sort || "starred-desc";
  items = [...items].sort((a, b) => {
    if (sort === "stars-desc") return (b.stars || 0) - (a.stars || 0);
    if (sort === "stars-asc") return (a.stars || 0) - (b.stars || 0);
    if (sort === "name-asc") return (a.name || "").localeCompare(b.name || "");
    if (sort === "name-desc") return (b.name || "").localeCompare(a.name || "");
    if (sort === "updated-desc") return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    if (sort === "updated-asc") return (a.updatedAt || "").localeCompare(b.updatedAt || "");
    if (sort === "starred-desc") return (b.starredAt || "").localeCompare(a.starredAt || "");
    if (sort === "starred-asc") return (a.starredAt || "").localeCompare(b.starredAt || "");
    return 0;
  });

  return items;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredProjects.value.length / pageSize.value)));
const safeCurrentPage = computed(() => Math.min(currentPage.value, totalPages.value));
const pageStart = computed(() => (filteredProjects.value.length ? (safeCurrentPage.value - 1) * pageSize.value + 1 : 0));
const pageEnd = computed(() => Math.min(safeCurrentPage.value * pageSize.value, filteredProjects.value.length));
const paginatedProjects = computed(() => {
  const start = (safeCurrentPage.value - 1) * pageSize.value;
  return filteredProjects.value.slice(start, start + pageSize.value);
});
const batchAllSelected = computed(() =>
  paginatedProjects.value.length > 0 && paginatedProjects.value.every(item => batchSelectedIds.value.has(item.id))
);
const batchIndeterminate = computed(() => {
  const selectedOnPage = paginatedProjects.value.filter(item => batchSelectedIds.value.has(item.id)).length;
  return selectedOnPage > 0 && selectedOnPage < paginatedProjects.value.length;
});
const batchAllFilteredSelected = computed(() =>
  filteredProjects.value.length > 0 && filteredProjects.value.every(item => batchSelectedIds.value.has(item.id))
);

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
const primarySyncMode = computed(() => {
  if (syncStatusState.value !== "loaded") return null;
  return syncStatus.value.lastStarSyncAt ? "incremental" : "full";
});

const sortOptions = computed(() => [
  { value: "starred-desc", label: uiMessage("Star 时间最新", "Starred (Newest)") },
  { value: "starred-asc", label: uiMessage("Star 时间最早", "Starred (Oldest)") },
  { value: "updated-desc", label: uiMessage("最近更新", "Recently Updated") },
  { value: "updated-asc", label: uiMessage("最早更新", "Least Recently Updated") },
  { value: "stars-desc", label: uiMessage("Stars 从高到低", "Stars (High to Low)") },
  { value: "stars-asc", label: uiMessage("Stars 从低到高", "Stars (Low to High)") },
  { value: "name-asc", label: uiMessage("名称 A-Z", "Name A-Z") },
  { value: "name-desc", label: uiMessage("名称 Z-A", "Name Z-A") }
]);
const primarySyncLabel = computed(() => {
  if (syncStatusState.value === "loading") return t("sync.statusLoading");
  if (syncStatusState.value !== "loaded") return t("sync.statusUnavailableShort");
  return primarySyncMode.value === "incremental" ? t("signedIn.syncNew") : t("signedIn.syncInitial");
});
const aiButtonLabel = computed(() => aiPendingCount.value > 0 ? t("signedIn.aiButtonPending", { count: aiPendingCount.value }) : t("signedIn.aiButtonRerun"));

const aiSummaryText = computed(() => {
  if (!isAuthenticated.value) {
    return "";
  }

  if (aiConfigState.value === "loading") return t("sync.aiConfigLoading");
  if (aiConfigState.value === "error") return t("sync.aiConfigError");
  if (aiConfigState.value === "unavailable") return t("sync.aiConfigUnavailable");
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

  if (syncStatusState.value === "loading") return t("sync.statusLoading");
  if (syncStatusState.value === "error") return t("sync.statusError");
  if (syncStatusState.value === "unavailable") return t("sync.statusUnavailable");
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
  const requestGeneration = ++metaRequestGeneration;
  const requestAuthEpoch = authEpoch;
  const requestWasAuthenticated = isAuthenticated.value;
  const meta = await getMeta();
  if (requestGeneration !== metaRequestGeneration ||
      requestAuthEpoch !== authEpoch ||
      requestWasAuthenticated !== isAuthenticated.value) return;
  categories.value = meta.categories || [];
  statusOptions.value = meta.statusOptions || [];
  categoryCounts.value = meta.categoryCounts || {};
}

async function loadCategories() {
  const requestGeneration = ++categoriesRequestGeneration;
  const requestAuthEpoch = authEpoch;
  try {
    const data = await getManagedCategories();
    if (requestGeneration !== categoriesRequestGeneration ||
        requestAuthEpoch !== authEpoch ||
        !isAuthenticated.value) return;
    categoryList.value = data.categories || [];
  } catch {
    if (requestGeneration !== categoriesRequestGeneration ||
        requestAuthEpoch !== authEpoch) return;
    categoryList.value = [];
  }
}

function refreshStats() {
  stats.value = [
    { label: t("stats.total"), value: projects.value.length },
    { label: t("stats.recommended"), value: projects.value.filter(item => item.recommended).length },
    { label: t("stats.review"), value: projects.value.filter(item => item.category === UNCATEGORIZED).length },
    { label: t("stats.remoteIssues"), value: projects.value.filter(item => item.remoteStatus && item.remoteStatus !== "active").length }
  ];
}

async function settleRefreshes(...tasks) {
  const results = await Promise.allSettled(tasks.map(task => task()));
  return results.some(result => result.status === "rejected");
}

function appendRefreshFailure(message) {
  return `${message} ${t("sync.refreshFailed")}`.trim();
}

function mergeProjectsWithNewerLocalChanges(incoming, revisionsAtRequest) {
  const currentById = new Map(projects.value.map(item => [item.id, item]));
  const incomingIds = new Set(incoming.map(item => item.id));
  const merged = [];
  incoming.forEach(item => {
    const requestRevision = revisionsAtRequest.get(item.id) || 0;
    const currentRevision = projectRevisions.get(item.id) || 0;
    if (currentRevision !== requestRevision) {
      if (currentById.has(item.id)) merged.push(currentById.get(item.id));
      return;
    }
    merged.push(item);
  });

  for (const [id, current] of currentById) {
    const requestRevision = revisionsAtRequest.get(id) || 0;
    const currentRevision = projectRevisions.get(id) || 0;
    if (!incomingIds.has(id) && currentRevision !== requestRevision) {
      merged.push(current);
    }
  }
  return merged;
}

async function loadProjects(options = {}) {
  const requestGeneration = ++projectsRequestGeneration;
  const requestAuthEpoch = authEpoch;
  const requestWasAuthenticated = isAuthenticated.value;
  const revisionsAtRequest = options.revisionsAtRequest
    ? new Map(options.revisionsAtRequest)
    : new Map(projectRevisions);
  let nextProjects;
  let nextStats = null;

  if (requestWasAuthenticated) {
    const result = await getMyProjects();
    nextProjects = result.items || [];
  } else {
    const result = await getProjects({
      category: filters.category,
      keyword: filters.keyword,
      status: filters.status,
      language: filters.language,
      quick: filters.quick,
      sort: filters.sort
    });
    nextProjects = result.items || [];
    nextStats = result.stats || [];
  }

  if (requestGeneration !== projectsRequestGeneration ||
      requestAuthEpoch !== authEpoch ||
      requestWasAuthenticated !== isAuthenticated.value) return;

  projects.value = mergeProjectsWithNewerLocalChanges(nextProjects, revisionsAtRequest);
  if (requestWasAuthenticated) {
    refreshStats();
  } else {
    stats.value = nextStats;
  }

  if (!selectedProjectId.value && projects.value.length) {
    selectedProjectId.value = projects.value[0].id;
  }

  const projectIds = new Set(projects.value.map(item => item.id));
  batchSelectedIds.value = new Set([...batchSelectedIds.value].filter(id => projectIds.has(id)));
}

async function loadCurrentUser() {
  const requestAuthEpoch = authEpoch;
  const result = await getCurrentUser();
  if (requestAuthEpoch !== authEpoch) return;
  currentUser.value = result?.user || null;
  authResolved.value = true;
}

async function loadAiConfig() {
  const requestGeneration = ++aiConfigRequestGeneration;
  const requestAuthEpoch = authEpoch;
  if (!isAuthenticated.value) {
    aiClassificationConfig.value = { enabled: false, model: "", maxPerRun: 25, includeReadme: false };
    aiConfigState.value = "unavailable";
    return;
  }

  aiConfigState.value = "loading";
  try {
    const config = await getAiClassificationConfig();
    if (requestGeneration !== aiConfigRequestGeneration ||
        requestAuthEpoch !== authEpoch ||
        !isAuthenticated.value) return;
    aiClassificationConfig.value = config;
    aiConfigState.value = "loaded";
  } catch (error) {
    if (requestGeneration !== aiConfigRequestGeneration || requestAuthEpoch !== authEpoch) return;
    aiConfigState.value = "error";
    throw error;
  }
}

async function retryAiConfig() {
  try {
    await loadAiConfig();
  } catch {
    // The explicit error state remains visible and retryable.
  }
}

async function loadSyncStatus() {
  const requestGeneration = ++syncStatusRequestGeneration;
  const requestAuthEpoch = authEpoch;
  if (!isAuthenticated.value) {
    syncStatus.value = { lastStarSyncAt: null, recentRuns: [] };
    syncStatusState.value = "unavailable";
    return;
  }

  syncStatusState.value = "loading";
  try {
    const result = await getMySyncStatus();
    if (requestGeneration !== syncStatusRequestGeneration ||
        requestAuthEpoch !== authEpoch ||
        !isAuthenticated.value) return;
    syncStatus.value = result;
    syncStatusState.value = "loaded";
  } catch (error) {
    if (requestGeneration !== syncStatusRequestGeneration || requestAuthEpoch !== authEpoch) return;
    syncStatusState.value = "error";
    throw error;
  }
}

async function retrySyncStatus() {
  try {
    await loadSyncStatus();
  } catch {
    // The explicit error state remains visible and retryable.
  }
}

async function openDetail(id) {
  const requestGeneration = ++detailRequestGeneration;
  const requestAuthEpoch = authEpoch;
  detailLoadError.value = null;
  try {
    const project = await getProject(id);
    if (requestGeneration !== detailRequestGeneration || requestAuthEpoch !== authEpoch) return;
    activeProject.value = project;
    drawerOpen.value = true;
  } catch {
    if (requestGeneration !== detailRequestGeneration ||
        requestAuthEpoch !== authEpoch ||
        !isAuthenticated.value) return;
    detailLoadError.value = { id };
  }
}

function retryDetailLoad() {
  const projectId = detailLoadError.value?.id;
  if (projectId) void openDetail(projectId);
}

function closeDetail() {
  detailRequestGeneration += 1;
  detailLoadError.value = null;
  drawerOpen.value = false;
  activeProject.value = null;
}

async function refreshActiveProject() {
  const projectId = activeProject.value?.id;
  if (!drawerOpen.value || !projectId) return;
  const requestGeneration = ++detailRequestGeneration;
  const requestAuthEpoch = authEpoch;
  try {
    const project = await getProject(projectId);
    if (requestGeneration !== detailRequestGeneration ||
        requestAuthEpoch !== authEpoch ||
        !drawerOpen.value ||
        activeProject.value?.id !== projectId) return;
    activeProject.value = project;
  } catch {
    if (requestGeneration !== detailRequestGeneration ||
        requestAuthEpoch !== authEpoch ||
        !drawerOpen.value ||
        activeProject.value?.id !== projectId) return;
    detailLoadError.value = { id: projectId };
  }
}

function handleDrawerSaved(updated) {
  if (!isAuthenticated.value) return;
  replaceProjectInState(updated);
  if (activeProject.value?.id === updated.id) {
    detailRequestGeneration += 1;
    activeProject.value = updated;
  }
  syncMessage.value = t("drawer.saveSuccess");
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
  draftBaseline.value = {
    ...draft,
    features: featuresText.value,
    tags: tagsText.value
  };
}

function isCurrentAuthenticatedEpoch(requestAuthEpoch) {
  return requestAuthEpoch === authEpoch && isAuthenticated.value;
}

function replaceProjectInState(updated) {
  if (!isAuthenticated.value) return;
  projectStateRevision += 1;
  projectRevisions.set(updated.id, projectStateRevision);
  const existing = projects.value.some(item => item.id === updated.id);
  projects.value = existing
    ? projects.value.map(item => (item.id === updated.id ? updated : item))
    : [...projects.value, updated];

  if (selectedProjectId.value === updated.id) {
    syncDraft(updated);
  }

  if (drawerOpen.value && activeProject.value?.id === updated.id) {
    activeProject.value = {
      ...activeProject.value,
      ...updated
    };
  }

  refreshStats();
}

function removeProjectFromState(projectId) {
  if (!isAuthenticated.value) return;
  projectStateRevision += 1;
  projectRevisions.set(projectId, projectStateRevision);
  projects.value = projects.value.filter(item => item.id !== projectId);
  if (selectedProjectId.value === projectId) {
    selectedProjectId.value = null;
    syncDraft(null);
  }
  if (drawerOpen.value && activeProject.value?.id === projectId) {
    detailRequestGeneration += 1;
    drawerOpen.value = false;
    activeProject.value = null;
  }
  refreshStats();
}

function resetDraft() {
  syncDraft(selectedProject.value);
}

function openAdmin() {
  if (!isAuthenticated.value) {
    return;
  }
  adminMode.value = true;
  adminMessage.value = "";
  importMessage.value = "";
  syncDraft(selectedProject.value);
  loadCategories();
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
  if (adminSaving.value) return;
  previousSelectedProjectId.value = selectedProjectId.value;
  selectedProjectId.value = null;
  adminMessage.value = "";
  importMessage.value = "";
  syncDraft(null);
}

function cancelCreateProject() {
  if (adminSaving.value) return;
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
  if (adminSaving.value) return;
  selectedProjectId.value = id;
  previousSelectedProjectId.value = id;
  adminMessage.value = "";
  const project = projects.value.find(item => item.id === id);
  syncDraft(project);
}

async function saveProject() {
  if (adminSaving.value) return;
  adminSaving.value = true;
  const draftSnapshot = {
    ...draft,
    features: featuresText.value,
    tags: tagsText.value
  };

  let savedProject;
  let mutationToken = null;
  let updatedProjectId = null;
  const mutationAuthEpoch = authEpoch;
  const revisionsBeforeMutation = new Map(projectRevisions);
  try {
    if (selectedProjectId.value) {
      updatedProjectId = selectedProjectId.value;
      if (batchOperationBusy.value || isProjectMutationBusy(updatedProjectId)) {
        adminSaving.value = false;
        return;
      }
      if (!projects.value.some(item => item.id === updatedProjectId)) {
        adminSaving.value = false;
        return;
      }
      const payload = {};
      Object.entries(draftSnapshot).forEach(([field, value]) => {
        if (value !== draftBaseline.value[field]) payload[field] = value;
      });
      const queued = queueProjectUpdate(updatedProjectId, payload);
      mutationToken = queued.token;
      savedProject = await queued.promise;
      if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch) ||
          !isLatestProjectMutation(updatedProjectId, mutationToken)) {
        adminSaving.value = false;
        return;
      }
      adminMessage.value = uiMessage(`已更新：${savedProject.name}`, `Updated: ${savedProject.name}`);
    } else {
      savedProject = await createProject(draftSnapshot);
      if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) {
        adminSaving.value = false;
        return;
      }
      selectedProjectId.value = savedProject.id;
      previousSelectedProjectId.value = savedProject.id;
      adminMessage.value = uiMessage(`已创建：${savedProject.name}`, `Created: ${savedProject.name}`);
    }
  } catch (error) {
    adminSaving.value = false;
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    adminMessage.value = error.message || uiMessage("保存失败", "Save failed");
    return;
  }

  replaceProjectInState(savedProject);
  const refreshFailed = await settleRefreshes(
    loadMeta,
    () => loadProjects({ revisionsAtRequest: revisionsBeforeMutation })
  );
  if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) {
    adminSaving.value = false;
    return;
  }
  const selected = projects.value.find(item => item.id === selectedProjectId.value);
  if (selected) syncDraft(selected);
  if (refreshFailed) {
    adminMessage.value = appendRefreshFailure(adminMessage.value);
  }
  adminSaving.value = false;
}

async function removeProject(id) {
  if (adminSaving.value) return;
  const payload = typeof id === "object" && id !== null ? id : { id, unstarOnGithub: false };
  const mutationAuthEpoch = authEpoch;
  const revisionsBeforeMutation = new Map(projectRevisions);
  if (batchOperationBusy.value || isProjectMutationBusy(payload.id)) return;

  try {
    const queued = queueProjectDelete(payload.id, {
      unstarOnGithub: payload.unstarOnGithub
    });
    const result = await queued.promise;
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch) ||
        !isLatestProjectMutation(payload.id, queued.token)) return;

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
    removeProjectFromState(payload.id);
    const refreshResults = await Promise.allSettled([
      loadMeta(),
      loadProjects({ revisionsAtRequest: revisionsBeforeMutation })
    ]);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshResults.some(item => item.status === "rejected")) {
      adminMessage.value = `${adminMessage.value} ${t("sync.refreshFailed")}`;
    }
    syncDraft(null);
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    adminMessage.value = error.message || uiMessage("删除失败", "Delete failed");
  }
}

async function runGithubImport() {
  if (!importRepo.value.trim()) {
    importMessage.value = uiMessage("必须填写仓库地址。", "Repository input is required.");
    return;
  }

  importMessage.value = uiMessage("正在导入仓库...", "Importing repository...");
  const mutationAuthEpoch = authEpoch;
  const revisionsBeforeMutation = new Map(projectRevisions);

  try {
    const result = await importGithubRepo({ repo: importRepo.value });
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    importMessage.value = uiMessage(`已导入：${result.project.name}`, `Imported: ${result.project.name}`);
    selectedProjectId.value = result.project.id;
    previousSelectedProjectId.value = result.project.id;
    replaceProjectInState(result.project);
    const refreshFailed = await settleRefreshes(
      loadMeta,
      () => loadProjects({ revisionsAtRequest: revisionsBeforeMutation })
    );
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    const selected = projects.value.find(item => item.id === result.project.id);
    if (selected) syncDraft(selected);
    if (refreshFailed) {
      importMessage.value = appendRefreshFailure(importMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    importMessage.value = error.message || uiMessage("导入失败", "Import failed");
  }
}

async function quickCategorizeProject({ id, category }) {
  const project = projects.value.find(item => item.id === id);
  if (!project || !category || !beginBatchOperation([id])) {
    return;
  }

  triageSavingId.value = id;
  const mutationAuthEpoch = authEpoch;

  try {
    const queued = queueProjectUpdate(id, { category });
    const updated = await queued.promise;
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch) ||
        !isLatestProjectMutation(id, queued.token)) return;
    replaceProjectInState(updated);
    syncMessage.value = t("triage.savedCategory", { category: translateCategory(category) });
    const refreshFailed = await settleRefreshes(loadMeta);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshFailed) {
      syncMessage.value = appendRefreshFailure(syncMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = error.message || t("triage.saveFailed");
  } finally {
    triageSavingId.value = null;
    endBatchOperation();
  }
}

function toggleSelectAll() {
  if (batchOperationBusy.value) return;
  const next = new Set(batchSelectedIds.value);
  const currentPageIds = paginatedProjects.value.map(item => item.id);
  if (batchAllSelected.value) {
    currentPageIds.forEach(id => next.delete(id));
  } else {
    currentPageIds.forEach(id => next.add(id));
  }
  batchSelectedIds.value = next;
}

function toggleSelectAllFiltered() {
  if (batchOperationBusy.value) return;
  const next = new Set(batchSelectedIds.value);
  const filteredIds = filteredProjects.value.map(item => item.id);
  if (batchAllFilteredSelected.value) {
    filteredIds.forEach(id => next.delete(id));
  } else {
    filteredIds.forEach(id => next.add(id));
  }
  batchSelectedIds.value = next;
}

function handleBatchSelectionUpdate(nextSelectedIds) {
  if (batchOperationBusy.value) return;
  batchSelectedIds.value = nextSelectedIds;
}

async function runBatchUpdate(overrides) {
  const ids = [...batchSelectedIds.value];
  if (!ids.length) return;
  const batchWorkerLimit = beginBatchOperation(ids);
  if (!batchWorkerLimit) return;

  batchSaving.value = true;
  syncMessage.value = "";
  const mutationAuthEpoch = authEpoch;
  const revisionsBeforeBatch = new Map(projectRevisions);

  const targets = ids
    .map(id => ({ id, project: projects.value.find(item => item.id === id) }))
    .filter(target => target.project);
  const skipped = ids.length - targets.length;
  const releaseReservations = reserveProjectMutations(targets.map(target => target.id));

  try {
    const results = await runBatchWorkers(
      targets,
      target => {
        const queued = queueProjectUpdate(target.id, overrides);
        return queued.promise.then(project => ({ project, token: queued.token }));
      },
      () => isCurrentAuthenticatedEpoch(mutationAuthEpoch),
      batchWorkerLimit
    );
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    const failedIds = [];
    let success = 0;
    results.forEach((result, index) => {
      if (result.ok) {
        if (isLatestProjectMutation(targets[index].id, result.value.token)) {
          success += 1;
          replaceProjectInState(result.value.project);
        } else {
          failedIds.push(targets[index].id);
        }
      } else {
        failedIds.push(targets[index].id);
      }
    });

    batchSelectedIds.value = new Set(failedIds);
    syncMessage.value = t("triage.batchResult", {
      success,
      failed: failedIds.length,
      skipped
    });
  } finally {
    if (isCurrentAuthenticatedEpoch(mutationAuthEpoch)) {
      const refreshResults = await Promise.allSettled([
        loadMeta(),
        loadProjects({ revisionsAtRequest: revisionsBeforeBatch })
      ]);
      if (isCurrentAuthenticatedEpoch(mutationAuthEpoch) &&
          refreshResults.some(result => result.status === "rejected")) {
        syncMessage.value = `${syncMessage.value} ${t("sync.refreshFailed")}`;
      }
    }
    batchSaving.value = false;
    releaseReservations();
    endBatchOperation();
  }
}

const BATCH_WORKER_COUNT = 4;

function beginBatchOperation(projectIds = []) {
  const availableWorkerSlots = BATCH_WORKER_COUNT - busyProjectIds.size;
  if (batchOperationBusy.value || hasBusyProjectMutations(projectIds) || availableWorkerSlots <= 0) return 0;
  batchOperationBusy.value = true;
  return availableWorkerSlots;
}

function endBatchOperation() {
  batchOperationBusy.value = false;
}

async function runBatchWorkers(
  targets,
  mutateTarget,
  shouldContinue = () => true,
  workerLimit = BATCH_WORKER_COUNT
) {
  const results = new Array(targets.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < targets.length && shouldContinue()) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { ok: true, value: await mutateTarget(targets[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  const workerCount = Math.min(workerLimit, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function batchCategorize(category) {
  return runBatchUpdate({ category });
}

function batchMarkResearch() {
  return runBatchUpdate({ status: "待研究" });
}

async function markProjectResearch(id) {
  const project = projects.value.find(item => item.id === id);
  if (!project || !beginBatchOperation([id])) {
    return;
  }

  triageSavingId.value = id;
  const mutationAuthEpoch = authEpoch;

  try {
    const queued = queueProjectUpdate(id, { status: "待研究" });
    const updated = await queued.promise;
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch) ||
        !isLatestProjectMutation(id, queued.token)) return;
    replaceProjectInState(updated);
    syncMessage.value = t("triage.savedResearch");
    const refreshFailed = await settleRefreshes(loadMeta);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshFailed) {
      syncMessage.value = appendRefreshFailure(syncMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = error.message || t("triage.saveFailed");
  } finally {
    triageSavingId.value = null;
    endBatchOperation();
  }
}

async function runStarSync(mode = null) {
  if (!mode && syncStatusState.value !== "loaded") {
    return;
  }
  const selectedMode = mode || primarySyncMode.value;
  const resolvedMode = selectedMode === "full" ? "full" : "incremental";
  syncMessage.value = resolvedMode === "incremental" ? t("sync.syncingNew") : t("sync.syncingFull");
  syncing.value = true;
  const mutationAuthEpoch = authEpoch;

  try {
    const result = await syncGithubStars({ mode: resolvedMode });
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = result.mode === "incremental"
      ? t("sync.incrementalDone", { total: result.total })
      : t("sync.fullDone", { total: result.total });
    const refreshFailed = await settleRefreshes(loadSyncStatus, loadMeta, loadProjects);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshFailed) {
      syncMessage.value = appendRefreshFailure(syncMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
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
  const mutationAuthEpoch = authEpoch;

  try {
    const result = await runAiClassification({ force: false });
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = t("sync.aiDone", { updated: result.updated, skipped: result.skipped });
    const refreshFailed = await settleRefreshes(loadProjects, refreshActiveProject);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshFailed) {
      syncMessage.value = appendRefreshFailure(syncMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = error.message || uiMessage("AI 分类失败", "AI classification failed");
  } finally {
    classifyingAi.value = false;
  }
}

async function runRuleReclassification() {
  syncMessage.value = t("sync.rerunRules");
  reclassifyingRules.value = true;
  const mutationAuthEpoch = authEpoch;

  try {
    const result = await rerunRuleClassification();
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = t("sync.rerunRulesDone", { total: result.total, updated: result.updated });
    const refreshFailed = await settleRefreshes(loadMeta, loadProjects, refreshActiveProject);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshFailed) {
      syncMessage.value = appendRefreshFailure(syncMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = error.message || uiMessage("规则重分类失败", "Rule reclassification failed");
  } finally {
    reclassifyingRules.value = false;
  }
}

async function recheckVisibleRemoteIssues() {
  recheckingRemote.value = true;
  syncMessage.value = t("remoteOps.copy", { count: filteredProjects.value.length });
  const mutationAuthEpoch = authEpoch;

  try {
    const result = await recheckRemoteStatus({
      projectIds: filteredProjects.value.map(item => item.id)
    });
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = t("sync.remoteRecheckDone", { updated: result.updated });
    const refreshFailed = await settleRefreshes(loadProjects, refreshActiveProject);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshFailed) {
      syncMessage.value = appendRefreshFailure(syncMessage.value);
    }
  } catch (error) {
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    syncMessage.value = error.message || uiMessage("远端状态检查失败", "Remote status recheck failed");
  } finally {
    recheckingRemote.value = false;
  }
}

async function removeVisibleProjects() {
  const count = filteredProjects.value.length;
  const targetIds = filteredProjects.value.map(item => item.id);
  if (!count || batchOperationBusy.value || hasBusyProjectMutations(targetIds)) {
    return;
  }

  const shouldRemove = window.confirm(t("sync.batchRemoveConfirm", { count }));
  if (!shouldRemove) {
    return;
  }
  const batchWorkerLimit = beginBatchOperation(targetIds);
  if (!batchWorkerLimit) return;

  removingVisible.value = true;
  const mutationAuthEpoch = authEpoch;
  const revisionsBeforeBatch = new Map(projectRevisions);
  const targets = [...filteredProjects.value];
  const releaseReservations = reserveProjectMutations(targets.map(item => item.id));

  try {
    const results = await runBatchWorkers(
      targets,
      item => {
        const queued = queueProjectDelete(item.id, { unstarOnGithub: false });
        return queued.promise.then(value => ({ value, token: queued.token }));
      },
      () => isCurrentAuthenticatedEpoch(mutationAuthEpoch),
      batchWorkerLimit
    );
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    const failedIds = [];
    let success = 0;
    results.forEach((result, index) => {
      const projectId = targets[index].id;
      if (result.ok && isLatestProjectMutation(projectId, result.value.token)) {
        success += 1;
        removeProjectFromState(projectId);
      } else {
        failedIds.push(projectId);
      }
    });
    const failed = failedIds.length;
    batchSelectedIds.value = new Set(failedIds);
    syncMessage.value = t("sync.removedVisibleResult", { success, failed });
    selectedProjectId.value = null;
    const refreshResults = await Promise.allSettled([
      loadMeta(),
      loadProjects({ revisionsAtRequest: revisionsBeforeBatch })
    ]);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    const refreshFailed = refreshResults.some(result => result.status === "rejected");
    if (refreshFailed) {
      syncMessage.value = `${syncMessage.value} ${t("sync.refreshFailed")}`;
    } else if (!filteredProjects.value.length) {
      resetBrowseFilters();
    }
  } finally {
    removingVisible.value = false;
    releaseReservations();
    endBatchOperation();
  }
}

async function retryFailedDeletes() {
  const ids = [...batchSelectedIds.value];
  if (!ids.length) return;
  const batchWorkerLimit = beginBatchOperation(ids);
  if (!batchWorkerLimit) return;

  const targets = ids
    .map(id => projects.value.find(item => item.id === id))
    .filter(Boolean);
  const skipped = ids.length - targets.length;
  removingVisible.value = true;
  const mutationAuthEpoch = authEpoch;
  const revisionsBeforeBatch = new Map(projectRevisions);
  const releaseReservations = reserveProjectMutations(targets.map(item => item.id));

  try {
    const results = await runBatchWorkers(
      targets,
      item => {
        const queued = queueProjectDelete(item.id, { unstarOnGithub: false });
        return queued.promise.then(value => ({ value, token: queued.token }));
      },
      () => isCurrentAuthenticatedEpoch(mutationAuthEpoch),
      batchWorkerLimit
    );
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    const failedIds = [];
    let success = 0;
    results.forEach((result, index) => {
      const projectId = targets[index].id;
      if (result.ok && isLatestProjectMutation(projectId, result.value.token)) {
        success += 1;
        removeProjectFromState(projectId);
      } else {
        failedIds.push(projectId);
      }
    });
    batchSelectedIds.value = new Set(failedIds);
    syncMessage.value = t("sync.removedRetryResult", {
      success,
      failed: failedIds.length,
      skipped
    });

    const refreshResults = await Promise.allSettled([
      loadMeta(),
      loadProjects({ revisionsAtRequest: revisionsBeforeBatch })
    ]);
    if (!isCurrentAuthenticatedEpoch(mutationAuthEpoch)) return;
    if (refreshResults.some(result => result.status === "rejected")) {
      syncMessage.value = `${syncMessage.value} ${t("sync.refreshFailed")}`;
    } else if (!filteredProjects.value.length) {
      resetBrowseFilters();
    }
  } finally {
    removingVisible.value = false;
    releaseReservations();
    endBatchOperation();
  }
}

function loginWithGithub() {
  try {
    window.location.href = getGithubLoginUrl();
  } catch {
    initializationError.value = { stage: "backend" };
  }
}

function clearProjectMetadata() {
  categories.value = [];
  statusOptions.value = [];
  categoryCounts.value = {};
  categoryList.value = [];
}

function clearAuthenticatedUiState() {
  currentUser.value = null;
  projects.value = [];
  stats.value = [];
  clearProjectMetadata();
  syncStatus.value = { lastStarSyncAt: null, recentRuns: [] };
  syncStatusState.value = "unavailable";
  aiConfigState.value = "unavailable";
  detailLoadError.value = null;
  adminMode.value = false;
  adminMessage.value = "";
  importMessage.value = "";
  importRepo.value = "";
  syncMessage.value = "";
  drawerOpen.value = false;
  activeProject.value = null;
  selectedProjectId.value = null;
  previousSelectedProjectId.value = null;
  syncDraft(null);
  triageSavingId.value = null;
  batchSelectedIds.value = new Set();
  batchSaving.value = false;
  batchOperationBusy.value = false;
  syncing.value = false;
  classifyingAi.value = false;
  aiClassificationConfig.value = { enabled: false, model: "", maxPerRun: 25, includeReadme: false };
  reclassifyingRules.value = false;
  recheckingRemote.value = false;
  removingVisible.value = false;
  filters.keyword = "";
  filters.status = ALL_STATUS;
  filters.language = ALL_LANGUAGES;
  filters.sort = "starred-desc";
  showPageSize.value = false;
  resetBrowseFilters();
}

async function handleLogout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  closeMoreActions();
  const logoutAuthEpoch = authEpoch;
  try {
    await logout();
  } catch {
    syncMessage.value = t("signedIn.logoutFailed");
    return;
  } finally {
    loggingOut.value = false;
  }

  if (authEpoch === logoutAuthEpoch) {
    closeMoreActions();
    invalidateAuthenticatedRequests();
    clearAuthenticatedUiState();
  }
}

function clearInvalidatedAuth() {
  closeMoreActions();
  invalidateAuthenticatedRequests();
  clearAuthenticatedUiState();
}

function invalidateAuthenticatedRequests() {
  authEpoch += 1;
  invalidateProjectMutations();
  metaRequestGeneration += 1;
  categoriesRequestGeneration += 1;
  projectsRequestGeneration += 1;
  projectRevisions.clear();
  syncStatusRequestGeneration += 1;
  aiConfigRequestGeneration += 1;
  detailRequestGeneration += 1;
}

const stopAuthInvalidationListener = onAuthInvalidated(clearInvalidatedAuth);
onUnmounted(stopAuthInvalidationListener);

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
    if (!batchOperationBusy.value) batchSelectedIds.value = new Set();
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

let moreActionsDocumentHandler = null;

function cleanupMoreActionsDocumentListener() {
  if (!moreActionsDocumentHandler) return;
  document.removeEventListener("click", moreActionsDocumentHandler, true);
  moreActionsDocumentHandler = null;
}

function closeMoreActions() {
  showMore.value = false;
  cleanupMoreActionsDocumentListener();
}

watch(showMore, (open) => {
  cleanupMoreActionsDocumentListener();
  if (!open) return;

  moreActionsDocumentHandler = (event) => {
    if (moreActionsRef.value && !moreActionsRef.value.contains(event.target)) {
      showMore.value = false;
    }
  };
  document.addEventListener("click", moreActionsDocumentHandler, true);
});

function selectPageSize(size) {
  pageSize.value = size;
  showPageSize.value = false;
}

let pageSizeDocumentHandler = null;

function cleanupPageSizeDocumentListener() {
  if (!pageSizeDocumentHandler) return;
  document.removeEventListener("click", pageSizeDocumentHandler, true);
  pageSizeDocumentHandler = null;
}

watch(showPageSize, (open) => {
  cleanupPageSizeDocumentListener();
  if (!open) return;

  pageSizeDocumentHandler = (event) => {
    if (pageSizeRef.value && !pageSizeRef.value.contains(event.target)) {
      showPageSize.value = false;
    }
  };
  document.addEventListener("click", pageSizeDocumentHandler, true);
});

onBeforeUnmount(() => {
  cleanupMoreActionsDocumentListener();
  cleanupPageSizeDocumentListener();
});

function initializationStage(error, fallbackStage) {
  return error?.code === "NETWORK_ERROR" ? "backend" : fallbackStage;
}

async function initializeApp() {
  loading.value = true;
  authResolved.value = false;
  initializationError.value = null;

  try {
    try {
      await loadCurrentUser();
    } catch (error) {
      initializationError.value = { stage: initializationStage(error, "auth") };
      return;
    }

    const coreAuthEpoch = authEpoch;
    const coreWasAuthenticated = isAuthenticated.value;
    const coreResults = await Promise.allSettled([
      loadMeta(),
      isAuthenticated.value ? loadProjects() : Promise.resolve()
    ]);
    const [metaResult, projectsResult] = coreResults;
    const backendFailure = coreResults.find(
      result => result.status === "rejected" && result.reason?.code === "NETWORK_ERROR"
    );
    if (backendFailure) {
      initializationError.value = { stage: "backend" };
      return;
    }
    if (metaResult.status === "rejected") {
      initializationError.value = { stage: initializationStage(metaResult.reason, "meta") };
      return;
    }
    if (projectsResult.status === "rejected") {
      if (coreWasAuthenticated &&
          (coreAuthEpoch !== authEpoch || !isAuthenticated.value)) {
        return;
      }
      initializationError.value = { stage: initializationStage(projectsResult.reason, "projects") };
      return;
    }

    const optionalTasks = [loadAiConfig()];
    if (isAuthenticated.value) optionalTasks.push(loadSyncStatus());
    // Optional status/config requests keep their own visible states and must not block the core UI.
    void Promise.allSettled(optionalTasks);
  } finally {
    loading.value = false;
  }
}

onMounted(initializeApp);
</script>
