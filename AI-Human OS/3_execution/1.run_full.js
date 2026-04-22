import fs from "fs";
import { execSync } from "child_process";
import path from "path";

import {
  appendJsonl,
  getRuntimePaths,
  readJson,
  readTargetRequest,
  writeJson,
  writeJsonl,
  writeTargetRequest,
} from "../runtime/planning/data_layer.js";
import { buildCycleMetric, buildRunSummary, extractDriftViolations } from "../runtime/recovery/execution_metrics.js";
import { buildRetryFeedback, classifyFailure } from "../runtime/recovery/retry_feedback.js";
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
  logError("State validation failed");
  if (stderr || stdout) {
    console.log(stderr + stdout);
  }
  runStatus = "preflight_failed";
  updateRunFailure(
    combined.toLowerCase().includes("plan_incomplete") ? "plan_incomplete" : "unknown_failure",
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
      retryCount++;

      if (retryCount > MAX_RETRIES) {
        logError("Max retries reached -> stopping");
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
          terminalReason: "max_retries",
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

      logWarn("Self-healing triggered");
      logSub(`Retry ${retryCount}/${MAX_RETRIES}`);

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
