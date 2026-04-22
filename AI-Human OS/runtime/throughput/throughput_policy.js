import fs from "fs";

import {
  getRuntimePaths,
  readJson,
  safeRead,
  writeJson,
} from "../planning/data_layer.js";

const DEFAULT_THROUGHPUT_POLICY = {
  version: 1,
  gate2_auto_approve: {
    enabled: true,
    min_score: 90,
    max_total_cycles: 8,
    max_touched_areas: 2,
    max_reconciliation_fixes: 1,
    block_on_assumptions_carried_forward: true,
    block_on_scope_creep: true,
    block_on_traceability_gaps: true,
  },
  gate3_auto_approve: {
    enabled: true,
    min_score: 85,
    max_attempt_number: 1,
    max_file_size_bytes: 25000,
    manual_review_on_behavior_sensitive: false,
    block_on_non_skipped_warnings: true,
    allowed_skipped_warning_checks: [
      "export_detected",
      "semantic_requirements",
      "ast_contracts",
      "ui_surface_coherence",
      "cross_file_contract_coherence",
      "workflow_state_coherence",
      "browser_scaffold_coherence",
    ],
  },
  adaptive_retry: {
    enabled: true,
    max_retries_default: 3,
    max_retries_by_classification: {
      syntax_failure: 2,
      ast_contract_mismatch: 2,
      interface_mismatch: 3,
      ui_surface_mismatch: 2,
      cross_file_contract_mismatch: 2,
      workflow_contract_mismatch: 2,
      registry_conflict: 2,
      plan_incomplete: 1,
      missing_capability_contract: 1,
      behavior_contract_invalid: 1,
      unknown_failure: 1,
    },
    early_stop_if_no_improvement: true,
    max_same_failure_signature: 2,
  },
};

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isObject(base) || !isObject(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isObject(value) && isObject(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function ensureThroughputPolicy(aiOsRoot) {
  const paths = getRuntimePaths(aiOsRoot);
  if (!fs.existsSync(paths.throughputPolicyJson)) {
    writeJson(paths.throughputPolicyJson, DEFAULT_THROUGHPUT_POLICY);
  }

  return paths;
}

function readScalarList(markdown, heading) {
  const escaped = String(heading || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = markdown.match(new RegExp(`### ${escaped}\\r?\\n([\\s\\S]*?)(?:\\r?\\n### |$)`, "i"))?.[1] || "";

  return block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function readBulletField(markdown, label) {
  return markdown.match(new RegExp(`${String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(?:\\r?\\n)?-\\s*(.+)`, "i"))?.[1]?.trim().toLowerCase() || "";
}

function normalizeArea(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const firstSegment = normalized.split("/")[0] || "";

  if (["client", "server", "shared"].includes(firstSegment)) {
    return firstSegment;
  }

  if (firstSegment === "AI-Human OS") {
    return "AI-Human OS";
  }

  return "project_root";
}

function isNoneList(items) {
  if (!items || items.length === 0) {
    return true;
  }

  return items.length === 1 && /^none$/i.test(items[0]);
}

function buildApproval(status, source, reasons = []) {
  return {
    status,
    source,
    reasons: reasons.length > 0 ? reasons : ["none"],
  };
}

export function loadThroughputPolicy(aiOsRoot) {
  const paths = ensureThroughputPolicy(aiOsRoot);
  const stored = readJson(paths.throughputPolicyJson, {});
  const merged = deepMerge(DEFAULT_THROUGHPUT_POLICY, stored || {});

  if (JSON.stringify(merged) !== JSON.stringify(stored || {})) {
    writeJson(paths.throughputPolicyJson, merged);
  }

  return merged;
}

export function evaluateExecutionGatePolicy({
  aiOsRoot,
  intentConfirmation,
  planData,
  reconciliationReport = null,
  decisionEvaluation = null,
  traceabilityEvaluation = null,
}) {
  const paths = ensureThroughputPolicy(aiOsRoot);
  const policy = loadThroughputPolicy(aiOsRoot).gate2_auto_approve || {};
  const traceability = traceabilityEvaluation || readJson(paths.planTraceabilityEvaluationJson, null);
  const decisions = decisionEvaluation || readJson(paths.planDecisionEvaluationJson, null);
  const operations = planData?.operations || [];
  const touchedAreas = [...new Set(operations.map(operation => normalizeArea(operation.file_path)).filter(Boolean))];
  const assumptions = [
    ...readScalarList(intentConfirmation, "Assumptions I Am Making To Proceed"),
    ...readScalarList(intentConfirmation, "Assumptions I Am Making"),
  ].filter(Boolean);
  const ambiguityStatus = readBulletField(intentConfirmation, "Ambiguity Resolution Status") || "not_set";
  const reconciliationFixes = (reconciliationReport?.applied_fixes || []).length;
  const blockers = [];
  let score = 100;

  if (!policy.enabled) {
    blockers.push("gate2_auto_approve_disabled");
  }

  if (!traceability) {
    blockers.push("traceability_evaluation_missing");
  }

  if (decisions?.ok === false) {
    blockers.push("plan_decision_evaluation_failed");
  }

  if (policy.block_on_scope_creep && traceability?.scope_creep?.flagged) {
    blockers.push("scope_creep_flagged");
  }

  if (policy.block_on_traceability_gaps && (
    Number(traceability?.summary?.outcome_missing || 0) > 0 ||
    Number(traceability?.summary?.location_missing || 0) > 0 ||
    Number(traceability?.summary?.constraint_missing || 0) > 0
  )) {
    blockers.push("traceability_gaps_present");
  }

  if (policy.block_on_assumptions_carried_forward && !isNoneList(assumptions)) {
    blockers.push("assumptions_carried_forward");
  }

  if (Number(policy.max_total_cycles || 0) > 0 && operations.length > Number(policy.max_total_cycles)) {
    blockers.push("plan_too_wide_for_auto_approval");
  }

  if (Number(policy.max_touched_areas || 0) > 0 && touchedAreas.length > Number(policy.max_touched_areas)) {
    blockers.push("too_many_system_areas");
  }

  if (Number(policy.max_reconciliation_fixes || 0) >= 0 && reconciliationFixes > Number(policy.max_reconciliation_fixes)) {
    blockers.push("too_many_compiler_reconciliation_fixes");
  }

  if (ambiguityStatus === "assumptions_accepted") {
    score -= 10;
  }

  if (operations.length > 4) {
    score -= 5;
  }

  if (touchedAreas.length > 1) {
    score -= 5;
  }

  if (reconciliationFixes > 0) {
    score -= Math.min(10, reconciliationFixes * 5);
  }

  if (!isNoneList(assumptions)) {
    score -= 10;
  }

  const threshold = Number(policy.min_score || 90);
  const autoApproved = blockers.length === 0 && score >= threshold;

  return {
    gate: "gate2",
    enabled: Boolean(policy.enabled),
    score: Math.max(0, Math.min(100, score)),
    threshold,
    auto_approved: autoApproved,
    blockers,
    signals: {
      total_cycles: operations.length,
      touched_areas: touchedAreas,
      reconciliation_fix_count: reconciliationFixes,
      ambiguity_resolution_status: ambiguityStatus,
      assumptions_carried_forward: !isNoneList(assumptions),
      decision_evaluation_ok: decisions?.ok !== false,
      traceability_ok: traceability?.ok !== false,
      scope_creep_flagged: Boolean(traceability?.scope_creep?.flagged),
    },
    approval: autoApproved
      ? buildApproval("approved", "throughput_policy_auto_approve", [
          `score ${Math.max(0, Math.min(100, score))} >= threshold ${threshold}`,
          "no blocking drift or scope-creep signals were found",
        ])
      : buildApproval("needs_human_review", "human_review_required", blockers.length > 0 ? blockers : [
          `score ${Math.max(0, Math.min(100, score))} < threshold ${threshold}`,
        ]),
  };
}

function isSkippedWarning(check) {
  return /^skipped:/i.test(String(check?.detail || ""));
}

function formatWarning(check) {
  return check?.detail ? `${check.name}: ${check.detail}` : String(check?.name || "");
}

export function evaluateCommitGatePolicy({
  aiOsRoot,
  context,
}) {
  const policy = loadThroughputPolicy(aiOsRoot).gate3_auto_approve || {};
  const warningChecks = (context?.verifyResult?.checks || []).filter(check => check.status === "warn");
  const riskyWarnings = warningChecks.filter(check =>
    !isSkippedWarning(check) ||
    !(policy.allowed_skipped_warning_checks || []).includes(check.name)
  );
  const blockers = [];
  let score = 100;
  const attemptNumber = Number(context?.executionResult?.attempt_number || 0);
  const behaviorRequired = Boolean(context?.request?.behavior_contract?.required);

  if (!policy.enabled) {
    blockers.push("gate3_auto_approve_disabled");
  }

  if (context?.verifyResult?.status !== "pass") {
    blockers.push("verification_not_passed");
  }

  if (attemptNumber > Number(policy.max_attempt_number || 1)) {
    blockers.push("retry_count_exceeds_auto_approval_limit");
  }

  if (Number(policy.max_file_size_bytes || 0) > 0 && Number(context?.fileSize || 0) > Number(policy.max_file_size_bytes)) {
    blockers.push("file_too_large_for_auto_approval");
  }

  if (policy.manual_review_on_behavior_sensitive && behaviorRequired) {
    blockers.push("behavior_sensitive_operation_requires_manual_review");
  }

  if (policy.block_on_non_skipped_warnings && riskyWarnings.length > 0) {
    blockers.push("risky_verification_warnings_present");
  }

  if (behaviorRequired) {
    score -= 5;
  }

  if (warningChecks.length > 0) {
    score -= riskyWarnings.length > 0 ? Math.min(15, riskyWarnings.length * 5) : 0;
  }

  if (attemptNumber > 1) {
    score -= Math.min(15, (attemptNumber - 1) * 10);
  }

  if (Number(context?.fileSize || 0) > 12000) {
    score -= 5;
  }

  const threshold = Number(policy.min_score || 85);
  const autoApproved = blockers.length === 0 && score >= threshold;

  return {
    gate: "gate3",
    enabled: Boolean(policy.enabled),
    score: Math.max(0, Math.min(100, score)),
    threshold,
    auto_approved: autoApproved,
    blockers,
    signals: {
      attempt_number: attemptNumber,
      warning_count: warningChecks.length,
      risky_warning_count: riskyWarnings.length,
      behavior_required: behaviorRequired,
      file_size_bytes: Number(context?.fileSize || 0),
    },
    warning_summary: {
      allowed_skipped_warnings: warningChecks
        .filter(check => isSkippedWarning(check) && (policy.allowed_skipped_warning_checks || []).includes(check.name))
        .map(formatWarning),
      risky_warnings: riskyWarnings.map(formatWarning),
    },
    approval: autoApproved
      ? buildApproval("approved", "throughput_policy_auto_approve", [
          `score ${Math.max(0, Math.min(100, score))} >= threshold ${threshold}`,
          "verified artifact stayed within the auto-approval safety policy",
        ])
      : buildApproval("needs_human_review", "human_review_required", blockers.length > 0 ? blockers : [
          `score ${Math.max(0, Math.min(100, score))} < threshold ${threshold}`,
        ]),
  };
}

export function buildExecutionFailureAssessment({
  classification,
  executionResult,
  verifyResult,
}) {
  const verifyErrors = (verifyResult?.errors || [])
    .map(entry => `${entry.name || "unknown"}:${entry.detail || ""}`)
    .sort();
  const signaturePayload = {
    classification: String(classification || "unknown_failure"),
    execution_reason: String(executionResult?.reason || executionResult?.status || ""),
    verify_errors: verifyErrors,
  };

  return {
    signature: JSON.stringify(signaturePayload),
    error_count: verifyErrors.length > 0 ? verifyErrors.length : 1,
  };
}

export function getAdaptiveRetryPolicy(aiOsRoot) {
  return loadThroughputPolicy(aiOsRoot).adaptive_retry || DEFAULT_THROUGHPUT_POLICY.adaptive_retry;
}

export function getRetryLimitForClassification(policy, classification) {
  const normalizedPolicy = policy || DEFAULT_THROUGHPUT_POLICY.adaptive_retry;
  const defaultLimit = Number(normalizedPolicy.max_retries_default || 3);
  const specificLimit = normalizedPolicy.max_retries_by_classification?.[classification];
  return Number.isFinite(Number(specificLimit)) ? Number(specificLimit) : defaultLimit;
}

export function describeThroughputPolicy(aiOsRoot) {
  const paths = ensureThroughputPolicy(aiOsRoot);
  return {
    policy: loadThroughputPolicy(aiOsRoot),
    path: paths.throughputPolicyJson,
    raw: safeRead(paths.throughputPolicyJson),
  };
}
