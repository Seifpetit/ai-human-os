import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

import { getImplementationPlan, getNextCycle } from "./4.parse_plan.js";
import { enrichRequest } from "./5.enrich_request.js";
import { ensureBehaviorSimulation } from "../runtime/behavior/behavior_simulation.js";
import {
  getRuntimePaths,
  readJson,
  syncAppliedState,
  syncFileRegistryJson,
  writeTargetRequest,
} from "../runtime/planning/data_layer.js";
import { loadProductRequirements } from "../runtime/requirements/product_requirements.js";
import {
  logStep,
  logSub,
  logSuccess,
  logError,
  logDivider,
  logWarn
} from "./run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const EXEC_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(EXEC_DIR);
const PATHS = getRuntimePaths(AI_OS_ROOT);

function getRegistryEntry(registry, filePath) {
  return registry.files?.[filePath] || null;
}

logStep("Operator");
logSub("Loading system state...");

const planData = getImplementationPlan(AI_OS_ROOT);
const { appliedOperations } = syncAppliedState(AI_OS_ROOT);
const registry = syncFileRegistryJson(AI_OS_ROOT);
const productRequirements = loadProductRequirements(PATHS);
const featureRequest = fs.existsSync(PATHS.featureRequestMd)
  ? fs.readFileSync(PATHS.featureRequestMd, "utf-8")
  : "";

logSub("Finding next cycle...");

const next = getNextCycle(planData, appliedOperations.completed_operation_keys);

if (next?.status === "complete") {
  logSuccess("All cycles complete");
  process.exit(2);
}

if (next?.status === "blocked") {
  logError("Plan is blocked by unsatisfied dependencies");
  console.error("PLAN_BLOCKED");
  console.error(JSON.stringify(next.remaining, null, 2));
  process.exit(1);
}

logSuccess(`Next file: ${next.file}`);
logSub(`Original Type: ${next.type}`);

let effectiveType = next.type;
const registryEntry = getRegistryEntry(registry, next.file);

if (next.type === "edit_existing_file" && !registryEntry) {
  logWarn("No registry entry -> switching to bootstrap (new_file)");
  effectiveType = "new_file";
}

logSub(`Effective Type: ${effectiveType}`);
logSub("Building typed target request...");

const baseRequest = {
  operation_key: next.operationKey,
  file_path: next.file,
  file_type: effectiveType,
  planned_operation_type: next.type,
  effective_operation_type: effectiveType,
  purpose: next.purpose,
  dependencies: next.depends || [],
  semantic_requirements: next.semanticRequirements || {
    must_import: [],
    must_use: [],
    must_not_use: [],
    must_preserve: [],
  },
};

let request = null;
const existingRequest = readJson(PATHS.targetRequestJson, null);

if (existingRequest?.feedback && existingRequest.operation_key === next.operationKey) {
  logSub("Feedback detected -> preserving existing request");
  request = {
    ...existingRequest,
    operation_key: next.operationKey,
    operation_type: effectiveType,
    file_path: next.file,
    purpose: next.purpose,
    dependencies: next.depends || [],
    planned_operation_type: next.type,
    effective_operation_type: effectiveType,
    semantic_requirements: next.semanticRequirements || existingRequest.semantic_requirements || {
      must_import: [],
      must_use: [],
      must_not_use: [],
      must_preserve: [],
    },
    required_interface: {
      inputs: registryEntry?.interface?.inputs || existingRequest.required_interface?.inputs || [],
      outputs: registryEntry?.interface?.outputs || existingRequest.required_interface?.outputs || [],
      allowed_symbols: registryEntry?.symbols?.allowed || existingRequest.required_interface?.allowed_symbols || [],
      forbidden_symbols: registryEntry?.symbols?.forbidden || existingRequest.required_interface?.forbidden_symbols || [],
    },
    capability_dependencies: (planData.capability_dependencies || []).filter(dependency =>
      (dependency.required_contracts || []).includes(next.file) ||
      (dependency.prerequisite_operations || []).includes(`${next.file}::${next.type}`)
    ),
    browser_scaffold: planData.browser_scaffold || existingRequest.browser_scaffold || {},
    cross_file_contracts: planData.cross_file_contracts || existingRequest.cross_file_contracts || {},
    workflow_contracts: planData.workflow_contracts || existingRequest.workflow_contracts || {},
  };
} else {
  request = enrichRequest(baseRequest, {
    requestId: existingRequest?.request_id || `req_${Date.now()}`,
    feature: planData.feature,
    goal: planData.goal,
    registryEntry,
    deliverySurfaces: planData.delivery_surfaces || {},
    browserScaffold: planData.browser_scaffold || {},
    capabilityDependencies: planData.capability_dependencies || [],
    crossFileContracts: planData.cross_file_contracts || {},
    workflowContracts: planData.workflow_contracts || {},
    productRequirements,
    memoryRefs: {
      project_context: PATHS.projectContextMd,
      system_registry: PATHS.systemRegistryMd,
      file_registry_json: PATHS.fileRegistryJson,
      feature_request: PATHS.featureRequestMd,
      product_standards_md: PATHS.productStandardsMd,
      ui_patterns_md: PATHS.uiPatternsMd,
      design_tokens_json: PATHS.designTokensJson,
    },
  });
}

request = {
  ...request,
  behavior_contract: request.behavior_contract || {
    required: false,
    status: "pending_evaluation",
    simulation_status: "unknown",
    trigger_reasons: [],
    capability_labels: [],
    artifact_paths: {},
    summary: {},
  },
};

writeTargetRequest(AI_OS_ROOT, request);
logSuccess("TARGET_FILE_REQUEST ready");

try {
  const behavior = ensureBehaviorSimulation({
    aiOsRoot: AI_OS_ROOT,
    planData,
    featureRequestMarkdown: featureRequest,
    baseRequest,
  });

  request = {
    ...request,
    behavior_contract: behavior.contract,
    memory_refs: {
      ...(request.memory_refs || {}),
      ...behavior.memoryRefs,
    },
  };
  writeTargetRequest(AI_OS_ROOT, request);

  if (behavior.contract.required) {
    logSuccess(`Behavior simulation ${behavior.contract.status}`);
  } else {
    logSub("Behavior simulation skipped for this operation");
  }
} catch (err) {
  logError("Behavior simulation blocked execution");
  console.error(err.message);
  process.exit(1);
}

logDivider();
logSub("Running execute agent...");

try {
  execSync(
    `node "${path.join(AI_OS_ROOT, "3_execution/6.run_execute.js")}"`,
    {
      stdio: "pipe",
    }
  );
} catch (err) {
  const stderr = err.stderr?.toString() || "";
  const stdout = err.stdout?.toString() || "";
  const combined = stderr + "\n" + stdout;

  console.log(combined);

  if (combined.includes("INTERFACE_MISMATCH")) {
    throw new Error("INTERFACE_MISMATCH");
  }

  logError("Execute agent failed (unknown)");
  process.exit(1);
}

logSuccess("Cycle completed successfully");
