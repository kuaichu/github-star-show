import "dotenv/config";
import { fetchRepository } from "./githubService.js";
import { saveAutomaticClassificationIfUnchanged } from "./userProjectService.js";
import { CATEGORY_LABELS } from "./classificationService.js";
import { NetworkRequestError, requestJson } from "../lib/httpClient.js";
import {
  OperationLeaseLostError,
  withOperationLease,
  withOperationLeaseTransaction
} from "./operationLeaseService.js";
import { PublicHttpError } from "../lib/publicHttpError.js";

export const AI_CATEGORY_OPTIONS = [
  CATEGORY_LABELS.ai,
  CATEGORY_LABELS.ops,
  CATEGORY_LABELS.network,
  CATEGORY_LABELS.media,
  CATEGORY_LABELS.security,
  CATEGORY_LABELS.frontend,
  CATEGORY_LABELS.automation,
  CATEGORY_LABELS.uncategorized
];

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === "true";
}

function getMaxPerRun(limit) {
  const configured = Number(process.env.AI_CLASSIFICATION_MAX_PER_RUN ?? 25);
  const configuredLimit = Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 100)
    : 25;
  if (limit === undefined || limit === null) return configuredLimit;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new PublicHttpError("INVALID_AI_LIMIT", 400, "limit must be a positive integer");
  }
  return Math.min(limit, configuredLimit);
}

function getAiModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function getOpenAiBaseUrl() {
  return String(process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

function getAiCooldownSeconds() {
  const value = Number(process.env.AI_CLASSIFICATION_COOLDOWN_SECONDS ?? 300);
  return Number.isInteger(value) && value >= 1 && value <= 86_400 ? value : 300;
}

function shouldUseAiClassification() {
  return parseBooleanEnv(process.env.AI_CLASSIFICATION_ENABLED, false) && Boolean(process.env.OPENAI_API_KEY);
}

function shouldIncludeReadme() {
  return parseBooleanEnv(process.env.AI_CLASSIFICATION_INCLUDE_README, false);
}

function buildSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["category", "confidence", "reason"],
    properties: {
      category: {
        type: "string",
        enum: AI_CATEGORY_OPTIONS
      },
      confidence: {
        type: "number"
      },
      reason: {
        type: "string"
      }
    }
  };
}

function buildPrompt(project, readme = "") {
  const payload = {
    name: project.name,
    author: project.author,
    description: project.description,
    language: project.language,
    tags: project.tags,
    github: project.github,
    readme
  };

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You classify GitHub repositories into one fixed category list.",
            `Choose exactly one category from: ${AI_CATEGORY_OPTIONS.join(", ")}.`,
            "Prefer the repository's main use case rather than implementation details.",
            "Use the fallback category for generic utilities or when the evidence is weak.",
            "Return a concise reason in plain English."
          ].join("\n")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    }
  ];
}

function parseResponseJson(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return JSON.parse(data.output_text);
  }

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) {
        return JSON.parse(content.text);
      }
    }
  }

  throw new Error("OpenAI response did not contain structured output.");
}

async function fetchReadmeSnippet(project, accessToken = "") {
  if (!shouldIncludeReadme()) {
    return "";
  }

  try {
    const repository = await fetchRepository(project.github, accessToken);
    return repository.readme || "";
  } catch (error) {
    if (error instanceof NetworkRequestError && error.rateLimited) throw error;
    return "";
  }
}

export function getAiClassificationConfig() {
  return {
    enabled: shouldUseAiClassification(),
    model: getAiModel(),
    maxPerRun: getMaxPerRun(),
    includeReadme: shouldIncludeReadme()
  };
}

export async function classifyProjectWithAi(project, options = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  options.signal?.throwIfAborted();
  const model = getAiModel();
  const readme = await fetchReadmeSnippet(project, options.accessToken || "");
  options.signal?.throwIfAborted();
  const response = await requestJson(`${getOpenAiBaseUrl()}/responses`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      input: buildPrompt(project, readme),
      text: {
        format: {
          type: "json_schema",
          name: "repository_classification",
          strict: true,
          schema: buildSchema()
        }
      }
    })
  }, {
    service: "OpenAI",
    idempotent: false
  });

  const data = response.data;

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI classification failed.");
  }

  if (data.status && data.status !== "completed") {
    throw new Error(`OpenAI response status was ${data.status}.`);
  }

  if (data.refusal) {
    throw new Error("OpenAI refused to classify this repository.");
  }

  const parsed = parseResponseJson(data);
  return {
    category: parsed.category,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    reason: String(parsed.reason || "").trim(),
    model,
    classifiedAt: new Date()
  };
}

function shouldClassifyProject(project, force) {
  if (force) return true;
  if (project.categorySource === "manual") return false;
  if (!project.aiCategory) return true;
  if (project.categorySource !== "ai" && project.category === CATEGORY_LABELS.uncategorized) return true;
  return false;
}

async function performAiClassification(projects, options, config, maxPerRun) {
  const force = options.force ?? false;
  const user = options.user;
  const candidates = projects.filter(project => shouldClassifyProject(project, force)).slice(0, maxPerRun);
  const results = [];

  for (const project of candidates) {
    options.signal?.throwIfAborted();
    let classification;
    try {
      classification = await classifyProjectWithAi(project, {
        accessToken: user.accessToken || "",
        signal: options.signal
      });
    } catch (error) {
      if ((error instanceof NetworkRequestError && error.rateLimited) ||
          error instanceof OperationLeaseLostError) {
        throw error;
      }
      results.push({
        id: project.id,
        name: project.name,
        error: "AI classification failed."
      });
      continue;
    }

    options.signal?.throwIfAborted();
    const updatedProject = await withOperationLeaseTransaction(options.lease, tx =>
      saveAutomaticClassificationIfUnchanged(user, project, {
        category: classification.category,
        categorySource: "ai",
        categoryReason: classification.reason ? `ai:${classification.reason}` : "ai:classified",
        aiCategory: classification.category,
        aiConfidence: classification.confidence,
        aiReason: classification.reason,
        aiModel: classification.model,
        aiClassifiedAt: classification.classifiedAt
      }, { client: tx })
    );
    if (updatedProject) {
      results.push(updatedProject);
    } else {
      results.push({
        id: project.id,
        name: project.name,
        skipped: true,
        conflicted: true
      });
    }
  }

  return {
    enabled: true,
    processed: candidates.length,
    updated: results.filter(item => !item.error && !item.skipped).length,
    skipped: Math.max(projects.length - candidates.length, 0)
      + results.filter(item => item.skipped).length,
    items: results,
    model: config.model
  };
}

export async function classifyProjectsWithAi(projects, options = {}) {
  const config = getAiClassificationConfig();

  if (!config.enabled) {
    return {
      enabled: false,
      processed: 0,
      updated: 0,
      skipped: projects.length,
      items: []
    };
  }

  const user = options.user;
  if (!user) {
    throw new Error("A user is required for AI classification.");
  }
  if (options.force !== undefined && typeof options.force !== "boolean") {
    throw new PublicHttpError("INVALID_AI_FORCE", 400, "force must be a boolean");
  }
  const maxPerRun = getMaxPerRun(options.limit);
  const userId = Number(user.dbUserId || user.id);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("A positive userId is required");

  return withOperationLease({
    key: `classification:${userId}`,
    userId,
    kind: "ai",
    respectCooldown: true,
    cooldownSeconds: getAiCooldownSeconds()
  }, (lease, signal) => performAiClassification(
    projects,
    { ...options, signal, lease },
    config,
    maxPerRun
  ));
}
