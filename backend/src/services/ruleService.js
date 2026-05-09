import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  } catch {
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
    throw new Error("matchValue and targetCategory are required.");
  }

  if (!["topic", "keyword", "language"].includes(rule.matchType)) {
    throw new Error('matchType must be "topic", "keyword", or "language".');
  }

  rules.push(rule);
  saveRules(userId, rules);
  return rule;
}

export function updateRule(userId, ruleId, input) {
  const rules = loadRules(userId);
  const index = rules.findIndex(r => r.id === Number(ruleId));

  if (index === -1) {
    throw new Error("Rule not found.");
  }

  if (input.matchValue !== undefined) rules[index].matchValue = String(input.matchValue).trim().toLowerCase();
  if (input.targetCategory !== undefined) rules[index].targetCategory = input.targetCategory;
  if (input.matchType !== undefined) {
    if (!["topic", "keyword", "language"].includes(input.matchType)) {
      throw new Error('matchType must be "topic", "keyword", or "language".');
    }
    rules[index].matchType = input.matchType;
  }
  if (input.priority !== undefined) rules[index].priority = input.priority;

  saveRules(userId, rules);
  return rules[index];
}

export function deleteRule(userId, ruleId) {
  const rules = loadRules(userId);
  const index = rules.findIndex(r => r.id === Number(ruleId));

  if (index === -1) {
    throw new Error("Rule not found.");
  }

  rules.splice(index, 1);
  saveRules(userId, rules);
  return true;
}

export function getUserRules(userId) {
  return listRules(userId);
}
