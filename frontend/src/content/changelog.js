export const BUILT_WITH = [
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
];

export const CHANGELOG_CONTENT = {
  "zh-CN": {
    eyebrow: "更新记录",
    title: "版本信息与更新历史",
    subtitle: "这里记录当前 demo 已支持的能力，以及每个版本新增或调整的内容。",
    close: "关闭",
    currentVersion: {
      heading: "当前版本",
      version: "v0.1.0-beta.2",
      summary: "新增后台新增自定义分类支持，修复开发中遇到的一些逻辑问题",
      badge: "Beta"
    },
    capabilities: {
      heading: "当前能力",
      items: [
        "GitHub OAuth 登录",
        "按用户隔离的 Star 同步",
        "增量同步与全量重同步",
        "规则分类与分类导航",
        "远端状态追踪",
        "后台编辑与项目管理",
        "删除时可选同步取消 GitHub Star",
        "项目详情内 README 预览"
      ]
    },
    changelog: {
      heading: "更新历史",
      releases: [
        {
          version: "v0.1.0-beta.2",
          date: "2026-05-08",
          badge: "功能更新",
          items: [
            "后台新增自定义分类支持，输入时可复用已有默认分类",
            "分类导航保存后即时刷新，自定义分类追加在默认分类之后",
            "修复后台新建模式无法退出的问题，新增「退出新建」入口",
            "修复从新建页面返回后再次进入后台仍停留在新建态的问题",
            "重新进入后台时恢复上次查看的项目，或回到已有项目列表"
          ]
        },
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
      ]
    },
    builtWith: {
      heading: "开发工具 / 技术栈",
      items: BUILT_WITH
    },
    nextUp: {
      heading: "下一步计划",
      items: [
        "继续增强规则分类覆盖率",
        "补齐自部署文档与升级说明",
        "继续打磨后台整理流程",
        "准备正式版发布"
      ]
    }
  },
  en: {
    eyebrow: "Release Notes",
    title: "Version & Update History",
    subtitle: "A quick look at what the current demo can do and what changed between versions.",
    close: "Close",
    currentVersion: {
      heading: "Current Version",
      version: "v0.1.0-beta.1",
      summary: "This is the first public beta demo focused on user-scoped GitHub star sync and local library management.",
      badge: "Beta"
    },
    capabilities: {
      heading: "Current Capabilities",
      items: [
        "GitHub OAuth login",
        "User-scoped star sync",
        "Incremental sync and full re-sync",
        "Rule-based categorization",
        "Remote state tracking",
        "Admin editing and manual project management",
        "Optional GitHub unstar during deletion",
        "README preview in project details"
      ]
    },
    changelog: {
      heading: "Changelog",
      releases: [
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
          version: "v0.1.1",
          date: "2026-05-08",
          badge: "Feature Update",
          items: [
            "Added support for custom categories in Admin",
            "Sidebar category navigation now updates immediately after saving category changes",
            "Preserved default category ordering while appending custom categories after built-in ones",
            "Fixed Admin create-mode lock-in issue — added exit without saving",
            "Fixed returning to Admin reopening the empty create form"
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
      ]
    },
    builtWith: {
      heading: "Built With",
      items: BUILT_WITH
    },
    nextUp: {
      heading: "Coming Next",
      items: [
        "Stronger rule-based categorization",
        "Self-hosted deployment documentation",
        "More polished admin workflows",
        "Formal release preparation"
      ]
    }
  }
};