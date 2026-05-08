<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="eyebrow">{{ t("sidebar.eyebrow") }}</div>
      <h1>GitHub <span>Star Show</span></h1>
      <p class="sidebar-copy">
        {{ t("sidebar.copy") }}
      </p>
    </div>

    <div class="status-panel">
      <div class="status-row">
        <span>{{ t("sidebar.productState") }}</span>
        <strong>{{ t("sidebar.connected") }}</strong>
      </div>
      <div class="status-row">
        <span>{{ t("sidebar.frontendStack") }}</span>
      </div>
      <div class="status-row">
        <span>{{ t("sidebar.backendStack") }}</span>
      </div>
    </div>

    <div class="side-block">
      <h2>{{ t("sidebar.categoryTitle") }}</h2>
      <div class="menu-caption">{{ t("sidebar.categoryCaption") }}</div>
      <div class="menu-list">
        <button
          v-for="category in categories"
          :key="category"
          class="menu-item"
          :class="{ active: modelValue.category === category }"
          type="button"
          @click="$emit('update:category', category)"
        >
          <span>{{ translateCategory(category) }}</span>
          <small>{{ counts[category] ?? 0 }}</small>
        </button>
      </div>
    </div>

    <div v-if="remoteStatuses?.length" class="side-block">
      <h2>{{ t("sidebar.remoteTitle") }}</h2>
      <div class="menu-caption">{{ t("sidebar.remoteCaption") }}</div>
      <div class="menu-list">
        <button
          v-for="status in remoteStatuses"
          :key="status.key"
          class="menu-item"
          :class="{ active: modelValue.remoteStatus === status.key }"
          type="button"
          @click="$emit('update:remote-status', status.key)"
        >
          <span>{{ status.label }}</span>
          <small>{{ remoteCounts[status.key] ?? 0 }}</small>
        </button>
      </div>
    </div>

    <div class="side-block side-block-compact">
      <h2>{{ t("sidebar.quickTitle") }}</h2>
      <div class="quick-list">
        <button
          v-for="item in quickFilters"
          :key="item.key"
          class="quick-item"
          :class="{ active: modelValue.quick === item.key }"
          type="button"
          @click="$emit('toggle-quick', item.key)"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.badge }}</small>
        </button>
      </div>
    </div>

    <div class="sidebar-footnote">
      <div class="sidebar-footnote-title">{{ t("sidebar.aboutTitle") }}</div>
      <p class="sidebar-footnote-copy">
        {{ t("sidebar.aboutCopy") }}
      </p>
    </div>
  </aside>
</template>

<script setup>
import { t, translateCategory } from "../i18n";

defineProps({
  categories: Array,
  counts: Object,
  remoteStatuses: Array,
  remoteCounts: Object,
  quickFilters: Array,
  modelValue: Object
});

defineEmits(["update:category", "update:remote-status", "toggle-quick"]);
</script>
