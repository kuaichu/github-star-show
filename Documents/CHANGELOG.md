# Changelog

## v0.1.0-beta.8

### Admin Panel UI Polish

- Redesigned auto-sync panel: switch removed from dark card, now label-above with inline switch row, enlarged toggle (56×32) with visible off-state border
- Full-width filled save button (brand green + dark text), replacing outline style
- Three-state status logic: off→disabled, on→enabled, on+scheduled→next run time
- Success toast auto-dismisses after 2 seconds
- Replaced pill/chip category labels with 4px colored bar + left-aligned text
- Deeper row separators and divider between category list and add-area
- Unified rename/delete buttons at 28px height for compact list rows
- Localized rule type dropdown (Topic/Keyword/Language → Chinese labels) with focus shadow
- Moved admin eyebrow badge into subtitle beneath page title
- Fixed "Topic matching" → "主题匹配" in rules description
- Rule dropdown options now show Chinese labels while keeping English internal values

## Project Drawer Refinement

- Moved the `recommended` control out of the main admin form and into the project drawer edit flow.
- Reworked the drawer `recommended` control into a switch-style inline setting.
- Hides top shortcut buttons and drawer tabs while editing, then restores them after save/cancel.
- Removed the duplicated `Links` tab and kept GitHub / Demo / Docs shortcuts in the drawer header only.
- Added a `Release` shortcut in the drawer header when GitHub metadata and release activity are available.
- Fixed drawer save to submit a full project payload so partial edits no longer fail with `name is required`.

## v0.1.0-beta.6

### 自动定时同步

后端：
- 新增 `AutoSyncConfig` Prisma 模型（userId 唯一、enabled、mode、intervalHours、nextScheduledAt）
- 新增 `SchedulerService`：基于 `setInterval` 每 60 秒轮询到期配置
- `server.js` 启动时自动注册调度器
- `GET /api/sync/auto-config` 和 `PUT /api/sync/auto-config` API 端点
- 跳过正在同步中的用户，避免并发
- GitHub API 失败不影响本地数据
- PM2 重启后调度器随 server 自动启动

前端：
- 后台管理新增「自动同步」折叠面板（`AdminPanel.vue`）
- 支持启用/禁用、模式（增量/全量）、间隔（1/3/6/12/24/48/168 小时）
- 显示下次执行时间
- 中英文完整翻译

设计原则：
- 自动同步是可选功能，默认不开启
- 用户后台手动配置后生效
- 自托管场景下后端进程必须常驻运行

### 已知问题

- Edit 工具对中文文本的匹配存在编码问题，需通过 PowerShell 或 Node 脚本 workaround
- Windows 下 Prisma generate 偶发 EPERM 文件锁错误，需重启 Node 进程

## v0.1.0-beta.5

### 维护活跃度功能

后端：
- Project 模型新增 `latestReleaseAt`、`latestCommitAt`、`activityCheckedAt` 字段
- 新增 `fetchLatestRelease` / `fetchLatestCommit` GitHub API 函数
- 新增 `updateProjectActivity` 轻量更新函数，不触及 Project 其他字段
- 同步流程末尾 fire-and-forget 非阻塞刷新活动数据
- 增量同步只刷新增项目，全量同步刷全部项目
- API 失败静默保留已有值，不阻塞主同步

前端展示（三轮 UI 迭代）：

第一轮：
- 项目卡片 meta 区新增活动行（Release / Commit 相对时间）
- 详情抽屉 metaItems 新增 combined 活动条目

第二轮：
- 卡片右上角替换 updatedAt，改为两行时间（最近提交 + 最新 Release）
- 详情抽屉拆为独立条目（最新 Release / 最近提交）
- 移除概览 grid 中的"更新时间"避免冗余

第三轮：
- 右上角清空，顶部只保留分类 tag / 语言 tag
- 活跃度移至作者/Star 区下方，单行紧凑格式
- 日期格式统一为 YYYY-MM-DD，超长省略
- opacity 0.65 低对比度 secondary style

### 排序增强

- 新增按 Star 时间排序（正序 / 倒序）
- 排序选项按用户使用意图重新排列：Star 时间 → 更新时间 → Stars → 名称
- 默认排序从 `stars-desc` 改为 `starred-desc`

### Hero 同步状态布局修复

- 同步状态文本在右上角跳动问题修复
- 改为两列 grid 布局：内容左列 + 按钮右列
- 所有同步状态下位置稳定

### 已知问题

- Edit 工具对中文文本的匹配存在编码问题，需通过 PowerShell 或 Node 脚本 workaround
- Windows 下 Prisma generate 偶发 EPERM 文件锁错误，需重启 Node 进程
