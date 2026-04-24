import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getRuntimePaths, readJson, readJsonl, readTargetRequest, writeJson } from "../runtime/planning/data_layer.js";
import { assertWorkspaceRootReady } from "../runtime/workspace/workspace_config.js";

const __filename = fileURLToPath(import.meta.url);
const UPGRADE_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(UPGRADE_DIR);
const PROJECT_ROOT = assertWorkspaceRootReady(AI_OS_ROOT).projectRoot;
const PATHS = getRuntimePaths(AI_OS_ROOT);

const REPORT_JSON_PATH = path.join(PATHS.dataDir, "schema_gap_report.json");
const REPORT_MD_PATH = path.join(UPGRADE_DIR, "SCHEMA_GAP_REPORT.md");

function lower(value) {
  return String(value || "").toLowerCase();
}

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function classifyGap({ executionResult, verifyResult, request, planData }) {
  const reason = lower(executionResult?.reason);
  const message = lower(executionResult?.message);
  const verifyFailures = (verifyResult?.errors || []).map(entry => lower(entry.name));
  const workflowContracts = planData?.workflow_contracts || {};
  const capabilityDependencies = planData?.capability_dependencies || [];
  const requestFilePath = request?.file_path || "";

  const relevantCapability = capabilityDependencies.find(dependency =>
    (dependency.required_contracts || []).includes(requestFilePath) ||
    (dependency.prerequisite_operations || []).includes(`${requestFilePath}::${request?.planned_operation_type || request?.operation_type || ""}`)
  );

  if (verifyFailures.includes("capability_contract_coherence")) {
    return {
      gap_family: "capability_dependencies",
      confidence: "high",
      evidence: "Verifier failed capability_contract_coherence",
    };
  }

  if (
    reason === "insufficient_context" &&
    (
      message.includes("transport") ||
      message.includes("endpoint") ||
      message.includes("route") ||
      message.includes("browser-to-server") ||
      message.includes("request interface")
    )
  ) {
    return {
      gap_family: "transport_contracts",
      confidence: "high",
      evidence: executionResult?.message || "Execution blocked on undefined transport contract",
    };
  }

  if (reason === "insufficient_context" && relevantCapability) {
    return {
      gap_family: "capability_dependencies",
      confidence: "medium",
      evidence: executionResult?.message || "Execution blocked on missing capability context",
    };
  }

  if (reason === "insufficient_context" && workflowContracts.request_boundary && workflowContracts.state_owner) {
    return {
      gap_family: "workflow_contracts",
      confidence: "medium",
      evidence: executionResult?.message || "Execution blocked on workflow boundary context",
    };
  }

  if (
    reason === "insufficient_context" &&
    (message.includes("prop") || message.includes("hook") || message.includes("style surface"))
  ) {
    return {
      gap_family: "cross_file_contracts",
      confidence: "medium",
      evidence: executionResult?.message || "Execution blocked on cross-file UI context",
    };
  }

  if (
    reason === "insufficient_context" &&
    (message.includes("html") || message.includes("mount") || message.includes("runtime entry") || message.includes("scaffold"))
  ) {
    return {
      gap_family: "browser_scaffold",
      confidence: "medium",
      evidence: executionResult?.message || "Execution blocked on browser scaffold context",
    };
  }

  return {
    gap_family: "unknown_contract_gap",
    confidence: "low",
    evidence: executionResult?.message || "No known contract-gap family matched current failure",
  };
}

function buildRecommendedFiles(gapFamily) {
  const planningCore = [
    "AI-Human OS/1_planning/3_plan_generation_prompt.txt",
    "AI-Human OS/1_planning/IMPLEMENTATION_PLAN.template.md",
    "AI-Human OS/runtime/planning/data_layer.js",
    "AI-Human OS/runtime/planning/plan_completeness.js",
    "AI-Human OS/1_planning/IMPLEMENTATION_PLAN.md",
  ];

  const maps = {
    transport_contracts: [
      ...planningCore,
      "AI-Human OS/runtime/verification/transport_contract_coherence.js",
      "AI-Human OS/3_execution/7.run_verify.js",
      "AI-Human OS/3_execution/3.run_operator.js",
      "AI-Human OS/3_execution/6.run_execute.js",
      "AI-Human OS/agents/execute_agent.md",
    ],
    capability_dependencies: [
      ...planningCore,
      "AI-Human OS/runtime/verification/capability_contract_coherence.js",
      "AI-Human OS/3_execution/7.run_verify.js",
      "AI-Human OS/3_execution/3.run_operator.js",
      "AI-Human OS/3_execution/6.run_execute.js",
      "AI-Human OS/agents/execute_agent.md",
    ],
    workflow_contracts: [
      ...planningCore,
      "AI-Human OS/runtime/verification/workflow_state_coherence.js",
      "AI-Human OS/3_execution/7.run_verify.js",
    ],
    cross_file_contracts: [
      ...planningCore,
      "AI-Human OS/runtime/verification/cross_file_contract_coherence.js",
      "AI-Human OS/3_execution/7.run_verify.js",
    ],
    browser_scaffold: [
      ...planningCore,
      "AI-Human OS/runtime/verification/browser_scaffold_coherence.js",
      "AI-Human OS/3_execution/7.run_verify.js",
    ],
    unknown_contract_gap: planningCore,
  };

  return maps[gapFamily] || planningCore;
}

function renderMarkdown(report) {
  const lines = [
    "# Schema Gap Report",
    "",
    `- generated_at: ${report.generated_at}`,
    `- feature: ${report.feature || "unknown"}`,
    `- operation_key: ${report.operation_key || "unknown"}`,
    `- file_path: ${report.file_path || "unknown"}`,
    `- detected_gap_family: ${report.detected_gap_family}`,
    `- confidence: ${report.confidence}`,
    "",
    "## Evidence",
    "",
    `- execution_reason: ${report.execution_reason || "none"}`,
    `- execution_message: ${report.execution_message || "none"}`,
    `- verifier_failures: ${(report.verifier_failures || []).join(", ") || "none"}`,
    "",
    "## Why This Is A Schema Gap",
    "",
    report.why_this_is_a_schema_gap || "No explanation generated.",
    "",
    "## Recommended Upgrade Area",
    "",
    `- primary_layer: ${report.recommended_upgrade.primary_layer}`,
    `- secondary_layer: ${report.recommended_upgrade.secondary_layer}`,
    `- execution_followup: ${report.recommended_upgrade.execution_followup}`,
    "",
    "## Files To Update",
    "",
    ...(report.recommended_files || []).map(file => `- ${file}`),
    "",
  ];

  return lines.join("\n");
}

function main() {
  const executionResult = readJson(PATHS.executionResultJson, null);
  const verifyResult = readJson(PATHS.verifyResultJson, null);
  const planData = readJson(PATHS.implementationPlanJson, null);
  const request = readTargetRequest(AI_OS_ROOT);
  const history = readJsonl(PATHS.executionHistoryJsonl);
  const classification = classifyGap({
    executionResult,
    verifyResult,
    request,
    planData,
  });

  const report = {
    generated_at: new Date().toISOString(),
    project_root: PROJECT_ROOT,
    feature: planData?.feature || "",
    operation_key: request?.operation_key || executionResult?.operation_key || "",
    file_path: request?.file_path || executionResult?.file_path || "",
    detected_gap_family: classification.gap_family,
    confidence: classification.confidence,
    execution_reason: executionResult?.reason || "",
    execution_message: executionResult?.message || "",
    verifier_failures: (verifyResult?.errors || []).map(entry => entry.name),
    recent_history_count: history.length,
    why_this_is_a_schema_gap:
      classification.gap_family === "transport_contracts"
        ? "The feature defines capability and workflow boundaries, but the runtime transport boundary between browser and server is still implicit. Execution is blocking because the client adapter would need to invent route/method/payload transport details."
        : classification.gap_family === "capability_dependencies"
          ? "The feature consumes a reusable capability whose prerequisite contracts are not fully modeled or established before consumer files are being executed."
          : "Recent failures indicate a missing or under-specified contract class that is not yet represented strongly enough in planning and verification.",
    evidence: classification.evidence,
    recommended_upgrade: {
      primary_layer: "planning",
      secondary_layer: "verification",
      execution_followup: "thin_request_payload_only",
    },
    recommended_files: buildRecommendedFiles(classification.gap_family),
  };

  writeJson(REPORT_JSON_PATH, report);
  fs.writeFileSync(REPORT_MD_PATH, renderMarkdown(report), "utf-8");
  console.log(`Schema gap detected: ${report.detected_gap_family}`);
  console.log(`Report written: ${REPORT_MD_PATH}`);
}

main();
