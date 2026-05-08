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

const topicRules = [
  {
    category: CATEGORY_LABELS.network,
    topics: ["nas", "openwrt", "proxmox", "router", "vpn", "dns", "homelab", "v2ray", "clash", "proxy"]
  },
  {
    category: CATEGORY_LABELS.ops,
    topics: ["docker", "kubernetes", "selfhosted", "self-hosted", "nginx", "monitoring", "devops", "server"]
  },
  {
    category: CATEGORY_LABELS.ai,
    topics: ["ai", "llm", "agent", "rag", "openai", "anthropic", "chatgpt", "prompt-engineering"]
  },
  {
    category: CATEGORY_LABELS.frontend,
    topics: ["vue", "react", "frontend", "ui", "visualization", "echarts", "dashboard", "tailwindcss"]
  },
  {
    category: CATEGORY_LABELS.media,
    topics: ["video", "audio", "media", "image", "gallery", "download", "streaming", "player"]
  },
  {
    category: CATEGORY_LABELS.security,
    topics: ["security", "ctf", "pentest", "exploit", "vulnerability", "xss", "sql-injection"]
  },
  {
    category: CATEGORY_LABELS.automation,
    topics: ["automation", "workflow", "productivity", "bot", "script", "cli", "tooling"]
  }
];

const keywordRules = [
  {
    category: CATEGORY_LABELS.ai,
    keywords: ["llm", "agent", "rag", "ai", "prompt", "model", "openai", "anthropic", "copilot"]
  },
  {
    category: CATEGORY_LABELS.ops,
    keywords: ["docker", "kubernetes", "server", "panel", "nginx", "monitor", "devops", "self-hosted", "self hosted"]
  },
  {
    category: CATEGORY_LABELS.network,
    keywords: ["nas", "router", "network", "proxy", "vpn", "dns", "homelab", "virtualization", "openwrt", "proxmox"]
  },
  {
    category: CATEGORY_LABELS.media,
    keywords: ["media", "video", "audio", "stream", "image", "gallery", "download", "player"]
  },
  {
    category: CATEGORY_LABELS.security,
    keywords: ["security", "ctf", "vulnerability", "exploit", "pentest", "crypto", "attack", "defense"]
  },
  {
    category: CATEGORY_LABELS.frontend,
    keywords: ["vue", "react", "ui", "dashboard", "frontend", "design", "visual", "component", "chart"]
  },
  {
    category: CATEGORY_LABELS.automation,
    keywords: ["automation", "workflow", "productivity", "bot", "script", "assistant", "toolkit", "manager"]
  }
];

const languageFallbackRules = [
  { category: CATEGORY_LABELS.frontend, languages: ["vue", "html", "css", "scss", "less"] },
  { category: CATEGORY_LABELS.automation, languages: ["shell", "powershell", "batchfile"] }
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTopics(tags = []) {
  return tags
    .filter(Boolean)
    .map(tag => normalizeText(tag))
    .filter(Boolean);
}

function findTopicMatch(topics) {
  for (const rule of topicRules) {
    const matchedTopic = topics.find(topic => rule.topics.includes(topic));
    if (matchedTopic) {
      return {
        category: rule.category,
        strategy: "topic",
        matchedOn: matchedTopic
      };
    }
  }

  return null;
}

function findKeywordMatch(haystack) {
  for (const rule of keywordRules) {
    const matchedKeyword = rule.keywords.find(keyword => {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i");
      return pattern.test(haystack);
    });
    if (matchedKeyword) {
      return {
        category: rule.category,
        strategy: "keyword",
        matchedOn: matchedKeyword
      };
    }
  }

  return null;
}

function findLanguageFallback(language) {
  const normalizedLanguage = normalizeText(language);
  if (!normalizedLanguage) {
    return null;
  }

  for (const rule of languageFallbackRules) {
    const matchedLanguage = rule.languages.find(item => item === normalizedLanguage);
    if (matchedLanguage) {
      return {
        category: rule.category,
        strategy: "language_fallback",
        matchedOn: matchedLanguage
      };
    }
  }

  if (["typescript", "javascript"].includes(normalizedLanguage)) {
    return {
      category: CATEGORY_LABELS.frontend,
      strategy: "language_fallback",
      matchedOn: normalizedLanguage
    };
  }

  return null;
}

export function classifyRepositoryDetailed(repo) {
  const topics = normalizeTopics(repo.tags || []);
  const topicMatch = findTopicMatch(topics);
  if (topicMatch) {
    return topicMatch;
  }

  const haystack = [
    repo.name,
    repo.description,
    ...(repo.tags || [])
  ]
    .filter(Boolean)
    .map(item => normalizeText(item))
    .join(" ");

  if (haystack.trim()) {
    const keywordMatch = findKeywordMatch(haystack);
    if (keywordMatch) {
      return keywordMatch;
    }
  }

  const languageMatch = findLanguageFallback(repo.language);
  if (languageMatch) {
    return languageMatch;
  }

  return {
    category: CATEGORY_LABELS.uncategorized,
    strategy: "fallback",
    matchedOn: ""
  };
}

export function classifyRepository(repo) {
  return classifyRepositoryDetailed(repo).category;
}
