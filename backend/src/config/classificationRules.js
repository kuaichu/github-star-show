export const CATEGORY_LABELS = {
  ai: "AI / LLM",
  ops: "运维 / 自建服务",
  network: "网络 / NAS / 虚拟化",
  media: "媒体 / 下载 / 图床",
  security: "安全 / CTF",
  frontend: "前端 UI / 可视化",
  automation: "自动化 / 效率工具",
  uncategorized: "未分类 / 待整理"
};

export const CATEGORY_SOURCE = {
  topic: "topic",
  keyword: "keyword",
  languageFallback: "language_fallback",
  manual: "manual",
  uncategorized: "uncategorized"
};

export const topicRules = [
  {
    category: CATEGORY_LABELS.ai,
    values: [
      "ai", "llm", "agent", "rag", "openai", "anthropic", "chatgpt", "prompt-engineering",
      "machine-learning", "deep-learning", "nlp", "gpt", "transformer", "langchain",
      "generative-ai", "image-generation", "text-to-image", "stable-diffusion",
      "chatbot", "knowledge-graph", "vector-database", "embedding", "fine-tuning",
      "mlops", "pytorch", "tensorflow", "huggingface", "diffusers", "inference",
      "onnx", "llama", "chat", "gpu", "cuda", "autogpt", "function-calling",
      "multi-agent", "ai-agent", "vector-search", "semantic-search", "neural-network",
      "reinforcement-learning", "computer-vision", "speech-recognition", "tts",
      "recommender-system", "anomaly-detection", "data-science", "jupyter",
      "large-language-model", "genai", "aigc", "ai-art", "code-generation"
    ]
  },
  {
    category: CATEGORY_LABELS.ops,
    values: [
      "docker", "kubernetes", "selfhosted", "self-hosted", "nginx", "monitoring",
      "devops", "server", "docker-compose", "container", "orchestration", "deployment",
      "hosting", "cloud-native", "reverse-proxy", "letsencrypt", "ssl", "tls",
      "caddy", "traefik", "istio", "ansible", "terraform", "infrastructure",
      "postgresql", "mysql", "redis", "message-queue", "rabbitmq", "elasticsearch",
      "prometheus", "grafana", "jaeger", "cicd", "github-actions", "gitlab-ci",
      "ci-cd", "pipeline", "iac", "configuration-management", "load-balancing",
      "api-gateway", "service-mesh", "microservices", "serverless", "edge-computing",
      "containerd", "podman", "helm", "kustomize", "argo", "gitops", "hpa",
      "auto-scaling", "uptime", "status-page", "log-management", "opentelemetry"
    ]
  },
  {
    category: CATEGORY_LABELS.network,
    values: [
      "nas", "openwrt", "proxmox", "router", "vpn", "dns", "homelab", "v2ray",
      "clash", "proxy", "networking", "ddns", "wireguard", "tailscale", "frp",
      "nat", "tunnel", "network-tools", "ipfs", "p2p", "mesh", "wifi",
      "firewall", "load-balancer", "gateway", "cloudflare", "subnet",
      "dhcp", "http", "tcp", "udp", "quic", "http3", "proxy-server",
      "socks5", "transparent-proxy", "sd-wan", "softether", "zero-tier",
      "netbird", "nebula", "headscale", "dynamic-dns", "internal-network",
      "local-network", "home-network", "wan", "bandwidth", "traffic-shaping"
    ]
  },
  {
    category: CATEGORY_LABELS.media,
    values: [
      "video", "audio", "media", "image", "gallery", "download", "streaming",
      "player", "torrent", "bittorrent", "youtube-dl", "yt-dlp",
      "music", "podcast", "photo", "screenshot", "wallpaper", "comic", "manga",
      "reader", "ebook", "alist", "cloud-storage", "file-sharing", "sync",
      "transfer", "ffmpeg", "transcoding", "streaming-server", "plex", "emby",
      "subsonic", "navidrome", "media-server", "media-center", "video-player",
      "music-player", "podcast-player", "downloader", "video-downloader",
      "bulk-downloader", "media-manager", "photo-library", "image-host",
      "image-upload", "file-browser", "file-manager", "nas-tools", "movie",
      "tv-show", "anime", "subtitle", "lyrics", "visualizer", "waveform"
    ]
  },
  {
    category: CATEGORY_LABELS.security,
    values: [
      "security", "ctf", "pentest", "exploit", "vulnerability", "xss", "sql-injection",
      "cybersecurity", "malware", "reverse-engineering", "forensics", "osint",
      "bug-bounty", "hardening", "authentication", "authorization", "oauth",
      "jwt", "encryption", "cryptography", "privacy", "adblock", "dns-block",
      "ids", "ips", "zero-trust", "audit", "compliance", "waf",
      "penetration-testing", "red-team", "blue-team", "threat-intelligence",
      "vulnerability-management", "security-tools", "security-audit",
      "code-analysis", "static-analysis", "dynamic-analysis", "fuzzing",
      "binary-analysis", "disassembler", "debugger", "rootkit", "ransomware",
      "phishing", "social-engineering", "2fa", "mfa", "password-manager",
      "secret-management", "key-management", "hsm", "identity-management",
      "access-control", "rbac", "casbin", "security-scanning", "cve"
    ]
  },
  {
    category: CATEGORY_LABELS.frontend,
    values: [
      "vue", "react", "frontend", "ui", "visualization", "echarts", "dashboard",
      "tailwindcss", "css", "animation", "icon", "font", "chart", "d3",
      "threejs", "webgl", "canvas", "svelte", "nextjs", "nuxt", "typescript",
      "javascript", "angular", "webpack", "vite", "tailwind", "bootstrap",
      "responsive", "mobile-first", "pwa", "spa", "ssr", "astro", "remix",
      "solidjs", "alpinejs", "htmx", "component-library", "design-system",
      "ui-components", "ui-kit", "icons", "icon-library", "font-library",
      "css-framework", "css-animation", "css-grid", "flexbox", "storybook",
      "figma", "design-tokens", "dark-mode", "theme", "color-scheme",
      "data-visualization", "data-viz", "charting", "graphs", "diagram",
      "flowchart", "mindmap", "timeline", "calendar", "kanban", "table",
      "data-table", "grid-layout", "responsive-design", "mobile-ui",
      "micro-frontend", "web-component", "shadow-dom", "virtual-dom",
      "state-management", "pinia", "vuex", "redux", "zustand", "jotai",
      "react-query", "tanstack", "vue-router", "react-router", "frontend-framework"
    ]
  },
  {
    category: CATEGORY_LABELS.automation,
    values: [
      "automation", "workflow", "productivity", "bot", "script", "cli", "tooling",
      "devtools", "git", "github-actions", "ci", "cd", "makefile", "dotfiles",
      "config", "template", "generator", "scaffolding", "boilerplate",
      "snippet", "bookmark", "launcher", "clipboard", "search", "text-editor",
      "ide", "plugin", "extension", "terminal", "emulator", "cross-platform",
      "tui", "gui", "windows", "linux", "macos", "task-runner", "taskfile",
      "build-tool", "bundler", "linter", "formatter", "code-quality",
      "testing", "unit-testing", "e2e", "playwright", "cypress", "vitest",
      "jest", "mocha", "chai", "assert", "mock", "stub", "fixture",
      "code-review", "linting", "prettier", "eslint", "stylelint",
      "commitlint", "husky", "lint-staged", "semver", "changelog",
      "release-automation", "npm", "yarn", "pnpm", "package-manager",
      "monorepo", "turborepo", "nx", "lerna", "workspace",
      "command-line", "terminal-emulator", "shell", "bash", "zsh",
      "fish", "powershell", "cross-shell", "prompt", "oh-my-zsh",
      "alacritty", "kitty", "wezterm", "tmux", "screen",
      "file-utility", "file-converter", "batch-processing", "cron",
      "scheduler", "reminder", "timer", " Pomodoro", "habit-tracker",
      "note-taking", "knowledge-base", "wiki", "journal", "logseq",
      "obsidian", "notion", "todo", "task-management", "project-management"
    ]
  }
];

export const keywordRules = [
  {
    category: CATEGORY_LABELS.ai,
    values: [
      "llm", "agent", "rag", "ai", "prompt", "model", "openai", "anthropic", "copilot",
      "gpt", "chatgpt", "langchain", "machine learning", "deep learning", "neural",
      "transformer", "embedding", "vector database", "vector search", "semantic search",
      "stable diffusion", "image generation", "text to image", "huggingface",
      "pytorch", "tensorflow", "chatbot", "knowledge graph", "fine tuning",
      "inference", "llama", "autogpt", "multi-agent", "function calling",
      "generative ai", "aigc", "nlp", "natural language", "computer vision",
      "speech recognition", "text to speech", "recommender", "anomaly detection",
      "data science", "jupyter", "mlops", "genai", "code generation"
    ]
  },
  {
    category: CATEGORY_LABELS.ops,
    values: [
      "docker", "kubernetes", "server", "panel", "nginx", "monitor", "devops",
      "self-hosted", "self hosted", "docker compose", "container", "orchestration",
      "deploy", "hosting", "cloud native", "reverse proxy", "letsencrypt",
      "caddy", "traefik", "ansible", "terraform", "infrastructure",
      "postgresql", "postgres", "mysql", "redis", "message queue", "rabbitmq",
      "elasticsearch", "prometheus", "grafana", "jaeger", "ci/cd",
      "github actions", "gitlab ci", "pipeline", "iac", "configuration management",
      "api gateway", "service mesh", "microservice", "serverless",
      "helm", "kustomize", "argo", "gitops", "auto scaling",
      "uptime", "status page", "log management", "opentelemetry",
      "one panel", "管理面板", "server management"
    ]
  },
  {
    category: CATEGORY_LABELS.network,
    values: [
      "nas", "router", "network", "proxy", "vpn", "dns", "homelab",
      "virtualization", "openwrt", "proxmox", "wireguard", "tailscale",
      "frp", "tunnel", "ddns", "dynamic dns", "mesh", "firewall",
      "gateway", "load balancer", "p2p", "ipfs", "quic", "http3",
      "socks5", "transparent proxy", "sd wan", "zero tier", "netbird",
      "nebula", "headscale", "home network", "internal network",
      "traffic shaping", "bandwidth", "subnet", "nat traversal"
    ]
  },
  {
    category: CATEGORY_LABELS.media,
    values: [
      "media", "video", "audio", "stream", "image", "gallery", "download",
      "player", "torrent", "bittorrent", "youtube dl", "yt dlp",
      "music", "podcast", "photo", "screenshot", "wallpaper", "comic",
      "manga", "reader", "ebook", "alist", "cloud storage", "file sharing",
      "sync", "file transfer", "ffmpeg", "transcoding", "media server",
      "plex", "emby", "jellyfin", "subsonic", "navidrome",
      "video player", "music player", "downloader", "video downloader",
      "media manager", "photo library", "image host", "image upload",
      "file browser", "file manager", "nas tools", "movie", "subtitle",
      "lyrics", "visualizer", "media center", "streaming server"
    ]
  },
  {
    category: CATEGORY_LABELS.security,
    values: [
      "security", "ctf", "vulnerability", "exploit", "pentest", "crypto",
      "attack", "defense", "cybersecurity", "malware", "reverse engineering",
      "forensics", "osint", "bug bounty", "hardening", "authentication",
      "authorization", "oauth", "jwt", "encryption", "cryptography",
      "privacy", "adblock", "dns block", "ids", "ips", "zero trust",
      "audit", "compliance", "waf", "penetration testing", "red team",
      "blue team", "threat intelligence", "fuzzing", "binary analysis",
      "disassembler", "debugger", "rootkit", "ransomware", "phishing",
      "2fa", "mfa", "password manager", "secret management",
      "access control", "rbac", "security scanning", "cve",
      "penetration test", "hacking", "infosec"
    ]
  },
  {
    category: CATEGORY_LABELS.frontend,
    values: [
      "vue", "react", "ui", "dashboard", "frontend", "design", "visual",
      "component", "chart", "tailwindcss", "tailwind", "css", "animation",
      "icon", "icons", "font", "typography", "d3", "threejs", "three.js",
      "three js", "webgl", "canvas", "svelte", "nextjs", "next.js", "next js",
      "nuxt", "nuxtjs", "typescript", "javascript", "angular", "webpack",
      "vite", "bootstrap", "responsive", "pwa", "spa", "ssr", "astro",
      "remix", "solidjs", "alpinejs", "htmx", "component library",
      "design system", "ui kit", "icon library", "css framework",
      "css animation", "css grid", "flexbox", "storybook", "figma",
      "design token", "dark mode", "data visualization", "data viz",
      "charting", "diagram", "flowchart", "mindmap", "timeline",
      "kanban", "data table", "grid layout", "responsive design",
      "micro frontend", "web component", "state management",
      "pinia", "vuex", "redux", "zustand", "react query",
      "tanstack", "vue router", "react router"
    ]
  },
  {
    category: CATEGORY_LABELS.automation,
    values: [
      "automation", "workflow", "productivity", "bot", "assistant", "toolkit",
      "manager", "command line", "cli", "terminal", "devtools", "git",
      "github action", "makefile", "taskfile", "dotfiles", "config",
      "template", "generator", "scaffolding", "boilerplate",
      "snippet", "bookmark", "launcher", "clipboard", "text editor",
      "ide", "plugin", "extension", "emulator", "cross platform",
      "tui", "gui", "task runner", "build tool", "bundler",
      "linter", "formatter", "code quality", "unit test", "e2e",
      "playwright", "cypress", "vitest", "jest", "code review",
      "prettier", "eslint", "commitlint", "husky", "semver",
      "changelog", "npm", "yarn", "pnpm", "package manager",
      "monorepo", "turborepo", "nx", "lerna", "workspace",
      "shell", "bash", "zsh", "powershell", "tmux",
      "file utility", "file converter", "batch processing",
      "cron", "scheduler", "habit tracker", "note taking",
      "knowledge base", "wiki", "todo", "task management",
      "project management", "job scheduler", "automation tool"
    ]
  }
];

export const languageRules = [
  { category: CATEGORY_LABELS.frontend, values: ["vue", "html", "css", "scss", "less", "svelte", "astro"] },
  { category: CATEGORY_LABELS.automation, values: ["shell", "powershell", "batchfile", "makefile", "dockerfile", "cmake"] },
  { category: CATEGORY_LABELS.ai, values: ["jupyter notebook"] },
  { category: CATEGORY_LABELS.security, values: ["cybersecurity"] },
  { category: CATEGORY_LABELS.ops, values: ["terraform", "hcl"] },
  { category: CATEGORY_LABELS.network, values: ["wireguard"] }
];
