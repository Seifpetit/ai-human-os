import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getModelConfig, runModel } from "../model/model_adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRODUCT_ROOT = path.resolve(__dirname, "..", "..");
const PROMPT_PATH = path.join(PRODUCT_ROOT, "prompts", "l0_agent.txt");

function loadPrompt() {
  return fs.readFileSync(PROMPT_PATH, "utf-8");
}

function buildPrompt(rawIntent) {
  return [
    loadPrompt(),
    "",
    "INPUT",
    JSON.stringify({
      raw_intent: String(rawIntent || ""),
    }, null, 2),
  ].join("\n");
}

export function runL0Agent(rawIntent) {
  const result = runModel(buildPrompt(rawIntent), {
    ...getModelConfig(),
    sandbox: "read-only",
  });

  return JSON.parse(String(result?.raw_text || "").trim());
}
