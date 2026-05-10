export const BUILT_WITH = [
  { category: "AI / 模型", items: ["DeepSeek V4", "GPT-5.4"] },
  { category: "开发工具", items: ["Codex", "Claude Code"] },
  { category: "前端 / 框架", items: ["Vue 3", "Vite"] },
  { category: "后端", items: ["Express", "Prisma", "SQLite"] },
  { category: "部署 / 运维", items: ["Cloudflare Pages", "1Panel", "PM2"] }
];

export const CHANGELOG_CONTENT = {
  "zh-CN": {
    eyebrow: "更新记录",
    title: "版本信息与更新历史",
    subtitle: "这里记录当前 demo 已支持的能力，以及每个版本新增或调整的内容。",
    close: "关闭",
    currentVersion: {
      heading: "\u5f53\u524d\u7248\u672c",
      version: "v0.1.0-beta.8",
      summary: "\u540e\u53f0\u7ba1\u7406\u9762\u677f\u5168\u9762 UI \u6253\u78e8",
      badge: "Beta"
    },
    capabilities: {
      heading: "\u5f53\u524d\u80fd\u529b",
      items: [
        "GitHub OAuth \u767b\u5f55",
        "\u6309\u7528\u6237\u9694\u79bb\u7684 Star \u540c\u6b65",
        "\u589e\u91cf\u540c\u6b65\u4e0e\u5168\u91cf\u91cd\u540c\u6b65",
        "\u89c4\u5219\u5206\u7c7b\u4e0e\u5206\u7c7b\u5bfc\u822a",
        "\u8fdc\u7aef\u72b6\u6001\u8ffd\u8e2a",
        "\u540e\u53f0\u7f16\u8f91\u4e0e\u9879\u76ee\u7ba1\u7406",
        "\u5220\u9664\u65f6\u53ef\u9009\u540c\u6b65\u53d6\u6d88 GitHub Star",
        "\u9879\u76ee\u8be6\u60c5\u5185 README \u9884\u89c8",
        "\u9879\u76ee\u8be6\u60c5\u62bd\u5c49\u5185\u76f4\u63a5\u7f16\u8f91\u5206\u7c7b/\u72b6\u6001/\u5907\u6ce8/\u63a8\u8350\u6807\u8bb0",
        "\u672a\u5206\u7c7b\u89c6\u56fe\u6279\u91cf\u591a\u9009\u6574\u7406",
        "\u81ea\u5b9a\u4e49\u5206\u7c7b\u89c4\u5219\u7ba1\u7406",
        "\u9879\u76ee\u7ef4\u62a4\u6d3b\u8dc3\u5ea6\u5c55\u793a\uff08Release / Commit \u65f6\u95f4\uff09",
        "\u591a\u79cd\u6392\u5e8f\u65b9\u5f0f\uff08Star \u65f6\u95f4\u3001\u66f4\u65b0\u65f6\u95f4\u3001Stars\u3001\u540d\u79f0\uff09",
        "\u81ea\u52a8\u5b9a\u65f6\u540c\u6b65\uff08\u53ef\u9009\uff0c\u540e\u53f0\u914d\u7f6e\uff09",
        "\u5206\u7c7b\u7ba1\u7406\u9762\u677f\u5217\u8868\u6837\u5f0f\u4f18\u5316\u4e0e\u7edf\u4e00\u64cd\u4f5c\u6309\u94ae",
        "\u81ea\u52a8\u540c\u6b65\u9762\u677f\u5168\u5bbd\u586b\u5145\u5f0f\u4fdd\u5b58\u6309\u94ae\u4e0e Toast \u63d0\u793a"
      ]
    },
    changelog: {
      heading: "\u66f4\u65b0\u5386\u53f2",
      releases: [
        {
          version: "v0.1.0-beta.8",
          date: "2026-05-10",
          badge: "UI \u4f18\u5316",
          items: [
            "\u81ea\u52a8\u540c\u6b65\u9762\u677f\u91cd\u6784\uff1a\u5f00\u5173\u79fb\u9664\u6df1\u8272\u5361\u7247\u80cc\u666f\uff0c\u6539\u4e3a label \u5728\u4e0a + \u5f00\u5173\u884c\u6a2a\u5411\u5e03\u5c40",
            "\u5f00\u5173\u5c3a\u5bf8\u653e\u5927\u81f3 56\u00d732\uff0c\u5173\u95ed\u6001\u589e\u52a0\u53ef\u89c1\u8fb9\u6846",
            "\u5168\u5bbd\u586b\u5145\u8272\u4fdd\u5b58\u6309\u94ae\uff08\u4e3b\u9898\u7eff + \u6df1\u8272\u6587\u5b57\uff09\uff0c\u66ff\u4ee3\u63cf\u8fb9\u6309\u94ae",
            "\u72b6\u6001\u6587\u5b57\u4e09\u6bb5\u903b\u8f91\uff1a\u5173\u95ed\u2192\u5df2\u5173\u95ed\u3001\u5f00\u542f\u2192\u5df2\u5f00\u542f\u3001\u6709\u4e0b\u6b21\u65f6\u95f4\u2192\u4e0b\u6b21\u6267\u884c",
            "\u4fdd\u5b58\u6210\u529f\u63d0\u793a\u6539\u4e3a 2 \u79d2\u81ea\u52a8\u6d88\u5931 Toast",
            "\u5206\u7c7b\u7ba1\u7406\u5217\u8868\u53bb\u6389 pill \u80f6\u56ca\u6837\u5f0f\uff0c\u6539\u4e3a\u5de6\u4fa7 4px \u5f69\u8272\u7ad6\u6761 + \u5de6\u5bf9\u9f50\u6587\u5b57",
            "\u5206\u7c7b\u5217\u8868\u6bcf\u884c\u5e95\u90e8\u5206\u9694\u7ebf\u52a0\u6df1\uff0c\u5217\u8868\u4e0e\u6dfb\u52a0\u533a\u57df\u4e4b\u95f4\u52a0\u5206\u9694\u7ebf",
            "\u91cd\u547d\u540d/\u5220\u9664\u6309\u94ae\u7edf\u4e00 28px \u9ad8\u5ea6\uff0c\u5217\u8868\u66f4\u7d27\u51d1",
            "\u89c4\u5219\u7ba1\u7406\u4e0b\u62c9\u6846\u6c49\u5316\uff08\u4e3b\u9898/\u5173\u952e\u8bcd/\u8bed\u8a00\uff09\uff0c\u805a\u7126\u65f6 box-shadow \u6539\u5584",
            "\u540e\u53f0\u6807\u9898\u533a\u300c\u540e\u53f0\u6a21\u5f0f\u300d\u6807\u7b7e\u6539\u4e3a\u526f\u6807\u9898\uff0c\u878d\u5165\u6807\u9898\u5c42\u7ea7",
            "\u5206\u7c7b\u89c4\u5219\u63cf\u8ff0\u6587\u5b57\u300cTopic \u5339\u914d\u300d\u6539\u4e3a\u300c\u4e3b\u9898\u5339\u914d\u300d"
          ]
        },
        {
          version: "v0.1.0-beta.7",
          date: "2026-05-10",
          badge: "UI \u4f18\u5316",
          items: [
            "\u5c06\u63a8\u8350\u5165\u53e3\u4ece\u540e\u53f0\u4e3b\u7ba1\u7406\u8868\u5355\u79fb\u5165\u9879\u76ee\u8be6\u60c5\u62bd\u5c49\u7f16\u8f91\u533a",
            "\u5c06\u63a8\u8350\u6807\u8bb0\u91cd\u505a\u4e3a\u5f00\u5173\u5f0f\u884c\u5185\u8bbe\u7f6e\uff0c\u4f18\u5316\u62bd\u5c49\u7f16\u8f91\u533a\u5c42\u7ea7",
            "\u8fdb\u5165\u7f16\u8f91\u6001\u65f6\u81ea\u52a8\u9690\u85cf\u9876\u90e8\u5feb\u6377\u6309\u94ae\u548c\u9875\u7b7e\uff0c\u907f\u514d\u53ef\u70b9\u51fb\u4f46\u65e0\u6cd5\u5207\u6362\u7684\u72b6\u6001\u51b2\u7a81",
            "\u79fb\u9664\u91cd\u590d\u7684\u94fe\u63a5\u9875\u7b7e\uff0c\u4ec5\u4fdd\u7559\u9876\u90e8 GitHub / \u6f14\u793a / \u6587\u6863 \u5feb\u6377\u5165\u53e3",
            "\u5f53\u5b58\u5728 Release \u6d3b\u8dc3\u5ea6\u4fe1\u606f\u65f6\uff0c\u62bd\u5c49\u9876\u90e8\u65b0\u589e Release \u5feb\u6377\u6309\u94ae",
            "\u4fee\u590d\u62bd\u5c49\u5c40\u90e8\u7f16\u8f91\u4fdd\u5b58\u65f6\u51fa\u73b0 name is required \u7684\u6821\u9a8c\u9519\u8bef"
          ]
        },
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
      version: "v0.1.0-beta.8",
      summary: "Admin panel UI polish and refinement",
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
        "In-drawer editing of category, status, notes, and recommended flag",
        "Batch multi-select triage in uncategorized view",
        "Custom classification rule management",
        "Maintenance activity display (Release / Commit time)",
        "Multiple sort options (Star time, Updated, Stars, Name)",
        "Scheduled auto-sync (optional, configurable in admin)",
        "Polished category management list with consistent action buttons",
        "Full-width filled save button with auto-dismiss toast in auto-sync panel"
      ]
    },
    changelog: {
      heading: "Changelog",
      releases: [
        {
          version: "v0.1.0-beta.8",
          date: "2026-05-10",
          badge: "UI Refinement",
          items: [
            "Redesigned auto-sync panel: switch removed from dark card, now label-above with inline switch row",
            "Enlarged toggle to 56×32 with visible off-state border",
            "Full-width filled save button (brand green + dark text), replacing outline style",
            "Three-state status logic: off→disabled, on→enabled, on+scheduled→next run time",
            "Success toast auto-dismisses after 2 seconds",
            "Replaced pill/chip category labels with 4px colored bar + left-aligned text",
            "Deeper row separators and divider between category list and add-area",
            "Unified rename/delete buttons at 28px height for compact list rows",
            "Localized rule type dropdown (Topic/Keyword/Language → Chinese labels) with focus shadow",
            "Moved admin eyebrow badge into subtitle beneath page title",
            "Fixed 'Topic matching' → '主题匹配' in rules description"
          ]
        },
        {
          version: "v0.1.0-beta.7",
          date: "2026-05-10",
          badge: "UI Refinement",
          items: [
            "Moved the recommended entry out of the main admin form and into the project drawer edit flow",
            "Reworked the recommended control into a switch-style inline setting inside the drawer",
            "Edit mode now hides header shortcut buttons and content tabs to avoid conflicting navigation states",
            "Removed the duplicated Links tab and kept GitHub / Demo / Docs as header shortcuts only",
            "Added a Release shortcut in the drawer header when release activity is available",
            "Fixed partial drawer saves failing with the validation error: name is required"
          ]
        },
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
            "Scheduler auto-starts with the server after PM2 restart",
            "Project drawer UI refinement: recommended moved to a switch-style inline setting and edit mode now hides shortcut links and tabs",
            "Project drawer now shows a Release shortcut when release activity is available"
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
        "Formal release preparation"
      ]
    }
  }
};
