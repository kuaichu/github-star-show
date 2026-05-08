<template>
  <div class="drawer-mask" :class="{ show: visible }" @click="$emit('close')"></div>
  <aside class="drawer" :class="{ show: visible }" :aria-hidden="visible ? 'false' : 'true'">
    <div class="drawer-head">
      <div>
        <div class="eyebrow">{{ t("drawer.eyebrow") }}</div>
        <h2 class="drawer-title">{{ project?.name || t("drawer.title") }}</h2>
        <p class="drawer-subtitle">
          {{ project ? `@${project.author} / ${translateCategory(project.category)} / ${translateStatus(project.status)}` : t("drawer.emptySubtitle") }}
        </p>
        <div v-if="project && headerLinks.length" class="drawer-top-actions">
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
      <button class="close-button" type="button" :aria-label="t('drawer.close')" @click="$emit('close')">&times;</button>
    </div>

    <template v-if="project">
      <nav class="drawer-tabs" :aria-label="tabCopy.sections">
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

      <template v-if="activeTab === 'overview'">
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
          <div v-if="project.readme" class="readme-preview markdown-body" v-html="renderedReadme"></div>
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

      <template v-else-if="activeTab === 'links'">
        <section class="detail-panel">
          <h3>{{ tabCopy.links }}</h3>
          <div class="detail-link-grid">
            <a
              v-for="item in linkItems"
              :key="item.href"
              class="detail-link-card"
              :href="item.href"
              target="_blank"
              rel="noreferrer"
            >
              <div class="detail-link-label">{{ item.label }}</div>
              <div class="detail-link-url">{{ item.preview }}</div>
            </a>
          </div>
        </section>
      </template>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { locale, t, translateCategory, translateRemoteStatus, translateStatus } from "../i18n";

const props = defineProps({
  visible: Boolean,
  project: Object,
  formatDate: Function,
  formatNumber: Function
});

defineEmits(["close"]);

const activeTab = ref("overview");

const tabCopy = computed(() => {
  if (locale.value === "zh-CN") {
    return {
      sections: "详情分区",
      overview: "概览",
      readme: "README",
      notes: "备注",
      links: "链接",
      readmeHint: "以下内容来自 GitHub 仓库主页的 README.md 预览。",
      readmeEmpty: "这个项目当前没有可读取的 README 内容。",
      openReadme: "在 GitHub 中查看 README",
      github: "GitHub",
      demo: "演示",
      docs: "文档"
    };
  }

  return {
    sections: "Detail sections",
    overview: "Overview",
    readme: "README",
    notes: "Notes",
    links: "Links",
    readmeHint: "Preview pulled from the repository README on GitHub.",
    readmeEmpty: "This project does not currently expose a readable README.",
    openReadme: "Open README on GitHub",
    github: "GitHub",
    demo: "Demo",
    docs: "Docs"
  };
});

const metaItems = computed(() => {
  if (!props.project) return [];

  return [
    { label: t("drawer.fields.category"), value: translateCategory(props.project.category) },
    { label: t("drawer.fields.status"), value: translateStatus(props.project.status) },
    { label: t("drawer.fields.language"), value: props.project.language },
    { label: t("drawer.fields.stars"), value: props.formatNumber(props.project.stars) },
    { label: t("drawer.fields.updated"), value: props.formatDate(props.project.updatedAt) },
    { label: t("drawer.fields.recommended"), value: props.project.recommended ? t("drawer.fields.yes") : t("drawer.fields.no") }
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
    props.project.demo ? { href: props.project.demo, label: tabCopy.value.demo } : null,
    props.project.docs ? { href: props.project.docs, label: tabCopy.value.docs } : null
  ].filter(Boolean);
});

const linkItems = computed(() => {
  if (!props.project) {
    return [];
  }

  return [
    props.project.github ? { href: props.project.github, label: tabCopy.value.github, preview: compactUrl(props.project.github) } : null,
    props.project.demo ? { href: props.project.demo, label: tabCopy.value.demo, preview: compactUrl(props.project.demo) } : null,
    props.project.docs ? { href: props.project.docs, label: tabCopy.value.docs, preview: compactUrl(props.project.docs) } : null
  ].filter(Boolean);
});

const tabItems = computed(() => {
  const items = [{ key: "overview", label: tabCopy.value.overview }];

  if (props.project?.readme) {
    items.push({ key: "readme", label: tabCopy.value.readme });
  }

  items.push({ key: "notes", label: tabCopy.value.notes });

  if (linkItems.value.length) {
    items.push({ key: "links", label: tabCopy.value.links });
  }

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

watch(
  () => props.project?.id,
  () => {
    activeTab.value = props.project?.readme ? "readme" : "overview";
  },
  { immediate: true }
);

watch(tabItems, items => {
  if (!items.some(item => item.key === activeTab.value)) {
    activeTab.value = items[0]?.key || "overview";
  }
});

function compactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return value;
  }
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
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
}

function renderMarkdown(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n").trim();
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
