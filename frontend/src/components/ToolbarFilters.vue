<template>
  <section class="toolbar">
    <div class="toolbar-row">
      <input
        :value="modelValue.keyword"
        class="input"
        type="search"
        placeholder="搜索项目名、描述、作者或标签..."
        @input="$emit('update:keyword', $event.target.value)"
      />
      <select
        :value="modelValue.status"
        class="select"
        @change="$emit('update:status', $event.target.value)"
      >
        <option v-for="option in statusOptions" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
      <select
        :value="modelValue.language"
        class="select"
        @change="$emit('update:language', $event.target.value)"
      >
        <option v-for="option in languageOptions" :key="option" :value="option">
          {{ option }}
        </option>
      </select>
      <select
        :value="modelValue.sort"
        class="select"
        @change="$emit('update:sort', $event.target.value)"
      >
        <option v-for="option in sortOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <button class="button" type="button" @click="$emit('reset')">重置筛选</button>
    </div>

    <div class="toolbar-meta">
      <div class="toolbar-tip">{{ summary }}</div>
      <div class="toolbar-tip">前端默认地址：`http://localhost:5173`</div>
    </div>
  </section>
</template>

<script setup>
defineProps({
  modelValue: Object,
  statusOptions: Array,
  languageOptions: Array,
  sortOptions: Array,
  summary: String
});

defineEmits([
  "update:keyword",
  "update:status",
  "update:language",
  "update:sort",
  "reset"
]);
</script>
