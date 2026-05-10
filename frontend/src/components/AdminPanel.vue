<template>
  <section class="admin-panel">
    <div class="admin-head">
      <div>
        <div class="eyebrow">{{ t("admin.eyebrow") }}</div>
        <h2>{{ t("admin.title") }}</h2>
        <p>{{ t("admin.subtitle") }}</p>
      </div>
      <button class="ghost-button" type="button" @click="$emit('close')">{{ t("admin.back") }}</button>
    </div>

    <div class="admin-import">
      <div>
        <h3>{{ t("admin.importTitle") }}</h3>
        <p v-html="t('admin.importCopy')"></p>
      </div>
      <div class="admin-import-row">
        <input
          :value="importRepo"
          class="input"
          type="text"
          :placeholder="t('admin.importPlaceholder')"
          @input="$emit('update:import-repo', $event.target.value)"
        />
        <button class="button" type="button" @click="$emit('import-repo')">{{ t("admin.importButton") }}</button>
      </div>
      <p v-if="importMessage" class="admin-message">{{ importMessage }}</p>
    </div>

    <details class="admin-category-management">
      <summary class="admin-category-summary">
        <h3>{{ t("admin.categoryManagement") }}</h3>
      </summary>
      <p class="admin-category-copy">{{ t("admin.categoryManagementCopy") }}</p>

      <div v-if="managedCategories.length" class="admin-category-group">
        <div v-for="cat in managedCategories" :key="cat.id" class="admin-category-row">
          <span class="chip brand">{{ cat.name }}</span>
          <div class="admin-category-row-actions">
            <button class="ghost-button" type="button" @click="openRenameModal(cat)">{{ t("admin.renameCategory") }}</button>
            <button class="danger-button-small" type="button" @click="openDeleteCategoryModal(cat)">{{ t("admin.deleteCategory") }}</button>
          </div>
        </div>
      </div>

      <div class="admin-category-add">
        <input
          v-model="newCategoryName"
          class="input"
          type="text"
          :placeholder="t('admin.addCategoryPlaceholder')"
          @keyup.enter="addCategory"
        />
        <button class="button" type="button" :disabled="!newCategoryName.trim()" @click="addCategory">{{ t("admin.addCategory") }}</button>
      </div>
      <p v-if="categoryMessage" class="admin-message">{{ categoryMessage }}</p>
    </details>

    <details class="admin-category-management">
      <summary class="admin-category-summary">
        <h3>{{ t("admin.rulesTitle") }}</h3>
      </summary>
      <p class="admin-category-copy">{{ t("admin.rulesCopy") }}</p>

      <div v-if="rules.length" class="admin-category-group">
        <div v-for="rule in rules" :key="rule.id" class="admin-category-row">
          <div>
            <span class="chip brand">{{ rule.targetCategory }}</span>
            <span class="rule-chip-type">{{ ruleTypeLabel(rule.matchType) }}</span>
            <span class="rule-chip-value">{{ rule.matchValue }}</span>
          </div>
          <div class="admin-category-row-actions">
            <button class="danger-button-small" type="button" @click="deleteRule(rule.id)">{{ t("admin.deleteRule") }}</button>
          </div>
        </div>
      </div>
      <p v-else class="admin-list-meta">{{ t("admin.rulesEmpty") }}</p>

      <div class="rule-form-row">
        <select v-model="ruleForm.matchType" class="select rule-form-select">
          <option value="topic">Topic</option>
          <option value="keyword">Keyword</option>
          <option value="language">Language</option>
        </select>
        <input
          v-model="ruleForm.matchValue"
          class="input"
          type="text"
          :placeholder="t('admin.ruleValuePlaceholder')"
        />
        <input
          v-model="ruleForm.targetCategory"
          class="input"
          type="text"
          :placeholder="t('admin.ruleCategoryPlaceholder')"
          list="rule-category-options"
        />
        <datalist id="rule-category-options">
          <option v-for="cat in categoryOptions" :key="cat" :value="cat" />
        </datalist>
        <button
          class="button"
          type="button"
          :disabled="!ruleForm.matchValue.trim() || !ruleForm.targetCategory.trim()"
          @click="addRule"
        >
          {{ t("admin.addRule") }}
        </button>
      </div>
      <p v-if="ruleMessage" class="admin-message">{{ ruleMessage }}</p>
    </details>

    <details class="admin-category-management">
      <summary class="admin-category-summary">
        <h3>{{ t("admin.autoSync") }}</h3>
      </summary>
      <p class="admin-category-copy">{{ t("admin.autoSyncCopy") }}</p>

      <div class="auto-sync-form">
        <div class="auto-sync-field">
          <span class="auto-sync-label">{{ t("admin.autoSync") }}</span>
          <div class="switch-row">
            <span class="switch-status" :class="{ active: autoSyncEnabled }">
              {{ autoSyncEnabled ? (autoSyncNextRun ? t("admin.autoSyncNextRun", { time: autoSyncNextRun }) : t("admin.autoSyncEnabled")) : t("admin.autoSyncDisabled") }}
            </span>
            <label class="switch-toggle">
              <input v-model="autoSyncEnabled" type="checkbox" />
              <span class="switch-toggle-ui" aria-hidden="true"></span>
            </label>
          </div>
        </div>

        <label class="auto-sync-field">
          <span class="auto-sync-label">{{ t("admin.autoSyncMode") }}</span>
          <select v-model="autoSyncMode" class="select">
            <option value="incremental">{{ t("admin.autoSyncIncremental") }}</option>
            <option value="full">{{ t("admin.autoSyncFull") }}</option>
          </select>
        </label>

        <label class="auto-sync-field">
          <span class="auto-sync-label">{{ t("admin.autoSyncInterval") }}</span>
          <select v-model="autoSyncInterval" class="select">
            <option :value="1">{{ t("admin.autoSyncInterval_1") }}</option>
            <option :value="3">{{ t("admin.autoSyncInterval_3") }}</option>
            <option :value="6">{{ t("admin.autoSyncInterval_6") }}</option>
            <option :value="12">{{ t("admin.autoSyncInterval_12") }}</option>
            <option :value="24">{{ t("admin.autoSyncInterval_24") }}</option>
            <option :value="48">{{ t("admin.autoSyncInterval_48") }}</option>
            <option :value="168">{{ t("admin.autoSyncInterval_168") }}</option>
          </select>
        </label>

        <div class="auto-sync-actions">
          <button class="button auto-sync-save" type="button" :disabled="autoSyncSaving" @click="saveAutoSync">
            {{ autoSyncSaving ? t("common.loadingShort") : t("admin.save") }}
          </button>
          <transition name="toast-fade">
            <span v-if="autoSyncMessage" class="auto-sync-toast">{{ autoSyncMessage }}</span>
          </transition>
        </div>
      </div>
    </details>

    <div class="admin-layout">
      <aside class="admin-list">
        <div class="admin-list-head">
          <h3>{{ t("admin.listTitle") }}</h3>
          <button class="button" type="button" @click="$emit('create')">{{ t("admin.newProject") }}</button>
        </div>

        <div class="admin-filter-row">
          <label class="admin-filter-field">
            <span>{{ t("admin.category") }}</span>
            <select v-model="adminCategoryFilter" class="select">
              <option value="all">{{ t("admin.allCategories") }}</option>
              <option v-for="category in categoryOptions" :key="category" :value="category">{{ translateCategory(category) }}</option>
            </select>
          </label>
          <p class="admin-list-meta">{{ t("admin.showing", { visible: filteredProjects.length, total: projects.length }) }}</p>
        </div>

        <button
          v-for="item in filteredProjects"
          :key="item.id"
          class="admin-list-item"
          :class="{ active: selectedProject && selectedProject.id === item.id }"
          type="button"
          @click="$emit('select', item.id)"
        >
          <strong>{{ item.name }}</strong>
          <span>{{ translateCategory(item.category) }} / {{ translateStatus(item.status) }}</span>
        </button>

        <EmptyState v-if="!filteredProjects.length" icon="folder">
          <template #title>{{ t("admin.emptyList") }}</template>
        </EmptyState>
      </aside>

      <Transition name="admin-editor" mode="out-in">
        <div :key="editorKey" class="admin-editor">
          <div class="admin-editor-head">
            <h3>{{ isCreateMode ? t("admin.createProject") : t("admin.editProject") }}</h3>
            <button
              v-if="isCreateMode"
              class="ghost-button"
              type="button"
              @click="$emit('cancel-create')"
            >
              {{ cancelCreateLabel }}
            </button>
            <button
              v-if="!isCreateMode && selectedProject"
              class="danger-button"
              type="button"
              @click="openDeleteModal"
            >
              {{ t("admin.deleteProject") }}
            </button>
          </div>

          <form class="admin-form" @submit.prevent="$emit('save')">
            <div v-if="selectedProject && selectedProject.aiCategory" class="full admin-message">
              {{ t("admin.aiCategory") }}: {{ selectedProject.aiCategory }}
              <span v-if="selectedProject.aiConfidence !== null && selectedProject.aiConfidence !== undefined">
                ({{ Math.round(selectedProject.aiConfidence * 100) }}%)
              </span>
              <br />
              {{ selectedProject.aiReason }}
            </div>
            <label>
              <span>{{ t("admin.fields.name") }}</span>
              <input v-model="draft.name" class="input" type="text" />
            </label>
            <label>
              <span>{{ t("admin.fields.author") }}</span>
              <input v-model="draft.author" class="input" type="text" />
            </label>
            <label>
              <span>{{ t("admin.category") }}</span>
              <input
                v-model="draft.category"
                class="input"
                type="text"
                list="admin-category-options"
              />
              <small class="field-help">{{ categoryFieldHelp }}</small>
              <datalist id="admin-category-options">
                <option v-for="category in categoryOptions" :key="category" :value="category" />
              </datalist>
            </label>
            <label>
              <span>{{ t("admin.fields.status") }}</span>
              <select v-model="draft.status" class="select">
                <option v-for="status in statusOptions" :key="status" :value="status">{{ translateStatus(status) }}</option>
              </select>
            </label>
            <label>
              <span>{{ t("admin.fields.language") }}</span>
              <input v-model="draft.language" class="input" type="text" />
            </label>
            <label>
              <span>{{ t("admin.fields.stars") }}</span>
              <input v-model.number="draft.stars" class="input" type="number" min="0" />
            </label>
            <label>
              <span>{{ t("admin.fields.updatedAt") }}</span>
              <input v-model="draft.updatedAt" class="input" type="date" />
            </label>
            <label class="full">
              <span>{{ t("admin.fields.description") }}</span>
              <textarea v-model="draft.description" class="textarea"></textarea>
            </label>
            <label class="full">
              <span>{{ t("admin.fields.highlights") }}</span>
              <textarea :value="featuresText" class="textarea" @input="$emit('update:features-text', $event.target.value)"></textarea>
            </label>
            <label class="full">
              <span>{{ t("admin.fields.tags") }}</span>
              <input :value="tagsText" class="input" type="text" @input="$emit('update:tags-text', $event.target.value)" />
            </label>
            <label>
              <span>{{ t("admin.fields.github") }}</span>
              <input v-model="draft.github" class="input" type="url" />
            </label>
            <label>
              <span>{{ t("admin.fields.demo") }}</span>
              <input v-model="draft.demo" class="input" type="url" />
            </label>
            <label>
              <span>{{ t("admin.fields.docs") }}</span>
              <input v-model="draft.docs" class="input" type="url" />
            </label>
            <label class="full">
              <span>{{ t("admin.fields.notes") }}</span>
              <textarea v-model="draft.note" class="textarea"></textarea>
            </label>
            <div class="admin-actions full">
              <button class="button" type="submit">{{ t("admin.save") }}</button>
              <button class="ghost-button" type="button" @click="$emit('reset')">{{ t("admin.reset") }}</button>
            </div>
            <p v-if="message" class="admin-message">{{ message }}</p>
          </form>
        </div>
      </Transition>
    </div>

    <Transition name="admin-modal">
      <div v-if="showDeleteModal" class="modal-mask" @click.self="closeDeleteModal">
        <div class="confirm-modal">
          <div class="eyebrow">{{ t("admin.confirmDelete") }}</div>
          <h3>{{ t("admin.removeLocalTitle") }}</h3>
          <p class="modal-copy">
            {{ t("admin.removeLocalCopy", { name: selectedProject?.name || "" }) }}
          </p>

          <label class="modal-checkbox" :class="{ disabled: !canManageStars }">
            <input
              v-model="unstarOnGithub"
              type="checkbox"
              :disabled="!canManageStars"
            />
            <span>{{ t("admin.unstarCheckbox") }}</span>
          </label>

          <p v-if="!canManageStars" class="modal-note">
            {{ t("admin.permissionNote") }}
          </p>

          <div class="admin-actions">
            <button class="danger-button" type="button" @click="confirmDelete">{{ t("admin.confirmRemove") }}</button>
            <button class="ghost-button" type="button" @click="closeDeleteModal">{{ t("admin.cancel") }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="admin-modal">
      <div v-if="showDeleteCategoryModal" class="modal-mask" @click.self="closeDeleteCategoryModal">
        <div class="confirm-modal">
          <div class="eyebrow">{{ t("admin.deleteCategory") }}</div>
          <h3>{{ t("admin.confirmDeleteCategory", { name: categoryToDelete?.name || "" }) }}</h3>
          <div class="admin-actions">
            <button class="danger-button" type="button" @click="confirmDeleteCategory">{{ t("admin.confirmRemove") }}</button>
            <button class="ghost-button" type="button" @click="closeDeleteCategoryModal">{{ t("admin.cancel") }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="admin-modal">
      <div v-if="showRenameModal" class="modal-mask" @click.self="closeRenameModal">
        <div class="confirm-modal">
          <div class="eyebrow">{{ t("admin.renameModalTitle") }}</div>
          <label>
            <span>{{ t("admin.renameModalNewName") }}</span>
            <input v-model="renameCategoryName" class="input" type="text" @keyup.enter="confirmRenameCategory" />
          </label>
          <div class="admin-actions">
            <button class="button" type="button" :disabled="!renameCategoryName.trim()" @click="confirmRenameCategory">{{ t("admin.renameCategory") }}</button>
            <button class="ghost-button" type="button" @click="closeRenameModal">{{ t("admin.cancelRename") }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import EmptyState from "./EmptyState.vue";
import { locale, t, translateCategory, translateStatus } from "../i18n";
import {
  getManagedCategories,
  createManagedCategory,
  renameManagedCategory,
  deleteManagedCategory,
  getUserRules,
  createRule as createRuleApi,
  deleteRule as deleteRuleApi,
  getAutoSyncConfig,
  updateAutoSyncConfig
} from "../api/projects.js";

const props = defineProps({
  projects: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  selectedProject: Object,
  draft: Object,
  isCreateMode: Boolean,
  statusOptions: Array,
  featuresText: String,
  tagsText: String,
  message: String,
  importRepo: String,
  importMessage: String,
  canManageStars: Boolean,
  managedCategories: { type: Array, default: () => [] }
});

const emit = defineEmits([
  "close",
  "create",
  "select",
  "save",
  "delete",
  "cancel-create",
  "reset",
  "import-repo",
  "update:features-text",
  "update:tags-text",
  "update:import-repo",
  "refresh-categories"
]);

const ADMIN_ALL_CATEGORIES = "all";

const showDeleteModal = ref(false);
const unstarOnGithub = ref(false);
const adminCategoryFilter = ref(ADMIN_ALL_CATEGORIES);

const newCategoryName = ref("");
const categoryMessage = ref("");
const showDeleteCategoryModal = ref(false);
const categoryToDelete = ref(null);
const showRenameModal = ref(false);
const categoryToRename = ref(null);
const renameCategoryName = ref("");

const rules = ref([]);
const ruleMessage = ref("");
const ruleForm = ref({
  matchType: "keyword",
  matchValue: "",
  targetCategory: ""
});

const autoSyncEnabled = ref(false);
const autoSyncMode = ref("incremental");
const autoSyncInterval = ref(24);
const autoSyncNextRun = ref("");
const autoSyncMessage = ref("");
const autoSyncSaving = ref(false);
const autoSyncTimer = ref(null);

async function loadAutoSyncConfig() {
  try {
    const config = await getAutoSyncConfig();
    autoSyncEnabled.value = config.enabled;
    autoSyncMode.value = config.mode;
    autoSyncInterval.value = config.intervalHours;
    autoSyncNextRun.value = config.nextScheduledAt ? formatAutoSyncTime(config.nextScheduledAt) : "";
  } catch {
    autoSyncEnabled.value = false;
  }
}

function formatAutoSyncTime(isoString) {
  try {
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoString;
  }
}

async function saveAutoSync() {
  if (autoSyncTimer.value) {
    clearTimeout(autoSyncTimer.value);
    autoSyncTimer.value = null;
  }
  autoSyncSaving.value = true;
  autoSyncMessage.value = "";
  try {
    const config = await updateAutoSyncConfig({
      enabled: autoSyncEnabled.value,
      mode: autoSyncMode.value,
      intervalHours: autoSyncInterval.value
    });
    autoSyncNextRun.value = config.nextScheduledAt ? formatAutoSyncTime(config.nextScheduledAt) : "";
    autoSyncMessage.value = t("admin.autoSyncSaved");
    autoSyncTimer.value = setTimeout(() => { autoSyncMessage.value = ""; }, 2000);
  } catch (err) {
    autoSyncMessage.value = err.message || t("admin.autoSyncSaveFailed");
    autoSyncTimer.value = setTimeout(() => { autoSyncMessage.value = ""; }, 3000);
  } finally {
    autoSyncSaving.value = false;
  }
}

async function loadRules() {
  try {
    const data = await getUserRules();
    rules.value = data.rules || [];
  } catch {
    rules.value = [];
  }
}

function ruleTypeLabel(type) {
  if (type === "topic") return "Topic";
  if (type === "keyword") return "Keyword";
  if (type === "language") return "Language";
  return type;
}

async function addRule() {
  const matchValue = ruleForm.value.matchValue.trim();
  const targetCategory = ruleForm.value.targetCategory.trim();
  if (!matchValue || !targetCategory) {
    ruleMessage.value = t("admin.ruleValueRequired");
    return;
  }

  try {
    await createRuleApi({
      matchType: ruleForm.value.matchType,
      matchValue,
      targetCategory,
      priority: 0
    });
    ruleForm.value.matchValue = "";
    ruleForm.value.targetCategory = "";
    ruleMessage.value = "";
    await loadRules();
  } catch (err) {
    ruleMessage.value = err.message || t("admin.ruleAddFailed");
  }
}

async function deleteRule(ruleId) {
  try {
    await deleteRuleApi(ruleId);
    await loadRules();
  } catch (err) {
    ruleMessage.value = err.message || t("admin.ruleDeleteFailed");
  }
}

const editorKey = computed(() => (props.selectedProject?.id ? `project-${props.selectedProject.id}` : "create-project"));
const categoryOptions = computed(() => props.categories.filter(item => item && item !== "全部项目" && item !== "__all_projects__"));
const categoryFieldHelp = computed(() =>
  locale.value === "zh-CN"
    ? "可直接输入自定义分类，也可以从现有分类中选择。"
    : "Type a custom category directly or pick one of the existing categories."
);

const cancelCreateLabel = computed(() =>
  locale.value === "zh-CN" ? "退出新建" : "Exit Create Mode"
);

const filteredProjects = computed(() => {
  if (adminCategoryFilter.value === ADMIN_ALL_CATEGORIES) {
    return props.projects;
  }

  return props.projects.filter(item => item.category === adminCategoryFilter.value);
});

watch(
  () => props.selectedProject,
  value => {
    if (!value) {
      return;
    }

    const stillVisible = filteredProjects.value.some(item => item.id === value.id);
    if (!stillVisible) {
      adminCategoryFilter.value = ADMIN_ALL_CATEGORIES;
    }
  }
);

function openDeleteModal() {
  unstarOnGithub.value = false;
  showDeleteModal.value = true;
}

function closeDeleteModal() {
  showDeleteModal.value = false;
}

function confirmDelete() {
  if (!props.selectedProject) {
    return;
  }

  emit("delete", {
    id: props.selectedProject.id,
    unstarOnGithub: Boolean(unstarOnGithub.value && props.canManageStars)
  });
  closeDeleteModal();
}

async function addCategory() {
  const name = newCategoryName.value.trim();
  if (!name) {
    categoryMessage.value = t("admin.categoryNameRequired");
    return;
  }
  try {
    await createManagedCategory(name);
    newCategoryName.value = "";
    categoryMessage.value = "";
    emit("refresh-categories");
  } catch (err) {
    categoryMessage.value = err.message || t("admin.categoryExists");
  }
}

function openDeleteCategoryModal(cat) {
  categoryToDelete.value = cat;
  showDeleteCategoryModal.value = true;
}

function closeDeleteCategoryModal() {
  categoryToDelete.value = null;
  showDeleteCategoryModal.value = false;
}

async function confirmDeleteCategory() {
  if (!categoryToDelete.value) return;
  try {
    await deleteManagedCategory(categoryToDelete.value.name);
    closeDeleteCategoryModal();
    emit("refresh-categories");
  } catch (err) {
    categoryMessage.value = err.message || t("admin.categoryDeleteFailed");
  }
}

function openRenameModal(cat) {
  categoryToRename.value = cat;
  renameCategoryName.value = cat.name;
  showRenameModal.value = true;
}

function closeRenameModal() {
  categoryToRename.value = null;
  renameCategoryName.value = "";
  showRenameModal.value = false;
}

async function confirmRenameCategory() {
  if (!categoryToRename.value || !renameCategoryName.value.trim()) return;
  try {
    await renameManagedCategory(categoryToRename.value.name, renameCategoryName.value.trim());
    closeRenameModal();
    emit("refresh-categories");
  } catch (err) {
    categoryMessage.value = err.message || t("admin.categoryRenameFailed");
  }
}

onMounted(() => {
  loadRules();
  loadAutoSyncConfig();
});
</script>
