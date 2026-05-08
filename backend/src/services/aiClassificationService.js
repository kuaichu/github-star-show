import { fetchRepository } from "./githubService.js";
import { updateProjectAiClassification } from "./projectService.js";
import { CATEGORY_LABELS } from "./classificationService.js";

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

const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === "true";
}

function getMaxPerRun(limit) {
  const raw = limit ?? process.env.AI_CLASSIFICATION_MAX_PER_RUN ?? 25;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 25;
  return Math.min(value, 100);
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

async function fetchReadmeSnippet(project) {
  if (!shouldIncludeReadme()) {
    return "";
  }

  try {
    const repository = await fetchRepository(project.github);
    return repository.readme || "";
  } catch {
    return "";
  }
}

export function getAiClassificationConfig() {
  return {
    enabled: shouldUseAiClassification(),
    model: DEFAULT_MODEL,
    maxPerRun: getMaxPerRun(),
    includeReadme: shouldIncludeReadme()
  };
}

export async function classifyProjectWithAi(project) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const readme = await fetchReadmeSnippet(project);
  const response = await fetch(`${OPENAI_API_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
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
  });

  const data = await response.json();

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
    model: DEFAULT_MODEL,
    classifiedAt: new Date()
  };
}

function shouldClassifyProject(project, force) {
  if (force) return true;
  if (!project.aiCategory) return true;
  if (project.categorySource !== "ai" && project.category === CATEGORY_LABELS.uncategorized) return true;
  return false;
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

  const force = Boolean(options.force);
  const maxPerRun = getMaxPerRun(options.limit);
  const candidates = projects.filter(project => shouldClassifyProject(project, force)).slice(0, maxPerRun);
  const results = [];

  for (const project of candidates) {
    try {
      const classification = await classifyProjectWithAi(project);
      const updatedProject = await updateProjectAiClassification(project.id, classification);
      if (updatedProject) {
        results.push(updatedProject);
      }
    } catch (error) {
      results.push({
        id: project.id,
        name: project.name,
        error: error.message || "AI classification failed."
      });
    }
  }

  return {
    enabled: true,
    processed: candidates.length,
    updated: results.filter(item => !item.error).length,
    skipped: Math.max(projects.length - candidates.length, 0),
    items: results,
    model: config.model
  };
}
