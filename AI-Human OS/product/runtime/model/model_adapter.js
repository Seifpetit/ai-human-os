import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

const DEFAULT_CONFIG = {
  provider: "openai",
  model: "gpt-5.4",
  command: "codex",
  sandbox: "read-only",
};

export function getModelConfig() {
  return {
    provider: process.env.AI_OS_MODEL_PROVIDER || DEFAULT_CONFIG.provider,
    model: process.env.AI_OS_MODEL_NAME || DEFAULT_CONFIG.model,
    command: process.env.AI_OS_MODEL_COMMAND || DEFAULT_CONFIG.command,
    sandbox: process.env.AI_OS_MODEL_SANDBOX || DEFAULT_CONFIG.sandbox,
  };
}

export function runModel(prompt, options = {}) {
  const config = {
    ...getModelConfig(),
    ...options,
  };

  const command = config.command;
  let rawText = "";

  if (command === "codex") {
    const outputFile = path.join(
      os.tmpdir(),
      `ai_os_codex_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`
    );

    try {
      execSync(
        `codex exec --skip-git-repo-check --color never -m ${config.model} -s ${config.sandbox} -o "${outputFile}" -`,
        {
          input: prompt,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      rawText = fs.readFileSync(outputFile, "utf-8");
    } finally {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  } else {
    rawText = execSync(command, {
      input: prompt,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  return {
    status: "ok",
    provider: config.provider,
    model: config.model,
    raw_text: rawText,
  };
}
