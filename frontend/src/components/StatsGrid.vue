<template>
  <section class="stats">
    <article v-for="item in stats" :key="item.label" class="stat-card">
      <div class="stat-label">{{ item.label }}</div>
      <div class="stat-value">{{ item.value }}</div>
    </article>
  </section>
</template>

<script setup>
defineProps({
  stats: Array
});
</script>
