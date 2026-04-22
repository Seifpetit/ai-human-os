import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

import {
  getRuntimePaths,
  readTargetRequest,
  syncFileRegistryJson,
  writeJson,
} from "../runtime/planning/data_layer.js";
import { runModel, getModelConfig } from "../runtime/model/model_adapter.js";
import {
  logStep,
  logSub,
  logSuccess,
  logWarn,
  logError,
  timeStart,
  timeEnd,
  logDivider
} from "./run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const EXEC_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(EXEC_DIR);
const PROJECT_ROOT = path.dirname(AI_OS_ROOT);
const PATHS = getRuntimePaths(AI_OS_ROOT);

function safeRead(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

function sha256(value) {
  return createHash("sha256").update(value || "", "utf-8").digest("hex");
}

logStep("Execute Agent");
logSub("Loading typed target request...");

const request = readTargetRequest(AI_OS_ROOT);

if (!request) {
  logError("target_file_request.json not found");
  process.exit(1);
}

logSuccess("Request loaded");

if (request.feedback) {
  logSub("Feedback detected");
  console.log("   -> feedback:");
  console.log(`      type = ${request.feedback.feedback_type || request.feedback.type}`);
} else {
  logSub("No feedback");
}

const relativePath = request.file_path;

if (!relativePath) {
  logError("file_path not found in request");
  process.exit(1);
}

logSuccess(`Path extracted: ${relativePath}`);

const fullPath = path.join(PROJECT_ROOT, relativePath);
const fileExists = fs.existsSync(fullPath);
const isEditOperation = request.operation_type === "edit_existing_file";
const isNewFileOperation = request.operation_type === "new_file";

if (fileExists && isNewFileOperation && !request.feedback) {
  logWarn(`File already exists: ${relativePath}`);
  logSub("Skipping model call (no feedback)");

  writeJson(PATHS.executionResultJson, {
    request_id: request.request_id,
    operation_key: request.operation_key,
    status: "reused_existing",
    file_path: relativePath,
    model_generation_count: 0,
    attempt_number: 0,
    generated_at: new Date().toISOString(),
  });

  execSync(`node "${AI_OS_ROOT}/3_execution/7.run_verify.js" "${relativePath}"`, {
    stdio: "inherit",
  });

  try {
    execSync(`node "${AI_OS_ROOT}/4_registry_update/run_registry_update.js"`, {
      stdio: "pipe",
    });
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const combined = stderr + "\n" + stdout;

    console.log(combined);

    if (combined.includes("INTERFACE_MISMATCH")) {
      console.error("INTERFACE_MISMATCH");
      process.exit(1);
    }

    logError("Registry update failed (unknown)");
    process.exit(1);
  }

  execSync(`node "${AI_OS_ROOT}/5_commit/run_commit.js"`, {
    stdio: "inherit",
  });

  process.exit(0);
}

if (fileExists && isEditOperation) {
  logSub("Edit operation detected -> existing file will be sent through model execution");
}

if (fileExists && request.feedback) {
  logWarn(`File exists but feedback present -> forcing regeneration`);
}

logSub("Loading system memory...");

const executeAgent = safeRead(path.join(AI_OS_ROOT, "agents/execute_agent.md"));
const projectContext = safeRead(PATHS.projectContextMd);
const systemRegistry = safeRead(PATHS.systemRegistryMd);
const productStandards = safeRead(PATHS.productStandardsMd);
const uiPatterns = safeRead(PATHS.uiPatternsMd);
const designTokens = safeRead(PATHS.designTokensJson);
const fileRegistryJson = syncFileRegistryJson(AI_OS_ROOT);
const modelConfig = getModelConfig();

logSuccess("Memory loaded");
logSub("Building prompt...");

const prompt = `
${executeAgent}

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${projectContext}

SYSTEM_REGISTRY:
${systemRegistry}

PRODUCT_STANDARDS:
${productStandards}

UI_PATTERNS:
${uiPatterns}

DESIGN_TOKENS:
${designTokens}

FILE_REGISTRY_JSON:
${JSON.stringify(fileRegistryJson, null, 2)}

----------------------------------------
TASK
----------------------------------------

TARGET_FILE_REQUEST_JSON:
${JSON.stringify(request, null, 2)}

RULES:
- If feedback is present, you MUST correct the issue
- Do NOT modify unrelated parts
- Do NOT change interface unless required by feedback
- Maintain consistency with FILE_REGISTRY_JSON
- Respect PRODUCT_STANDARDS, UI_PATTERNS, and DESIGN_TOKENS when the file is user-facing
- If quality_level is standard_passing or higher, avoid obvious placeholder UI
- Treat TARGET_FILE_REQUEST_JSON.styling_contract as mandatory implementation policy, not a suggestion
- Treat TARGET_FILE_REQUEST_JSON.capability_dependencies as mandatory capability-boundary policy, not a suggestion
- If TARGET_FILE_REQUEST_JSON.capability_dependencies shows a missing or partial capability, stay strictly within the declared required_contracts and prerequisite scope for this file; do not invent missing shared/server/client boundaries
- If styling_contract.styling_hooks requires className, emit stable className hooks on user-facing layout surfaces
- If styling_contract.inline_styles is forbidden, do not use inline style objects for user-facing layout styling
- If styling_contract.local_token_objects is forbidden, do not declare local tokens/theme/color objects in the file
- If styling_contract.hardcoded_colors is forbidden, do not emit hex/rgb/hsl color literals in the file
- If TARGET_FILE_REQUEST_JSON.file_path ends with ".js" and the file is either:
  - TARGET_FILE_REQUEST_JSON.browser_scaffold.dom_mount_entry
  - the declared runtime entry surface
  - the declared render surface
  - a declared child component in TARGET_FILE_REQUEST_JSON.cross_file_contracts.child_components
  then do not emit JSX; the file must remain valid plain JS module syntax
`;

logSuccess("Prompt ready");

logDivider();
logSub(`Calling model adapter (${modelConfig.provider}:${modelConfig.model})...`);
timeStart("Model Generation");

let modelResult;

try {
  modelResult = runModel(prompt, modelConfig);
  timeEnd("Model Generation");
  logSuccess(`${modelResult.provider}:${modelResult.model} responded`);
} catch (err) {
  timeEnd("Model Generation");
  logError("Model call failed");
  console.error(err.message);
  process.exit(1);
}

logSub("Parsing model output...");

const result = modelResult.raw_text || "";
const fileMatch = result.match(/---FILE START---([\s\S]*?)---FILE END---/);
const failMatch = result.match(/---FAIL START---([\s\S]*?)---FAIL END---/);

function extractFailField(block, key) {
  return block.match(new RegExp(`${key}=(.+)`))?.[1]?.trim() || "";
}

if (failMatch) {
  const failBlock = failMatch[1].trim();
  const reason = extractFailField(failBlock, "reason");
  const message = extractFailField(failBlock, "message");

  writeJson(PATHS.executionResultJson, {
    request_id: request.request_id,
    operation_key: request.operation_key,
    status: "blocked",
    file_path: relativePath,
    model_generation_count: 1,
    attempt_number: Number(request.feedback?.retry_count || 0) + 1,
    provider: modelResult.provider,
    model: modelResult.model,
    reason,
    message,
    prompt_hash: `sha256:${sha256(prompt)}`,
    response_hash: `sha256:${sha256(result)}`,
    generated_at: new Date().toISOString(),
  });

  logError(`Execution blocked: ${reason || "unknown_reason"}`);
  if (message) {
    console.error(message);
  }
  console.error("EXECUTION_BLOCKED");
  process.exit(1);
}

if (!fileMatch) {
  logError("Invalid output format from agent");

  writeJson(PATHS.executionResultJson, {
    request_id: request.request_id,
    operation_key: request.operation_key,
    status: "invalid_output",
    file_path: relativePath,
    model_generation_count: 1,
    attempt_number: Number(request.feedback?.retry_count || 0) + 1,
    provider: modelResult.provider,
    model: modelResult.model,
    prompt_hash: `sha256:${sha256(prompt)}`,
    response_hash: `sha256:${sha256(result)}`,
    generated_at: new Date().toISOString(),
  });

  console.log(result);
  process.exit(1);
}

const fileContent = fileMatch[1].trim();
logSuccess("File content extracted");

logSub("Writing file...");

fs.mkdirSync(path.dirname(fullPath), { recursive: true });
fs.writeFileSync(fullPath, fileContent);

writeJson(PATHS.executionResultJson, {
  request_id: request.request_id,
  operation_key: request.operation_key,
  status: "generated",
  file_path: relativePath,
  model_generation_count: 1,
  attempt_number: Number(request.feedback?.retry_count || 0) + 1,
  provider: modelResult.provider,
  model: modelResult.model,
  prompt_hash: `sha256:${sha256(prompt)}`,
  response_hash: `sha256:${sha256(result)}`,
  content_hash: `sha256:${sha256(fileContent)}`,
  generated_at: new Date().toISOString(),
});

logSuccess(`File created: ${relativePath}`);

logDivider();
logSub("Running verification...");

try {
  execSync(`node "${AI_OS_ROOT}/3_execution/7.run_verify.js" "${relativePath}"`, {
    stdio: "inherit",
  });
} catch {
  logError("Verification failed");
  process.exit(1);
}

logDivider();
logSub("Running commit step...");

try {
  execSync(`node "${AI_OS_ROOT}/4_registry_update/run_commit_with_registry.js"`, {
    stdio: "inherit",
  });
} catch {
  logError("Commit failed");
  process.exit(1);
}

logSuccess("Execution complete");
