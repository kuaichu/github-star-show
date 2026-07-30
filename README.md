# GitHub Star Show

把 GitHub Stars 变成一个可整理、可维护、可自托管的个人开源项目库。

`GitHub Star Show` 是一个面向 GitHub Star 工作流的自托管 Web 应用。用户可以使用 GitHub 登录，拉取自己的 Star 仓库，同步到本地数据库中，再继续做分类、备注、状态管理和远端状态跟踪，而不是把 Star 永远埋在 GitHub 的长列表里。

## 在线 Demo

- 演示地址：[https://stars.yeque.top](https://stars.yeque.top)
- 当前公开版本：`v0.1.0-beta.5`
- 当前定位：公开测试用 demo，未来主形态是“用户自部署到自己的服务器”

## 当前已经支持的功能

### 认证与用户隔离

- GitHub OAuth 登录
- 持久化会话
- 按用户隔离的数据视图
- 同一个仓库可以被多个用户同时收藏，但彼此的备注、分类和状态互不覆盖

### 同步能力

- 首次全量同步 GitHub Stars
- 后续默认增量同步
- 手动执行全量重同步
- 同步记录与最近同步时间展示
- 支持从本地删除项目时，可选同时在 GitHub 上取消 Star

### 本地项目库

- 将 GitHub Star 落库存储
- 项目卡片展示、分页、筛选、详情抽屉
- 项目详情支持 README 预览
- 管理后台支持编辑项目元信息
- 支持手动导入单个 GitHub 仓库
- 多种排序方式：Star 时间、更新时间、Stars 数、名称升降序
- 项目维护活跃度展示（Release 时间、Commit 时间）

### 分类与整理

- 默认规则分类
- 分类导航
- 支持自定义分类
- 自定义分类保存后，左侧分类导航会立即刷新
- 默认分类顺序保持稳定，自定义分类追加在默认分类之后

### 远端状态感知

- `active`
- `unstarred`
- `archived`
- `missing`

系统不会因为远端状态变化就直接删除本地记录，而是优先保留本地整理结果，并通过状态标签提示用户处理。

### 后台管理

- 创建本地项目
- 编辑分类、备注、标签、状态、链接
- 新建项目时支持退出新建态
- 返回展示页后再次进入后台，不会卡在空白新建表单

### 体验与界面

- 中英文切换
- 更新记录抽屉
- 版本信息与技术栈说明
- 轻量动画与更统一的深色界面风格

## 当前技术栈

### 前端

- Vue 3
- Vite
- 原生 CSS

### 后端

- Express
- Prisma
- SQLite

### 当前演示部署

- 前端：Cloudflare Pages
- 后端：1Panel 自托管
- 进程守护：PM2

## 数据模型概览

项目当前的核心数据拆分如下：

- `Project`
  - 全局仓库元数据
  - 共享的 GitHub 仓库基础事实

- `UserProject`
  - 用户与仓库的关系表
  - 保存用户自己的分类、备注、状态、远端状态等

- `User`
  - 本地应用用户

- `GithubAccount`
  - GitHub 身份映射、授权信息、能力边界

- `Session`
  - 持久化登录会话

- `SyncRun`
  - 同步历史

## 本地开发

### 1. 安装依赖

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

### 2. 配置后端环境变量

从 `backend/.env.example` 复制生成 `backend/.env`，示例：

```env
DATABASE_URL="file:./dev.db"
PORT=3000
CLIENT_ORIGIN="http://localhost:5173"
APP_BASE_URL="http://localhost:5173"
BACKEND_BASE_URL="http://localhost:3000"

GITHUB_API_BASE_URL="https://api.github.com"
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GITHUB_TOKEN_ENCRYPTION_KEY="<base64-encoded 32-byte key>"
SESSION_TTL_DAYS="7"
SESSION_COOKIE_SAME_SITE="lax"
# SESSION_COOKIE_SECURE="true"
TRUST_PROXY="false"
OAUTH_LOGIN_RATE_LIMIT_MAX="10"
OAUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS="60"
OAUTH_STATE_MAX_ACTIVE="10000"

OPENAI_API_KEY=""
OPENAI_API_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"
AI_CLASSIFICATION_ENABLED="false"
AI_CLASSIFICATION_MAX_PER_RUN="25"
AI_CLASSIFICATION_INCLUDE_README="false"
```

`GITHUB_TOKEN_ENCRYPTION_KEY` 必须是独立生成、严格 base64 编码的 32 字节密钥；
生产环境缺失时后端会拒绝启动。本地和测试环境可在不涉及 GitHub token 的流程中
不配置该密钥，但 OAuth 登录、历史明文 token 迁移和任何 token 持久化都会安全失败，
不会降级为明文写入。生产环境默认启用 Secure cookie；无论 SameSite 使用 `lax`
还是 `none`，只要生产 `.env` 显式写入 `SESSION_COOKIE_SECURE=false`，后端都会拒绝
启动。本地非生产 HTTP 在未设置该变量时会自动保持关闭。
认证加固迁移会清空旧会话和旧明文 GitHub token，因此升级后所有用户需要重新登录。
浏览器从 `/auth/me` 读取 `csrfToken` 后只应保存在内存，并在所有
POST/PUT/PATCH/DELETE 请求的 `X-CSRF-Token` 请求头中发送。校验失败会返回稳定的
`code: "CSRF_INVALID"`。

### Cookie、CORS 与 HTTPS 部署

同站部署（例如 HTTPS 的 `app.example.com` 与 `api.example.com`，或本地不同端口）
使用默认 `SESSION_COOKIE_SAME_SITE=lax`。真正跨站的前后端（例如 `pages.dev` 前端与
另一个站点的 API）必须同时满足：

- 前后端都使用 HTTPS；
- 后端设置 `SESSION_COOKIE_SAME_SITE=none`，此模式会强制 Session cookie 带
  `Secure`；
- `CLIENT_ORIGIN` 只填写一个精确前端 origin（协议、域名和端口），不能写逗号列表；
- `APP_BASE_URL` 可带前端路径，但其 origin 必须与 `CLIENT_ORIGIN` 相同；
- 浏览器请求必须携带 credentials。后端 CORS 只回显精确匹配的 `CLIENT_ORIGIN`，
  并允许 `X-CSRF-Token`。

GitHub OAuth state cookie 始终保持 `SameSite=Lax`，因为 GitHub callback 是顶层导航；
不要把它改成 `None`。`/auth/github/login` 默认按客户端 IP 每进程每分钟允许 10 次，
超限返回 `429`。只有后端确实位于反向代理之后才配置 `TRUST_PROXY`，且只能列出最多
16 个明确的代理 IP/CIDR（例如 `127.0.0.1/8,::1/128`），绝不能使用 `true`；否则
攻击者可伪造 `X-Forwarded-For` 绕过限流。多实例部署时入口限流是每实例的，需在网关
再加一层共享限流；OAuth 活跃 state 上限则由数据库原子约束，默认全局 10000 条，
过期清理按 30 秒间隔、每批 100 条执行，避免每次登录触发全表删除。

### 3. 初始化数据库

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

已有 SQLite 数据库升级前请先按
[`backend/prisma/MIGRATION.md`](backend/prisma/MIGRATION.md) 完成备份、PRAGMA
核验和决策矩阵判定；持久化数据库不要再使用 `prisma db push`。

### 4. 启动后端

```bash
cd backend
npm run dev
```

### 5. 启动前端

```bash
cd frontend
npm run dev
```

## 当前已知边界

- AI 分类仍然是可选增强，默认关闭
- 规则分类仍有继续扩展空间，未分类项目还偏多
- 自动化定时全量同步还未接入
- 测试体系还没有系统补齐
- README 截图区仍待正式整理

## 下一步可以继续做什么

### 优先级最高

- 规则分类重构与配置化
- 分类依据可解释化（`source` / `reason`）
- 手动分类保护
- 降低“未分类 / 待整理”的比例

### 第二优先级

- 后台整理效率增强
- 搜索、排序、批量处理
- 未分类项目专门整理视图

### 第三优先级

- 自部署友好性补强
- 更完整的 `.env.example`
- 面向外部用户的部署文档
- 升级流程说明

### 暂缓项

- 本地 NLP 分类器
- AI 批处理分类
- 更重的智能增强能力

## 项目定位

这个项目不是：

- GitHub 的镜像站
- 通用书签管理器
- AI 驱动的知识库

它是：

> 一个把 GitHub Stars 转化为可长期整理、可持续同步、可自托管维护的个人开源项目库。
