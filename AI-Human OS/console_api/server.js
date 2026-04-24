import http from "http";
import { execFileSync, spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertWorkspaceRootReady, resolveProjectRoot, setWorkspaceRoot } from "../runtime/workspace/workspace_config.js";
import { getRuntimePaths, readJson, readJsonl } from "../runtime/planning/data_layer.js";
import { loadProductRequirements } from "../runtime/requirements/product_requirements.js";
import {
  buildCommitConfirmationContext,
  getCommitConfirmationState,
  renderCommitConfirmationMarkdown,
} from "../runtime/commit/commit_confirmation.js";
import { evaluateCommitGatePolicy } from "../runtime/throughput/throughput_policy.js";

const __filename = fileURLToPath(import.meta.url);
const API_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(API_DIR);
const REPO_ROOT = path.dirname(AI_OS_ROOT);

const HOST = "127.0.0.1";
const PORT = Number(process.env.AI_OS_CONSOLE_PORT || 4310);
const UI_PORT = Number(process.env.AI_OS_CONSOLE_UI_PORT || 5174);
const SNAPSHOT_LIMIT_PER_ARTIFACT = 12;
const ALLOWED_BROWSER_ORIGINS = new Set([
  `http://127.0.0.1:${UI_PORT}`,
  `http://localhost:${UI_PORT}`,
]);
const RESET_MODES = [
  {
    id: "normal",
    label: "Normal reset",
    description: "Resets the current active feature and runtime/applied state.",
  },
  {
    id: "archive",
    label: "Restore archived feature",
    description: "Restores archived planning/behavior docs and resets runtime/applied state.",
  },
  {
    id: "hard",
    label: "Hard reset",
    description: "Resets memory/planning/behavior files to templates and clears runtime state.",
  },
];

const ARTIFACT_LABELS = {
  project_context_md: "PROJECT_CONTEXT.md",
  product_standards_md: "PRODUCT_STANDARDS.md",
  planning_prompt_txt: "1_features_planning_prompt.txt",
  intent_confirmation_md: "Gate 1: INTENT_CONFIRMATION.md",
  execution_confirmation_md: "Gate 2: EXECUTION_CONFIRMATION.md",
  commit_confirmation_md: "Gate 3: COMMIT_CONFIRMATION.md",
  features_list_md: "FEATURES_LIST.md",
  feature_request_md: "FEATURE_REQUEST.md",
  implementation_plan_md: "IMPLEMENTATION_PLAN.md",
  implementation_plan_json: "implementation_plan.json",
  plan_decision_evaluation_json: "plan_decision_evaluation.json",
  plan_traceability_evaluation_json: "plan_traceability_evaluation.json",
  scenarios_md: "SCENARIOS.md",
  state_flow_md: "STATE_FLOW.md",
  reconciliation_rule_md: "RECONCILIATION_RULE.md",
  simulation_report_md: "SIMULATION_REPORT.md",
  target_file_request_json: "target_file_request.json",
  execution_result_json: "execution_result.json",
  verify_result_json: "verify_result.json",
  run_metrics_json: "run_metrics.json",
  cycle_metrics_jsonl: "cycle_metrics.jsonl",
  throughput_policy_json: "THROUGHPUT_POLICY.json",
  canonical_definitions_json: "CANONICAL_DEFINITIONS.json",
  workspace_config_json: "WORKSPACE_CONFIG.json",
};

const SNAPSHOT_ARTIFACTS_BY_TASK = {
  planning_intake: [
    "intent_confirmation_md",
  ],
  planning: [
    "features_list_md",
    "feature_request_md",
    "implementation_plan_md",
    "implementation_plan_json",
    "plan_decision_evaluation_json",
    "plan_traceability_evaluation_json",
    "execution_confirmation_md",
  ],
  ai: [
    "scenarios_md",
    "state_flow_md",
    "reconciliation_rule_md",
    "simulation_report_md",
    "target_file_request_json",
    "execution_result_json",
    "verify_result_json",
    "commit_confirmation_md",
    "run_metrics_json",
    "cycle_metrics_jsonl",
  ],
  schema_upgrade: [
    "implementation_plan_json",
    "plan_decision_evaluation_json",
    "plan_traceability_evaluation_json",
    "run_metrics_json",
  ],
  metrics_report: [
    "run_metrics_json",
    "cycle_metrics_jsonl",
  ],
};

function normalizePath(p) {
  return String(p || "").replace(/\\/g, "/");
}

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf-8").digest("hex");
}

function safeReadText(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
  } catch {
    return "";
  }
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function getBrowserOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    return origin;
  }

  const referer = String(req.headers.referer || "").trim();
  if (!referer) {
    return "";
  }

  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function hasBrowserFetchMetadata(req) {
  return Boolean(
    req.headers["sec-fetch-site"] ||
    req.headers["sec-fetch-mode"] ||
    req.headers["sec-fetch-dest"]
  );
}

function isAllowedBrowserOrigin(origin) {
  return ALLOWED_BROWSER_ORIGINS.has(origin);
}

function rejectDisallowedBrowserOrigin(req, res) {
  const browserOrigin = getBrowserOrigin(req);
  const browserLikeRequest = Boolean(browserOrigin) || hasBrowserFetchMetadata(req);

  if (!browserLikeRequest) {
    return false;
  }

  if (isAllowedBrowserOrigin(browserOrigin)) {
    return false;
  }

  json(res, 403, {
    ok: false,
    error: "origin_not_allowed",
    detail: `Console API only accepts browser requests from ${[...ALLOWED_BROWSER_ORIGINS].join(", ")}`,
  });
  return true;
}

function json(res, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function text(res, statusCode, value, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(value || "");
}

function notFound(res) {
  json(res, 404, { ok: false, error: "not_found" });
}

function badRequest(res, message) {
  json(res, 400, { ok: false, error: "bad_request", message });
}

function methodNotAllowed(res) {
  json(res, 405, { ok: false, error: "method_not_allowed" });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseJsonBody(body) {
  if (!body || !body.trim()) return {};
  return JSON.parse(body);
}

function getConsolePaths() {
  const runtimePaths = getRuntimePaths(AI_OS_ROOT);
  return {
    ...runtimePaths,
    consoleSnapshotsJson: runtimePaths.consoleSnapshotsJson,
  };
}

function getCanonicalArtifacts() {
  const paths = getConsolePaths();
  return {
    product_standards_md: path.join(AI_OS_ROOT, "memory/PRODUCT_STANDARDS.md"),
    project_context_md: path.join(AI_OS_ROOT, "memory/PROJECT_CONTEXT.md"),
    planning_prompt_txt: path.join(AI_OS_ROOT, "1_planning/1_features_planning_prompt.txt"),
    intent_confirmation_md: path.join(AI_OS_ROOT, "1_planning/INTENT_CONFIRMATION.md"),
    execution_confirmation_md: path.join(AI_OS_ROOT, "1_planning/EXECUTION_CONFIRMATION.md"),
    commit_confirmation_md: path.join(AI_OS_ROOT, "5_commit/COMMIT_CONFIRMATION.md"),
    features_list_md: path.join(AI_OS_ROOT, "1_planning/FEATURES_LIST.md"),
    feature_request_md: path.join(AI_OS_ROOT, "1_planning/FEATURE_REQUEST.md"),
    implementation_plan_md: path.join(AI_OS_ROOT, "1_planning/IMPLEMENTATION_PLAN.md"),
    implementation_plan_json: paths.implementationPlanJson,
    plan_decision_evaluation_json: paths.planDecisionEvaluationJson,
    plan_traceability_evaluation_json: paths.planTraceabilityEvaluationJson,
    scenarios_md: paths.scenariosMd,
    state_flow_md: paths.stateFlowMd,
    reconciliation_rule_md: paths.reconciliationRuleMd,
    simulation_report_md: paths.simulationReportMd,
    target_file_request_json: paths.targetRequestJson,
    execution_result_json: paths.executionResultJson,
    verify_result_json: paths.verifyResultJson,
    run_metrics_json: paths.runMetricsJson,
    cycle_metrics_jsonl: paths.cycleMetricsJsonl,
    throughput_policy_json: path.join(AI_OS_ROOT, "memory/THROUGHPUT_POLICY.json"),
    canonical_definitions_json: path.join(AI_OS_ROOT, "memory/CANONICAL_DEFINITIONS.json"),
    workspace_config_json: path.join(AI_OS_ROOT, "memory/WORKSPACE_CONFIG.json"),
  };
}

function getArtifactLabel(id) {
  return ARTIFACT_LABELS[id] || id;
}

function readApprovalStatus(markdown) {
  return (
    markdown.match(/Approval Status:\s*(?:\r?\n)?-\s*(.+)/i)?.[1]?.trim().toLowerCase() ||
    ""
  );
}

function setApprovalStatus(markdown, nextStatus) {
  const normalizedNext = String(nextStatus || "").trim();
  if (!normalizedNext) {
    throw new Error("approval_status_missing");
  }

  const allowed = new Set(["approved", "needs_human_review"]);
  if (!allowed.has(normalizedNext)) {
    throw new Error("approval_status_not_allowed");
  }

  if (!markdown || !markdown.trim()) {
    throw new Error("artifact_missing");
  }

  if (!/Approval Status:/i.test(markdown)) {
    throw new Error("approval_status_header_missing");
  }

  // Replace the first bullet under "Approval Status:" only.
  const updated = markdown.replace(
    /(Approval Status:\s*(?:\r?\n))-\s*.+/i,
    `$1- ${normalizedNext}`
  );

  if (updated === markdown) {
    throw new Error("approval_status_update_failed");
  }

  return updated;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionBlock(markdown, heading) {
  const escapedHeading = escapeRegExp(heading);
  return markdown.match(new RegExp(`### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?:\\r?\\n### |$)`, "i"))?.[1]?.trim() || "";
}

function extractScalarSection(markdown, heading) {
  const block = extractSectionBlock(markdown, heading);
  return block || "none";
}

function extractBulletItems(markdown, heading) {
  return extractSectionBlock(markdown, heading)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function extractBulletItemsAny(markdown, headings) {
  for (const heading of headings) {
    const items = extractBulletItems(markdown, heading);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function readMarkdownStatus(markdown, label) {
  return markdown.match(new RegExp(`${escapeRegExp(label)}:\\s*(?:\\r?\\n)?-\\s*(.+)`, "i"))?.[1]?.trim().toLowerCase() || "";
}

function isNoneList(items) {
  if (!items || items.length === 0) {
    return true;
  }

  return items.length === 1 && /^none$/i.test(items[0]);
}

function parsePlannedFileOperations(markdown) {
  return extractSectionBlock(markdown, "Planned File Operations")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function getCurrentProjectRoot() {
  return assertWorkspaceRootReady(AI_OS_ROOT).projectRoot;
}

function assertGate1ApprovalEligible(markdown) {
  const ambiguityResolutionStatus = readMarkdownStatus(markdown, "Ambiguity Resolution Status");
  const ambiguities = extractBulletItems(markdown, "Ambiguities Detected");
  const questions = extractBulletItems(markdown, "Questions For Human Confirmation");
  const assumptions = extractBulletItemsAny(markdown, [
    "Assumptions I Am Making To Proceed",
    "Assumptions I Am Making",
  ]);
  const hasAmbiguitySignals = !isNoneList(ambiguities) || !isNoneList(questions) || !isNoneList(assumptions);
  const allowedResolutionStates = new Set(["clear", "assumptions_accepted", "human_corrected"]);

  if (!allowedResolutionStates.has(ambiguityResolutionStatus)) {
    throw new Error("gate1_ambiguity_review_incomplete");
  }

  if (ambiguityResolutionStatus === "clear" && hasAmbiguitySignals) {
    throw new Error("gate1_clear_status_conflicts_with_open_ambiguity");
  }
}

function assertGate2ApprovalEligible(markdown) {
  const gates = computeGateState();
  if (gates.gate1.approval_status !== "approved") {
    throw new Error("gate2_requires_gate1_approved");
  }

  const paths = getRuntimePaths(AI_OS_ROOT);
  const planData = readJson(paths.implementationPlanJson, null);
  if (!planData || !Array.isArray(planData.operations) || planData.operations.length === 0) {
    throw new Error("gate2_missing_compiled_plan");
  }

  if (!fs.existsSync(paths.planDecisionEvaluationJson) || !fs.existsSync(paths.planTraceabilityEvaluationJson)) {
    throw new Error("gate2_missing_plan_evaluation_artifacts");
  }

  const currentFeature = planData.feature || "none";
  const currentGoal = planData.goal || "none";
  const markdownFeature = extractScalarSection(markdown, "Feature");
  const markdownGoal = extractScalarSection(markdown, "Goal");

  if (markdownFeature !== currentFeature) {
    throw new Error("gate2_stale_feature_snapshot");
  }

  if (markdownGoal !== currentGoal) {
    throw new Error("gate2_stale_goal_snapshot");
  }

  const currentOperations = (planData.operations || []).map(
    operation => `${operation.operation_key} | ${operation.operation_type} | ${operation.file_path}`
  );
  const markdownOperations = parsePlannedFileOperations(markdown);

  if (
    markdownOperations.length !== currentOperations.length ||
    markdownOperations.some((line, index) => line !== currentOperations[index])
  ) {
    throw new Error("gate2_stale_operation_snapshot");
  }
}

function assertGate3ApprovalEligible(markdown) {
  const gates = computeGateState();
  if (gates.gate2.approval_status !== "approved") {
    throw new Error("gate3_requires_gate2_approved");
  }

  const projectRoot = getCurrentProjectRoot();
  const context = buildCommitConfirmationContext({
    aiOsRoot: AI_OS_ROOT,
    projectRoot,
  });
  const throughputAssessment = evaluateCommitGatePolicy({
    aiOsRoot: AI_OS_ROOT,
    context,
  });
  const state = getCommitConfirmationState(markdown, {
    operationKey: context.request.operation_key,
    contentHash: context.contentHash,
  });

  if (state === "stale" || state === "missing") {
    writeText(
      context.paths.commitConfirmationMd,
      renderCommitConfirmationMarkdown({
        ...context,
        approval: throughputAssessment.approval,
        throughputAssessment,
      })
    );
    throw new Error("gate3_artifact_stale_refreshed");
  }
}

function assertGateApprovalEligible({ gateId, markdown, nextStatus }) {
  if (String(nextStatus || "").trim() !== "approved") {
    return;
  }

  if (gateId === "gate1") {
    assertGate1ApprovalEligible(markdown);
    return;
  }

  if (gateId === "gate2") {
    assertGate2ApprovalEligible(markdown);
    return;
  }

  if (gateId === "gate3") {
    assertGate3ApprovalEligible(markdown);
  }
}

function artifactMeta(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, size_bytes: 0, mtime_ms: 0 };
    }
    const stat = fs.statSync(filePath);
    return {
      exists: stat.isFile(),
      size_bytes: stat.size,
      mtime_ms: stat.mtimeMs,
    };
  } catch {
    return { exists: false, size_bytes: 0, mtime_ms: 0 };
  }
}

function computeGateState() {
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const gate1 = safeReadText(CANONICAL_ARTIFACTS.intent_confirmation_md);
  const gate2 = safeReadText(CANONICAL_ARTIFACTS.execution_confirmation_md);
  const gate3 = safeReadText(CANONICAL_ARTIFACTS.commit_confirmation_md);

  return {
    gate1: {
      artifact: "intent_confirmation_md",
      approval_status: gate1 ? readApprovalStatus(gate1) || "unknown" : "missing",
      meta: artifactMeta(CANONICAL_ARTIFACTS.intent_confirmation_md),
    },
    gate2: {
      artifact: "execution_confirmation_md",
      approval_status: gate2 ? readApprovalStatus(gate2) || "unknown" : "missing",
      meta: artifactMeta(CANONICAL_ARTIFACTS.execution_confirmation_md),
    },
    gate3: {
      artifact: "commit_confirmation_md",
      approval_status: gate3 ? readApprovalStatus(gate3) || "unknown" : "missing",
      meta: artifactMeta(CANONICAL_ARTIFACTS.commit_confirmation_md),
    },
  };
}

function extractHumanProjectDescription(markdown) {
  const fields = parseProjectContextFields(markdown);
  return renderProjectContextFields(fields).trim();
}

const PROJECT_CONTEXT_FIELD_DEFS = [
  { key: "what_the_product_is", label: "What the product is" },
  { key: "what_players_users_do", label: "What players/users do" },
  { key: "core_idea", label: "Core idea" },
  { key: "how_it_works", label: "How it works" },
  { key: "hard_parts", label: "Hard parts" },
  { key: "rules_constraints", label: "Rules / constraints" },
  { key: "one_line_version", label: "One-line version" },
];

function extractProjectContextBlock(markdown) {
  const match = String(markdown || "").match(
    /\[ HUMAN PROJECT DESCRIPTION START \]\s*([\s\S]*?)\s*\[ HUMAN PROJECT DESCRIPTION END \]/i
  );
  return String(match?.[1] || "").trim();
}

function normalizeProjectContextFieldValue(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parseProjectContextFields(markdown) {
  const block = extractProjectContextBlock(markdown);
  const fields = Object.fromEntries(PROJECT_CONTEXT_FIELD_DEFS.map(field => [field.key, ""]));
  let currentKey = "";

  for (const rawLine of block.split(/\r?\n/)) {
    const trimmed = rawLine.trimEnd();
    const matchingField = PROJECT_CONTEXT_FIELD_DEFS.find(
      field => trimmed.toLowerCase() === `${field.label.toLowerCase()}:`
    );

    if (matchingField) {
      currentKey = matchingField.key;
      continue;
    }

    if (!currentKey) {
      continue;
    }

    const currentValue = fields[currentKey];
    fields[currentKey] = currentValue ? `${currentValue}\n${rawLine}` : rawLine;
  }

  for (const key of Object.keys(fields)) {
    fields[key] = normalizeProjectContextFieldValue(fields[key]);
  }

  return fields;
}

function renderProjectContextFields(fields) {
  return PROJECT_CONTEXT_FIELD_DEFS.map(field => {
    const value = normalizeProjectContextFieldValue(fields?.[field.key]);
    return `${field.label}:\n${value}`;
  }).join("\n\n");
}

function projectContextReady(fields) {
  return PROJECT_CONTEXT_FIELD_DEFS.every(field => Boolean(normalizeProjectContextFieldValue(fields?.[field.key])));
}

function updateHumanProjectDescription(markdown, projectContextInput) {
  let fields;
  if (typeof projectContextInput === "string") {
    fields = parseProjectContextFields(projectContextInput);
    if (!projectContextReady(fields) && normalizeProjectContextFieldValue(projectContextInput)) {
      fields = {
        ...Object.fromEntries(PROJECT_CONTEXT_FIELD_DEFS.map(field => [field.key, ""])),
        what_the_product_is: normalizeProjectContextFieldValue(projectContextInput),
      };
    }
  } else {
    fields = projectContextInput?.fields || projectContextInput || {};
  }
  const descriptionBlock = renderProjectContextFields(fields).trim() + "\n";

  if (
    !/\[ HUMAN PROJECT DESCRIPTION START \]/i.test(String(markdown || "")) ||
    !/\[ HUMAN PROJECT DESCRIPTION END \]/i.test(String(markdown || ""))
  ) {
    throw new Error("project_context_template_markers_missing");
  }

  return String(markdown || "").replace(
    /(\[ HUMAN PROJECT DESCRIPTION START \]\s*)([\s\S]*?)(\s*\[ HUMAN PROJECT DESCRIPTION END \])/i,
    `$1${descriptionBlock}$3`
  );
}

function summarizeProjectContext() {
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const filePath = CANONICAL_ARTIFACTS.project_context_md;
  const content = safeReadText(filePath);
  const fields = parseProjectContextFields(content);
  const humanDescription = renderProjectContextFields(fields);
  const summary = [
    fields.what_the_product_is,
    fields.what_players_users_do,
    fields.core_idea,
    fields.one_line_version,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  return {
    path: normalizePath(filePath),
    meta: artifactMeta(filePath),
    ready: projectContextReady(fields),
    fields,
    human_description: humanDescription,
    summary,
  };
}

function summarizePlanningPrompt() {
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const filePath = CANONICAL_ARTIFACTS.planning_prompt_txt;
  return {
    path: normalizePath(filePath),
    meta: artifactMeta(filePath),
  };
}

function isPlaceholderValue(value) {
  const normalized = String(value || "").trim();
  return !normalized || /^<.*>$/.test(normalized);
}

function normalizeStyleValue(value) {
  const normalized = String(value || "").trim();
  return isPlaceholderValue(normalized) ? "" : normalized;
}

function replaceSingleLineField(markdown, label, value) {
  const pattern = new RegExp(`(${escapeRegExp(label)}:\\s*\\r?\\n)([^\\r\\n]*)`, "i");
  if (!pattern.test(String(markdown || ""))) {
    throw new Error(`product_standards_field_missing:${label}`);
  }

  return String(markdown || "").replace(pattern, `$1${String(value || "").trim()}`);
}

function summarizeStyleInputs() {
  const runtimePaths = getRuntimePaths(AI_OS_ROOT);
  const requirements = loadProductRequirements(runtimePaths);
  const standards = requirements.product_standards || {};
  const productStandardsPath = runtimePaths.productStandardsMd;
  const values = {
    quality_level: normalizeStyleValue(standards.quality_level),
    preferred_tone: normalizeStyleValue(standards.preferred_tone),
    visual_direction: normalizeStyleValue(standards.visual_direction),
    color_direction: normalizeStyleValue(standards.color_direction),
    ui_density: normalizeStyleValue(standards.ui_density),
    accessibility_baseline: normalizeStyleValue(standards.accessibility_baseline),
    interaction_notes: normalizeStyleValue(standards.interaction_notes),
  };

  const ready = [
    values.quality_level,
    values.preferred_tone,
    values.visual_direction,
    values.color_direction,
    values.ui_density,
    values.accessibility_baseline,
    values.interaction_notes,
  ].every(Boolean);

  return {
    path: normalizePath(productStandardsPath),
    meta: artifactMeta(productStandardsPath),
    ...values,
    ready,
    summary: [
      values.quality_level,
      values.preferred_tone,
      values.visual_direction,
    ].filter(Boolean).join(" "),
  };
}

function sanitizeProjectFolderName(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  const sanitized = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("project_name_invalid");
  }

  const reservedNames = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);

  if (reservedNames.has(sanitized.toUpperCase())) {
    throw new Error("project_name_reserved");
  }

  return sanitized;
}

function prepareWorkspaceTarget({ parentRoot, projectName }) {
  const normalizedParentRoot = path.resolve(String(parentRoot || ""));
  if (
    !normalizedParentRoot ||
    !fs.existsSync(normalizedParentRoot) ||
    !fs.statSync(normalizedParentRoot).isDirectory()
  ) {
    throw new Error("workspace_parent_root_invalid");
  }

  const projectFolderName = sanitizeProjectFolderName(projectName);
  const workspaceRoot = path.join(normalizedParentRoot, projectFolderName);
  const existed = fs.existsSync(workspaceRoot);

  if (existed && !fs.statSync(workspaceRoot).isDirectory()) {
    throw new Error("workspace_target_not_directory");
  }

  if (!existed) {
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }

  return {
    parentRoot: normalizedParentRoot,
    projectFolderName,
    workspaceRoot,
    created: !existed,
  };
}

function buildWorkspaceStatus() {
  const resolved = resolveProjectRoot(AI_OS_ROOT);
  const hasPackageJson = resolved?.ok && resolved?.projectRoot
    ? fs.existsSync(path.join(resolved.projectRoot, "package.json"))
    : false;
  const workspaceParentRoot = resolved?.projectRoot ? path.dirname(resolved.projectRoot) : "";
  const projectName = resolved?.projectRoot ? path.basename(resolved.projectRoot) : "";

  try {
    validateWorkspaceOrThrow(resolved);
    return {
      ok: resolved.ok,
      validation_ok: true,
      has_package_json: hasPackageJson,
      workspace_root: normalizePath(resolved.projectRoot),
      workspace_parent_root: normalizePath(workspaceParentRoot),
      project_name: projectName,
      source: resolved.source,
      config_path: normalizePath(resolved.configPath),
      error: resolved.ok ? "none" : resolved.error,
    };
  } catch (err) {
    return {
      ok: resolved.ok,
      validation_ok: false,
      has_package_json: hasPackageJson,
      workspace_root: normalizePath(resolved.projectRoot),
      workspace_parent_root: normalizePath(workspaceParentRoot),
      project_name: projectName,
      source: resolved.source,
      config_path: normalizePath(resolved.configPath),
      error: String(err?.message || err),
    };
  }
}

function summarizePlanData(planData) {
  const operations = Array.isArray(planData?.operations) ? planData.operations : [];
  const normalizedOperations = operations.map(operation => ({
    cycle: operation.cycle || 0,
    operation_key: operation.operation_key || "",
    file_path: operation.file_path || "",
    file_name: path.basename(operation.file_path || ""),
    operation_type: operation.operation_type || "",
    purpose: operation.purpose || "",
    depends_on: Array.isArray(operation.depends_on) ? operation.depends_on : [],
  }));

  return {
    available: normalizedOperations.length > 0,
    feature: planData?.feature || "",
    goal: planData?.goal || "",
    file_count: new Set(normalizedOperations.map(item => item.file_path).filter(Boolean)).size,
    feature_count: planData?.feature ? 1 : 0,
    operation_count: normalizedOperations.length,
    operations: normalizedOperations,
  };
}

function isLikelyVerifying() {
  const recentLogs = logBuffer.slice(-20).join("\n");
  return /verify|verification/i.test(recentLogs);
}

function buildExecutionSummary({ planSummary, currentOperation, runMetrics, gates }) {
  const rows = readJsonl(getCanonicalArtifacts().cycle_metrics_jsonl) || [];
  const latestByKey = new Map();
  for (const row of rows) {
    const key = row?.operation?.operation_key;
    if (key && !latestByKey.has(key)) {
      latestByKey.set(key, row);
    }
  }

  const lifecycleStatus = runMetrics?.lifecycle?.status || "unknown";
  const gate3Pending =
    (gates?.gate3?.meta?.exists && gates?.gate3?.approval_status !== "approved") ||
    lifecycleStatus === "commit_gate_blocked";
  const verifying =
    activeRun?.status === "running" &&
    activeRun?.task_id === "ai" &&
    isLikelyVerifying();

  const operations = (planSummary.operations || []).map(operation => {
    const latestCycle = latestByKey.get(operation.operation_key) || null;
    const isCurrent = currentOperation?.operation_key === operation.operation_key;
    let status = "pending";

    if (isCurrent && gate3Pending) {
      status = "needs review";
    } else if (isCurrent && activeRun?.status === "running" && activeRun?.task_id === "ai") {
      status = verifying ? "verifying" : "running";
    } else if (latestCycle) {
      status = latestCycle?.execution?.final_status === "success" ? "done" : "failed";
    }

    return {
      operation_key: operation.operation_key,
      file_path: operation.file_path,
      file_name: operation.file_name,
      operation_type: operation.operation_type,
      purpose: operation.purpose,
      status,
      retry_count: latestCycle?.recovery?.retry_count ?? 0,
      failure_classification: latestCycle?.execution?.terminal_reason || "none",
      is_current: isCurrent,
    };
  });

  return {
    available: planSummary.available,
    total_operations: operations.length,
    completed_operations: operations.filter(item => item.status === "done").length,
    current_operation_key: currentOperation?.operation_key || "",
    operations,
  };
}

function computeFrontendPhase({ workspace, projectContext, styleInputs, gates, runMetrics }) {
  const lifecycleStatus = runMetrics?.lifecycle?.status || "unknown";

  if (!workspace.validation_ok || !projectContext.ready || !styleInputs.ready) {
    return {
      current_screen: "init",
      title: "Init",
      description: "Initialize workspace, project context, and style inputs before intake.",
    };
  }

  if (gates?.gate1?.approval_status === "missing") {
    return {
      current_screen: "intake",
      title: "Intake",
      description: "Prepare raw human scope and run planning intake.",
    };
  }

  if (gates?.gate1?.approval_status !== "approved") {
    return {
      current_screen: "intent_review",
      title: "Intent Review",
      description: "Review the machine understanding of the intended scope.",
    };
  }

  if (gates?.gate2?.approval_status !== "approved") {
    return {
      current_screen: "plan_review",
      title: "Plan Review",
      description: "Review the compiled plan before execution starts.",
    };
  }

  if (
    (gates?.gate3?.meta?.exists && gates?.gate3?.approval_status !== "approved") ||
    lifecycleStatus === "commit_gate_blocked"
  ) {
    return {
      current_screen: "artifact_review",
      title: "Artifact Review",
      description: "Approve the verified artifact before it enters accepted state.",
    };
  }

  if (lifecycleStatus === "completed") {
    return {
      current_screen: "complete",
      title: "Complete",
      description: "Run complete.",
    };
  }

  return {
    current_screen: "execution",
    title: "Execution",
    description: "Track progress through planned operations.",
  };
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readSnapshotStore(filePath) {
  const value = safeReadJson(filePath);
  if (!value || !Array.isArray(value.entries)) {
    return { version: 1, entries: [] };
  }
  return value;
}

function writeSnapshotStore(filePath, store) {
  writeText(filePath, JSON.stringify(store, null, 2) + "\n");
}

function trimSnapshotEntries(entries) {
  const kept = [];
  const counts = new Map();

  for (const entry of entries) {
    const current = counts.get(entry.artifact_id) || 0;
    if (current >= SNAPSHOT_LIMIT_PER_ARTIFACT) {
      continue;
    }
    kept.push(entry);
    counts.set(entry.artifact_id, current + 1);
  }

  return kept;
}

function snapshotArtifact(artifactId, reason, extra = {}) {
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const consolePaths = getConsolePaths();
  const filePath = CANONICAL_ARTIFACTS[artifactId];
  if (!filePath) {
    return null;
  }

  const content = safeReadText(filePath);
  const meta = artifactMeta(filePath);
  const entry = {
    snapshot_id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    artifact_id: artifactId,
    label: getArtifactLabel(artifactId),
    reason,
    created_at: new Date().toISOString(),
    path: normalizePath(filePath),
    exists: meta.exists,
    meta,
    content_hash: sha256(content),
    content,
    ...extra,
  };

  const store = readSnapshotStore(consolePaths.consoleSnapshotsJson);
  store.entries = trimSnapshotEntries([entry, ...store.entries]);
  writeSnapshotStore(consolePaths.consoleSnapshotsJson, store);
  return entry;
}

function snapshotArtifacts(artifactIds, reason, extra = {}) {
  return (artifactIds || [])
    .map(artifactId => snapshotArtifact(artifactId, reason, extra))
    .filter(Boolean);
}

function readArtifactSnapshots(artifactId) {
  const consolePaths = getConsolePaths();
  const store = readSnapshotStore(consolePaths.consoleSnapshotsJson);
  return store.entries.filter(entry => entry.artifact_id === artifactId);
}

function buildDiffPreview(beforeText, afterText) {
  const changed = sha256(beforeText) !== sha256(afterText);
  if (!changed) {
    return {
      changed: false,
      common_prefix_lines: String(afterText || "").split(/\r?\n/).length,
      common_suffix_lines: 0,
      removed_line_count: 0,
      added_line_count: 0,
      preview: [],
    };
  }

  const beforeLines = String(beforeText || "").split(/\r?\n/);
  const afterLines = String(afterText || "").split(/\r?\n/);

  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let beforeSuffix = beforeLines.length - 1;
  let afterSuffix = afterLines.length - 1;
  while (
    beforeSuffix >= prefix &&
    afterSuffix >= prefix &&
    beforeLines[beforeSuffix] === afterLines[afterSuffix]
  ) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }

  const removed = beforeSuffix >= prefix ? beforeLines.slice(prefix, beforeSuffix + 1) : [];
  const added = afterSuffix >= prefix ? afterLines.slice(prefix, afterSuffix + 1) : [];
  const contextBefore = beforeLines.slice(Math.max(0, prefix - 3), prefix);
  const contextAfter = afterLines.slice(afterSuffix + 1, Math.min(afterLines.length, afterSuffix + 4));
  const preview = [
    ...contextBefore.map(text => ({ kind: "context", text })),
    ...removed.slice(0, 80).map(text => ({ kind: "remove", text })),
    ...added.slice(0, 80).map(text => ({ kind: "add", text })),
    ...contextAfter.map(text => ({ kind: "context", text })),
  ];

  return {
    changed,
    common_prefix_lines: prefix,
    common_suffix_lines: Math.max(0, beforeLines.length - 1 - beforeSuffix),
    removed_line_count: removed.length,
    added_line_count: added.length,
    preview,
  };
}

function buildArtifactDiff(artifactId) {
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const filePath = CANONICAL_ARTIFACTS[artifactId];
  if (!filePath) {
    throw new Error("unknown_artifact_id");
  }

  const currentContent = safeReadText(filePath);
  const currentMeta = artifactMeta(filePath);
  const currentHash = sha256(currentContent);
  const snapshots = readArtifactSnapshots(artifactId);
  const baseline = snapshots.find(entry => entry.content_hash !== currentHash) || snapshots[0] || null;
  const diff = buildDiffPreview(baseline?.content || "", currentContent);

  return {
    ok: true,
    id: artifactId,
    label: getArtifactLabel(artifactId),
    path: normalizePath(filePath),
    current: {
      meta: currentMeta,
      content_hash: currentHash,
      content: currentContent,
    },
    baseline: baseline
      ? {
          snapshot_id: baseline.snapshot_id,
          reason: baseline.reason,
          created_at: baseline.created_at,
          content_hash: baseline.content_hash,
          meta: baseline.meta,
          content: baseline.content,
        }
      : null,
    diff,
    snapshot_count: snapshots.length,
  };
}

function formatVerifyEvidence(verifyResult) {
  if (!verifyResult) return [];

  const failedChecks = (verifyResult.errors || []).map(entry => `${entry.name}: ${entry.detail}`);
  const warningChecks = (verifyResult.checks || [])
    .filter(check => check.status === "warn")
    .map(check => `${check.name}: ${check.detail || "warning"}`);

  return [...failedChecks, ...warningChecks].slice(0, 8);
}

function summarizeBlockedState({ gates, runMetrics, verifyResult, executionResult, request }) {
  const lifecycle = runMetrics?.lifecycle?.status || "unknown";
  const classification = runMetrics?.failure?.classification || "none";
  const cause = runMetrics?.failure?.cause || "none";
  const verifyEvidence = formatVerifyEvidence(verifyResult);

  if (gates?.gate1?.approval_status !== "approved") {
    return {
      severity: "warn",
      title: "Waiting On Gate 1",
      summary: "Scope approval is still pending, so planning should not continue.",
      suggested_next_step: "Review INTENT_CONFIRMATION.md and approve Gate 1.",
      evidence: [
        `gate1_status: ${gates?.gate1?.approval_status || "missing"}`,
      ],
    };
  }

  if (gates?.gate2?.approval_status !== "approved") {
    return {
      severity: "warn",
      title: "Waiting On Gate 2",
      summary: "The compiled execution plan is not approved yet.",
      suggested_next_step: "Review EXECUTION_CONFIRMATION.md and approve Gate 2.",
      evidence: [
        `gate2_status: ${gates?.gate2?.approval_status || "missing"}`,
      ],
    };
  }

  if (lifecycle === "completed") {
    return {
      severity: "ok",
      title: "Run Complete",
      summary: "No blocking state is active for the current workspace.",
      suggested_next_step: "Inspect metrics, or start the next planning/execution run.",
      evidence: [
        `total_cycles: ${runMetrics?.total_cycles || 0}`,
        `completed_cycles: ${runMetrics?.success?.completed_cycles || 0}`,
      ],
    };
  }

  if (lifecycle === "commit_gate_blocked" || classification === "commit_confirmation_missing" || classification === "commit_confirmation_pending") {
    return {
      severity: "blocked",
      title: "Gate 3 Is Blocking Commit",
      summary: "A verified artifact exists, but it cannot enter accepted state until the commit confirmation is approved.",
      suggested_next_step: "Review COMMIT_CONFIRMATION.md, approve Gate 3, then rerun node run_ai.js.",
      evidence: [
        `classification: ${classification}`,
        `gate3_status: ${gates?.gate3?.approval_status || "missing"}`,
        request?.file_path ? `file: ${request.file_path}` : "",
      ].filter(Boolean),
    };
  }

  if (lifecycle === "execution_gate_blocked" || classification === "execution_confirmation_missing" || classification === "execution_confirmation_pending") {
    return {
      severity: "blocked",
      title: "Gate 2 Is Blocking Execution",
      summary: "Execution cannot start because the compiled plan confirmation is missing or pending.",
      suggested_next_step: "Review EXECUTION_CONFIRMATION.md, approve Gate 2, then rerun node run_ai.js.",
      evidence: [
        `classification: ${classification}`,
        `gate2_status: ${gates?.gate2?.approval_status || "missing"}`,
      ],
    };
  }

  if (lifecycle === "behavior_gate_blocked" || classification === "behavior_contract_invalid") {
    return {
      severity: "blocked",
      title: "Behavior Contract Blocked The Cycle",
      summary: "The 2_behavior simulation did not produce a passing behavioral spec for the current operation.",
      suggested_next_step: "Inspect SCENARIOS.md, STATE_FLOW.md, RECONCILIATION_RULE.md, and SIMULATION_REPORT.md before rerunning node run_ai.js.",
      evidence: [
        `classification: ${classification}`,
        request?.feature ? `feature: ${request.feature}` : "",
        request?.file_path ? `file: ${request.file_path}` : "",
      ].filter(Boolean),
    };
  }

  if (classification === "missing_capability_contract") {
    return {
      severity: "blocked",
      title: "Missing Capability Contract",
      summary: "Execution is blocked because prerequisite capability boundaries are still implicit.",
      suggested_next_step: "Run node run_schema_upgrade.js or tighten the plan/contracts before rerunning.",
      evidence: [
        `classification: ${classification}`,
        cause !== "none" ? `cause: ${cause}` : "",
      ].filter(Boolean),
    };
  }

  if (classification === "plan_incomplete") {
    return {
      severity: "blocked",
      title: "Plan Cannot Progress",
      summary: "The plan still has pending work, but the dependency graph cannot move forward from the current accepted state.",
      suggested_next_step: "Inspect implementation_plan.json and traceability/decision evaluation, then repair the blocked dependency path.",
      evidence: [
        `classification: ${classification}`,
        cause !== "none" ? `cause: ${cause}` : "",
      ].filter(Boolean),
    };
  }

  if (classification !== "none" || verifyEvidence.length > 0) {
    return {
      severity: "blocked",
      title: "Verification Or Recovery Failure",
      summary: "The current cycle failed deterministic checks or exhausted recovery without producing an acceptable artifact.",
      suggested_next_step: "Inspect verify_result.json, execution_result.json, and the current target request before rerunning.",
      evidence: [
        `classification: ${classification}`,
        cause !== "none" ? `cause: ${cause}` : "",
        ...verifyEvidence,
      ].filter(Boolean).slice(0, 8),
    };
  }

  if (lifecycle === "running") {
    return {
      severity: "neutral",
      title: "Run In Progress",
      summary: "The pipeline is actively processing the current workspace.",
      suggested_next_step: "Watch the logs and timeline for the next terminal state.",
      evidence: [
        request?.operation_key ? `operation: ${request.operation_key}` : "",
        request?.file_path ? `file: ${request.file_path}` : "",
      ].filter(Boolean),
    };
  }

  return {
    severity: "neutral",
    title: "Ready",
    summary: "No active block is detected from the current canonical artifacts.",
    suggested_next_step: "Run the next allowlisted pipeline step.",
    evidence: [],
  };
}

function cycleArtifactSuggestions(cycle) {
  const suggestions = [];
  const terminalReason = String(cycle?.execution?.terminal_reason || "");
  const violations = new Set(cycle?.verification?.violations || []);

  suggestions.push({ id: "run_metrics_json", label: getArtifactLabel("run_metrics_json") });

  if (cycle?.operation?.file_path) {
    suggestions.push({ id: "target_file_request_json", label: getArtifactLabel("target_file_request_json") });
  }

  if (cycle?.execution?.final_status !== "success" || violations.size > 0) {
    suggestions.push({ id: "verify_result_json", label: getArtifactLabel("verify_result_json") });
    suggestions.push({ id: "execution_result_json", label: getArtifactLabel("execution_result_json") });
  }

  if (terminalReason === "behavior_blocked") {
    suggestions.push({ id: "simulation_report_md", label: getArtifactLabel("simulation_report_md") });
    suggestions.push({ id: "state_flow_md", label: getArtifactLabel("state_flow_md") });
  }

  if (terminalReason === "plan_blocked" || terminalReason === "execution_blocked") {
    suggestions.push({ id: "implementation_plan_json", label: getArtifactLabel("implementation_plan_json") });
    suggestions.push({ id: "plan_traceability_evaluation_json", label: getArtifactLabel("plan_traceability_evaluation_json") });
  }

  if (terminalReason === "committed") {
    suggestions.push({ id: "commit_confirmation_md", label: getArtifactLabel("commit_confirmation_md") });
  }

  return [...new Map(suggestions.map(item => [item.id, item])).values()];
}

function buildTimeline() {
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const runMetrics = safeReadJson(CANONICAL_ARTIFACTS.run_metrics_json);
  const rows = readJsonl(CANONICAL_ARTIFACTS.cycle_metrics_jsonl) || [];
  const cycles = rows
    .slice()
    .reverse()
    .map(cycle => ({
      cycle_id: cycle.cycle_id,
      started_at: cycle.timestamp_start || "",
      finished_at: cycle.timestamp_end || "",
      operation: cycle.operation || {},
      execution: cycle.execution || {},
      verification: cycle.verification || {},
      recovery: cycle.recovery || {},
      scoring: cycle.scoring || {},
      meta: cycle.meta || {},
      artifact_suggestions: cycleArtifactSuggestions(cycle),
    }));

  return {
    ok: true,
    run: runMetrics
      ? {
          run_id: runMetrics.run_id || "",
          lifecycle: runMetrics.lifecycle || {},
          failure: runMetrics.failure || {},
          success: runMetrics.success || {},
          scoring: runMetrics.scoring || {},
          performance: runMetrics.performance || {},
        }
      : null,
    cycles,
  };
}

function readResetArchives() {
  try {
    const raw = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "reset.js"), "--list-archives-json"],
      {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      }
    );

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.archives) ? parsed.archives : [];
  } catch {
    return [];
  }
}

function getResetOptions() {
  return {
    ok: true,
    modes: RESET_MODES,
    archives: readResetArchives(),
  };
}

function pickWorkspaceRoot({ projectName } = {}) {
  if (process.platform !== "win32") {
    throw new Error("workspace_picker_unsupported_platform");
  }

  const currentWorkspace = resolveProjectRoot(AI_OS_ROOT);
  const initialPath = currentWorkspace.ok ? path.dirname(currentWorkspace.projectRoot) : REPO_ROOT;
  const normalizedProjectName = sanitizeProjectFolderName(projectName);
  const pickerScriptPath = path.join(API_DIR, "select_parent_folder.ps1");

  const output = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      pickerScriptPath,
      "-InitialPath",
      initialPath,
      "-DialogTitle",
      `Choose the parent folder for ${normalizedProjectName}`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    }
  ).trim();

  if (!output || output === "__CANCELLED__") {
    return { ok: true, cancelled: true };
  }

  const target = prepareWorkspaceTarget({
    parentRoot: output,
    projectName: normalizedProjectName,
  });
  const result = setWorkspaceRoot(AI_OS_ROOT, target.workspaceRoot);
  const resolved = resolveProjectRoot(AI_OS_ROOT);
  validateWorkspaceOrThrow(resolved);

  return {
    ok: true,
    cancelled: false,
    selected: {
      parent_root: normalizePath(target.parentRoot),
      project_name: target.projectFolderName,
      workspace_root: normalizePath(target.workspaceRoot),
      created: target.created,
    },
    written: {
      workspace_root: normalizePath(result.config.workspace_root),
      config_path: normalizePath(result.configPath),
    },
    resolved: {
      ok: resolved.ok,
      workspace_root: normalizePath(resolved.projectRoot),
      workspace_parent_root: normalizePath(path.dirname(resolved.projectRoot)),
      project_name: path.basename(resolved.projectRoot),
      source: resolved.source,
      error: resolved.ok ? "none" : resolved.error,
    },
  };
}

function runResetMode({ mode, archiveDirName = "" }) {
  const normalizedMode = String(mode || "").trim().toLowerCase();
  if (!RESET_MODES.some(item => item.id === normalizedMode)) {
    throw new Error("unknown_reset_mode");
  }

  if (activeRun?.status === "running") {
    throw new Error("run_already_active");
  }

  const resolvedWorkspace = resolveProjectRoot(AI_OS_ROOT);
  let workspace = null;
  try {
    workspace = validateWorkspaceOrThrow(resolvedWorkspace);
  } catch {
    workspace = null;
  }

  const args = [path.join(REPO_ROOT, "reset.js"), "--mode", normalizedMode];
  if (normalizedMode === "archive") {
    if (!archiveDirName) {
      throw new Error("archive_selection_required");
    }
    args.push("--archive", archiveDirName);
  }

  pushLog(`[console] reset start mode=${normalizedMode}`);
  const output = execFileSync(process.execPath, args, {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        ...(workspace ? { AI_HUMAN_OS_WORKSPACE_ROOT: workspace.projectRoot } : {}),
      },
    });

  for (const line of String(output || "").split(/\r?\n/)) {
    if (line.trim()) {
      pushLog(line);
    }
  }
  pushLog(`[console] reset complete mode=${normalizedMode}`);

  return {
    ok: true,
    mode: normalizedMode,
    archive_dir_name: archiveDirName || "",
    output: String(output || ""),
  };
}

function computePipelineState() {
  const gates = computeGateState();
  const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
  const request = safeReadJson(CANONICAL_ARTIFACTS.target_file_request_json);
  const runMetrics = safeReadJson(CANONICAL_ARTIFACTS.run_metrics_json);
  const verifyResult = safeReadJson(CANONICAL_ARTIFACTS.verify_result_json);
  const executionResult = safeReadJson(CANONICAL_ARTIFACTS.execution_result_json);
  const planData = safeReadJson(CANONICAL_ARTIFACTS.implementation_plan_json);
  const planSummary = summarizePlanData(planData);
  const projectContext = summarizeProjectContext();
  const styleInputs = summarizeStyleInputs();
  const planningPrompt = summarizePlanningPrompt();

  const currentOperation = request
    ? {
        operation_key: request.operation_key || "",
        file_path: request.file_path || "",
        operation_type: request.effective_operation_type || request.operation_type || "",
        feature: request.feature || "",
      }
    : null;

  const lifecycleStatus = runMetrics?.lifecycle?.status || "unknown";
  const workspace = buildWorkspaceStatus();
  const phase = computeFrontendPhase({
    workspace,
    projectContext,
    styleInputs,
    gates,
    runMetrics,
  });
  const executionSummary = buildExecutionSummary({
    planSummary,
    currentOperation,
    runMetrics,
    gates,
  });

  const suggested = (() => {
    if (phase.current_screen === "init") {
      return "Set a valid workspace, fill PROJECT_CONTEXT.md, and complete the style fields before intake.";
    }
    if (phase.current_screen === "intake") {
      return "Edit the planning prompt, then run planning intake.";
    }
    if (phase.current_screen === "intent_review") {
      return "Review INTENT_CONFIRMATION.md and approve Gate 1.";
    }
    if (phase.current_screen === "plan_review") {
      return planSummary.available
        ? "Review the compiled plan, approve Gate 2, and start execution."
        : "Run planning to generate the execution-ready plan.";
    }
    if (phase.current_screen === "artifact_review") {
      return "Review COMMIT_CONFIRMATION.md, approve Gate 3, then rerun run_ai.";
    }
    if (phase.current_screen === "complete") {
      return "Run completed. Inspect metrics or start a new run.";
    }
    return "Run the next execution cycle.";
  })();

  return {
    ok: true,
    repo_root: normalizePath(REPO_ROOT),
    ai_os_root: normalizePath(AI_OS_ROOT),
    active_run: activeRun,
    workspace,
    readiness: {
      workspace_ready: workspace.validation_ok,
      project_context_ready: projectContext.ready,
      style_ready: styleInputs.ready,
      intake_ready: workspace.validation_ok && projectContext.ready && styleInputs.ready,
    },
    phase,
    paths: {
      planning_prompt: planningPrompt.path,
      project_context: projectContext.path,
      product_standards: styleInputs.path,
    },
    project_context: projectContext,
    style_inputs: styleInputs,
    planning_prompt: planningPrompt,
    plan_summary: planSummary,
    execution_summary: executionSummary,
    gates,
    current_operation: currentOperation,
    run: runMetrics
      ? {
          run_id: runMetrics.run_id || "",
          lifecycle: runMetrics.lifecycle || {},
          failure: runMetrics.failure || {},
          success: runMetrics.success || {},
          scoring: runMetrics.scoring || {},
          performance: runMetrics.performance || {},
        }
      : null,
    suggested_next_action: suggested,
    blocked_summary: summarizeBlockedState({
      gates,
      runMetrics,
      verifyResult,
      executionResult,
      request,
    }),
    legacy: {
      workspace: {
        ok: workspace.ok,
        workspace_root: workspace.workspace_root,
        source: workspace.source,
        config_path: workspace.config_path,
        error: workspace.error,
      },
      gates,
      current_operation: currentOperation,
      run: runMetrics
        ? {
            run_id: runMetrics.run_id || "",
            lifecycle: runMetrics.lifecycle || {},
            failure: runMetrics.failure || {},
          }
        : null,
      suggested_next_action: suggested,
      blocked_summary: summarizeBlockedState({
        gates,
        runMetrics,
        verifyResult,
        executionResult,
        request,
      }),
    },
  };
}

const ALLOWLISTED_TASKS = {
  planning_intake: {
    label: "Planning Intake",
    argv: [process.execPath, [path.join(REPO_ROOT, "run_planning_intake.js")]],
  },
  planning: {
    label: "Planning",
    argv: [process.execPath, [path.join(REPO_ROOT, "run_planning.js")]],
  },
  ai: {
    label: "Run AI",
    argv: [process.execPath, [path.join(REPO_ROOT, "run_ai.js")]],
  },
  schema_upgrade: {
    label: "Schema Upgrade",
    argv: [process.execPath, [path.join(REPO_ROOT, "run_schema_upgrade.js")]],
  },
  metrics_report: {
    label: "Metrics Report",
    argv: [process.execPath, [path.join(REPO_ROOT, "run_metrics_report.js")]],
  },
};

let activeRun = null;
let runSeq = 0;
const logBuffer = [];
const logSubscribers = new Set();
const MAX_LOG_LINES = 2500;

function pushLog(line) {
  const normalized = String(line || "").replace(/\r?\n$/, "");
  if (!normalized) return;
  logBuffer.push(normalized);
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
  }
  for (const res of logSubscribers) {
    try {
      res.write(`data: ${JSON.stringify({ t: Date.now(), line: normalized })}\n\n`);
    } catch {
      // ignore
    }
  }
}

function setActiveRun(nextRun) {
  activeRun = nextRun;
  for (const res of logSubscribers) {
    try {
      res.write(`data: ${JSON.stringify({ t: Date.now(), event: "run_state", run: activeRun })}\n\n`);
    } catch {
      // ignore
    }
  }
}

function startTask(taskId) {
  const task = ALLOWLISTED_TASKS[taskId];
  if (!task) {
    throw new Error("unknown_task");
  }
  if (activeRun?.status === "running") {
    throw new Error("run_already_active");
  }

  runSeq += 1;
  const runHandle = `console_run_${Date.now()}_${runSeq}`;
  const [bin, args] = task.argv;
  const workspace = resolveProjectRoot(AI_OS_ROOT);
  validateWorkspaceOrThrow(workspace);
  const snapshotIds = SNAPSHOT_ARTIFACTS_BY_TASK[taskId] || [];

  if (snapshotIds.length > 0) {
    snapshotArtifacts(snapshotIds, `${taskId}_before_run`, {
      task_id: taskId,
      phase: "before_run",
    });
  }

  logBuffer.length = 0;
  pushLog(`[console] starting ${task.label} (${taskId})`);

  const child = spawn(bin, args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...(workspace.ok ? { AI_HUMAN_OS_WORKSPACE_ROOT: workspace.projectRoot } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  setActiveRun({
    run_handle: runHandle,
    task_id: taskId,
    task_label: task.label,
    status: "running",
    started_at_ms: Date.now(),
    exit_code: null,
  });

  const pump = data => {
    const text = data.toString("utf-8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      pushLog(line);
    }
  };

  child.stdout.on("data", pump);
  child.stderr.on("data", pump);

  child.on("close", code => {
    if (snapshotIds.length > 0) {
      snapshotArtifacts(snapshotIds, `${taskId}_after_run`, {
        task_id: taskId,
        phase: "after_run",
        exit_code: Number.isFinite(code) ? code : null,
      });
    }
    pushLog(`[console] exited with code=${code}`);
    setActiveRun({
      ...activeRun,
      status: "exited",
      exit_code: Number.isFinite(code) ? code : null,
      finished_at_ms: Date.now(),
    });
  });

  return runHandle;
}

function validateWorkspaceOrThrow(resolvedWorkspace) {
  const validatedWorkspace = assertWorkspaceRootReady(AI_OS_ROOT, resolvedWorkspace);
  const workspaceRoot = path.resolve(validatedWorkspace.projectRoot);
  const normalized = workspaceRoot.replace(/\//g, "\\");

  // Drive root like C:\ or D:\
  if (/^[A-Za-z]:\\$/.test(normalized)) {
    throw new Error("workspace_root_is_drive_root");
  }

  // Reject obvious system folders.
  const lower = normalized.toLowerCase();
  const banned = [
    "\\windows",
    "\\program files",
    "\\program files (x86)",
  ];
  for (const item of banned) {
    if (lower === item || lower.endsWith(item)) {
      throw new Error("workspace_root_is_system_dir");
    }
  }

  return validatedWorkspace;
}

function handleOptions(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) {
    res.writeHead(403, {
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  res.writeHead(204, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
  const pathname = url.pathname;

  if (rejectDisallowedBrowserOrigin(req, res)) {
    return;
  }

  if (req.method === "OPTIONS") {
    return handleOptions(req, res);
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, { ok: true, host: HOST, port: PORT });
  }

  if (req.method === "GET" && pathname === "/api/state") {
    return json(res, 200, computePipelineState());
  }

  if (req.method === "GET" && pathname === "/api/artifacts") {
    const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
    const items = Object.entries(CANONICAL_ARTIFACTS).map(([id, filePath]) => ({
      id,
      label: getArtifactLabel(id),
      path: normalizePath(filePath),
      meta: artifactMeta(filePath),
    }));
    return json(res, 200, { ok: true, artifacts: items });
  }

  if (req.method === "GET" && pathname === "/api/artifact") {
    const id = url.searchParams.get("id") || "";
    const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
    const filePath = CANONICAL_ARTIFACTS[id];
    if (!filePath) return badRequest(res, "unknown_artifact_id");

    const content = safeReadText(filePath);
    return json(res, 200, {
      ok: true,
      id,
      label: getArtifactLabel(id),
      path: normalizePath(filePath),
      meta: artifactMeta(filePath),
      content,
    });
  }

  if (req.method === "GET" && pathname === "/api/artifact/diff") {
    const id = url.searchParams.get("id") || "";
    try {
      return json(res, 200, buildArtifactDiff(id));
    } catch (err) {
      return badRequest(res, String(err?.message || err));
    }
  }

  if (req.method === "GET" && pathname === "/api/timeline") {
    return json(res, 200, buildTimeline());
  }

  if (req.method === "GET" && pathname === "/api/workspace") {
    const workspace = buildWorkspaceStatus();
    return json(res, 200, {
      ok: true,
      workspace,
    });
  }

  if (req.method === "GET" && pathname === "/api/reset/options") {
    return json(res, 200, getResetOptions());
  }

  if (req.method === "POST" && pathname === "/api/workspace") {
    try {
      const body = await readBody(req);
      const payload = parseJsonBody(body);
      const nextRoot = String(payload?.root || payload?.workspace_root || "").trim();
      if (!nextRoot) {
        return badRequest(res, "workspace_root_missing");
      }
      const result = setWorkspaceRoot(AI_OS_ROOT, nextRoot);
      const workspace = buildWorkspaceStatus();
      if (!workspace.validation_ok) {
        throw new Error(workspace.error || "workspace_root_invalid");
      }
      return json(res, 200, {
        ok: true,
        written: {
          workspace_root: normalizePath(result.config.workspace_root),
          config_path: normalizePath(result.configPath),
        },
        resolved: workspace,
      });
    } catch (err) {
      return json(res, 409, { ok: false, error: "workspace_update_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "POST" && pathname === "/api/workspace/pick") {
    try {
      const body = await readBody(req);
      const payload = parseJsonBody(body);
      return json(res, 200, pickWorkspaceRoot({
        projectName: payload?.project_name || payload?.projectName || "",
      }));
    } catch (err) {
      return json(res, 409, { ok: false, error: "workspace_pick_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "POST" && pathname === "/api/project-context") {
    try {
      const body = await readBody(req);
      const payload = parseJsonBody(body);
      const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
      const filePath = CANONICAL_ARTIFACTS.project_context_md;
      const existing = safeReadText(filePath);
      const updated = updateHumanProjectDescription(
        existing,
        payload?.fields || payload?.project_context || payload?.human_description || payload?.humanDescription || {}
      );
      writeText(filePath, updated);
      return json(res, 200, {
        ok: true,
        project_context: summarizeProjectContext(),
        artifact: {
          id: "project_context_md",
          path: normalizePath(filePath),
          meta: artifactMeta(filePath),
        },
      });
    } catch (err) {
      return json(res, 409, { ok: false, error: "project_context_update_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "POST" && pathname === "/api/project-style") {
    try {
      const body = await readBody(req);
      const payload = parseJsonBody(body);
      const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
      const filePath = CANONICAL_ARTIFACTS.product_standards_md;
      const existing = safeReadText(filePath);
      let updated = existing;
      updated = replaceSingleLineField(updated, "Product quality level", payload?.quality_level ?? payload?.qualityLevel ?? "");
      updated = replaceSingleLineField(updated, "Preferred product tone", payload?.preferred_tone ?? payload?.preferredTone ?? "");
      updated = replaceSingleLineField(updated, "Visual direction", payload?.visual_direction ?? payload?.visualDirection ?? "");
      updated = replaceSingleLineField(updated, "Color direction", payload?.color_direction ?? payload?.colorDirection ?? "");
      updated = replaceSingleLineField(updated, "UI density", payload?.ui_density ?? payload?.uiDensity ?? "");
      updated = replaceSingleLineField(updated, "Accessibility baseline", payload?.accessibility_baseline ?? payload?.accessibilityBaseline ?? "");
      updated = replaceSingleLineField(updated, "Interaction notes", payload?.interaction_notes ?? payload?.interactionNotes ?? "");
      writeText(filePath, updated);
      return json(res, 200, {
        ok: true,
        style_inputs: summarizeStyleInputs(),
        artifact: {
          id: "product_standards_md",
          path: normalizePath(filePath),
          meta: artifactMeta(filePath),
        },
      });
    } catch (err) {
      return json(res, 409, { ok: false, error: "project_style_update_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/gates/")) {
    const parts = pathname.split("/").filter(Boolean);
    const gateId = parts[2] || "";
    const action = parts[3] || "";

    const gateToArtifact = {
      gate1: "intent_confirmation_md",
      gate2: "execution_confirmation_md",
      gate3: "commit_confirmation_md",
    };

    if (action !== "approve") return notFound(res);
    if (!gateToArtifact[gateId]) return badRequest(res, "unknown_gate");

    try {
      const body = await readBody(req);
      const payload = parseJsonBody(body);
      const status = payload?.approval_status || "approved";
      const artifactId = gateToArtifact[gateId];
      const CANONICAL_ARTIFACTS = getCanonicalArtifacts();
      const filePath = CANONICAL_ARTIFACTS[artifactId];
      const existing = safeReadText(filePath);
      assertGateApprovalEligible({
        gateId,
        markdown: existing,
        nextStatus: status,
      });
      snapshotArtifact(artifactId, `${gateId}_before_approve`, {
        gate_id: gateId,
        phase: "before_approve",
      });
      const updated = setApprovalStatus(existing, status);
      writeText(filePath, updated);
      snapshotArtifact(artifactId, `${gateId}_after_approve`, {
        gate_id: gateId,
        phase: "after_approve",
      });
      return json(res, 200, { ok: true, gate: gateId, artifact: artifactId, approval_status: status });
    } catch (err) {
      return json(res, 409, { ok: false, error: "gate_update_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "POST" && pathname === "/api/reset") {
    try {
      const body = await readBody(req);
      const payload = parseJsonBody(body);
      const result = runResetMode({
        mode: payload?.mode,
        archiveDirName: payload?.archive_dir_name || "",
      });
      return json(res, 200, result);
    } catch (err) {
      return json(res, 409, { ok: false, error: "reset_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "POST" && pathname.startsWith("/api/run/")) {
    const parts = pathname.split("/").filter(Boolean);
    const taskId = parts[2] || "";
    try {
      const runHandle = startTask(taskId);
      return json(res, 200, { ok: true, run_handle: runHandle, active_run: activeRun });
    } catch (err) {
      return json(res, 409, { ok: false, error: "run_start_failed", detail: String(err?.message || err) });
    }
  }

  if (req.method === "GET" && pathname === "/api/run") {
    return json(res, 200, { ok: true, active_run: activeRun });
  }

  if (req.method === "GET" && pathname === "/api/logs/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Initial snapshot.
    res.write(`data: ${JSON.stringify({ t: Date.now(), event: "snapshot", run: activeRun, lines: logBuffer })}\n\n`);
    logSubscribers.add(res);

    req.on("close", () => {
      logSubscribers.delete(res);
    });

    return;
  }

  if (req.method === "GET" && pathname === "/") {
    return text(
      res,
      200,
      [
        "AI-Human OS Console API",
        `- health: http://${HOST}:${PORT}/api/health`,
        `- state: http://${HOST}:${PORT}/api/state`,
        `- timeline: http://${HOST}:${PORT}/api/timeline`,
        `- workspace: http://${HOST}:${PORT}/api/workspace`,
        `- logs: http://${HOST}:${PORT}/api/logs/stream`,
      ].join("\n") + "\n"
    );
  }

  return notFound(res);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`AI-Human OS Console API listening on http://${HOST}:${PORT}`);
});
