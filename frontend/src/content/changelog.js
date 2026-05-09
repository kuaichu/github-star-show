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
      version: "v0.1.0-beta.6",
      summary: "自动定时同步调度器",
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
        "项目详情内 README 预览",
        "项目详情抽屉内直接编辑分类/状态/备注",
        "未分类视图批量多选整理",
        "自定义分类规则管理",
        "项目维护活跃度展示（Release / Commit 时间）",
        "多种排序方式（Star 时间、更新时间、Stars、名称）",
        "自动定时同步（可选，后台配置）"
      ]
    },
    changelog: {
      heading: "更新历史",
      releases: [
        {
          version: "v0.1.0-beta.6",
          date: "2026-05-10",
          badge: "功能更新",
          items: [
            "自动定时同步调度器：后端 setInterval 每 60 秒轮询到期任务",
            "后台管理新增自动同步配置面板（启用/禁用、模式、间隔）",
            "可选功能，默认不开启，用户后台手动配置",
            "跳过正在同步中的用户，避免并发执行",
            "GitHub API 失败不破坏本地数据",
            "PM2 重启后调度器随服务自动启动"
          ]
        },
        {
          version: "v0.1.0-beta.5",
          date: "2026-05-10",
          badge: "功能更新",
          items: [
            "项目维护活跃度：后端采集 Release / Commit 时间，同步后台非阻塞刷新",
            "卡片活跃度展示：作者/Star 区下方单行紧凑 YYYY-MM-DD 格式",
            "抽屉概览独立展示最新 Release 和最近提交，移除冗余更新时间",
            "新增 Star 时间排序，默认排序改为 Star 时间最新",
            "排序选项按用户意图重排：Star 时间 → 更新时间 → Stars → 名称",
            "修复 Hero 同步状态文本位置跳动问题"
          ]
        },
        {
          version: "v0.1.0-beta.4",
          date: "2026-05-09",
          badge: "功能更新",
          items: [
            "项目详情抽屉内直接编辑分类、状态、备注、推荐标记",
            "未分类整理视图支持多选批量归类与批量标记待研究",
            "后台新增自定义分类规则管理面板，支持 Topic/Keyword/Language 匹配",
            "自定义分类规则在同步和重跑时优先于内置规则生效"
          ]
        },
        {
          version: "v0.1.0-beta.3",
          date: "2026-05-09",
          badge: "功能更新",
          items: [
            "分类规则扩充",
            "修复English下的已知Bug",
            "分类管理重构为为按用户隔离",
            "新增搜索框，支持按名称/作者/描述/标签筛选",
            "新增排序切换，支持按 Stars/名称/更新时间升降序",
            "产品级 UI 精修：Hero 区精简、更多操作下拉、侧栏手风琴、卡片悬停 glow、标签降亮度、分页压缩、间距呼吸感"
          ]
        },
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
        "自动化定时同步",
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
      version: "v0.1.0-beta.6",
      summary: "Scheduled auto-sync scheduler",
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
        "README preview in project details",
        "In-drawer editing of category, status, notes",
        "Batch multi-select triage in uncategorized view",
        "Custom classification rule management",
        "Maintenance activity display (Release / Commit time)",
        "Multiple sort options (Star time, Updated, Stars, Name)",
        "Scheduled auto-sync (optional, configurable in admin)"
      ]
    },
    changelog: {
      heading: "Changelog",
      releases: [
        {
          version: "v0.1.0-beta.6",
          date: "2026-05-10",
          badge: "Feature Update",
          items: [
            "Scheduled auto-sync: setInterval-based scheduler polls every 60s",
            "Admin panel: auto-sync config (enable/disable, mode, interval)",
            "Opt-in feature, default disabled, configured by user in admin",
            "Skips users currently syncing to prevent concurrent execution",
            "GitHub API failures do not corrupt local data",
            "Scheduler auto-starts with the server after PM2 restart"
          ]
        },
        {
          version: "v0.1.0-beta.5",
          date: "2026-05-10",
          badge: "Feature Update",
          items: [
            "Maintenance activity: backend collects Release/Commit timestamps, fire-and-forget background refresh",
            "Compact YYYY-MM-DD activity line below author/star meta on cards",
            "Drawer overview now shows Latest Release and Latest Commit as separate entries, removed redundant Updated date",
            "Sort by star time added, default sort changed to star-desc",
            "Sort options reordered by user intent: Star time → Updated → Stars → Name",
            "Fixed Hero sync status text position jumping"
          ]
        },
        {
          version: "v0.1.0-beta.4",
          date: "2026-05-09",
          badge: "Feature Update",
          items: [
            "In-drawer editing for category, status, notes, and recommended flag",
            "Batch triage with multi-select categorization and mark-as-research in uncategorized view",
            "Custom classification rule management panel in Admin (Topic/Keyword/Language matching)",
            "Custom rules take priority over built-in rules during sync and reclassification"
          ]
        },
        {
          version: "v0.1.0-beta.3",
          date: "2026-05-09",
          badge: "Feature Update",
          items: [
            "Expanded Category Rules",
            "Fixed Known Bugs in English",
            "Restructured Category Management to be Isolated by User",
            "Added search box to filter by name, author, description, or tags",
            "Added sort switching by Stars/name/last updated",
            "UI refinement: compact hero, more-actions dropdown, sidebar accordion, card hover glow, dimmer tags, lighter pagination, breathing spacing"
          ]
        },
        {
          version: "v0.1.0-beta.2",
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
        "Automated scheduled sync",
        "Formal release preparation"
      ]
    }
  }
};
