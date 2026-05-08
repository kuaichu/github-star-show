# GitHub Star Show

一个把 GitHub Star 同步成本地个人项目库的网站。

它不只是展示 Star 列表，而是把你收藏过的仓库同步到自己的系统里，支持分类、筛选、编辑、导入、同步记录，以及后续可选的 AI 分类增强。

## 项目定位

这个项目现在更接近一个“个人开源项目收藏库”，而不是单纯的 GitHub Star 镜像页。

核心思路是：

- 用户使用 GitHub 登录
- 后端读取当前用户的 GitHub Stars
- 把 Star 同步到本地数据库
- 为每个用户建立自己的项目库视图
- 支持在本地继续整理这些项目

## 当前已实现功能

### 1. GitHub 登录

- 支持 GitHub OAuth 登录
- 登录成功后会创建本地用户
- 会保存 GitHub 账号关联关系
- 会创建数据库 session，而不是只存在内存里

### 2. GitHub Star 同步

- 支持把当前登录用户的 GitHub Stars 同步到本地
- 首次同步默认执行全量同步
- 后续同步默认执行增量同步
- 支持手动触发全量重同步
- 会记录最近同步时间
- 会记录最近几次同步历史

### 3. 用户项目库

- 同一个 GitHub 仓库可以存在于全局 `projects` 主表
- 用户和项目之间通过 `user_projects` 建立关系
- 每个用户看到的是自己的项目库，而不是固定演示数据
- 用户项目编辑结果会持久化，刷新页面或重启后端后不会丢失

### 4. 项目展示页

- 首页展示当前用户的项目卡片
- 支持项目详情抽屉
- 支持分类导航
- 支持快速过滤
- 支持统计卡片
- 支持项目标签、语言、更新时间、备注等展示

### 5. 管理台

- 支持查看项目列表
- 支持编辑项目信息
- 支持删除当前用户与项目的关系
- 支持新建本地项目
- 支持通过 `owner/repo` 导入单个 GitHub 仓库

### 6. 分类系统

- 默认启用规则分类
- 会基于仓库名、描述、语言、topics 进行分类
- 当前分类包括：
  - `AI / LLM`
  - `运维 / 自建服务`
  - `网络 / NAS / 虚拟化`
  - `媒体 / 下载 / 图床`
  - `安全 / CTF`
  - `前端 UI / 可视化`
  - `自动化 / 效率工具`
  - `未分类 / 待整理`

### 7. AI 分类能力

AI 分类已经预留为可选增强能力，但默认不依赖它。

当前策略是：

- 规则分类始终可用
- 不配置 AI key，项目也能完整运行
- 配置后可以手动触发 AI 分类
- 适合后续开源场景，不强绑作者自己的 API

## 技术栈

### 前端

- Vue 3
- Vite
- 原生 CSS

### 后端

- Express
- Prisma
- SQLite

## 项目结构

```text
GithubStarShow/
├─ frontend/                  前端应用（Vue + Vite）
├─ backend/                   后端服务（Express + Prisma）
├─ index.html                 早期静态原型保留文件
└─ README.md
```

## 数据模型

当前数据库核心结构：

- `User`
  - 本地用户
  - 保存 GitHub 登录用户的基础资料

- `GithubAccount`
  - GitHub 账号绑定关系
  - 保存 GitHub 用户 ID、login、token 等

- `Session`
  - 登录 session
  - 用于持久化登录态

- `Project`
  - 全局项目主表
  - 以 GitHub 仓库为中心保存标准信息

- `UserProject`
  - 用户与项目关系表
  - 保存用户自己的分类、状态、备注、标签等覆盖信息

- `SyncRun`
  - 同步记录表
  - 保存同步来源、同步数量、同步时间

## 同步逻辑说明

### 首次同步

- 用户第一次同步时执行全量同步
- 会读取当前用户所有 GitHub Stars
- 写入 `projects`
- 同时为当前用户写入 `user_projects`

### 后续同步

- 默认执行增量同步
- 以当前用户项目库里最新的 `starredAt` 作为边界
- 只拉取这之后新增的 Star
- 减少不必要的全量重复处理

### 全量重同步

- 用户仍可以手动执行全量同步
- 适合修复分类、补齐老数据、或做兜底校验

### 当前同步限制

这版还没有做的一点是：

- GitHub 上已经取消 Star 的仓库，不会在全量同步时自动从用户项目库里移除

这可以作为后续优化项继续补。

## 当前后端接口

### 基础接口

- `GET /api/health`
- `GET /api/meta`

### 项目接口

- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

### GitHub 导入

- `POST /api/github/import-repo`

### 认证接口

- `GET /auth/github/login`
- `GET /auth/github/callback`
- `GET /auth/me`
- `POST /auth/logout`

### 同步接口

- `POST /api/sync/github-stars`
- `GET /api/sync/me/projects`
- `GET /api/sync/me/status`
- `POST /api/sync/reclassify-rules`

### AI 相关接口

- `GET /api/sync/ai-config`
- `POST /api/sync/ai-classify`

## 本地启动

### 1. 安装依赖

前后端分别安装：

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

### 2. 配置后端环境变量

在 `backend` 目录下创建 `.env`，可以参考下面这份：

```env
DATABASE_URL="file:./dev.db"
PORT=3000
CLIENT_ORIGIN="http://localhost:5173"
APP_BASE_URL="http://localhost:5173"
BACKEND_BASE_URL="http://localhost:3000"

GITHUB_TOKEN=""
GITHUB_API_BASE_URL="https://api.github.com"
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

OPENAI_API_KEY=""
OPENAI_API_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"
AI_CLASSIFICATION_ENABLED="false"
AI_CLASSIFICATION_MAX_PER_RUN="25"
AI_CLASSIFICATION_INCLUDE_README="false"
```

### 3. 初始化数据库

如果是第一次启动，先在 `backend` 目录执行：

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动后端

```bash
cd backend
npm run dev
```

默认地址：

- [http://localhost:3000](http://localhost:3000)

### 5. 启动前端

```bash
cd frontend
npm run dev
```

默认地址：

- [http://localhost:5173](http://localhost:5173)

## GitHub OAuth 配置

如果要启用真实 GitHub 登录和 Star 同步，需要创建一个 GitHub OAuth App。

推荐配置：

- Homepage URL:
  - `http://localhost:5173`
- Authorization callback URL:
  - `http://localhost:3000/auth/github/callback`

然后把以下变量写入 `backend/.env`：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## 适合开源的使用方式

这个项目现在采用“规则优先，AI 可选”的思路，比较适合开源：

- 不配置 AI，也可以完整使用
- 规则分类是默认主路径
- AI 只是辅助增强
- 后续部署者可以自己决定是否配置 AI key

## 当前已知待完善点

除了 AI 之外，比较值得继续做的功能有：

### 1. 同步体系继续完善

- 全量同步时自动处理已取消 Star 的项目
- 更细的同步日志
- 同步进度提示
- 同步失败记录

### 2. 管理台增强

- 批量编辑
- 批量分类
- 批量删除用户项目关系
- 手工锁定分类

### 3. 规则分类增强

- 扩充关键词字典
- 增加优先级控制
- 增加排除词
- 降低“未分类 / 待整理”的占比

### 4. 项目库能力增强

- 置顶 / Pin
- 导出 Markdown / JSON / CSV
- 公共分享页
- 更完善的个人备注系统

### 5. 工程化补足

- 增加测试
- 增加错误边界处理
- 补充部署文档
- 补充开源说明

## 当前产品状态总结

这版已经不是单纯 demo，而是一个能跑通核心业务链路的产品雏形：

- GitHub 登录可用
- 用户 Star 同步可用
- 用户数据持久化可用
- 规则分类可用
- 管理台编辑可用
- 增量同步已接入
- AI 为可选增强，不是刚需依赖

如果你准备继续把它往 GitHub 开源项目方向推进，这个基础已经是成立的。
