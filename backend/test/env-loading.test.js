import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test(".env OPENAI_API_BASE_URL and OPENAI_MODEL are loaded before service evaluation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "github-star-show-env-"));
  try {
    await writeFile(path.join(directory, ".env"), [
      'DATABASE_URL="file:./env-test.db"',
      'OPENAI_API_KEY="env-key"',
      'OPENAI_API_BASE_URL="https://dotenv-openai.example.test/v1"',
      'OPENAI_MODEL="dotenv-model"',
      'AI_CLASSIFICATION_ENABLED="true"'
    ].join("\n"), "utf8");
    const serviceUrl = pathToFileURL(path.resolve("src/services/aiClassificationService.js")).href;
    const env = { ...process.env };
    for (const key of [
      "DATABASE_URL", "OPENAI_API_KEY", "OPENAI_API_BASE_URL", "OPENAI_MODEL",
      "AI_CLASSIFICATION_ENABLED"
    ]) delete env[key];
    const child = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `const service = await import(${JSON.stringify(serviceUrl)}); console.log(JSON.stringify(service.getAiClassificationConfig()));`
    ], {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: 30_000
    });
    assert.equal(child.status, 0, child.stderr);
    const config = JSON.parse(child.stdout.trim());
    assert.equal(config.enabled, true);
    assert.equal(config.model, "dotenv-model");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
