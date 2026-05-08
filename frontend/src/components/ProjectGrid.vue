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

defineProps({
  projects: { type: Array, default: () => [] },
  totalCount: { type: Number, default: 0 },
  rangeLabel: { type: String, default: "" },
  title: { type: String, default: "" },
  formatDate: { type: Function, required: true },
  formatNumber: { type: Function, required: true }
});

defineEmits(["detail"]);
</script>
