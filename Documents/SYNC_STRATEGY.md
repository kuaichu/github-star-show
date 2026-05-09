# SYNC_STRATEGY

## 核心原则

GitHub 是远端事实来源，本地数据库是用户整理结果来源。

同步系统必须遵守：

- 不因为远端状态变化自动硬删除本地记录
- 增量同步只负责拉取新增或新增可见范围内的项目
- 全量同步才负责远端状态校验
- 用户手动整理字段优先级高于自动同步
- GitHub 请求失败时优先保留本地数据

## 同步模式

### 增量同步

用于日常同步。

职责：

- 拉取新 Star
- 更新已有 `Project` 的远端事实字段
- 创建或更新 `UserProject`
- 不处理取消 Star 的删除
- 不做重度远端状态校验

说明：

- 当前实现按最近 `starredAt` 作为 cutoff
- 如果用户还没有历史同步记录，增量请求会自动退化为首次全量同步
- 同步完成后，后台非阻塞刷新新增项目的 Release / Commit 时间

### 全量同步

用于修复和周期性校验。

职责：

- 拉取完整 Star 列表
- 对比本地 `UserProject`
- 标记远端状态：
  - `active`
  - `unstarred`
  - `archived`
  - `missing`
- 不自动删除本地关系

说明：

- 全量同步负责识别”当前 GitHub Star 列表里已经不存在”的项目
- 对这些项目只更新 `remoteStatus` 与说明信息，不直接移除本地记录
- 同步完成后，后台非阻塞刷新所有项目的 Release / Commit 时间

## 字段更新规则

### 可以由同步更新

- `Project.name`
- `Project.author`
- `Project.description`
- `Project.language`
- `Project.tags`
- `Project.stars`
- `Project.updatedAt`
- `Project.github`
- `Project.demo`
- `Project.latestReleaseAt`
- `Project.latestCommitAt`
- `Project.activityCheckedAt`
- `UserProject.remoteStatus`
- `UserProject.remoteStatusNote`
- `UserProject.remoteCheckedAt`
- `UserProject.starredAt`
- `UserProject.lastSyncedAt`

### 不应被同步覆盖

- `UserProject.category`
- `UserProject.categorySource`
- `UserProject.categoryReason`
- `UserProject.note`
- `UserProject.recommended`
- `UserProject.status`
- `UserProject.tags`
- `UserProject.features`
- `UserProject.demo`
- `UserProject.docs`

说明：

- 用户手动整理结果属于本地资产，优先级高于同步结果
- 自动同步可以刷新远端事实，但不能抹掉用户自己的整理工作

## 删除策略

默认删除只删除本地 `UserProject` 关系。

如果用户明确选择“同时取消 GitHub Star”：

1. 先调用 GitHub unstar
2. GitHub 成功后再删除本地关系
3. 如果 GitHub 失败，不删除本地关系
4. 返回明确错误给前端

说明：

- 删除本地关系和取消 GitHub Star 不是强绑定行为
- 本地删除应始终是默认安全路径

## 失败处理

同步过程中遇到：

- GitHub rate limit
- token 失效
- scope 不足
- 网络异常
- 仓库 404

应尽量：

- 保留已有本地数据
- 写入 `SyncRun`
- 返回可理解的错误
- 避免静默破坏性操作

补充说明：

- 仓库状态检查失败时，优先保留已有 `remoteStatus`
- README 拉取失败不应影响主同步结果
- 任何 GitHub 请求异常都不应演变成“清空本地项目”

## 远端状态策略

当前远端状态包括：

- `active`
- `unstarred`
- `archived`
- `missing`

处理原则：

- `active`：远端存在且仍在用户 Star 列表中
- `unstarred`：仓库存在，但当前用户已取消 Star
- `archived`：仓库仍存在，但已归档
- `missing`：仓库检查返回 404，可能已删除或迁移

这些状态只用于提示和整理，不直接驱动本地删除。

## 分类与同步边界

- 同步可以触发规则分类，但不能覆盖手动分类
- 规则重跑时应跳过 `categorySource = manual` 的项目
- AI 分类必须保持可选，不可变成同步主链路的前置依赖

## 禁止事项

- 不允许把全量同步改成硬覆盖本地库
- 不允许增量同步删除本地记录
- 不允许 GitHub 请求失败后清空项目状态
- 不允许用重建数据库代替同步修复
- 不允许为了同步方便而破坏 `Project / UserProject` 分层
