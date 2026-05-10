<template>
  <div class="drawer-mask" :class="{ show: visible }" @click="closeDrawer"></div>
  <aside ref="drawerRef" class="drawer" :class="{ show: visible }" :aria-hidden="visible ? 'false' : 'true'">
    <div class="drawer-head">
      <div>
        <div class="eyebrow">{{ t("drawer.eyebrow") }}</div>
        <h2 class="drawer-title">{{ project?.name || t("drawer.title") }}</h2>
        <p class="drawer-subtitle">
          {{ project ? `@${project.author} / ${translateCategory(project.category)} / ${translateStatus(project.status)}` : t("drawer.emptySubtitle") }}
        </p>
        <div v-if="project && headerLinks.length && !editing" class="drawer-top-actions">
          <a
            v-for="item in headerLinks"
            :key="item.href"
            class="action-link compact"
            :href="item.href"
            target="_blank"
            rel="noreferrer"
          >
            {{ item.label }}
          </a>
        </div>
      </div>
      <div class="drawer-head-actions">
        <button
          v-if="project && !editing"
          class="ghost-button drawer-edit-btn"
          type="button"
          @click="startEditing"
        >
          {{ t("drawer.edit") }}
        </button>
        <button class="close-button" type="button" :aria-label="t('drawer.close')" @click="closeDrawer">&times;</button>
      </div>
    </div>

    <template v-if="project">
      <nav v-if="!editing" class="drawer-tabs" :aria-label="tabCopy.sections">
        <button
          v-for="item in tabItems"
          :key="item.key"
          class="drawer-tab"
          :class="{ active: activeTab === item.key }"
          type="button"
          @click="activeTab = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <template v-if="editing">
        <section class="detail-panel">
          <h3>{{ tabCopy.editTitle }}</h3>
          <div class="drawer-edit-form">
            <label class="drawer-edit-field">
              <span class="drawer-edit-label">{{ t("drawer.fields.category") }}</span>
              <select v-model="editForm.category" class="select">
                <option
                  v-for="cat in categoryOptions"
                  :key="cat"
                  :value="cat"
                >{{ translateCategory(cat) }}</option>
              </select>
            </label>
            <label class="drawer-edit-field">
              <span class="drawer-edit-label">{{ t("drawer.fields.status") }}</span>
              <select v-model="editForm.status" class="select">
                <option
                  v-for="opt in statusOptions"
                  :key="opt"
                  :value="opt"
                >{{ translateStatus(opt) }}</option>
              </select>
            </label>
            <label class="drawer-edit-field drawer-edit-field-full drawer-toggle-field" for="drawer-recommended">
              <span class="drawer-toggle-copy">
                <strong class="drawer-toggle-title">{{ t("drawer.fields.recommended") }}</strong>
                <span class="drawer-toggle-hint">在前台将项目显示为推荐项</span>
              </span>
              <span class="drawer-switch">
                <input
                  id="drawer-recommended"
                  v-model="editForm.recommended"
                  class="drawer-switch-input"
                  type="checkbox"
                />
                <span class="drawer-switch-ui" aria-hidden="true"></span>
              </span>
            </label>
            <label class="drawer-edit-field drawer-edit-field-full">
              <span class="drawer-edit-label">{{ t("drawer.notes") }}</span>
              <textarea
                v-model="editForm.note"
                class="textarea"
                rows="4"
              ></textarea>
            </label>
          </div>
          <div class="drawer-edit-actions">
            <button class="ghost-button" type="button" @click="cancelEditing">{{ t("drawer.cancel") }}</button>
            <button class="button" type="button" :disabled="saving" @click="saveEditing">
              {{ saving ? t("common.loadingShort") : t("drawer.save") }}
            </button>
          </div>
          <p v-if="editMessage" class="drawer-edit-message">{{ editMessage }}</p>
        </section>
      </template>

      <template v-else-if="activeTab === 'overview'">
        <section class="detail-panel">
          <h3>{{ t("drawer.overview") }}</h3>
          <div class="detail-grid">
            <div v-for="entry in metaItems" :key="entry.label" class="detail-item">
              <div class="detail-label">{{ entry.label }}</div>
              <div class="detail-value">{{ entry.value }}</div>
            </div>
          </div>
        </section>

        <section v-if="project.remoteStatus && project.remoteStatus !== 'active'" class="detail-panel">
          <h3>{{ t("drawer.remoteStatus") }}</h3>
          <p class="detail-text">{{ translateRemoteStatus(project.remoteStatus) }}</p>
          <p v-if="project.remoteStatusNote" class="detail-text">{{ project.remoteStatusNote }}</p>
        </section>

        <section class="detail-panel">
          <h3>{{ t("drawer.description") }}</h3>
          <p class="detail-text">{{ project.description || t("drawer.descriptionEmpty") }}</p>
        </section>

        <section v-if="project.categoryReason || project.categorySource" class="detail-panel">
          <h3>{{ classificationCopy.title }}</h3>
          <p class="detail-text">{{ classificationSourceText }}</p>
          <p v-if="project.categoryReason" class="detail-text">{{ classificationReasonText }}</p>
        </section>

        <section v-if="project.features.length" class="detail-panel">
          <h3>{{ t("drawer.highlights") }}</h3>
          <ul class="feature-list">
            <li v-for="feature in project.features" :key="feature">{{ feature }}</li>
          </ul>
        </section>

        <section v-if="project.aiCategory" class="detail-panel">
          <h3>{{ t("drawer.ai") }}</h3>
          <p class="detail-text">
            {{ project.aiCategory }}
            <span v-if="project.aiConfidence !== null && project.aiConfidence !== undefined">
              ({{ Math.round(project.aiConfidence * 100) }}%)
            </span>
          </p>
          <p v-if="project.aiReason" class="detail-text">{{ project.aiReason }}</p>
        </section>
      </template>

      <template v-else-if="activeTab === 'readme'">
        <section class="detail-panel">
          <div class="detail-panel-head">
            <div>
              <h3>{{ readmeTitle }}</h3>
              <p class="detail-hint">{{ tabCopy.readmeHint }}</p>
            </div>
            <a
              v-if="project.github"
              class="action-link compact"
              :href="`${project.github}#readme`"
              target="_blank"
              rel="noreferrer"
            >
              {{ tabCopy.openReadme }}
            </a>
          </div>
          <div v-if="project.readme" ref="readmePreviewRef" class="readme-preview markdown-body" v-html="renderedReadme"></div>
          <p v-else class="detail-text">{{ tabCopy.readmeEmpty }}</p>
        </section>
      </template>

      <template v-else-if="activeTab === 'notes'">
        <section class="detail-panel">
          <h3>{{ t("drawer.notes") }}</h3>
          <p class="detail-text">{{ project.note || t("drawer.notesEmpty") }}</p>
        </section>

        <section v-if="project.tags.length" class="detail-panel">
          <h3>{{ t("drawer.tags") }}</h3>
          <div class="chip-row">
            <span v-for="tag in project.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>
        </section>
      </template>

    </template>
  </aside>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { updateProject } from "../api/projects";
import { locale, t, translateCategory, translateRemoteStatus, translateStatus } from "../i18n";

const props = defineProps({
  visible: Boolean,
  project: Object,
  categories: { type: Array, default: () => [] },
  formatDate: Function,
  formatNumber: Function
});

const emit = defineEmits(["close", "saved"]);

const activeTab = ref("overview");
const editing = ref(false);
const saving = ref(false);
const editMessage = ref("");
const drawerRef = ref(null);
const readmePreviewRef = ref(null);
let lockedScrollY = 0;
const editForm = reactive({
  category: "",
  status: "",
  note: "",
  recommended: false
});

const statusOptions = ["收藏备用", "已部署", "正在使用", "待研究"];

const categoryOptions = computed(() => {
  return props.categories.filter(c => c && c !== "__all_projects__");
});

function initEditForm() {
  if (!props.project) return;
  editForm.category = props.project.category || "";
  editForm.status = props.project.status || "";
  editForm.note = props.project.note || "";
  editForm.recommended = Boolean(props.project.recommended);
}

function startEditing() {
  initEditForm();
  editing.value = true;
  editMessage.value = "";
}

function cancelEditing() {
  editing.value = false;
  editMessage.value = "";
}

function closeDrawer() {
  if (editing.value) {
    cancelEditing();
  }
  emit("close");
}

async function saveEditing() {
  if (!props.project) return;
  saving.value = true;
  editMessage.value = "";

  try {
    const updated = await updateProject(props.project.id, {
      ...props.project,
      category: editForm.category,
      status: editForm.status,
      note: editForm.note,
      recommended: editForm.recommended
    });
    emit("saved", updated);
    editing.value = false;
    editMessage.value = t("drawer.saveSuccess");
  } catch (error) {
    editMessage.value = error.message || t("drawer.saveFailed");
  } finally {
    saving.value = false;
  }
}

const tabCopy = computed(() => {
  if (locale.value === "zh-CN") {
    return {
      sections: "详情分区",
      overview: "概览",
      readme: "README",
      notes: "备注",
      readmeHint: "以下内容来自 GitHub 仓库主页的 README.md 预览。",
      readmeEmpty: "这个项目当前没有可读取的 README 内容。",
      openReadme: "在 GitHub 中查看 README",
      github: "GitHub",
      release: "Release",
      demo: "演示",
      docs: "文档",
      editTitle: "编辑项目"
    };
  }

  return {
    sections: "Detail sections",
    overview: "Overview",
    readme: "README",
    notes: "Notes",
    readmeHint: "Preview pulled from the repository README on GitHub.",
    readmeEmpty: "This project does not currently expose a readable README.",
    openReadme: "Open README on GitHub",
    github: "GitHub",
    release: "Release",
    demo: "Demo",
    docs: "Docs",
    editTitle: "Edit Project"
  };
});

const metaItems = computed(() => {
  if (!props.project) return [];

  return [
    { label: t("drawer.fields.category"), value: translateCategory(props.project.category) },
    { label: t("drawer.fields.status"), value: translateStatus(props.project.status) },
    { label: t("drawer.fields.language"), value: props.project.language },
    { label: t("drawer.fields.stars"), value: props.formatNumber(props.project.stars) },
    { label: t("drawer.fields.recommended"), value: props.project.recommended ? t("drawer.fields.yes") : t("drawer.fields.no") },
    ...(props.project.latestReleaseAt
      ? [{ label: t("drawer.latestRelease"), value: props.formatDate(props.project.latestReleaseAt) }]
      : []),
    ...(props.project.latestCommitAt
      ? [{ label: t("drawer.latestCommit"), value: props.formatDate(props.project.latestCommitAt) }]
      : [])
  ];
});

const readmeTitle = computed(() => {
  const label = t("drawer.readme");
  return label === "drawer.readme" ? "README" : label;
});

const headerLinks = computed(() => {
  if (!props.project) {
    return [];
  }

  return [
    props.project.github ? { href: props.project.github, label: tabCopy.value.github } : null,
    props.project.github && props.project.latestReleaseAt ? { href: buildReleaseUrl(props.project.github), label: tabCopy.value.release } : null,
    props.project.demo ? { href: props.project.demo, label: tabCopy.value.demo } : null,
    props.project.docs ? { href: props.project.docs, label: tabCopy.value.docs } : null
  ].filter(Boolean);
});

const tabItems = computed(() => {
  const items = [{ key: "overview", label: tabCopy.value.overview }];

  if (props.project?.readme) {
    items.push({ key: "readme", label: tabCopy.value.readme });
  }

  items.push({ key: "notes", label: tabCopy.value.notes });

  return items;
});

const renderedReadme = computed(() => renderMarkdown(props.project?.readme || ""));

const classificationCopy = computed(() => {
  if (locale.value === "zh-CN") {
    return {
      title: "分类依据",
      source: "分类来源",
      reason: "命中规则",
      manual: "手动整理",
      topic: "Topics 命中",
      keyword: "关键词命中",
      languageFallback: "语言兜底",
      uncategorized: "未命中规则"
    };
  }

  return {
    title: "Classification",
    source: "Source",
    reason: "Reason",
    manual: "Manual",
    topic: "Topics",
    keyword: "Keyword",
    languageFallback: "Language fallback",
    uncategorized: "No rule matched"
  };
});

const classificationSourceText = computed(() => {
  const value = props.project?.categorySource || "";
  if (!value) {
    return "";
  }

  let label = value;
  if (value === "manual") label = classificationCopy.value.manual;
  if (value === "topic") label = classificationCopy.value.topic;
  if (value === "keyword") label = classificationCopy.value.keyword;
  if (value === "language_fallback") label = classificationCopy.value.languageFallback;
  if (value === "uncategorized") label = classificationCopy.value.uncategorized;
  return `${classificationCopy.value.source}: ${label}`;
});

const classificationReasonText = computed(() => {
  if (!props.project?.categoryReason) {
    return "";
  }

  return `${classificationCopy.value.reason}: ${props.project.categoryReason}`;
});

function resetDrawerScroll() {
  if (drawerRef.value) {
    drawerRef.value.scrollTop = 0;
  }
  if (readmePreviewRef.value) {
    readmePreviewRef.value.scrollTop = 0;
    readmePreviewRef.value.scrollLeft = 0;
  }
}

function syncBodyScrollLock() {
  if (typeof document === "undefined") {
    return;
  }
  const html = document.documentElement;
  const body = document.body;

  if (props.visible) {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    html.classList.add("drawer-open");
    body.classList.add("drawer-open");
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return;
  }

  html.classList.remove("drawer-open");
  body.classList.remove("drawer-open");
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  window.scrollTo(0, lockedScrollY);
}

watch(
  () => props.project?.id,
  async () => {
    activeTab.value = props.project?.readme ? "readme" : "overview";
    editing.value = false;
    editMessage.value = "";
    await nextTick();
    resetDrawerScroll();
  },
  { immediate: true }
);

watch(tabItems, items => {
  if (!items.some(item => item.key === activeTab.value)) {
    activeTab.value = items[0]?.key || "overview";
  }
});

watch(
  () => activeTab.value,
  async tab => {
    if (tab !== "readme") {
      return;
    }
    await nextTick();
    resetDrawerScroll();
  }
);

watch(
  () => props.visible,
  () => {
    syncBodyScrollLock();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("drawer-open");
    document.body.classList.remove("drawer-open");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
  }
});

function buildReleaseUrl(githubUrl) {
  return `${String(githubUrl).replace(/\/$/, "")}/releases`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}

function sanitizeReadmeMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|section|article|header|footer)>/gi, "\n")
    .replace(/<(div|p|section|article|header|footer)(\s[^>]*)?>/gi, "")
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)")
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi, "![$1]($2)")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const label = String(inner)
        .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
      return `[${label || href}](${href})`;
    })
    .replace(/<\/?summary[^>]*>/gi, "")
    .replace(/<\/?details[^>]*>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderMarkdown(markdown) {
  const source = sanitizeReadmeMarkdown(markdown);
  if (!source) {
    return "";
  }

  const lines = source.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(`<li>${renderInlineMarkdown(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(`<li>${renderInlineMarkdown(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(renderInlineMarkdown(lines[index].trim().replace(/^>\s?/, "")));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.join("<br />")}</blockquote>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim()) {
      const current = lines[index].trim();
      if (
        current.startsWith("```") ||
        /^(#{1,6})\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        current.startsWith(">")
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
  }

  return blocks.join("");
}
</script>
