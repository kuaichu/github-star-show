# CLASSIFICATION_RULES

## 分类目标

分类系统用于帮助用户整理 GitHub Stars。

默认路径是规则分类，AI 只作为可选增强。

分类系统的目标不是“强行全部归类”，而是：

- 优先把明显项目稳定归入正确分类
- 给出可解释的分类依据
- 保留用户手动整理结果
- 让剩余不确定项目进入未分类工作台继续人工处理

## 当前分类集合

当前项目实际使用的主要分类包括：

- `AI / LLM`
- `运维 / 自建服务`
- `网络 / NAS / 虚拟化`
- `媒体 / 下载 / 图床`
- `安全 / CTF`
- `前端 UI / 可视化`
- `自动化 / 效率工具`
- `未分类 / 待整理`

## 分类优先级

分类优先级从高到低：

1. 手动分类
2. topics 规则命中
3. name / description / tags 关键词命中
4. language fallback
5. 可选 AI 分类
6. uncategorized

说明：

- 当前代码里规则分类主链路是 `topic -> keyword -> language_fallback -> uncategorized`
- AI 分类不在默认同步主链路里，而是独立可选增强

## 手动分类保护

用户手动修改过的分类不应被自动分类覆盖。

应记录：

- `category`
- `categorySource`
- `categoryReason`
- `categoryUpdatedAt`：推荐后续补充

当前已存在或已使用的来源值：

- `manual`
- `topic`
- `keyword`
- `language_fallback`
- `ai`
- `uncategorized`

当 `categorySource = manual` 时：

- 增量同步不得覆盖分类
- 全量同步不得覆盖分类
- AI 分类不得覆盖分类
- 只有用户主动操作才能修改

## topics 分类

优先读取 GitHub topics。

规则表按分类分组，命中多个 topics 时，按照规则表顺序决定优先级。

### AI / LLM
ai, llm, agent, rag, openai, anthropic, chatgpt, prompt-engineering, machine-learning, deep-learning, nlp, gpt, transformer, langchain, generative-ai, image-generation, text-to-image, stable-diffusion, chatbot, knowledge-graph, vector-database, embedding, fine-tuning, mlops, pytorch, tensorflow, huggingface, diffusers, inference, onnx, llama, chat, gpu, cuda, autogpt, function-calling, multi-agent, ai-agent, vector-search, semantic-search, neural-network, reinforcement-learning, computer-vision, speech-recognition, tts, recommender-system, anomaly-detection, data-science, jupyter, large-language-model, genai, aigc, ai-art, code-generation

### 运维 / 自建服务
docker, kubernetes, selfhosted, self-hosted, nginx, monitoring, devops, server, docker-compose, container, orchestration, deployment, hosting, cloud-native, reverse-proxy, letsencrypt, ssl, tls, caddy, traefik, istio, ansible, terraform, infrastructure, postgresql, mysql, redis, message-queue, rabbitmq, elasticsearch, prometheus, grafana, jaeger, cicd, github-actions, gitlab-ci, ci-cd, pipeline, iac, configuration-management, load-balancing, api-gateway, service-mesh, microservices, serverless, edge-computing, containerd, podman, helm, kustomize, argo, gitops, hpa, auto-scaling, uptime, status-page, log-management, opentelemetry

### 网络 / NAS / 虚拟化
nas, openwrt, proxmox, router, vpn, dns, homelab, v2ray, clash, proxy, networking, ddns, wireguard, tailscale, frp, nat, tunnel, network-tools, ipfs, p2p, mesh, wifi, firewall, load-balancer, gateway, cloudflare, subnet, dhcp, http, tcp, udp, quic, http3, proxy-server, socks5, transparent-proxy, sd-wan, softether, zero-tier, netbird, nebula, headscale, dynamic-dns, internal-network, local-network, home-network, wan, bandwidth, traffic-shaping

### 媒体 / 下载 / 图床
video, audio, media, image, gallery, download, streaming, player, torrent, bittorrent, youtube-dl, yt-dlp, music, podcast, photo, screenshot, wallpaper, comic, manga, reader, ebook, alist, cloud-storage, file-sharing, sync, transfer, ffmpeg, transcoding, streaming-server, plex, emby, subsonic, navidrome, media-server, media-center, video-player, music-player, podcast-player, downloader, video-downloader, bulk-downloader, media-manager, photo-library, image-host, image-upload, file-browser, file-manager, nas-tools, movie, tv-show, anime, subtitle, lyrics, visualizer, waveform

### 安全 / CTF
security, ctf, pentest, exploit, vulnerability, xss, sql-injection, cybersecurity, malware, reverse-engineering, forensics, osint, bug-bounty, hardening, authentication, authorization, oauth, jwt, encryption, cryptography, privacy, adblock, dns-block, ids, ips, zero-trust, audit, compliance, waf, penetration-testing, red-team, blue-team, threat-intelligence, vulnerability-management, security-tools, security-audit, code-analysis, static-analysis, dynamic-analysis, fuzzing, binary-analysis, disassembler, debugger, rootkit, ransomware, phishing, social-engineering, 2fa, mfa, password-manager, secret-management, key-management, hsm, identity-management, access-control, rbac, casbin, security-scanning, cve

### 前端 UI / 可视化
vue, react, frontend, ui, visualization, echarts, dashboard, tailwindcss, css, animation, icon, font, chart, d3, threejs, webgl, canvas, svelte, nextjs, nuxt, typescript, javascript, angular, webpack, vite, tailwind, bootstrap, responsive, mobile-first, pwa, spa, ssr, astro, remix, solidjs, alpinejs, htmx, component-library, design-system, ui-components, ui-kit, icons, icon-library, font-library, css-framework, css-animation, css-grid, flexbox, storybook, figma, design-tokens, dark-mode, theme, color-scheme, data-visualization, data-viz, charting, graphs, diagram, flowchart, mindmap, timeline, calendar, kanban, table, data-table, grid-layout, responsive-design, mobile-ui, micro-frontend, web-component, shadow-dom, virtual-dom, state-management, pinia, vuex, redux, zustand, jotai, react-query, tanstack, vue-router, react-router, frontend-framework

### 自动化 / 效率工具
automation, workflow, productivity, bot, script, cli, tooling, devtools, git, github-actions, ci, cd, makefile, dotfiles, config, template, generator, scaffolding, boilerplate, snippet, bookmark, launcher, clipboard, search, text-editor, ide, plugin, extension, terminal, emulator, cross-platform, tui, gui, windows, linux, macos, task-runner, taskfile, build-tool, bundler, linter, formatter, code-quality, testing, unit-testing, e2e, playwright, cypress, vitest, jest, mocha, chai, assert, mock, stub, fixture, code-review, linting, prettier, eslint, stylelint, commitlint, husky, lint-staged, semver, changelog, release-automation, npm, yarn, pnpm, package-manager, monorepo, turborepo, nx, lerna, workspace, command-line, terminal-emulator, shell, bash, zsh, fish, powershell, cross-shell, prompt, oh-my-zsh, alacritty, kitty, wezterm, tmux, screen, file-utility, file-converter, batch-processing, cron, scheduler, reminder, timer, pomodoro, habit-tracker, note-taking, knowledge-base, wiki, journal, logseq, obsidian, notion, todo, task-management, project-management

## keyword 分类

当 topics 没有命中时，检查：

- repo name
- description
- tags 文本
- README 摘要：当前默认不走规则主链路，后续可选扩展

关键词使用正则词边界匹配（`(^|[^a-z0-9])keyword([^a-z0-9]|$)`），避免"serverless"误判为"server"这类问题。

规则表按分类分组，匹配时按规则表顺序决定优先级。

### AI / LLM
llm, agent, rag, ai, prompt, model, openai, anthropic, copilot, gpt, chatgpt, langchain, machine learning, deep learning, neural, transformer, embedding, vector database, vector search, semantic search, stable diffusion, image generation, text to image, huggingface, pytorch, tensorflow, chatbot, knowledge graph, fine tuning, inference, llama, autogpt, multi-agent, function calling, generative ai, aigc, nlp, natural language, computer vision, speech recognition, text to speech, recommender, anomaly detection, data science, jupyter, mlops, genai, code generation

### 运维 / 自建服务
docker, kubernetes, server, panel, nginx, monitor, devops, self-hosted, self hosted, docker compose, container, orchestration, deploy, hosting, cloud native, reverse proxy, letsencrypt, caddy, traefik, ansible, terraform, infrastructure, postgresql, postgres, mysql, redis, message queue, rabbitmq, elasticsearch, prometheus, grafana, jaeger, ci/cd, github actions, gitlab ci, pipeline, iac, configuration management, api gateway, service mesh, microservice, serverless, helm, kustomize, argo, gitops, auto scaling, uptime, status page, log management, opentelemetry, one panel, 管理面板, server management

### 网络 / NAS / 虚拟化
nas, router, network, proxy, vpn, dns, homelab, virtualization, openwrt, proxmox, wireguard, tailscale, frp, tunnel, ddns, dynamic dns, mesh, firewall, gateway, load balancer, p2p, ipfs, quic, http3, socks5, transparent proxy, sd wan, zero tier, netbird, nebula, headscale, home network, internal network, traffic shaping, bandwidth, subnet, nat traversal

### 媒体 / 下载 / 图床
media, video, audio, stream, image, gallery, download, player, torrent, bittorrent, youtube dl, yt dlp, music, podcast, photo, screenshot, wallpaper, comic, manga, reader, ebook, alist, cloud storage, file sharing, sync, file transfer, ffmpeg, transcoding, media server, plex, emby, jellyfin, subsonic, navidrome, video player, music player, downloader, video downloader, media manager, photo library, image host, image upload, file browser, file manager, nas tools, movie, subtitle, lyrics, visualizer, media center, streaming server

### 安全 / CTF
security, ctf, vulnerability, exploit, pentest, crypto, attack, defense, cybersecurity, malware, reverse engineering, forensics, osint, bug bounty, hardening, authentication, authorization, oauth, jwt, encryption, cryptography, privacy, adblock, dns block, ids, ips, zero trust, audit, compliance, waf, penetration testing, red team, blue team, threat intelligence, fuzzing, binary analysis, disassembler, debugger, rootkit, ransomware, phishing, 2fa, mfa, password manager, secret management, access control, rbac, security scanning, cve, penetration test, hacking, infosec

### 前端 UI / 可视化
vue, react, ui, dashboard, frontend, design, visual, component, chart, tailwindcss, tailwind, css, animation, icon, icons, font, typography, d3, threejs, three.js, three js, webgl, canvas, svelte, nextjs, next.js, next js, nuxt, nuxtjs, typescript, javascript, angular, webpack, vite, bootstrap, responsive, pwa, spa, ssr, astro, remix, solidjs, alpinejs, htmx, component library, design system, ui kit, icon library, css framework, css animation, css grid, flexbox, storybook, figma, design token, dark mode, data visualization, data viz, charting, diagram, flowchart, mindmap, timeline, kanban, data table, grid layout, responsive design, micro frontend, web component, state management, pinia, vuex, redux, zustand, react query, tanstack, vue router, react router

### 自动化 / 效率工具
automation, workflow, productivity, bot, assistant, toolkit, manager, command line, cli, terminal, devtools, git, github action, makefile, taskfile, dotfiles, config, template, generator, scaffolding, boilerplate, snippet, bookmark, launcher, clipboard, text editor, ide, plugin, extension, emulator, cross platform, tui, gui, task runner, build tool, bundler, linter, formatter, code quality, unit test, e2e, playwright, cypress, vitest, jest, code review, prettier, eslint, commitlint, husky, semver, changelog, npm, yarn, pnpm, package manager, monorepo, turborepo, nx, lerna, workspace, shell, bash, zsh, powershell, tmux, file utility, file converter, batch processing, cron, scheduler, habit tracker, note taking, knowledge base, wiki, todo, task management, project management, job scheduler, automation tool

关键词规则应保持：

- 可解释
- 低误判
- 规则表顺序稳定

## language fallback

当 topics 和 keyword 都未命中时，根据主语言兜底。

示例：

| language | category |
|---|---|
| Vue | 前端 UI / 可视化 |
| HTML | 前端 UI / 可视化 |
| CSS | 前端 UI / 可视化 |
| SCSS | 前端 UI / 可视化 |
| Less | 前端 UI / 可视化 |
| Svelte | 前端 UI / 可视化 |
| Astro | 前端 UI / 可视化 |
| JavaScript | 前端 UI / 可视化 |
| TypeScript | 前端 UI / 可视化 |
| Shell | 自动化 / 效率工具 |
| PowerShell | 自动化 / 效率工具 |
| Batchfile | 自动化 / 效率工具 |
| Makefile | 自动化 / 效率工具 |
| Dockerfile | 自动化 / 效率工具 |
| CMake | 自动化 / 效率工具 |
| Jupyter Notebook | AI / LLM |
| Terraform | 运维 / 自建服务 |
| HCL | 运维 / 自建服务 |

说明：

- 语言兜底只在前两层规则都失败时使用
- `JavaScript / TypeScript` 兜底到前端，与前端生态定位一致

## uncategorized

无法可靠判断时，进入 `未分类 / 待整理`。

不要为了降低未分类比例而强行分类。

未分类项目应该进入：

- 未分类整理视图
- 后台手动编辑流
- 可选 AI 批处理流

## AI 分类

AI 分类必须是可选增强。

适用场景：

- rules 未命中
- 用户主动批处理
- 未分类工作台中后续可扩展的手动触发

AI 分类不得：

- 覆盖 `manual` 分类
- 成为同步必需流程
- 阻塞项目导入
- 产生不可解释分类

AI 分类结果应保存分类依据。

建议至少保存：

- `aiCategory`
- `aiReason`
- `aiConfidence`
- `aiModel`
- `aiClassifiedAt`

## 推荐演进方向

- 继续扩充 `topics` 与 `keyword` 规则表
- 为规则表增加更明确的维护说明和变更策略
- 后续补 `categoryUpdatedAt`
- 后续把“分类规则表配置化”作为优先工作，而不是先把 AI 做重

## 禁止事项

- 不允许用 AI 取代规则分类主路径
- 不允许自动覆盖手动分类
- 不允许为了追求命中率而牺牲可解释性
- 不允许把无法判断的项目强塞进某个分类
