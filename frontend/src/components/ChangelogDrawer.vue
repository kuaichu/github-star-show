<template>
  <div class="drawer-mask" :class="{ show: visible }" @click="$emit('close')"></div>
  <aside class="drawer changelog-drawer" :class="{ show: visible }" :aria-hidden="visible ? 'false' : 'true'">
    <div class="drawer-head">
      <div>
        <div class="eyebrow">{{ copy.eyebrow }}</div>
        <h2 class="drawer-title">{{ copy.title }}</h2>
        <p class="drawer-subtitle">{{ copy.subtitle }}</p>
      </div>
      <button class="close-button" type="button" :aria-label="copy.close" @click="$emit('close')">&times;</button>
    </div>

    <section class="detail-panel">
      <h3>{{ copy.currentVersion.heading }}</h3>
      <div class="changelog-version-row">
        <div>
          <div class="changelog-version-tag">{{ copy.currentVersion.version }}</div>
          <p class="detail-text">{{ copy.currentVersion.summary }}</p>
        </div>
        <span class="chip brand">{{ copy.currentVersion.badge }}</span>
      </div>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.capabilities.heading }}</h3>
      <ul class="feature-list">
        <li v-for="item in copy.capabilities.items" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.builtWith.heading }}</h3>
      <div class="chip-row">
        <span v-for="item in copy.builtWith.items" :key="item" class="chip">{{ item }}</span>
      </div>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.changelog.heading }}</h3>
      <div class="changelog-list">
        <article v-for="entry in copy.changelog.releases" :key="entry.version" class="changelog-entry">
          <div class="changelog-entry-head">
            <div>
              <h4>{{ entry.version }}</h4>
              <p class="detail-hint">{{ entry.date }}</p>
            </div>
            <span v-if="entry.badge" class="chip blue">{{ entry.badge }}</span>
          </div>
          <ul class="feature-list">
            <li v-for="item in entry.items" :key="item">{{ item }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.nextUp.heading }}</h3>
      <ul class="feature-list">
        <li v-for="item in copy.nextUp.items" :key="item">{{ item }}</li>
      </ul>
    </section>
  </aside>
</template>

<script setup>
import { computed } from "vue";
import { locale } from "../i18n";
import { CHANGELOG_CONTENT } from "../content/changelog";

defineProps({
  visible: Boolean
});

defineEmits(["close"]);

const copy = computed(() => {
  return CHANGELOG_CONTENT[locale.value] || CHANGELOG_CONTENT.en;
});
</script>
