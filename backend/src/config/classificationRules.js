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
    category: CATEGORY_LABELS.network,
    values: ["nas", "openwrt", "proxmox", "router", "vpn", "dns", "homelab", "v2ray", "clash", "proxy"]
  },
  {
    category: CATEGORY_LABELS.ops,
    values: ["docker", "kubernetes", "selfhosted", "self-hosted", "nginx", "monitoring", "devops", "server"]
  },
  {
    category: CATEGORY_LABELS.ai,
    values: ["ai", "llm", "agent", "rag", "openai", "anthropic", "chatgpt", "prompt-engineering"]
  },
  {
    category: CATEGORY_LABELS.frontend,
    values: ["vue", "react", "frontend", "ui", "visualization", "echarts", "dashboard", "tailwindcss"]
  },
  {
    category: CATEGORY_LABELS.media,
    values: ["video", "audio", "media", "image", "gallery", "download", "streaming", "player"]
  },
  {
    category: CATEGORY_LABELS.security,
    values: ["security", "ctf", "pentest", "exploit", "vulnerability", "xss", "sql-injection"]
  },
  {
    category: CATEGORY_LABELS.automation,
    values: ["automation", "workflow", "productivity", "bot", "script", "cli", "tooling"]
  }
];

export const keywordRules = [
  {
    category: CATEGORY_LABELS.ai,
    values: ["llm", "agent", "rag", "ai", "prompt", "model", "openai", "anthropic", "copilot"]
  },
  {
    category: CATEGORY_LABELS.ops,
    values: ["docker", "kubernetes", "server", "panel", "nginx", "monitor", "devops", "self-hosted", "self hosted"]
  },
  {
    category: CATEGORY_LABELS.network,
    values: ["nas", "router", "network", "proxy", "vpn", "dns", "homelab", "virtualization", "openwrt", "proxmox"]
  },
  {
    category: CATEGORY_LABELS.media,
    values: ["media", "video", "audio", "stream", "image", "gallery", "download", "player"]
  },
  {
    category: CATEGORY_LABELS.security,
    values: ["security", "ctf", "vulnerability", "exploit", "pentest", "crypto", "attack", "defense"]
  },
  {
    category: CATEGORY_LABELS.frontend,
    values: ["vue", "react", "ui", "dashboard", "frontend", "design", "visual", "component", "chart"]
  },
  {
    category: CATEGORY_LABELS.automation,
    values: ["automation", "workflow", "productivity", "bot", "assistant", "toolkit", "manager", "command line", "cli", "terminal"]
  }
];

export const languageRules = [
  { category: CATEGORY_LABELS.frontend, values: ["vue", "html", "css", "scss", "less"] },
  { category: CATEGORY_LABELS.automation, values: ["shell", "powershell", "batchfile"] },
  { category: CATEGORY_LABELS.ai, values: ["jupyter notebook"] }
];
