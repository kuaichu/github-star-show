# 部署与更新文档

这份文档记录 `GitHub Star Show` 当前 demo 站的部署方式，以及后续更新前端、后端和数据库时的标准流程。

当前线上结构：

- 前端：Cloudflare Pages
- 前端域名：`https://stars.yeque.top`
- 后端：1Panel 自托管
- 后端公网入口：`https://api.yeque.top:9000/githubstarshow`
- 后端进程守护：PM2

## 1. 目录约定

本地项目目录：

```text
E:\Project\Claude\GithubStarShow
```

服务器后端目录：

```text
/opt/github-star-show/backend
```

## 2. 前端部署

### Cloudflare Pages 构建参数

- 框架预设：`Vite`
- 根目录：`frontend`
- 构建命令：`npm run build`
- 输出目录：`dist`

### 前端环境变量

```env
VITE_API_BASE_URL=https://api.yeque.top:9000/githubstarshow/api
VITE_AUTH_BASE_URL=https://api.yeque.top:9000/githubstarshow/auth
```

### 正式前端域名

- `https://stars.yeque.top`

## 3. 后端环境变量

服务器 `backend/.env` 示例：

```env
DATABASE_URL="file:./data/dev.db"
PORT=3000

CLIENT_ORIGIN="https://stars.yeque.top"
APP_BASE_URL="https://stars.yeque.top"
BACKEND_BASE_URL="https://api.yeque.top:9000/githubstarshow"

GITHUB_API_BASE_URL="https://api.github.com"
GITHUB_CLIENT_ID="your-client-id"
GITHUB_CLIENT_SECRET="your-client-secret"

OPENAI_API_KEY=""
OPENAI_API_BASE_URL="https://api.openai.com/v1"
OPENAI_MODEL="gpt-4o-mini"
AI_CLASSIFICATION_ENABLED="false"
AI_CLASSIFICATION_MAX_PER_RUN="25"
AI_CLASSIFICATION_INCLUDE_README="false"
```

## 4. 反向代理规则

公网 API 网关必须在转发到 Express 前，去掉 `/githubstarshow` 这个前缀。

必须满足：

- `/githubstarshow/api/*` -> `/api/*`
- `/githubstarshow/auth/*` -> `/auth/*`

Express 实际监听的是：

- `http://127.0.0.1:3000`

### 健康检查地址

- 公网：
  - `https://api.yeque.top:9000/githubstarshow/api/health`
- 本机：
  - `http://127.0.0.1:3000/api/health`

## 5. GitHub OAuth 配置

GitHub OAuth App 建议填写：

- Homepage URL
  - `https://stars.yeque.top`
- Authorization callback URL
  - `https://api.yeque.top:9000/githubstarshow/auth/github/callback`

## 6. 后端首次上线流程

### 上传到服务器的内容

需要上传：

- `src`
- `prisma`
- `package.json`
- `package-lock.json`
- 服务器版本的 `.env`

不需要上传：

- `node_modules`
- 本地测试数据库
- 本地调试专用 `.env`

### 首次执行命令

```bash
cd /opt/github-star-show/backend
mkdir -p data
npm install
npx prisma generate
npx prisma db push
```

## 7. PM2 进程守护

### 安装 PM2

```bash
npm install -g pm2
```

### 启动后端

```bash
cd /opt/github-star-show/backend
pm2 start src/server.js --name github-star-show
```

### 保存进程列表

```bash
pm2 save
```

### 设置开机自启

```bash
pm2 startup
```

执行 `pm2 startup` 输出的那条命令后，再执行：

```bash
pm2 save
```

### 常用 PM2 命令

```bash
pm2 list
pm2 logs github-star-show
pm2 restart github-star-show
pm2 stop github-star-show
pm2 delete github-star-show
pm2 show github-star-show
```

## 8. 更新前端的流程

### 本地先验证

```powershell
cd E:\Project\Claude\GithubStarShow\frontend
npm run build
```

### 提交并推送

```powershell
cd E:\Project\Claude\GithubStarShow
git add .
git commit -m "feat: update frontend"
git push origin main
```

### Cloudflare Pages 自动部署

推送后，Cloudflare Pages 会自动重新构建。

需要确认：

- 构建状态是 `Success`
- 页面可以正常打开
- API 请求已经指向：
  - `https://api.yeque.top:9000/githubstarshow/...`

## 9. 更新后端的流程

### 本地先验证

```powershell
cd E:\Project\Claude\GithubStarShow\backend
npx prisma generate
```

### 提交并推送

```powershell
cd E:\Project\Claude\GithubStarShow
git add .
git commit -m "feat: update backend"
git push origin main
```

### 服务器更新

把最新后端代码同步到服务器后执行：

```bash
cd /opt/github-star-show/backend
npm install
npx prisma generate
pm2 restart github-star-show
```

如果 `schema.prisma` 改了，再补：

```bash
npx prisma db push
pm2 restart github-star-show
```

## 10. 前后端一起更新的流程

### 第一步：本地验证

```powershell
cd E:\Project\Claude\GithubStarShow\frontend
npm run build
```

```powershell
cd E:\Project\Claude\GithubStarShow\backend
npx prisma generate
```

### 第二步：提交并推送

```powershell
cd E:\Project\Claude\GithubStarShow
git add .
git commit -m "feat: release update"
git push origin main
```

### 第三步：服务器更新后端

```bash
cd /opt/github-star-show/backend
npm install
npx prisma generate
npx prisma db push
pm2 restart github-star-show
```

### 第四步：等待 Pages 自动部署完成

Cloudflare Pages 会在 push 后自动重新构建。

### 第五步：上线验证

确认：

- 前端页面正常打开
- GitHub 登录正常
- `/auth/me` 登录后能获取用户
- 同步功能正常
- 项目列表正常展示

## 11. 上线后验证清单

### 后端验证

```bash
curl http://127.0.0.1:3000/api/health
curl https://api.yeque.top:9000/githubstarshow/api/health
curl https://api.yeque.top:9000/githubstarshow/auth/me
```

预期：

- `/api/health` 返回 `ok: true`
- `/auth/me` 未登录时返回 `{"user":null}`

### 前端验证

- 首页能正常打开
- 点击登录后跳 GitHub，而不是 `localhost`
- 登录回调后能回到 `https://stars.yeque.top`
- 全量同步正常
- 增量同步正常
- 后台编辑与保存正常

## 12. 当前版本建议

当前公开 demo 版本建议：

- `v0.1.0-beta.2`

## 13. 下一步可以继续做什么

### 部署层面

- 补齐面向外部用户的正式自部署文档
- 增加 Docker / Docker Compose 方案
- 增加 1Panel / Nginx 示例配置

### 维护层面

- 增加升级流程的更细粒度说明
- 增加数据库备份与回滚说明
- 增加版本发布与 smoke test 清单

### 产品层面

- 规则分类重构与可解释化
- 后台整理效率增强
- 自动定时全量同步

## 14. 常见问题

### 登录按钮跳到 localhost

原因：

- 前端还在使用旧构建
- `VITE_AUTH_BASE_URL` 没生效

解决：

- 确认登录入口走环境变量
- 重新构建前端
- push 代码
- 等待 Pages 自动部署

### Windows 本地 `prisma generate` 报 `EPERM`

原因：

- 本地 Node 进程还占着 Prisma 引擎文件

解决：

- 先停掉本地后端进程
- 再执行：

```powershell
npx prisma generate
```

### 服务器本地能跑，公网接口 404

原因：

- 反向代理没有正确去掉 `/githubstarshow`

解决：

- 检查网关路径转发规则

### PM2 配好了但重启后没自动拉起

解决：

```bash
pm2 startup
pm2 save
```

并执行 `pm2 startup` 输出的那条命令。
