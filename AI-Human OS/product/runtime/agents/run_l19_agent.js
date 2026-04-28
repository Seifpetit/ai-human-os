import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getModelConfig, runModel } from "../model/model_adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRODUCT_ROOT = path.resolve(__dirname, "..", "..");
const PROMPT_PATH = path.join(PRODUCT_ROOT, "prompts", "l1_verifier_agent.txt");

function loadPrompt() {
  return fs.readFileSync(PROMPT_PATH, "utf-8");
}

function buildPrompt({ raw_intent, decision_graph, interrogation_trace }) {
  return [
    loadPrompt(),
    "",
    "INPUT",
    JSON.stringify({
      raw_intent: String(raw_intent || ""),
      decision_graph,
      interrogation_trace,
    }, null, 2),
  ].join("\n");
}

export function runL19Agent({ raw_intent, decision_graph, interrogation_trace }) {
  const result = runModel(buildPrompt({
    raw_intent,
    decision_graph,
    interrogation_trace,
  }), {
    ...getModelConfig(),
    sandbox: "read-only",
  });

  return JSON.parse(String(result?.raw_text || "").trim());
}
