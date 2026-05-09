# Changelog

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
