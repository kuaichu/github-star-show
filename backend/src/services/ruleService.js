import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PublicHttpError } from "../lib/publicHttpError.js";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/rules");
const cache = new Map();

function ensureDir() {
  if (!fs.existsSync(DIR)) {
    fs.mkdirSync(DIR, { recursive: true });
  }
}

function filePath(userId) {
  return path.join(DIR, `user-${userId}.json`);
}

function loadRules(userId) {
  const key = String(userId);
  if (cache.has(key)) {
    return cache.get(key);
  }

  ensureDir();
  const fp = filePath(userId);

  try {
    const raw = fs.readFileSync(fp, "utf-8");
    const rules = JSON.parse(raw);
    cache.set(key, rules);
    return rules;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    cache.set(key, []);
    return [];
  }
}

function saveRules(userId, rules) {
  ensureDir();
  const key = String(userId);
  const fp = filePath(userId);
  fs.writeFileSync(fp, JSON.stringify(rules, null, 2), "utf-8");
  cache.set(key, rules);
}

let nextId = 1;

function assignIds(rules) {
  return rules.map((rule, index) => ({
    ...rule,
    id: rule.id || (nextId + index)
  }));
}

export function listRules(userId) {
  return loadRules(userId).sort((a, b) => b.priority - a.priority);
}

export function createRule(userId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PublicHttpError("INVALID_RULE", 400, "Rule body must be an object.");
  }
  const rules = loadRules(userId);
  const rule = {
    id: Date.now(),
    matchType: input.matchType,
    matchValue: String(input.matchValue || "").trim().toLowerCase(),
    targetCategory: input.targetCategory,
    priority: input.priority ?? 0,
    createdAt: new Date().toISOString()
  };

  if (!rule.matchValue || !rule.targetCategory) {
    throw new PublicHttpError("INVALID_RULE", 400, "matchValue and targetCategory are required.");
  }

  if (!["topic", "keyword", "language"].includes(rule.matchType)) {
    throw new PublicHttpError("INVALID_RULE", 400, 'matchType must be "topic", "keyword", or "language".');
  }

  saveRules(userId, [...rules, rule]);
  return rule;
}

export function updateRule(userId, ruleId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PublicHttpError("INVALID_RULE", 400, "Rule body must be an object.");
  }
  const rules = loadRules(userId);
  const index = rules.findIndex(r => r.id === Number(ruleId));

  if (index === -1) {
    throw new PublicHttpError("RULE_NOT_FOUND", 404, "Rule not found.");
  }

  const updatedRules = rules.map(rule => ({ ...rule }));

  if (input.matchValue !== undefined) updatedRules[index].matchValue = String(input.matchValue).trim().toLowerCase();
  if (input.targetCategory !== undefined) updatedRules[index].targetCategory = input.targetCategory;
  if (input.matchType !== undefined) {
    if (!["topic", "keyword", "language"].includes(input.matchType)) {
      throw new PublicHttpError("INVALID_RULE", 400, 'matchType must be "topic", "keyword", or "language".');
    }
    updatedRules[index].matchType = input.matchType;
  }
  if (input.priority !== undefined) updatedRules[index].priority = input.priority;

  saveRules(userId, updatedRules);
  return updatedRules[index];
}

export function deleteRule(userId, ruleId) {
  const rules = loadRules(userId);
  const index = rules.findIndex(r => r.id === Number(ruleId));

  if (index === -1) {
    throw new PublicHttpError("RULE_NOT_FOUND", 404, "Rule not found.");
  }

  saveRules(userId, rules.filter((_, ruleIndex) => ruleIndex !== index));
  return true;
}

export function getUserRules(userId) {
  return listRules(userId);
}
