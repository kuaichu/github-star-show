<template>
  <div class="empty-state">
    <div class="empty-state-icon">
      <svg v-if="icon === 'search'" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="20" cy="20" r="12" opacity="0.6" />
        <line x1="29" y1="29" x2="38" y2="38" opacity="0.6" />
        <line x1="16" y1="20" x2="24" y2="20" opacity="0.3" />
      </svg>
      <svg v-else-if="icon === 'inbox'" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 24 L10 12 L38 12 L42 24" opacity="0.6" />
        <path d="M6 24 L6 36 L42 36 L42 24" opacity="0.6" />
        <path d="M6 24 L16 28 L32 28 L42 24" opacity="0.3" />
      </svg>
      <svg v-else-if="icon === 'check'" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="24" cy="24" r="16" opacity="0.5" />
        <path d="M16 24 L22 30 L32 18" opacity="0.8" />
      </svg>
      <svg v-else-if="icon === 'folder'" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 12 L20 12 L24 16 L42 16 L42 38 L6 38 Z" opacity="0.5" />
        <line x1="18" y1="26" x2="30" y2="26" opacity="0.25" />
        <line x1="18" y1="30" x2="30" y2="30" opacity="0.25" />
      </svg>
      <svg v-else-if="icon === 'remote'" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 18 L24 10 L36 18" opacity="0.4" />
        <path d="M12 30 L24 38 L36 30" opacity="0.4" />
        <line x1="19" y1="14" x2="14" y2="20" opacity="0.6" />
        <line x1="29" y1="14" x2="34" y2="20" opacity="0.6" />
      </svg>
      <svg v-else width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="24" cy="24" r="14" opacity="0.4" />
        <circle cx="24" cy="24" r="6" opacity="0.3" />
      </svg>
    </div>
    <h3 class="empty-state-title"><slot name="title" /></h3>
    <p v-if="$slots.default || description" class="empty-state-desc"><slot>{{ description }}</slot></p>
    <div v-if="$slots.action" class="empty-state-action"><slot name="action" /></div>
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: "inbox" },
  description: { type: String, default: "" }
});
</script>
