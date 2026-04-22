import {
  getRuntimePaths,
  readJson,
  readJsonl,
  readTargetRequest,
  syncAppliedState,
  writeJson,
  writeJsonl,
} from "../runtime/planning/data_layer.js";
import {
  logStep,
  logSub,
  logSuccess,
  logError
} from "../3_execution/run_logger.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const COMMIT_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(COMMIT_DIR);
const PATHS = getRuntimePaths(AI_OS_ROOT);

logStep("Commit Step");
logSub("Loading files...");

const request = readTargetRequest(AI_OS_ROOT);
const verifyResult = readJson(PATHS.verifyResultJson, null);
const { appliedOperations } = syncAppliedState(AI_OS_ROOT);
let history = readJsonl(PATHS.executionHistoryJsonl);

if (!request) {
  logError("target_file_request.json not found");
  process.exit(1);
}

if (verifyResult?.status === "fail") {
  logError("Cannot commit failed verification result");
  process.exit(1);
}

logSuccess("Files loaded");
logSub("Updating runtime state...");

const now = new Date().toISOString();
const cycleId = `cycle-${Date.now()}`;
const operationKey = request.operation_key || `${request.file_path}::${request.operation_type || "unknown"}`;

const completed = new Set(appliedOperations.completed_operation_keys || []);
completed.add(operationKey);

const normalizedOperations = {
  last_sync: now,
  completed_operation_keys: [...completed],
};

history.push({
  cycle_id: cycleId,
  request_id: request.request_id,
  operation_key: operationKey,
  file_path: request.file_path,
  operation_type: request.operation_type || "unknown",
  planned_operation_type: request.planned_operation_type || request.operation_type || "unknown",
  effective_operation_type: request.effective_operation_type || request.operation_type || "unknown",
  timestamp: now,
  status: "committed",
});

writeJson(PATHS.appliedOperationsJson, normalizedOperations);
writeJsonl(PATHS.executionHistoryJsonl, history);
syncAppliedState(AI_OS_ROOT);

logSuccess("Runtime state updated");
logStep("Commit complete\n");
