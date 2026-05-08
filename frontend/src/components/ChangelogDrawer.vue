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
      <h3>{{ copy.currentVersion }}</h3>
      <div class="changelog-version-row">
        <div>
          <div class="changelog-version-tag">v0.1.0-beta.1</div>
          <p class="detail-text">{{ copy.versionNote }}</p>
        </div>
        <span class="chip brand">{{ copy.beta }}</span>
      </div>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.capabilities }}</h3>
      <ul class="feature-list">
        <li v-for="item in capabilityItems" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.builtWith }}</h3>
      <div class="chip-row">
        <span v-for="item in builtWithItems" :key="item" class="chip">{{ item }}</span>
      </div>
    </section>

    <section class="detail-panel">
      <h3>{{ copy.changelog }}</h3>
      <div class="changelog-list">
        <article v-for="entry in changelogEntries" :key="entry.version" class="changelog-entry">
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
      <h3>{{ copy.next }}</h3>
      <ul class="feature-list">
        <li v-for="item in nextItems" :key="item">{{ item }}</li>
      </ul>
    </section>
  </aside>
</template>

<script setup>
import { computed } from "vue";
import { locale } from "../i18n";

defineProps({
  visible: Boolean
});

defineEmits(["close"]);

const copy = computed(() => {
  if (locale.value === "en") {
    return {
      eyebrow: "Release Notes",
      title: "Version & Update History",
      subtitle: "A quick look at what the current demo can do and what changed between versions.",
      close: "Close",
      currentVersion: "Current Version",
      versionNote: "This is the first public beta demo focused on user-scoped GitHub star sync and local library management.",
      beta: "Beta",
      capabilities: "Current Capabilities",
      builtWith: "Built With",
      changelog: "Changelog",
      next: "Coming Next"
    };
  }

  return {
    eyebrow: "更新记录",
    title: "版本信息与更新历史",
    subtitle: "这里记录当前 demo 已支持的能力，以及每个版本新增或调整的内容。",
    close: "关闭",
    currentVersion: "当前版本",
    versionNote: "这是首个公开 beta demo，重点已经覆盖用户级 GitHub Star 同步和本地项目库管理。",
    beta: "Beta",
    capabilities: "当前能力",
    builtWith: "开发工具 / 技术栈",
    changelog: "更新历史",
    next: "下一步计划"
  };
});

const capabilityItems = computed(() => {
  if (locale.value === "en") {
    return [
      "GitHub OAuth login",
      "User-scoped star sync",
      "Incremental sync and full re-sync",
      "Rule-based categorization",
      "Remote state tracking",
      "Admin editing and manual project management",
      "Optional GitHub unstar during deletion",
      "README preview in project details"
    ];
  }

  return [
    "GitHub OAuth 登录",
    "按用户隔离的 Star 同步",
    "增量同步与全量重同步",
    "规则分类与分类导航",
    "远端状态追踪",
    "后台编辑与项目管理",
    "删除时可选同步取消 GitHub Star",
    "项目详情内 README 预览"
  ];
});

const builtWithItems = computed(() => [
  "Codex",
  "GPT-5.4",
  "Vue 3",
  "Vite",
  "Express",
  "Prisma",
  "SQLite",
  "Cloudflare Pages",
  "1Panel",
  "PM2"
]);

const changelogEntries = computed(() => {
  if (locale.value === "en") {
    return [
      {
        version: "v0.1.0-beta.1",
        date: "2026-05-08",
        badge: "Public Demo",
        items: [
          "Added GitHub OAuth login and persistent sessions",
          "Implemented full and incremental star sync",
          "Introduced user-scoped library persistence",
          "Added remote state tracking for unstarred and archived repositories",
          "Added admin editing, import, and optional GitHub unstar on delete",
          "Deployed frontend and backend as a public demo"
        ]
      },
      {
        version: "v0.0.x",
        date: "Prototype Phase",
        badge: "Prototype",
        items: [
          "Built the original static showcase",
          "Explored project card layout and category navigation",
          "Prepared the foundation for sync and multi-user support"
        ]
      }
    ];
  }

  return [
    {
      version: "v0.1.0-beta.1",
      date: "2026-05-08",
      badge: "公开 Demo",
      items: [
        "加入 GitHub OAuth 登录与持久化会话",
        "实现 GitHub Star 全量同步与增量同步",
        "实现按用户隔离的本地项目库存储",
        "加入远端状态追踪，识别取消 Star 与归档仓库",
        "加入后台编辑、单仓库导入与删除时可选取消 GitHub Star",
        "完成前后端公开 demo 部署"
      ]
    },
    {
      version: "v0.0.x",
      date: "原型阶段",
      badge: "Prototype",
      items: [
        "完成最初的静态展示页原型",
        "探索项目卡片布局与分类导航样式",
        "为后续同步和多用户能力打下基础"
      ]
    }
  ];
});

const nextItems = computed(() => {
  if (locale.value === "en") {
    return [
      "Stronger rule-based categorization",
      "Self-hosted deployment documentation",
      "More polished admin workflows",
      "Formal release preparation"
    ];
  }

  return [
    "继续增强规则分类覆盖率",
    "补齐自部署文档与升级说明",
    "继续打磨后台整理流程",
    "准备正式版发布"
  ];
});
</script>
