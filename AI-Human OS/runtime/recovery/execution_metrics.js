import { readJson } from "../planning/data_layer.js";

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function mapVerifyCheckToDriftType(name) {
  const normalized = String(name || "").toLowerCase();

  if (normalized === "syntax_valid") return "SYNTAX_DRIFT";
  if (["semantic_requirements", "ast_contracts", "ui_surface_coherence", "cross_file_contract_coherence", "capability_contract_coherence"].includes(normalized)) {
    return "CONTRACT_DRIFT";
  }
  if (normalized === "workflow_state_coherence") return "STATE_DRIFT";
  if (normalized === "browser_scaffold_coherence") return "DEPENDENCY_DRIFT";
  if (["file_non_empty", "minimal_size", "unfinished_code", "product_requirements", "css_structure"].includes(normalized)) {
    return "EXECUTION_DRIFT";
  }

  return "EXECUTION_DRIFT";
}

export function extractDriftViolations({ verifyResult, classification }) {
  const fromVerify = (verifyResult?.errors || []).map(entry => mapVerifyCheckToDriftType(entry.name));

  const fromClassification = (() => {
    switch (classification) {
      case "syntax_failure":
        return ["SYNTAX_DRIFT"];
      case "interface_mismatch":
      case "ast_contract_mismatch":
      case "ui_surface_mismatch":
      case "cross_file_contract_mismatch":
        return ["CONTRACT_DRIFT"];
      case "missing_capability_contract":
      case "registry_conflict":
        return ["DEPENDENCY_DRIFT"];
      case "workflow_contract_mismatch":
        return ["ARCHITECTURE_DRIFT"];
      case "plan_incomplete":
        return ["PLAN_DRIFT"];
      case "unknown_failure":
        return ["EXECUTION_DRIFT"];
      default:
        return [];
    }
  })();

  return unique([...fromVerify, ...fromClassification]);
}

export function computeCycleScore({
  driftTypes = [],
  retryCount = 0,
  converged = true,
  detectionFailure = false,
  paths,
}) {
  const scoringConfig = readJson(paths?.driftScoringJson, null)?.drift_scoring || {};
  const startingScore = Number(scoringConfig.run_health?.starting_score || 100);
  const metaPenalties = scoringConfig.run_health?.meta_state_penalties || {};

  let score = startingScore;
  score -= unique(driftTypes).length * 10;
  score -= retryCount * 5;

  if (!converged) {
    score -= Number(metaPenalties.NON_CONVERGENCE || 25);
  }

  if (detectionFailure) {
    score -= Number(metaPenalties.DETECTION_FAILURE || 30);
  }

  return Math.max(0, Math.min(100, score));
}

export function buildCycleMetric({
  runId,
  cycleId,
  timestampStart,
  timestampEnd,
  paths,
  request,
  feature,
  attempts,
  finalStatus,
  verifyResult,
  classification,
  driftTypes = null,
  terminalReason,
  converged,
  detectionFailure = false,
  cycleMs,
}) {
  const driftViolations = unique(driftTypes || extractDriftViolations({ verifyResult, classification }));
  const retryCount = Math.max(0, attempts - 1);
  const finalScore = computeCycleScore({
    driftTypes: driftViolations,
    retryCount,
    converged,
    detectionFailure,
    paths,
  });

  return {
    run_id: runId,
    cycle_id: cycleId,
    timestamp_start: timestampStart,
    timestamp_end: timestampEnd,
    operation: {
      file_path: request?.file_path || "",
      type: request?.effective_operation_type || request?.operation_type || "unknown",
      source_feature: feature || request?.feature || "",
    },
    execution: {
      attempts,
      final_status: finalStatus,
      terminal_reason: terminalReason,
      duration_ms: cycleMs,
    },
    verification: {
      passed: verifyResult?.status === "pass",
      violations: driftViolations,
    },
    recovery: {
      retry_count: retryCount,
      converged,
    },
    scoring: {
      score: finalScore,
    },
    meta: {
      non_convergence: !converged,
      detection_failure: detectionFailure,
    },
  };
}

export function buildRunSummary({
  runId,
  cycleRecords = [],
  totalTimeMs = 0,
  startedAt = "",
  finishedAt = "",
  runStatus = "completed",
  failureClassification = "",
  failureCause = "",
}) {
  const successful = cycleRecords.filter(record => record.execution?.final_status === "success");
  const failed = cycleRecords.filter(record => record.execution?.final_status !== "success");
  const allViolations = cycleRecords.flatMap(record => record.verification?.violations || []);
  const uniqueDriftCounts = {};

  for (const violation of allViolations) {
    uniqueDriftCounts[violation] = (uniqueDriftCounts[violation] || 0) + 1;
  }

  const scores = cycleRecords.map(record => Number(record.scoring?.score || 0));
  const retries = cycleRecords.map(record => Number(record.recovery?.retry_count || 0));
  const durations = cycleRecords.map(record => Number(record.execution?.duration_ms || 0));

  return {
    run_id: runId,
    lifecycle: {
      started_at: startedAt,
      finished_at: finishedAt,
      status: runStatus,
    },
    failure: {
      classification: failureClassification || "none",
      cause: failureCause || "none",
    },
    total_cycles: cycleRecords.length,
    success: {
      completed_cycles: successful.length,
      failed_cycles: failed.length,
    },
    drift: {
      total_events: allViolations.length,
      drift_rate: cycleRecords.length > 0 ? Number((allViolations.length / cycleRecords.length).toFixed(2)) : 0,
      by_type: uniqueDriftCounts,
    },
    recovery: {
      avg_retries: cycleRecords.length > 0
        ? Number((retries.reduce((sum, value) => sum + value, 0) / cycleRecords.length).toFixed(2))
        : 0,
      max_retries: retries.length > 0 ? Math.max(...retries) : 0,
      non_converged_cycles: cycleRecords.filter(record => record.meta?.non_convergence).length,
    },
    scoring: {
      average_score: scores.length > 0
        ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2))
        : 0,
      min_score: scores.length > 0 ? Math.min(...scores) : 0,
      max_score: scores.length > 0 ? Math.max(...scores) : 0,
    },
    performance: {
      avg_cycle_time_ms: durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : 0,
      total_time_ms: totalTimeMs,
    },
  };
}
