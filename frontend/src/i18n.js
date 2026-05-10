import { ref } from "vue";

const STORAGE_KEY = "github-star-show-locale";
const DEFAULT_LOCALE = "zh-CN";

const initialLocale = (() => {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
})();

export const locale = ref(initialLocale);

export const localeOptions = [
  { key: "zh-CN", label: "简中" },
  { key: "en", label: "English" }
];

const messages = {
  "zh-CN": {
    language: "语言",
    common: {
      resetFilters: "重置筛选",
      loadingShort: "处理中..."
    },
    login: {
      eyebrow: "GitHub 登录",
      titlePrefix: "从空白项目库开始，",
      titleAccent: "再同步你自己的 GitHub Stars。",
      subtitle: "这个产品以每个用户自己的 GitHub 账户为中心。登录、同步你的 Stars，然后浏览你自己的项目库，而不是固定的演示列表。",
      loginButton: "使用 GitHub 登录",
      adminButton: "打开后台"
    },
    signedIn: {
      eyebrow: "已登录",
      welcome: "欢迎，{name}",
      subtitle: "同步你的 GitHub Stars 来建立个人项目库。规则分类默认启用，AI 只辅助那些还需要帮助的项目。",
      sync: "同步中...",
      syncNew: "同步新增 Stars",
      syncInitial: "首次全量同步",
      fullResync: "全量重同步",
      rerunRules: "重跑规则分类",
      reclassifying: "分类处理中...",
      moreActions: "更多操作",
      openAdmin: "打开后台",
      logout: "退出登录",
      aiButtonPending: "AI 分类 {count} 个待处理项目",
      aiButtonRerun: "重新执行 AI 分类"
    },
    sidebar: {
      eyebrow: "个人项目库",
      copy: "同步你的星标仓库，持续分类整理，构建一个你随时都能回看的个人项目库。",
      productState: "产品状态：",
      connected: "前后端已联通",
      frontendStack: "前端技术栈：Vue 3 + Vite",
      backendStack: "后端技术栈：Express + Prisma",
      categoryTitle: "分类导航",
      categoryCaption: "按主题切换",
      remoteTitle: "远端状态",
      remoteCaption: "查看同步健康度",
      quickTitle: "快捷筛选",
      aboutTitle: "这是什么",
      aboutCopy: "它已经不再是一个静态展示页，而是一个按用户区分、支持持久化、项目管理和重复同步记录的 GitHub Star 同步应用。"
    },
    summary: {
      blankTitle: "默认空白",
      blankCopy: "在用户连接 GitHub 账户之前，首页保持为空。",
      userTitle: "按用户区分的项目库",
      userCopy: "每个用户在同步后都会看到自己 GitHub 星标过的仓库。",
      hybridTitle: "混合分类",
      hybridCopy: "规则负责基础分类，AI 可以选择性辅助更难的尾部项目。"
    },
    sync: {
      aiDisabled: "规则分类已启用。AI 分类是可选增强，目前处于关闭状态。",
      aiEnabled: "规则分类仍然是默认路径。AI 已分类 {classified} 个项目，还有 {pending} 个项目目前只依赖规则。",
      neverSynced: "你还没有同步过 GitHub Stars。",
      lastSync: "上次 GitHub Star 同步时间：{time}。后续同步默认会走增量模式。",
      fullDone: "全量同步完成。已同步 {total} 个星标仓库。",
      incrementalDone: "增量同步完成。已同步 {total} 个星标仓库。",
      syncingNew: "正在同步新增的 GitHub Stars...",
      syncingFull: "正在执行 GitHub Star 全量同步...",
      rerunRules: "正在为你的当前项目库重新运行规则分类...",
      rerunRulesDone: "规则分类完成。共处理 {total} 个项目，刷新了 {updated} 个。",
      aiRunning: "正在使用 {model} 为还没有 AI 结果的项目执行分类...",
      aiDone: "AI 分类完成。更新了 {updated} 个项目，跳过了 {skipped} 个。",
      aiUnavailable: "AI 分类尚未配置。请在后端环境变量中设置 OPENAI_API_KEY 并启用 AI_CLASSIFICATION_ENABLED。",
      remoteRecheckDone: "远端状态检查完成。刷新了 {updated} 个项目。",
      removedVisibleDone: "已从本地项目库移除 {count} 个项目。",
      batchRemoveConfirm: "要从本地项目库中移除当前筛选出的 {count} 个项目吗？"
    },
    remoteOps: {
      title: "远端异常操作",
      copy: "对当前远端状态视图中的 {count} 个项目进行操作。",
      recheck: "重新检查当前项目",
      rechecking: "检查中...",
      remove: "从本地移除当前项目",
      removing: "移除中..."
    },
    triage: {
      title: "未分类整理视图",
      subtitle: "先处理最需要整理的项目。卡片里可以直接改分类，减少频繁切换到后台编辑。",
      remaining: "当前还有 {count} 个未分类项目待整理。",
      cleared: "当前未分类项目已经清空，可以回到全部项目继续浏览。",
      quickPick: "推荐先把高频分类放在手边。",
      langHint: "语言常见归属：",
      exit: "返回全部项目",
      openAdmin: "去后台精修",
      source: "当前依据：{value}",
      quickCategories: "快速归类",
      markResearch: "标记待研究",
      saving: "保存中...",
      savedCategory: "已归类到 {category}",
      savedResearch: "已标记为待研究",
      saveFailed: "快速整理失败",
      batchDone: "已批量归类 {count} 个项目",
      batchResearchDone: "已批量标记 {count} 个项目为待研究"
    },
    batch: {
      selected: "已选 {count} 项"
    },
    stats: {
      total: "项目总数",
      recommended: "推荐项目",
      review: "待整理",
      remoteIssues: "远端异常"
    },
    pagination: {
      title: "分页",
      perPage: "每页数量",
      showingRange: "显示第 {start}-{end} 项，共 {total} 个项目。",
      previous: "上一页",
      next: "下一页"
    },
    projects: {
      title: "我的星标项目",
      showingRange: "显示第 {start}-{end} 项，共 {total} 个项目",
      total: "共 {total} 个项目",
      recommended: "推荐",
      ai: "AI",
      commitShort: "提交 {date}",
      releaseShort: "Release {date}",
      details: "查看详情",
      openGithub: "打开 GitHub",
      noResultsTitle: "没有匹配结果",
      noResultsCopy: "试试更宽一点的筛选条件，或者重置当前过滤器。",
      searchPlaceholder: "搜索名称、作者、描述或标签..."
    },
    drawer: {
      eyebrow: "项目详情",
      title: "项目详情",
      emptySubtitle: "选择一个项目来查看详情。",
      overview: "概览",
      remoteStatus: "远端状态",
      description: "描述",
      descriptionEmpty: "暂无描述。",
      highlights: "亮点",
      notes: "备注",
      notesEmpty: "还没有备注。",
      tags: "标签",
      ai: "AI 分类",
      close: "关闭",
      edit: "编辑",
      save: "保存",
      cancel: "取消",
      saveSuccess: "项目已更新。",
      saveFailed: "保存失败",
      latestRelease: "最新 Release",
      latestCommit: "最近提交",
      fields: {
        category: "分类",
        status: "状态",
        language: "语言",
        stars: "Stars",
        recommended: "是否推荐",
        yes: "是",
        no: "否"
      }
    },
    admin: {
      eyebrow: "后台模式",
      title: "项目管理",
      subtitle: "直接在这个界面中创建、编辑和移除项目记录。",
      back: "返回展示页",
      importTitle: "从 GitHub 导入",
      importCopy: "输入 <code>owner/repo</code> 或粘贴完整的 GitHub 仓库链接。",
      importPlaceholder: "owner/repo",
      importButton: "导入仓库",
      listTitle: "项目列表",
      newProject: "新建项目",
      category: "分类",
      allCategories: "全部分类",
      showing: "显示 {visible} / {total} 个项目",
      emptyList: "当前后台分类筛选下没有匹配的项目。",
      editProject: "编辑项目",
      createProject: "新建项目",
      deleteProject: "删除项目",
      save: "保存项目",
      reset: "重置表单",
      fields: {
        name: "名称",
        author: "作者",
        status: "状态",
        language: "语言",
        stars: "Stars",
        updatedAt: "更新日期",
        recommended: "推荐",
        description: "描述",
        highlights: "亮点说明（每行一条）",
        tags: "标签（逗号分隔）",
        github: "GitHub",
        demo: "演示链接",
        docs: "文档",
        notes: "备注"
      },
      aiCategory: "AI 分类",
      confirmDelete: "确认删除",
      removeLocalTitle: "从本地库中移除此项目",
      removeLocalCopy: "这会把 {name} 从你的本地项目库中移除，默认不会影响 GitHub 上的 Star 状态。",
      unstarCheckbox: "同时在 GitHub 上取消 Star",
      permissionNote: "当前授权还不支持取消 GitHub Star。要使用这个选项，需要退出后重新登录 GitHub 以授予新权限。",
      confirmRemove: "确认移除",
      cancel: "取消",
      categoryManagement: "分类管理",
      categoryManagementCopy: "创建、重命名或删除分类。所有分类均可修改。",
      rulesTitle: "分类规则管理",
      rulesCopy: "自定义分类规则。自定义规则优先于内置规则。支持主题匹配、关键词匹配和语言匹配。",
      rulesEmpty: "添加你的第一条分类规则，来覆盖默认分类行为。",
      deleteRule: "删除规则",
      addRule: "添加规则",
      ruleValuePlaceholder: "匹配值（如 pytorch）",
      ruleCategoryPlaceholder: "目标分类（如 AI / LLM）",
      ruleValueRequired: "匹配值和目标分类不能为空",
      ruleAddFailed: "添加规则失败",
      ruleDeleteFailed: "删除规则失败",
      addCategory: "添加分类",
      addCategoryPlaceholder: "新分类名称",
      renameCategory: "重命名",
      deleteCategory: "删除分类",
      confirmDeleteCategory: "删除分类「{name}」？所有使用此分类的项目将被移入未分类。",
      categoryNameRequired: "分类名称不能为空",
      categoryExists: "分类已存在",
      cannotDeleteDefault: "默认分类不可删除",
      cannotRenameDefault: "默认分类不可重命名",
      renameModalTitle: "重命名分类",
      renameModalNewName: "新名称",
      cancelRename: "取消重命名",
      categoryDeleteFailed: "删除分类失败",
      categoryRenameFailed: "重命名分类失败",
      autoSync: "自动同步",
      autoSyncCopy: "定时自动同步 GitHub Stars。后台每 60 秒检查一次调度，到期自动执行。",
      autoSyncEnable: "启用自动同步",
      autoSyncMode: "同步模式",
      autoSyncIncremental: "增量同步",
      autoSyncFull: "全量同步",
      autoSyncInterval: "同步间隔",
      autoSyncInterval_1: "每小时",
      autoSyncInterval_3: "每 3 小时",
      autoSyncInterval_6: "每 6 小时",
      autoSyncInterval_12: "每 12 小时",
      autoSyncInterval_24: "每天",
      autoSyncInterval_48: "每 2 天",
      autoSyncInterval_168: "每周",
      autoSyncNextRun: "下次执行：{time}",
      autoSyncDisabled: "自动同步已关闭",
      autoSyncEnabled: "自动同步已开启",
      autoSyncSaved: "自动同步设置已保存",
      autoSyncSaveFailed: "保存自动同步设置失败",
      autoSyncSaveBtn: "保存设置"
    },
    quickFilters: {
      recommended: "推荐",
      deployed: "已部署",
      using: "正在使用",
      research: "待研究"
    },
    states: {
      allProjects: "全部项目",
      allRemote: "全部远端状态",
      uncategorized: "未分类 / 待整理",
      defaultStatus: "收藏备用",
      remoteActive: "正常",
      remoteUnstarred: "已取消 Star",
      remoteMissing: "疑似失效",
      remoteArchived: "已归档",
      statusSaved: "收藏备用",
      statusDeployed: "已部署",
      statusUsing: "正在使用",
      statusResearch: "待研究"
    }
  },
  en: {
    language: "Language",
    common: {
      resetFilters: "Reset Filters",
      loadingShort: "Working..."
    },
    login: {
      eyebrow: "GitHub Login",
      titlePrefix: "Start with an empty library,",
      titleAccent: "then sync your own GitHub Stars.",
      subtitle: "This product is centered on each user's GitHub account. Sign in, sync your stars, then browse your own project library instead of a fixed demo list.",
      loginButton: "Login with GitHub",
      adminButton: "Open Admin"
    },
    signedIn: {
      eyebrow: "Signed In",
      welcome: "Welcome, {name}",
      subtitle: "Sync your GitHub Stars to build a personal library. Rule-based categories stay active by default, and AI only assists the projects that still need help.",
      sync: "Syncing...",
      syncNew: "Sync New Stars",
      syncInitial: "Initial Full Sync",
      fullResync: "Full Re-sync",
      rerunRules: "Re-run Rule Categories",
      reclassifying: "Reclassifying...",
      moreActions: "More Actions",
      openAdmin: "Open Admin",
      logout: "Logout",
      aiButtonPending: "Classify {count} Pending Projects",
      aiButtonRerun: "Re-run AI Classification"
    },
    sidebar: {
      eyebrow: "Personal Library",
      copy: "Sync your starred repositories, keep them categorized, and build a personal project library you can browse any time.",
      productState: "Product state:",
      connected: "frontend and backend connected",
      frontendStack: "Frontend stack: Vue 3 + Vite",
      backendStack: "Backend stack: Express + Prisma",
      categoryTitle: "Category Navigation",
      categoryCaption: "Switch by topic",
      remoteTitle: "Remote Status",
      remoteCaption: "Review sync health",
      quickTitle: "Quick Filters",
      aboutTitle: "What This Is",
      aboutCopy: "This is no longer a static showcase page. It is now a per-user GitHub Star sync app with persistence, project management, and repeatable sync history."
    },
    summary: {
      blankTitle: "Blank By Default",
      blankCopy: "The home screen stays empty until a user connects a GitHub account.",
      userTitle: "Per User Library",
      userCopy: "Each user sees their own GitHub starred repositories after sync.",
      hybridTitle: "Hybrid Classification",
      hybridCopy: "Rules handle the base categories, and AI can optionally assist with the harder cases."
    },
    sync: {
      aiDisabled: "Rule-based categories are active. AI classification is optional and currently disabled.",
      aiEnabled: "Rule-based categories remain the default path. AI has classified {classified} projects and {pending} still rely on rules only.",
      neverSynced: "You have not synced your GitHub Stars yet.",
      lastSync: "Last GitHub Star sync: {time}. Future syncs will default to incremental mode.",
      fullDone: "Full sync completed. Synced {total} starred repositories.",
      incrementalDone: "Incremental sync completed. Synced {total} starred repositories.",
      syncingNew: "Syncing new GitHub Stars...",
      syncingFull: "Running a full GitHub Star sync...",
      rerunRules: "Re-running rule-based classification for your current library...",
      rerunRulesDone: "Rule classification completed. Processed {total} projects and refreshed {updated}.",
      aiRunning: "Running AI classification with {model} for projects without AI results...",
      aiDone: "AI classification completed. Updated {updated} projects, skipped {skipped}.",
      aiUnavailable: "AI classification is not configured yet. Set OPENAI_API_KEY and enable AI_CLASSIFICATION_ENABLED in the backend env.",
      remoteRecheckDone: "Remote status recheck completed. Refreshed {updated} projects.",
      removedVisibleDone: "Removed {count} projects from your local library.",
      batchRemoveConfirm: "Remove {count} currently filtered projects from your local library?"
    },
    remoteOps: {
      title: "Remote Issue Actions",
      copy: "Operate on the {count} projects in the current remote status view.",
      recheck: "Recheck Visible Issues",
      rechecking: "Rechecking...",
      remove: "Remove Visible From Local",
      removing: "Removing..."
    },
    triage: {
      title: "Uncategorized Triage View",
      subtitle: "Handle the projects that need attention first. Reassign categories directly on each card instead of bouncing into admin for every edit.",
      remaining: "{count} uncategorized projects still need review.",
      cleared: "Your uncategorized queue is empty right now. You can jump back to the full library.",
      quickPick: "Keep the most common target categories within reach.",
      langHint: "Common categories by language:",
      exit: "Back to All Projects",
      openAdmin: "Open Admin",
      source: "Current signal: {value}",
      quickCategories: "Quick categorize",
      markResearch: "Mark To Research",
      saving: "Saving...",
      savedCategory: "Moved to {category}",
      savedResearch: "Marked as To Research",
      saveFailed: "Quick triage failed",
      batchDone: "Batch categorized {count} projects",
      batchResearchDone: "Batch marked {count} projects as To Research"
    },
    batch: {
      selected: "{count} selected"
    },
    stats: {
      total: "Total Projects",
      recommended: "Recommended",
      review: "Need Review",
      remoteIssues: "Remote Issues"
    },
    pagination: {
      title: "Pagination",
      perPage: "Per page",
      showingRange: "Showing {start}-{end} of {total} projects.",
      previous: "Previous",
      next: "Next"
    },
    projects: {
      title: "My Starred Projects",
      showingRange: "Showing {start}-{end} of {total} projects",
      total: "Total {total} projects",
      recommended: "Recommended",
      ai: "AI",
      commitShort: "Commit {date}",
      releaseShort: "Release {date}",
      details: "View Details",
      openGithub: "Open GitHub",
      noResultsTitle: "No Matching Results",
      noResultsCopy: "Try a broader keyword or reset the current filters.",
      searchPlaceholder: "Search by name, author, description or tags..."
    },
    drawer: {
      eyebrow: "Project Detail",
      title: "Project Detail",
      emptySubtitle: "Select a project to inspect its details.",
      overview: "Overview",
      remoteStatus: "Remote Status",
      description: "Description",
      descriptionEmpty: "No description.",
      highlights: "Highlights",
      notes: "Notes",
      notesEmpty: "No notes yet.",
      tags: "Tags",
      ai: "AI Classification",
      close: "Close",
      edit: "Edit",
      save: "Save",
      cancel: "Cancel",
      saveSuccess: "Project updated.",
      saveFailed: "Save failed",
      latestRelease: "Latest Release",
      latestCommit: "Latest Commit",
      fields: {
        category: "Category",
        status: "Status",
        language: "Language",
        stars: "Stars",
        recommended: "Recommended",
        yes: "Yes",
        no: "No"
      }
    },
    admin: {
      eyebrow: "Admin Mode",
      title: "Project Management",
      subtitle: "Create, edit, and remove project records directly from this screen.",
      back: "Back To Showcase",
      importTitle: "Import From GitHub",
      importCopy: "Use <code>owner/repo</code> or paste a full GitHub repository URL.",
      importPlaceholder: "owner/repo",
      importButton: "Import Repo",
      listTitle: "Project List",
      newProject: "New Project",
      category: "Category",
      allCategories: "All Categories",
      showing: "Showing {visible} of {total} projects",
      emptyList: "No projects match the current admin category filter.",
      editProject: "Edit Project",
      createProject: "New Project",
      deleteProject: "Delete Project",
      save: "Save Project",
      reset: "Reset Form",
      fields: {
        name: "Name",
        author: "Author",
        status: "Status",
        language: "Language",
        stars: "Stars",
        updatedAt: "Updated At",
        recommended: "Recommended",
        description: "Description",
        highlights: "Highlights (one per line)",
        tags: "Tags (comma separated)",
        github: "GitHub",
        demo: "Demo",
        docs: "Docs",
        notes: "Notes"
      },
      aiCategory: "AI category",
      confirmDelete: "Confirm Delete",
      removeLocalTitle: "Remove This Project From Your Local Library",
      removeLocalCopy: "This will remove {name} from your local project library. By default it will not affect the Star state on GitHub.",
      unstarCheckbox: "Also unstar on GitHub",
      permissionNote: "Your current authorization does not support removing GitHub stars yet. To use this option, log out and sign in to GitHub again with the updated scope.",
      confirmRemove: "Confirm Remove",
      cancel: "Cancel",
      categoryManagement: "Category Management",
      categoryManagementCopy: "Create, rename, or delete categories. All categories are fully editable.",
      rulesTitle: "Classification Rules",
      rulesCopy: "Create custom classification rules. Custom rules take priority over built-in rules. Supports topic matching, keyword matching, and language matching.",
      rulesEmpty: "No custom rules yet. Add a rule to override default classification behavior.",
      deleteRule: "Delete Rule",
      addRule: "Add Rule",
      ruleValuePlaceholder: "Match value (e.g. pytorch)",
      ruleCategoryPlaceholder: "Target category (e.g. AI / LLM)",
      ruleValueRequired: "Match value and target category are required",
      ruleAddFailed: "Failed to add rule",
      ruleDeleteFailed: "Failed to delete rule",
      addCategory: "Add Category",
      addCategoryPlaceholder: "New category name",
      renameCategory: "Rename",
      deleteCategory: "Delete Category",
      confirmDeleteCategory: 'Delete category "{name}"? All projects using this category will be moved to Uncategorized.',
      categoryNameRequired: "Category name is required",
      categoryExists: "Category already exists",
      renameModalTitle: "Rename Category",
      renameModalNewName: "New name",
      cancelRename: "Cancel Rename",
      categoryDeleteFailed: "Failed to delete category",
      categoryRenameFailed: "Failed to rename category",
      autoSync: "Auto Sync",
      autoSyncCopy: "Schedule automatic GitHub Star syncs. The scheduler checks every 60 seconds and runs when due.",
      autoSyncEnable: "Enable Auto Sync",
      autoSyncMode: "Sync Mode",
      autoSyncIncremental: "Incremental",
      autoSyncFull: "Full",
      autoSyncInterval: "Interval",
      autoSyncInterval_1: "Every hour",
      autoSyncInterval_3: "Every 3 hours",
      autoSyncInterval_6: "Every 6 hours",
      autoSyncInterval_12: "Every 12 hours",
      autoSyncInterval_24: "Every day",
      autoSyncInterval_48: "Every 2 days",
      autoSyncInterval_168: "Every week",
      autoSyncNextRun: "Next run: {time}",
      autoSyncDisabled: "Auto sync is disabled",
      autoSyncEnabled: "Auto sync is on",
      autoSyncSaved: "Auto sync settings saved",
      autoSyncSaveFailed: "Failed to save auto sync settings",
      autoSyncSaveBtn: "Save Settings"
    },
    quickFilters: {
      recommended: "Recommended",
      deployed: "Deployed",
      using: "In Use",
      research: "To Research"
    },
    states: {
      allProjects: "All Projects",
      allRemote: "All Remote Statuses",
      uncategorized: "Uncategorized / Needs Review",
      defaultStatus: "Saved for Later",
      remoteActive: "Active",
      remoteUnstarred: "Unstarred",
      remoteMissing: "Possibly Missing",
      remoteArchived: "Archived",
      statusSaved: "Saved for Later",
      statusDeployed: "Deployed",
      statusUsing: "In Use",
      statusResearch: "To Research"
    }
  }
};

const categoryMap = {
  "AI / LLM": "AI / LLM",
  "自动化 / 效率工具": "Automation / Productivity",
  "媒体 / 下载 / 图床": "Media / Downloads / Images",
  "网络 / NAS / 虚拟化": "Network / NAS / Virtualization",
  "未分类 / 待整理": "Uncategorized / Needs Review",
  "运维 / 自建服务": "Ops / Self-hosted",
  "前端 UI / 可视化": "Frontend UI / Visualization",
  "安全 / CTF": "Security / CTF",
  "全部项目": "All Projects"
};

const statusMap = {
  "收藏备用": "Saved for Later",
  "已部署": "Deployed",
  "正在使用": "In Use",
  "待研究": "To Research"
};

function getMessage(path) {
  return path.split(".").reduce((value, key) => value?.[key], messages[locale.value]) ?? path;
}

export function t(path, params = {}) {
  const template = getMessage(path);
  if (typeof template !== "string") {
    return path;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ""));
}

export function setLocale(nextLocale) {
  locale.value = nextLocale;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
  }
}

export function translateCategory(value) {
  if (locale.value === "zh-CN") {
    return value === "__all_projects__" ? t("states.allProjects") : value;
  }

  return categoryMap[value] || value;
}

export function translateStatus(value) {
  if (locale.value === "zh-CN") {
    return value;
  }

  return statusMap[value] || value;
}

export function translateRemoteStatus(status) {
  if (status === "active") return t("states.remoteActive");
  if (status === "unstarred") return t("states.remoteUnstarred");
  if (status === "missing") return t("states.remoteMissing");
  if (status === "archived") return t("states.remoteArchived");
  return status || "";
}
