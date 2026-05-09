<template>
  <section>
    <div class="content-head">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ rangeLabel || t("projects.total", { total: totalCount }) }}</p>
      </div>
    </div>

    <TransitionGroup v-if="projects.length" name="project-grid" tag="div" class="grid">
      <article v-for="item in projects" :key="item.id" class="card">
        <div class="card-body">
          <div class="card-head">
            <div class="chip-row">
              <span class="chip brand">{{ translateCategory(item.category) }}</span>
              <span class="chip blue">{{ item.language }}</span>
              <span v-if="item.recommended" class="chip warn">{{ t("projects.recommended") }}</span>
              <span v-if="item.aiCategory" class="chip">{{ t("projects.ai") }}</span>
            </div>
            <div class="card-head-side">
              <span v-if="item.remoteStatus !== 'active'" class="chip danger">{{ translateRemoteStatus(item.remoteStatus) }}</span>
              <span class="card-meta">{{ t("projects.updated", { date: formatDate(item.updatedAt) }) }}</span>
            </div>
          </div>

          <h3>{{ item.name }}</h3>
          <div class="card-meta card-meta-main">@{{ item.author }} / {{ translateStatus(item.status) }} / ★{{ formatNumber(item.stars) }}</div>
          <p class="card-description">{{ item.description }}</p>

          <div v-if="item.features.length" class="card-section">
            <ul class="feature-list">
              <li v-for="feature in item.features" :key="feature">{{ feature }}</li>
            </ul>
          </div>

          <div class="card-section note-section">
            <p class="project-note">{{ item.note }}</p>
          </div>

          <div v-if="showTriage" class="card-section triage-section">
            <div class="triage-head">
              <strong>{{ t("triage.quickCategories") }}</strong>
              <span class="card-meta">{{ t("triage.source", { value: item.categoryReason || item.categorySource || "-" }) }}</span>
            </div>
            <p v-if="item.language && languageHints[item.language]" class="triage-hint">
              {{ t("triage.langHint") }} {{ languageHints[item.language].map(c => translateCategory(c)).join("、") }}
            </p>
            <div class="triage-actions">
              <button
                v-for="category in triageCategories"
                :key="`${item.id}-${category}`"
                class="triage-chip"
                type="button"
                :disabled="triageSavingId === item.id"
                @click="$emit('quick-category', { id: item.id, category })"
              >
                {{ translateCategory(category) }}
              </button>
              <button
                class="triage-chip triage-chip-muted"
                type="button"
                :disabled="triageSavingId === item.id"
                @click="$emit('mark-research', item.id)"
              >
                {{ triageSavingId === item.id ? t("triage.saving") : t("triage.markResearch") }}
              </button>
            </div>
          </div>

          <div v-if="item.tags.length" class="chip-row card-tags">
            <span v-for="tag in item.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>
        </div>

        <div class="card-actions">
          <button class="ghost-button" type="button" @click="$emit('detail', item.id)">{{ t("projects.details") }}</button>
          <a class="button" :href="item.github" target="_blank" rel="noreferrer">{{ t("projects.openGithub") }}</a>
        </div>
      </article>
    </TransitionGroup>

    <div v-else class="empty">
      <h3>{{ t("projects.noResultsTitle") }}</h3>
      <p>{{ t("projects.noResultsCopy") }}</p>
    </div>
  </section>
</template>

<script setup>
import { t, translateCategory, translateRemoteStatus, translateStatus } from "../i18n";

const languageHints = {
  Python: ["AI / LLM", "自动化 / 效率工具", "安全 / CTF"],
  PHP: ["前端 UI / 可视化", "运维 / 自建服务"],
  "C#": ["媒体 / 下载 / 图床", "运维 / 自建服务"],
  "C++": ["AI / LLM", "媒体 / 下载 / 图床", "自动化 / 效率工具"],
  "C": ["自动化 / 效率工具", "安全 / CTF", "网络 / NAS / 虚拟化"],
  Kotlin: ["前端 UI / 可视化", "自动化 / 效率工具"],
  Go: ["网络 / NAS / 虚拟化", "运维 / 自建服务", "自动化 / 效率工具"],
  Rust: ["自动化 / 效率工具", "安全 / CTF"],
  Java: ["前端 UI / 可视化", "运维 / 自建服务"],
  Ruby: ["运维 / 自建服务", "自动化 / 效率工具"],
  Swift: ["前端 UI / 可视化", "自动化 / 效率工具"],
  Dart: ["前端 UI / 可视化", "自动化 / 效率工具"],
  Lua: ["媒体 / 下载 / 图床", "自动化 / 效率工具"],
  Zig: ["自动化 / 效率工具", "安全 / CTF"],
  Haskell: ["AI / LLM", "自动化 / 效率工具"],
  R: ["AI / LLM", "自动化 / 效率工具"],
  Scala: ["AI / LLM", "运维 / 自建服务"],
  Objective_C: ["前端 UI / 可视化", "自动化 / 效率工具"]
};

defineProps({
  projects: { type: Array, default: () => [] },
  totalCount: { type: Number, default: 0 },
  rangeLabel: { type: String, default: "" },
  title: { type: String, default: "" },
  showTriage: { type: Boolean, default: false },
  triageCategories: { type: Array, default: () => [] },
  triageSavingId: { type: Number, default: null },
  formatDate: { type: Function, required: true },
  formatNumber: { type: Function, required: true }
});

defineEmits(["detail", "quick-category", "mark-research"]);
</script>
