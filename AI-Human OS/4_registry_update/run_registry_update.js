import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { ensureCommitConfirmationApproved } from "../runtime/commit/commit_confirmation.js";
import { resolveProjectRoot } from "../runtime/workspace/workspace_config.js";
import {
  getRuntimePaths,
  readTargetRequest,
  syncFileRegistryJson,
  writeJson,
} from "../runtime/planning/data_layer.js";
import { analyzeFileForRegistry } from "../runtime/registry/file_registry_analysis.js";
import {
  logStep,
  logSub,
  logSuccess,
  logError,
  logWarn
} from "../3_execution/run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const REG_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(REG_DIR);
const resolvedProjectRoot = resolveProjectRoot(AI_OS_ROOT);
const PROJECT_ROOT = resolvedProjectRoot.ok ? resolvedProjectRoot.projectRoot : path.dirname(AI_OS_ROOT);
const PATHS = getRuntimePaths(AI_OS_ROOT);

logStep("Registry Update");

try {
  ensureCommitConfirmationApproved({
    aiOsRoot: AI_OS_ROOT,
    projectRoot: PROJECT_ROOT,
  });
  logSuccess("Commit confirmation approved");
} catch (err) {
  logError("Commit gate blocked");
  console.error(err.message);
  process.exit(1);
}

const request = readTargetRequest(AI_OS_ROOT);
let registry = syncFileRegistryJson(AI_OS_ROOT);

if (!request) {
  logError("Missing target request");
  process.exit(1);
}

const relativePath = request.file_path;

if (!relativePath) {
  logError("file_path not found in request");
  process.exit(1);
}

const fullPath = path.join(PROJECT_ROOT, relativePath);

if (!fs.existsSync(fullPath)) {
  logError("Generated file not found");
  process.exit(1);
}

logSuccess(`Target file: ${relativePath}`);

const code = fs.readFileSync(fullPath, "utf-8");
const analyzed = analyzeFileForRegistry({
  filePath: relativePath,
  content: code,
  requestPurpose: request.purpose || "",
  requestDependencies: request.dependencies || [],
  requestContracts: {
    cross_file_contracts: request.cross_file_contracts || {},
    workflow_contracts: request.workflow_contracts || {},
  },
});

logSub("Extracting file contract...");
const detectedInputs = analyzed.interface.inputs;

if (detectedInputs.length) {
  logSuccess(`Detected inputs: ${detectedInputs.map(input => input.name).join(", ")}`);
} else {
  logWarn("No inputs detected");
}

const entry = registry.files?.[relativePath] || null;

if (!entry) {
  logWarn("No registry entry -> bootstrapping");

  registry.files = registry.files || {};
  registry.files[relativePath] = {
    ...analyzed,
    history: [
      {
        operation_key: request.operation_key,
        validated_at: new Date().toISOString(),
      }
    ],
  };

  writeJson(PATHS.fileRegistryJson, registry);
  syncFileRegistryJson(AI_OS_ROOT);
  logSuccess("Registry entry created");
  process.exit(0);
}

logSub("Validating against registry...");

const registeredInputs = (entry.interface?.inputs || []).map(input => input.name);
const detectedInputNames = detectedInputs.map(input => input.name);

const missingInRegistry = detectedInputNames.filter(name => !registeredInputs.includes(name));
const missingInCode = registeredInputs.filter(name => !detectedInputNames.includes(name));
const registeredPropInputs = entry.contracts?.prop_inputs || [];
const detectedPropInputs = analyzed.contracts?.prop_inputs || [];
const propContractMismatch =
  registeredPropInputs.length > 0 &&
  (
    detectedPropInputs.some(name => !registeredPropInputs.includes(name)) ||
    registeredPropInputs.some(name => !detectedPropInputs.includes(name))
  );

if (missingInRegistry.length || missingInCode.length || propContractMismatch) {
  logError("Interface mismatch detected");

  if (missingInRegistry.length) {
    console.log(`   Missing in registry: ${missingInRegistry.join(", ")}`);
  }

  if (missingInCode.length) {
    console.log(`   Missing in code: ${missingInCode.join(", ")}`);
  }

  if (propContractMismatch) {
    console.log(`   Prop contract mismatch: registry=[${registeredPropInputs.join(", ")}] code=[${detectedPropInputs.join(", ")}]`);
  }

  console.error("INTERFACE_MISMATCH");
  process.exit(1);
}

entry.history = entry.history || [];
entry.history.push({
  operation_key: request.operation_key,
  validated_at: new Date().toISOString(),
});

entry.responsibility = analyzed.responsibility;
entry.imports = analyzed.imports;
entry.exports = analyzed.exports;
entry.reads = analyzed.reads;
entry.writes = analyzed.writes;
entry.dependencies = analyzed.dependencies;
entry.interface.outputs = analyzed.interface.outputs;
entry.symbols.allowed = analyzed.symbols.allowed;
entry.symbols.forbidden = analyzed.symbols.forbidden;
entry.contracts = analyzed.contracts;

writeJson(PATHS.fileRegistryJson, registry);
syncFileRegistryJson(AI_OS_ROOT);

logSuccess("Registry validation passed");
process.exit(0);
