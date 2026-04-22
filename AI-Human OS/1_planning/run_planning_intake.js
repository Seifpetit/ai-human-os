import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getModelConfig, runModel } from "../runtime/model/model_adapter.js";
import { getRuntimePaths, safeRead } from "../runtime/planning/data_layer.js";
import {
  logDivider,
  logError,
  logStep,
  logSub,
  logSuccess,
  timeEnd,
  timeStart,
} from "../3_execution/run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const PLANNING_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(PLANNING_DIR);
const PATHS = getRuntimePaths(AI_OS_ROOT);
const INTENT_CONFIRMATION_PATH = path.join(PLANNING_DIR, "INTENT_CONFIRMATION.md");

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.trim() + "\n", "utf-8");
}

function stripMarkdownFences(value) {
  const trimmed = String(value || "").trim();
  const fenced = trimmed.match(/^```(?:md|markdown)?\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildIntentConfirmationPrompt() {
  const scopePrompt = safeRead(path.join(PLANNING_DIR, "1_features_planning_prompt.txt"));

  return `
${scopePrompt}

----------------------------------------
NEW TASK
----------------------------------------

Do NOT generate FEATURES_LIST.md yet.

Your task now is to generate INTENT_CONFIRMATION.md only.

This is a human-verification checkpoint.
You must translate the human's raw scope input into a clear, reviewable planning handshake before feature generation begins.

The file must be easy for a human to scan and approve.
Do not turn this into roadmap planning.
Do not introduce implementation details unless they are already explicit in memory or obviously required by the human input.

----------------------------------------
OUTPUT CONTRACT
----------------------------------------

Return ONLY INTENT_CONFIRMATION.md using this exact structure:

# INTENT_CONFIRMATION.md

## HUMAN REVIEW FIRST - EDIT HERE

Approval Status:
- needs_human_review

What to do:
- Review the machine understanding below.
- If it is accurate enough for planning, change Approval Status to \`approved\`.
- If it is wrong, edit this file directly or revise 1_features_planning_prompt.txt and rerun \`node run_planning_intake.js\`.
- Do not run \`node run_planning.js\` until Approval Status is \`approved\`.

Human Corrections:
- none

---

## Machine Understanding

### Project Identity
<2-5 lines in plain language>

### Next Playable Win
<2-5 lines>

### Player Promise Right Now
- <item>

### Must Include Now
- <item>

### Must Stay Out Now
- <item>

### Budget And Constraints
- <item>

### Deferred Until Later
- <item>

### Assumptions I Am Making
- <item>

### Open Questions Or Risks
- <item or "none">

Rules:
- keep language plain and compact
- keep sections concrete
- preserve hard exclusions
- if the human intent is rough, resolve it into the narrowest safe understanding
- do not generate features, files, or implementation steps
- do not leave out uncertainties; list them under Open Questions Or Risks

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${safeRead(PATHS.projectContextMd)}

SYSTEM_REGISTRY:
${safeRead(PATHS.systemRegistryMd)}

FILE_REGISTRY:
${safeRead(PATHS.fileRegistryMd)}
`;
}

logStep("Planning Intake");

try {
  logSub("Generating INTENT_CONFIRMATION.md...");
  const prompt = buildIntentConfirmationPrompt();
  const modelConfig = getModelConfig();
  timeStart("Model Generation");
  const result = runModel(prompt, modelConfig);
  timeEnd("Model Generation");
  const markdown = stripMarkdownFences(result.raw_text || "");
  writeText(INTENT_CONFIRMATION_PATH, markdown);
  logSuccess("INTENT_CONFIRMATION.md updated");

  logDivider();
  logSuccess("Planning intake complete");
  logSub("Review AI-Human OS/1_planning/INTENT_CONFIRMATION.md");
  logSub("When approved, change Approval Status to approved");
  logSub("Then run: node run_planning.js");
  process.exit(0);
} catch (err) {
  logError("Planning intake failed");
  console.error(err.message);
  process.exit(1);
}
