# DEPLOY_CHECKLIST

## 目标

这份清单用于在发布 `GitHub Star Show` 时，降低“能构建但不能用”的风险。

重点保护：

- 前后端环境变量正确
- GitHub OAuth 回调正确
- 数据库不被误破坏
- 前后端版本匹配
- 登录、同步、列表、详情这些核心流程上线后可用

## 发布前检查

### 代码与文档

- 确认本次改动范围清楚
- 确认是否涉及：
  - 前端
  - 后端
  - Prisma schema
  - 环境变量
  - OAuth 配置
- 确认相关文档已更新
  - [CURRENT_STATUS.md](E:/Project/Claude/GithubStarShow/Documents/CURRENT_STATUS.md)
  - [SYNC_STRATEGY.md](E:/Project/Claude/GithubStarShow/Documents/SYNC_STRATEGY.md)
  - [CLASSIFICATION_RULES.md](E:/Project/Claude/GithubStarShow/Documents/CLASSIFICATION_RULES.md)

### 本地验证

- 前端构建通过

```powershell
cd E:\Project\Claude\GithubStarShow\frontend
npm run build
```

- 后端 Prisma generate 通过

```powershell
cd E:\Project\Claude\GithubStarShow\backend
npx prisma generate
```

- 如果改了 schema，确认 `schema.prisma` 变更是兼容的
- 不允许使用 destructive reset

### 环境变量检查

前端确认：

- `VITE_API_BASE_URL`
- `VITE_AUTH_BASE_URL`

后端确认：

- `DATABASE_URL`
- `PORT`
- `CLIENT_ORIGIN`
- `APP_BASE_URL`
- `BACKEND_BASE_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OPENAI_API_KEY`：如未启用 AI，可为空
- `AI_CLASSIFICATION_ENABLED`

### GitHub OAuth 检查

确认 GitHub OAuth App 配置：

- Homepage URL 指向前端正式域名
- Authorization callback URL 指向后端正式回调地址

当前示例：

- Homepage URL：`https://stars.yeque.top`
- Callback URL：`https://api.yeque.top:9000/githubstarshow/auth/github/callback`

### 数据安全检查

- 如果改了数据库 schema，先确认是否需要备份
- 发布前不要直接覆盖线上数据库文件
- 对数据结构变更，优先考虑可回滚和兼容已有数据

## 发布执行清单

### 前端发布

- 推送前端代码
- 确认 Cloudflare Pages 使用：
  - Root directory：`frontend`
  - Build command：`npm run build`
  - Output directory：`dist`
- 等待 Cloudflare Pages 自动构建完成

### 后端发布

- 将最新后端代码同步到服务器目录

服务器目录示例：

```text
/opt/github-star-show/backend
```

- 在服务器执行：

```bash
cd /opt/github-star-show/backend
npm install
npx prisma generate
```

- 如果 `schema.prisma` 改了，再执行：

```bash
npx prisma db push
```

- 重启 PM2 进程：

```bash
pm2 restart github-star-show
```

### 反向代理检查

确认公网 API 网关在转发到 Express 前，已经去掉 `/githubstarshow` 前缀：

- `/githubstarshow/api/*` -> `/api/*`
- `/githubstarshow/auth/*` -> `/auth/*`

如果这里配错，最常见现象是：

- 后端本机健康检查正常
- 公网接口 404

## 上线后验证

### 后端健康检查

本机检查：

```bash
curl http://127.0.0.1:3000/api/health
```

公网检查：

```bash
curl https://api.yeque.top:9000/githubstarshow/api/health
curl https://api.yeque.top:9000/githubstarshow/auth/me
```

预期：

- `/api/health` 返回 `ok: true`
- `/auth/me` 未登录时返回 `{ "user": null }`

### 前端页面检查

- 首页可以正常打开
- 页面没有白屏
- API 请求地址不是 `localhost`
- 点击登录后跳转 GitHub 正常
- 登录回调后能回到正式前端地址

### 核心功能检查

- 登录正常
- 首次同步正常
- 增量同步正常
- 全量重同步正常
- 项目列表正常展示
- 详情抽屉正常打开
- README 拉取失败时页面不崩
- 后台编辑正常
- 未分类整理视图正常

### 数据边界检查

- 手动分类不会被同步覆盖
- 远端状态异常项目只标记状态，不被自动删除
- 删除本地项目默认只删除 `UserProject`
- 选择“同时取消 GitHub Star”时，失败不会误删本地关系

## 回滚准备

发布前应至少明确：

- 当前线上版本对应的 git 提交
- 当前后端代码备份位置
- 当前数据库备份位置
- 如果 schema 改动了，如何回退

最低要求：

- 能回退代码
- 能恢复数据库
- 能恢复环境变量配置

## 常见故障排查

### 登录跳到 localhost

优先检查：

- 前端是否还是旧构建
- `VITE_AUTH_BASE_URL` 是否生效
- Pages 是否完成最新部署

### 公网接口 404

优先检查：

- 反向代理是否正确去掉 `/githubstarshow`
- 后端 PM2 进程是否正常
- `BACKEND_BASE_URL` 是否配置正确

### Prisma generate 失败

在 Windows 上优先检查：

- 是否仍有本地 Node 进程占用 Prisma 引擎文件

### 页面能开但登录失败

优先检查：

- GitHub OAuth client id / secret
- callback URL
- `APP_BASE_URL`
- `BACKEND_BASE_URL`
- 跨域来源是否与正式域名一致

## 禁止事项

- 不允许上线前靠“清空数据库”解决问题
- 不允许跳过健康检查与登录检查
- 不允许 schema 改动后不评估数据影响
- 不允许前后端同时更新却只验证其中一侧
- 不允许发布后不做基本 smoke test
