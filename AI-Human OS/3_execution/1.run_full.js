import fs from "fs";
import { execSync } from "child_process";
import path from "path";

import {
  appendJsonl,
  getRuntimePaths,
  readJson,
  readTargetRequest,
  safeRead,
  writeJson,
  writeJsonl,
  writeTargetRequest,
} from "../runtime/planning/data_layer.js";
import { assertExecutionConfirmationApproved } from "../runtime/planning/execution_confirmation.js";
import { buildCycleMetric, buildRunSummary, extractDriftViolations } from "../runtime/recovery/execution_metrics.js";
import { buildRetryFeedback, classifyFailure } from "../runtime/recovery/retry_feedback.js";
import {
  buildExecutionFailureAssessment,
  getAdaptiveRetryPolicy,
  getRetryLimitForClassification,
} from "../runtime/throughput/throughput_policy.js";
import {
  logDivider,
  logError,
  logStep,
  logSub,
  logSuccess,
  logWarn,
} from "./run_logger.js";

const AI_OS_ROOT = path.join(process.cwd(), "AI-Human OS");
const PATHS = getRuntimePaths(AI_OS_ROOT);
const RUN_ID = `run_${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
const RUN_STARTED_AT = new Date().toISOString();
const RUN_START_MS = Date.now();
const MAX_CYCLES = 50;
const MAX_RETRIES = 5;
const ADAPTIVE_RETRY_POLICY = getAdaptiveRetryPolicy(AI_OS_ROOT);
const cycleRecords = [];

let runStatus = "running";
let runFailureClassification = "";
let runFailureCause = "";

function normalizeFailureCause({ classification, executionResult, verifyResult, fallback }) {
  if (executionResult?.message) {
    return executionResult.message;
  }

  if (verifyResult?.status === "fail" && (verifyResult.errors || []).length > 0) {
    return verifyResult.errors.map(entry => entry.detail || entry.name).join("; ");
  }

  if (classification === "plan_incomplete") {
    return "Implementation plan is incomplete for the current feature or runtime state.";
  }

  if (classification === "missing_capability_contract") {
    return "The current feature cannot be safely implemented because prerequisite capability or boundary contracts are still implicit.";
  }

  return fallback || "Unknown failure.";
}

function normalizeSuggestedNextStep({ classification }) {
  const schemaUpgradeClasses = new Set([
    "missing_capability_contract",
    "workflow_contract_mismatch",
    "plan_incomplete",
  ]);

  if (classification === "execution_confirmation_missing" || classification === "execution_confirmation_pending") {
    return "Review AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md, update Approval Status, then rerun: node run_ai.js";
  }

  if (classification === "commit_confirmation_missing" || classification === "commit_confirmation_pending") {
    return "Review AI-Human OS/5_commit/COMMIT_CONFIRMATION.md, update Approval Status, then rerun: node run_ai.js";
  }

  if (classification === "behavior_contract_invalid") {
    return "Review AI-Human OS/2_behavior/SCENARIOS.md, STATE_FLOW.md, RECONCILIATION_RULE.md, and SIMULATION_REPORT.md, then rerun: node run_ai.js";
  }

  if (schemaUpgradeClasses.has(classification)) {
    return "Run: node run_schema_upgrade.js";
  }

  if (classification === "syntax_failure" || classification === "interface_mismatch" || classification === "ast_contract_mismatch") {
    return "Inspect the current generated file and verifier output, patch surgically, then rerun: node run_ai.js";
  }

  if (classification === "registry_conflict" || classification === "ui_surface_mismatch" || classification === "cross_file_contract_mismatch") {
    return "Inspect the generated request/result files and patch the relevant runtime verifier or contract layer before rerunning.";
  }

  return "Inspect the latest execution_result.json and verify_result.json, then patch the failing layer before rerunning.";
}

function printFailureSummary({ classification, executionResult, verifyResult, fallbackCause }) {
  const cause = normalizeFailureCause({
    classification,
    executionResult,
    verifyResult,
    fallback: fallbackCause,
  });
  const suggestedNextStep = normalizeSuggestedNextStep({ classification });

  console.log("");
  console.log("Failure summary:");
  console.log(`- cause: ${cause}`);
  console.log(`- suggested next step: ${suggestedNextStep}`);
}

function readScopedArtifact(filePath, request) {
  const artifact = readJson(filePath, null);
  if (!artifact || !request) return null;
  if (artifact.operation_key && artifact.operation_key !== request.operation_key) return null;
  return artifact;
}

function openCycle(cycleNumber) {
  return {
    cycleNumber,
    cycleId: cycleNumber,
    timestampStart: new Date().toISOString(),
    startMs: Date.now(),
    attempts: 0,
    request: null,
    feature: "",
    driftTypes: new Set(),
    failureSignatureCounts: {},
    lowestErrorCount: Number.POSITIVE_INFINITY,
  };
}

function trackFailureAssessment(activeCycle, failureAssessment) {
  if (!activeCycle || !failureAssessment?.signature) {
    return {
      sameSignatureCount: 0,
      improved: false,
    };
  }

  const sameSignatureCount = (activeCycle.failureSignatureCounts[failureAssessment.signature] || 0) + 1;
  activeCycle.failureSignatureCounts[failureAssessment.signature] = sameSignatureCount;

  const improved = failureAssessment.error_count < activeCycle.lowestErrorCount;
  if (improved) {
    activeCycle.lowestErrorCount = failureAssessment.error_count;
  }

  return {
    sameSignatureCount,
    improved,
  };
}

function enrichActiveCycle(activeCycle, request, executionResult, classification, verifyResult) {
  if (!activeCycle || !request) {
    return;
  }

  activeCycle.request = request;
  activeCycle.feature = request.feature || activeCycle.feature || "";
  activeCycle.attempts += Number(executionResult?.model_generation_count || 0);

  for (const driftType of extractDriftViolations({ verifyResult, classification })) {
    activeCycle.driftTypes.add(driftType);
  }
}

function finalizeCycle({
  activeCycle,
  cycleRecords,
  finalStatus,
  classification,
  verifyResult,
  terminalReason,
  converged,
}) {
  if (!activeCycle || !activeCycle.request) {
    return null;
  }

  const record = buildCycleMetric({
    runId: RUN_ID,
    cycleId: activeCycle.cycleId,
    timestampStart: activeCycle.timestampStart,
    timestampEnd: new Date().toISOString(),
    paths: PATHS,
    request: activeCycle.request,
    feature: activeCycle.feature,
    attempts: activeCycle.attempts,
    finalStatus,
    verifyResult,
    classification,
    driftTypes: [...activeCycle.driftTypes],
    terminalReason,
    converged,
    cycleMs: Date.now() - activeCycle.startMs,
  });

  appendJsonl(PATHS.cycleMetricsJsonl, record);
  cycleRecords.push(record);
  return record;
}

function writeRunSummary(cycleRecords) {
  writeJson(
    PATHS.runMetricsJson,
    buildRunSummary({
      runId: RUN_ID,
      cycleRecords,
      totalTimeMs: Date.now() - RUN_START_MS,
      startedAt: RUN_STARTED_AT,
      finishedAt: new Date().toISOString(),
      runStatus,
      failureClassification: runFailureClassification,
      failureCause: runFailureCause,
    })
  );
}

function ensureMetricArtifacts() {
  if (!fs.existsSync(PATHS.cycleMetricsJsonl)) {
    writeJsonl(PATHS.cycleMetricsJsonl, []);
  }

  writeRunSummary(cycleRecords);
}

function updateRunFailure(classification, cause) {
  runFailureClassification = classification || "";
  runFailureCause = cause || "";
}

logStep("FULL EXECUTION STARTED");
ensureMetricArtifacts();

try {
  logDivider();
  logStep("Preflight");
  logSub("Checking execution confirmation gate...");

  const executionConfirmation = safeRead(PATHS.executionConfirmationMd);
  if (!executionConfirmation.trim()) {
    throw new Error(
      "EXECUTION_GATE_BLOCKED\n- EXECUTION_CONFIRMATION.md is missing\n- Run node run_planning.js\n- Review AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md\n- Change Approval Status to approved before running node run_ai.js"
    );
  }

  assertExecutionConfirmationApproved(executionConfirmation);
  logSuccess("Execution confirmation approved");

  logSub("Running state validation...");

  execSync(
    `node "AI-Human OS/3_execution/2.run_state_validate.js"`,
    { stdio: "pipe" }
  );

  logSuccess("State is clean");
} catch (err) {
  const stderr = err.stderr?.toString() || "";
  const stdout = err.stdout?.toString() || "";
  const combined = `${stderr}\n${stdout}\n${err.message || ""}`.trim();
  const normalized = combined.toLowerCase();
  const gateBlocked = normalized.includes("execution_gate_blocked") || normalized.includes("execution_blocked");
  logError(gateBlocked ? "Execution gate blocked" : "State validation failed");
  if (stderr || stdout) {
    console.log(stderr + stdout);
  }
  runStatus = gateBlocked ? "execution_gate_blocked" : "preflight_failed";
  updateRunFailure(
    gateBlocked
      ? (normalized.includes("missing") ? "execution_confirmation_missing" : "execution_confirmation_pending")
      : (normalized.includes("plan_incomplete") ? "plan_incomplete" : "unknown_failure"),
    combined || "State validation failed before execution started."
  );
  writeRunSummary(cycleRecords);
  printFailureSummary({
    classification: runFailureClassification,
    executionResult: null,
    verifyResult: null,
    fallbackCause: runFailureCause,
  });
  process.exit(1);
}

let cycleNumber = 0;
let retryCount = 0;
let activeCycle = null;

while (true) {
  if (!activeCycle) {
    cycleNumber++;

    if (cycleNumber > MAX_CYCLES) {
      logError("Max cycles reached - possible infinite loop");
      runStatus = "failed";
      updateRunFailure("max_cycles", "Execution hit the max cycle limit without converging.");
      printFailureSummary({
        classification: "unknown_failure",
        executionResult: null,
        verifyResult: null,
        fallbackCause: runFailureCause,
      });
      break;
    }

    activeCycle = openCycle(cycleNumber);
    logDivider();
    logStep(`Cycle ${cycleNumber}`);
  } else {
    logDivider();
    logStep(`Cycle ${activeCycle.cycleNumber} Retry ${retryCount + 1}`);
  }

  try {
    logSub("Running operator...");
    execSync(
      `node "AI-Human OS/3_execution/3.run_operator.js"`,
      { stdio: "pipe" }
    );

    const request = readTargetRequest(AI_OS_ROOT);
    const executionResult = readScopedArtifact(PATHS.executionResultJson, request);
    const verifyResult = readScopedArtifact(PATHS.verifyResultJson, request);
    enrichActiveCycle(activeCycle, request, executionResult, "success", verifyResult);

    logSuccess(`Cycle ${activeCycle.cycleNumber} finished`);
    finalizeCycle({
      activeCycle,
      cycleRecords,
      finalStatus: "success",
      classification: "success",
      verifyResult,
      terminalReason: "committed",
      converged: true,
    });
    writeRunSummary(cycleRecords);
    activeCycle = null;
    retryCount = 0;
  } catch (err) {
    if (err.status === 2) {
      logSuccess("IMPLEMENTATION COMPLETE");
      runStatus = "completed";
      break;
    }

    const stderr = err.stderr?.toString() || "";
    const stdout = err.stdout?.toString() || "";
    const message = err.message || "";
    const stack = err.stack || "";
    const errorMsg = stderr + "\n" + stdout + "\n" + message + "\n" + stack;

    console.log(stderr + stdout);

    const request = readTargetRequest(AI_OS_ROOT);
    const verifyResult = readScopedArtifact(PATHS.verifyResultJson, request);
    const executionResult = readScopedArtifact(PATHS.executionResultJson, request);
    const planData = readJson(PATHS.implementationPlanJson, null);
    const classification = classifyFailure({
      text: errorMsg,
      verifyResult,
      executionResult,
      request,
      planData,
    });

    enrichActiveCycle(activeCycle, request, executionResult, classification, verifyResult);

    if (classification === "missing_capability_contract") {
      logError("Execution blocked by missing capability contracts");
      runStatus = "failed";
      updateRunFailure(
        classification,
        "The current file cannot be safely implemented because prerequisite contracts are still missing."
      );
      finalizeCycle({
        activeCycle,
        cycleRecords,
        finalStatus: "failed",
        classification,
        verifyResult,
        terminalReason: "execution_blocked",
        converged: false,
      });
      writeRunSummary(cycleRecords);
      printFailureSummary({
        classification,
        executionResult,
        verifyResult,
        fallbackCause: runFailureCause,
      });
      activeCycle = null;
      break;
    }

    if (classification === "behavior_contract_invalid") {
      logError("Behavior contract blocked execution");
      runStatus = "behavior_gate_blocked";
      updateRunFailure(
        classification,
        "2_behavior simulation did not produce a valid passing behavioral contract for the current feature."
      );
      finalizeCycle({
        activeCycle,
        cycleRecords,
        finalStatus: "failed",
        classification,
        verifyResult,
        terminalReason: "behavior_blocked",
        converged: false,
      });
      writeRunSummary(cycleRecords);
      printFailureSummary({
        classification,
        executionResult,
        verifyResult,
        fallbackCause: runFailureCause,
      });
      activeCycle = null;
      break;
    }

    if (classification === "commit_confirmation_missing" || classification === "commit_confirmation_pending") {
      logError("Commit gate blocked");
      runStatus = "commit_gate_blocked";
      updateRunFailure(
        classification,
        classification === "commit_confirmation_missing"
          ? "COMMIT_CONFIRMATION.md is missing for the current verified artifact."
          : "COMMIT_CONFIRMATION.md is waiting for human approval."
      );
      writeRunSummary(cycleRecords);
      printFailureSummary({
        classification,
        executionResult,
        verifyResult,
        fallbackCause: runFailureCause,
      });
      activeCycle = null;
      break;
    }

    if (errorMsg.includes("PLAN_BLOCKED")) {
      logError("Plan blocked by unsatisfied dependencies");
      runStatus = "failed";
      updateRunFailure(
        "plan_incomplete",
        "The plan still has remaining operations, but their dependencies cannot be satisfied from the current applied state."
      );
      finalizeCycle({
        activeCycle,
        cycleRecords,
        finalStatus: "failed",
        classification: "plan_incomplete",
        verifyResult,
        terminalReason: "plan_blocked",
        converged: false,
      });
      writeRunSummary(cycleRecords);
      printFailureSummary({
        classification: "plan_incomplete",
        executionResult,
        verifyResult,
        fallbackCause: runFailureCause,
      });
      activeCycle = null;
      break;
    }

    if (classification !== "unknown_failure") {
      const failureAssessment = buildExecutionFailureAssessment({
        classification,
        executionResult,
        verifyResult,
      });
      const retryTracking = trackFailureAssessment(activeCycle, failureAssessment);
      const retryLimit = ADAPTIVE_RETRY_POLICY.enabled === false
        ? MAX_RETRIES
        : Math.min(MAX_RETRIES, getRetryLimitForClassification(ADAPTIVE_RETRY_POLICY, classification));
      const stalled = Boolean(ADAPTIVE_RETRY_POLICY.enabled) &&
        Boolean(ADAPTIVE_RETRY_POLICY.early_stop_if_no_improvement) &&
        retryTracking.sameSignatureCount > Number(ADAPTIVE_RETRY_POLICY.max_same_failure_signature || 2);
      const nextRetryCount = retryCount + 1;

      if (stalled) {
        logError("Retry loop stalled on the same failure signature");
        runStatus = "failed";
        updateRunFailure(
          classification,
          "Self-healing retries stalled on the same failure signature without improving."
        );
        finalizeCycle({
          activeCycle,
          cycleRecords,
          finalStatus: "failed",
          classification,
          verifyResult,
          terminalReason: "stalled_retry_loop",
          converged: false,
        });
        writeRunSummary(cycleRecords);
        printFailureSummary({
          classification,
          executionResult,
          verifyResult,
          fallbackCause: runFailureCause,
        });
        activeCycle = null;
        break;
      }

      if (nextRetryCount > retryLimit) {
        logError("Retry limit reached -> stopping");
        runStatus = "failed";
        updateRunFailure(
          classification,
          "Self-healing retries were exhausted without converging on a valid file."
        );
        finalizeCycle({
          activeCycle,
          cycleRecords,
          finalStatus: "failed",
          classification,
          verifyResult,
          terminalReason: "retry_limit_reached",
          converged: false,
        });
        writeRunSummary(cycleRecords);
        printFailureSummary({
          classification,
          executionResult,
          verifyResult,
          fallbackCause: runFailureCause,
        });
        activeCycle = null;
        break;
      }

      retryCount = nextRetryCount;

      logWarn("Self-healing triggered");
      logSub(`Retry ${retryCount}/${retryLimit}`);

      const currentRequest = readJson(PATHS.targetRequestJson, null);

      if (currentRequest) {
        writeTargetRequest(AI_OS_ROOT, {
          ...currentRequest,
          feedback: buildRetryFeedback({
            classification,
            retryCount,
          }),
        });

        logSub("Feedback injected");
        console.log("   -> feedback:");
        console.log(`      type = ${classification}`);
      } else {
        logWarn("TARGET_FILE_REQUEST not found -> cannot inject feedback");
      }

      continue;
    }

    logError("Operator crashed (unknown)");
    runStatus = "failed";
    updateRunFailure(classification, message || "Operator crashed for an unknown reason.");
    finalizeCycle({
      activeCycle,
      cycleRecords,
      finalStatus: "failed",
      classification,
      verifyResult,
      terminalReason: "unknown_failure",
      converged: false,
    });
    writeRunSummary(cycleRecords);
    printFailureSummary({
      classification,
      executionResult,
      verifyResult,
      fallbackCause: runFailureCause,
    });
    console.error(message);
    activeCycle = null;
    break;
  }
}

if (runStatus === "running") {
  runStatus = "completed";
}

writeRunSummary(cycleRecords);

logDivider();
logStep("FULL EXECUTION ENDED");
