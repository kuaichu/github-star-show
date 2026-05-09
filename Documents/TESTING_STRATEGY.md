# TESTING_STRATEGY

## 测试目标

测试重点不是追求高覆盖率数字，而是保护核心数据模型和同步行为不回归。

优先保护：

- 用户整理结果不被覆盖
- 同步状态正确
- 删除流程安全
- GitHub 失败时不破坏本地数据
- `Project / UserProject` 分层稳定

## 高风险模块

### 同步模块

必须测试：

- 首次全量同步创建 `Project` 和 `UserProject`
- 增量同步只新增或更新，不删除本地关系
- 全量同步能标记 `unstarred`
- `archived` 仓库能正确标记
- `missing` 仓库能正确标记
- GitHub 失败时保留本地数据
- `SyncRun` 能记录成功和失败结果

建议额外覆盖：

- 首次请求“增量同步”时自动退化为全量同步
- 全量同步不会因为远端缺失而删除本地 `UserProject`
- 远端状态检查失败时保留已有 `remoteStatus`

### 分类模块

必须测试：

- `topics` 优先命中
- `keyword` 次级命中
- `language fallback`
- 未命中进入 `uncategorized`
- `manual` 分类不会被自动分类覆盖
- `categorySource` 和 `categoryReason` 正确写入

建议额外覆盖：

- 多个 topic 同时命中时按规则顺序生效
- `JavaScript / TypeScript` 额外语言兜底正常
- 规则重跑时跳过 `categorySource = manual` 的项目

### 删除模块

必须测试：

- 本地删除只删除 `UserProject`
- 可选 GitHub unstar 成功后才删除本地关系
- GitHub unstar 失败时不删除本地关系
- 删除操作不会删除 `Project` 全局记录，除非未来有安全清理机制

建议额外覆盖：

- 当前授权 scope 不足时，返回明确错误
- 删除非当前用户关系时不会误删他人的 `UserProject`

### API 模块

必须测试：

- 未登录用户不能访问用户项目接口
- 当前用户只能看到自己的 `UserProject`
- 项目列表返回的是 `Project + UserProject` 聚合视图
- 编辑接口只修改允许修改的字段

建议额外覆盖：

- `/auth/me` 未登录时返回 `{ "user": null }`
- `/sync/me/status` 能返回最近同步记录
- AI 分类未配置时返回明确错误，而不是静默失败

## 推荐测试分层

### 单元测试

适合：

- 分类规则
- 字段保护逻辑
- 状态转换函数
- GitHub API response mapping

优先建议落地的单元测试目标：

- `classificationService`
- 远端状态映射逻辑
- 删除流程中的顺序控制

### 集成测试

适合：

- 同步流程
- 删除流程
- 用户项目聚合接口
- Prisma 数据读写

优先建议落地的集成测试目标：

- `syncService`
- `projects` 路由
- `sync` 路由
- `userProjectService`

### 手动回归清单

每次大改后手动确认：

- 登录正常
- 同步正常
- 项目列表正常
- 详情抽屉正常
- README 失败时页面不崩
- 未分类工作台可用
- 手动分类不会被同步覆盖

建议补充：

- 全量同步后远端状态标签显示正常
- 本地删除与可选 GitHub unstar 流程正常
- AI 分类关闭时页面仍可正常使用

## 测试数据原则

- 优先使用最小但有区分度的数据集
- 测试数据应覆盖：
  - 多用户
  - 同一仓库被多个用户收藏
  - 已手动分类项目
  - 未分类项目
  - 远端状态异常项目

- 不要把单用户 happy path 当成充分覆盖

## 失败场景策略

以下场景必须进测试计划：

- GitHub rate limit
- token 失效
- scope 不足
- 网络异常
- 仓库 404
- 部分同步失败

验证重点：

- 本地数据仍然存在
- 错误能返回到前端
- 不出现静默破坏

## 禁止事项

- 不允许用清空数据库来通过测试
- 不允许只测 happy path
- 不允许跳过删除和同步失败场景
- 不允许为了测试方便改变核心数据边界
- 不允许用 destructive reset 作为“测试修复手段”
