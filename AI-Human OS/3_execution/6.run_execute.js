import fs from "fs";
import { execSync } from "child_process";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

import {
  getRuntimePaths,
  readJson,
  readTargetRequest,
  syncFileRegistryJson,
  writeJson,
} from "../runtime/planning/data_layer.js";
import { resolveProjectRoot } from "../runtime/workspace/workspace_config.js";
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
const resolvedProjectRoot = resolveProjectRoot(AI_OS_ROOT);
const PROJECT_ROOT = resolvedProjectRoot.ok ? resolvedProjectRoot.projectRoot : path.dirname(AI_OS_ROOT);
const PATHS = getRuntimePaths(AI_OS_ROOT);

function safeRead(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

function sha256(value) {
  return createHash("sha256").update(value || "", "utf-8").digest("hex");
}

function hasCurrentVerifiedArtifact({
  request,
  executionResult,
  verifyResult,
  relativePath,
  fullPath,
}) {
  if (!request?.operation_key || !fs.existsSync(fullPath)) {
    return false;
  }

  if (verifyResult?.status !== "pass" || verifyResult?.operation_key !== request.operation_key) {
    return false;
  }

  if (executionResult?.operation_key !== request.operation_key || executionResult?.file_path !== relativePath) {
    return false;
  }

  const behaviorRequired = Boolean(request.behavior_contract?.required);
  if (Boolean(executionResult?.behavior_contract_required) !== behaviorRequired) {
    return false;
  }

  if (behaviorRequired && executionResult?.behavior_plan_hash !== request.behavior_contract?.plan_hash) {
    return false;
  }

  const currentContent = fs.readFileSync(fullPath, "utf-8");
  const currentContentHash = `sha256:${sha256(currentContent)}`;
  if (executionResult?.content_hash !== currentContentHash) {
    return false;
  }

  return ["generated", "reused_existing"].includes(executionResult?.status || "");
}

function runCommitStep() {
  logDivider();
  logSub("Running commit step...");

  try {
    execSync(`node "${AI_OS_ROOT}/4_registry_update/run_commit_with_registry.js"`, {
      stdio: "inherit",
    });
  } catch (err) {
    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const combined = stderr + "\n" + stdout + "\n" + (err.message || "");
    const commitGateBlocked = combined.toLowerCase().includes("commit_gate_blocked");

    logError(commitGateBlocked ? "Commit gate blocked" : "Commit failed");
    process.exit(1);
  }
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
const existingExecutionResult = readJson(PATHS.executionResultJson, null);
const existingVerifyResult = readJson(PATHS.verifyResultJson, null);

if (hasCurrentVerifiedArtifact({
  request,
  executionResult: existingExecutionResult,
  verifyResult: existingVerifyResult,
  relativePath,
  fullPath,
})) {
  logSuccess("Current artifact already verified for this operation");
  runCommitStep();
  logSuccess("Execution complete");
  process.exit(0);
}

if (fileExists && isNewFileOperation && !request.feedback) {
  logWarn(`File already exists: ${relativePath}`);
  logSub("Skipping model call (no feedback)");
  const existingContent = fs.readFileSync(fullPath, "utf-8");

  writeJson(PATHS.executionResultJson, {
    request_id: request.request_id,
    operation_key: request.operation_key,
    status: "reused_existing",
    file_path: relativePath,
    model_generation_count: 0,
    attempt_number: 0,
    behavior_contract_required: Boolean(request.behavior_contract?.required),
    behavior_plan_hash: request.behavior_contract?.plan_hash || "",
    content_hash: `sha256:${sha256(existingContent)}`,
    generated_at: new Date().toISOString(),
  });

  execSync(`node "${AI_OS_ROOT}/3_execution/7.run_verify.js" "${relativePath}"`, {
    stdio: "inherit",
  });
  runCommitStep();
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
const behaviorScenarios = request.behavior_contract?.required ? safeRead(request.memory_refs?.scenarios_md) : "";
const behaviorStateFlow = request.behavior_contract?.required ? safeRead(request.memory_refs?.state_flow_md) : "";
const behaviorReconciliationRule = request.behavior_contract?.required ? safeRead(request.memory_refs?.reconciliation_rule_md) : "";
const behaviorSimulationReport = request.behavior_contract?.required ? safeRead(request.memory_refs?.simulation_report_md) : "";
const fileRegistryJson = syncFileRegistryJson(AI_OS_ROOT);
const modelConfig = getModelConfig();

if (request.behavior_contract?.required && request.behavior_contract?.simulation_status !== "pass") {
  logError("Behavior contract is not ready");
  console.error("BEHAVIOR_SIMULATION_FAILED");
  process.exit(1);
}

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

${request.behavior_contract?.required ? `
----------------------------------------
BEHAVIOR CONTRACT
----------------------------------------

This operation is behavior-sensitive. The artifacts below are mandatory behavioral policy for generation.
Do not invent alternate state ownership, sync behavior, authority rules, or conflict resolution.

BEHAVIOR_CONTRACT_JSON:
${JSON.stringify(request.behavior_contract, null, 2)}

SCENARIOS.md:
${behaviorScenarios}

STATE_FLOW.md:
${behaviorStateFlow}

RECONCILIATION_RULE.md:
${behaviorReconciliationRule}

SIMULATION_REPORT.md:
${behaviorSimulationReport}
` : ""}

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
- If TARGET_FILE_REQUEST_JSON.behavior_contract.required is true, treat SCENARIOS.md, STATE_FLOW.md, RECONCILIATION_RULE.md, and SIMULATION_REPORT.md as mandatory behavioral specification, not advisory context
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
    behavior_contract_required: Boolean(request.behavior_contract?.required),
    behavior_plan_hash: request.behavior_contract?.plan_hash || "",
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
    behavior_contract_required: Boolean(request.behavior_contract?.required),
    behavior_plan_hash: request.behavior_contract?.plan_hash || "",
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
  behavior_contract_required: Boolean(request.behavior_contract?.required),
  behavior_plan_hash: request.behavior_contract?.plan_hash || "",
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
runCommitStep();

logSuccess("Execution complete");
