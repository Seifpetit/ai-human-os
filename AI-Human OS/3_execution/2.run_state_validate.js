import path from "path";
import { fileURLToPath } from "url";

import {
  getRuntimePaths,
  readJsonl,
  syncAppliedState,
  writeJson,
  writeJsonl,
} from "../runtime/planning/data_layer.js";
import { getImplementationPlan } from "./4.parse_plan.js";
import {
  logStep,
  logSub,
  logSuccess,
  logError
} from "./run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const EXEC_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(EXEC_DIR);
const PATHS = getRuntimePaths(AI_OS_ROOT);

function normalizeOperationKeys(planData, appliedOperations, history) {
  const operations = planData.operations || [];
  const byOpKey = new Map(operations.map(op => [op.operation_key, op]));
  const byLegacyRef = new Map();

  for (const op of operations) {
    const list = byLegacyRef.get(op.legacy_ref) || [];
    list.push(op);
    byLegacyRef.set(op.legacy_ref, list);
  }

  const consumed = new Set();

  function resolveLegacy(ref) {
    if (byOpKey.has(ref)) return ref;

    const candidates = byLegacyRef.get(ref) || [];
    const nextCandidate = candidates.find(candidate => !consumed.has(candidate.operation_key));
    if (!nextCandidate) return ref;

    consumed.add(nextCandidate.operation_key);
    return nextCandidate.operation_key;
  }

  const normalizedHistory = history.map(entry => {
    const resolved = resolveLegacy(entry.operation_key);
    return {
      ...entry,
      operation_key: resolved,
    };
  });

  const normalizedCompleted = [
    ...(appliedOperations.completed_operation_keys || []).map(resolveLegacy),
    ...normalizedHistory
      .filter(entry => entry.status === "committed")
      .map(entry => entry.operation_key),
  ];

  return {
    history: normalizedHistory,
    completed_operation_keys: [...new Set(normalizedCompleted)],
  };
}

logStep("State Validation");

try {
  logSub("Loading runtime state...");
  const { appliedOperations } = syncAppliedState(AI_OS_ROOT);
  const history = readJsonl(PATHS.executionHistoryJsonl);
  const planData = getImplementationPlan(AI_OS_ROOT);

  logSub("Normalizing completed operations from history...");
  const normalized = normalizeOperationKeys(planData, appliedOperations, history);

  const normalizedState = {
    last_sync: appliedOperations.last_sync || new Date().toISOString(),
    completed_operation_keys: normalized.completed_operation_keys,
  };

  writeJson(PATHS.appliedOperationsJson, normalizedState);
  writeJsonl(PATHS.executionHistoryJsonl, normalized.history);
  syncAppliedState(AI_OS_ROOT);

  logSuccess(`State normalized (${normalizedState.completed_operation_keys.length} operations)`);
} catch (err) {
  logError("State validation failed");
  console.error(err.message);
  process.exit(1);
}

logStep("State Validation Complete\n");
