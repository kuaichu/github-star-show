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

        <div v-if="!filteredProjects.length" class="admin-empty-list">
          {{ t("admin.emptyList") }}
        </div>
      </aside>

      <Transition name="admin-editor" mode="out-in">
        <div :key="editorKey" class="admin-editor">
          <div class="admin-editor-head">
            <h3>{{ isCreateMode ? t("admin.createProject") : t("admin.editProject") }}</h3>
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
              <input v-model="draft.category" class="input" type="text" />
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
            <label class="checkbox-field">
              <input v-model="draft.recommended" type="checkbox" />
              <span>{{ t("admin.fields.recommended") }}</span>
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
  </section>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { t, translateCategory, translateStatus } from "../i18n";

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
  canManageStars: Boolean
});

const emit = defineEmits([
  "close",
  "create",
  "select",
  "save",
  "delete",
  "reset",
  "import-repo",
  "update:features-text",
  "update:tags-text",
  "update:import-repo"
]);

const ADMIN_ALL_CATEGORIES = "all";

const showDeleteModal = ref(false);
const unstarOnGithub = ref(false);
const adminCategoryFilter = ref(ADMIN_ALL_CATEGORIES);

const editorKey = computed(() => (props.selectedProject?.id ? `project-${props.selectedProject.id}` : "create-project"));
const categoryOptions = computed(() => props.categories.filter(item => item && item !== "全部项目"));
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
</script>
