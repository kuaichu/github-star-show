import {
  CATEGORY_LABELS,
  CATEGORY_SOURCE,
  keywordRules,
  languageRules,
  topicRules
} from "../config/classificationRules.js";

export { CATEGORY_LABELS, CATEGORY_SOURCE };

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

function buildReason(source, matchedValue) {
  if (source === CATEGORY_SOURCE.languageFallback) {
    return `language:${matchedValue}`;
  }

  if (source === CATEGORY_SOURCE.uncategorized) {
    return "uncategorized:no-rule-matched";
  }

  return `${source}:${matchedValue}`;
}

function matchFromRules(values, rules, source) {
  for (const rule of rules) {
    const matchedValue = values.find(value => rule.values.includes(value));
    if (matchedValue) {
      return {
        category: rule.category,
        categorySource: source,
        categoryReason: buildReason(source, matchedValue)
      };
    }
  }

  return null;
}

function matchFromUserRules(values, rules, source) {
  for (const rule of rules) {
    if (values.includes(rule.matchValue)) {
      return {
        category: rule.targetCategory,
        categorySource: `user_${source}`,
        categoryReason: `user_rule:${rule.matchValue}`
      };
    }
  }
  return null;
}

function findKeywordMatch(haystack) {
  for (const rule of keywordRules) {
    const matchedKeyword = rule.values.find(keyword => {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, "i");
      return pattern.test(haystack);
    });

    if (matchedKeyword) {
      return {
        category: rule.category,
        categorySource: CATEGORY_SOURCE.keyword,
        categoryReason: buildReason(CATEGORY_SOURCE.keyword, matchedKeyword)
      };
    }
  }

  return null;
}

function findUserKeywordMatch(haystack, userRules) {
  for (const rule of userRules) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(rule.matchValue)}([^a-z0-9]|$)`, "i");
    if (pattern.test(haystack)) {
      return {
        category: rule.targetCategory,
        categorySource: "user_keyword",
        categoryReason: `user_rule:${rule.matchValue}`
      };
    }
  }
  return null;
}

export function classifyRepositoryDetailed(repo, userRules = []) {
  const topics = normalizeTopics(repo.tags || []);
  const userTopicRules = userRules.filter(r => r.matchType === "topic");

  // User topic rules first
  const userTopicMatch = matchFromUserRules(topics, userTopicRules, "topic");
  if (userTopicMatch) {
    return userTopicMatch;
  }

  // Built-in topic rules
  const topicMatch = matchFromRules(topics, topicRules, CATEGORY_SOURCE.topic);
  if (topicMatch) {
    return topicMatch;
  }

  const haystack = [repo.name, repo.description, ...(repo.tags || [])]
    .filter(Boolean)
    .map(item => normalizeText(item))
    .join(" ");

  // User keyword rules
  const userKeywordRules = userRules.filter(r => r.matchType === "keyword");
  if (haystack.trim()) {
    const userKeywordMatch = findUserKeywordMatch(haystack, userKeywordRules);
    if (userKeywordMatch) {
      return userKeywordMatch;
    }
  }

  if (haystack.trim()) {
    const keywordMatch = findKeywordMatch(haystack);
    if (keywordMatch) {
      return keywordMatch;
    }
  }

  const userLanguageRules = userRules.filter(r => r.matchType === "language");
  const normalizedLanguage = normalizeText(repo.language);

  if (normalizedLanguage) {
    // User language rules first
    const userLangMatch = matchFromUserRules([normalizedLanguage], userLanguageRules, "language");
    if (userLangMatch) {
      return userLangMatch;
    }

    const languageMatch = matchFromRules([normalizedLanguage], languageRules, CATEGORY_SOURCE.languageFallback);
    if (languageMatch) {
      return languageMatch;
    }

    if (["typescript", "javascript"].includes(normalizedLanguage)) {
      return {
        category: CATEGORY_LABELS.frontend,
        categorySource: CATEGORY_SOURCE.languageFallback,
        categoryReason: buildReason(CATEGORY_SOURCE.languageFallback, normalizedLanguage)
      };
    }
  }

  return {
    category: CATEGORY_LABELS.uncategorized,
    categorySource: CATEGORY_SOURCE.uncategorized,
    categoryReason: buildReason(CATEGORY_SOURCE.uncategorized, "")
  };
}

export function classifyRepository(repo, userRules = []) {
  return classifyRepositoryDetailed(repo, userRules).category;
}
