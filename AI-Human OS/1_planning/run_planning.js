import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getModelConfig, runModel } from "../runtime/model/model_adapter.js";
import { getRuntimePaths, readJson, safeRead, syncImplementationPlanJson } from "../runtime/planning/data_layer.js";
import { renderExecutionConfirmationMarkdown } from "../runtime/planning/execution_confirmation.js";
import { reconcileImplementationPlanMarkdown, renderPlanReconciliationMarkdown } from "../runtime/planning/plan_reconciler.js";
import { evaluateExecutionGatePolicy } from "../runtime/throughput/throughput_policy.js";
import {
  assessRetryProgress,
  getPlanningRetryPolicy,
  shouldContinueRetrying,
} from "../runtime/planning/retry_strategy.js";
import { renderFeedbackMarkdown } from "../runtime/planning/structured_feedback.js";
import {
  assertFeatureRequestValid,
  assertFeaturesListValid,
  parseFeaturesListMarkdown,
  selectInitialFeature,
} from "../runtime/planning/upstream_planning_evaluator.js";
import {
  logDivider,
  logError,
  logStep,
  logSub,
  logSuccess,
  logWarn,
  timeEnd,
  timeStart,
} from "../3_execution/run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const PLANNING_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(PLANNING_DIR);
const PATHS = getRuntimePaths(AI_OS_ROOT);
const INTENT_CONFIRMATION_PATH = path.join(PLANNING_DIR, "INTENT_CONFIRMATION.md");

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.trim() + "\n", "utf-8");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function stripMarkdownFences(value) {
  const trimmed = String(value || "").trim();
  const fenced = trimmed.match(/^```(?:md|markdown)?\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBulletItems(markdown, heading) {
  const escapedHeading = escapeRegExp(heading);
  const block = markdown.match(new RegExp(`### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?:\\r?\\n### |$)`, "i"))?.[1] || "";

  return block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function isNoneList(items) {
  if (!items || items.length === 0) {
    return true;
  }

  return items.length === 1 && /^none$/i.test(items[0]);
}

function assertIntentApproved(markdown) {
  const status = markdown.match(/Approval Status:\s*(?:\r?\n)?-\s*(.+)/i)?.[1]?.trim().toLowerCase() || "";
  if (status !== "approved") {
    throw new Error(
      "PLANNING_BLOCKED\n- INTENT_CONFIRMATION.md is not approved\n- Review AI-Human OS/1_planning/INTENT_CONFIRMATION.md\n- Change Approval Status to approved before running node run_planning.js"
    );
  }

  const ambiguityResolutionStatus = markdown.match(/Ambiguity Resolution Status:\s*(?:\r?\n)?-\s*(.+)/i)?.[1]?.trim().toLowerCase() || "";
  const ambiguities = extractBulletItems(markdown, "Ambiguities Detected");
  const questions = extractBulletItems(markdown, "Questions For Human Confirmation");
  const assumptions = [
    ...extractBulletItems(markdown, "Assumptions I Am Making To Proceed"),
    ...extractBulletItems(markdown, "Assumptions I Am Making"),
  ];
  const hasAmbiguitySignals = !isNoneList(ambiguities) || !isNoneList(questions) || !isNoneList(assumptions);
  const allowedResolutionStates = new Set(["clear", "assumptions_accepted", "human_corrected"]);

  if (!ambiguityResolutionStatus) {
    if (hasAmbiguitySignals) {
      throw new Error(
        "PLANNING_BLOCKED\n- INTENT_CONFIRMATION.md contains assumptions or ambiguity without explicit human resolution\n- Add Ambiguity Resolution Status to INTENT_CONFIRMATION.md\n- Use one of: clear, assumptions_accepted, human_corrected\n- Then rerun node run_planning.js"
      );
    }

    return;
  }

  if (!allowedResolutionStates.has(ambiguityResolutionStatus)) {
    throw new Error(
      "PLANNING_BLOCKED\n- INTENT_CONFIRMATION.md ambiguity review is incomplete\n- Review ambiguities, questions, and assumptions in AI-Human OS/1_planning/INTENT_CONFIRMATION.md\n- Change Ambiguity Resolution Status to clear, assumptions_accepted, or human_corrected before running node run_planning.js"
    );
  }

  if (ambiguityResolutionStatus === "clear" && hasAmbiguitySignals) {
    throw new Error(
      "PLANNING_BLOCKED\n- Ambiguity Resolution Status is set to clear but the confirmation doc still lists ambiguity/questions/assumptions\n- Either resolve those items in the doc or change Ambiguity Resolution Status to assumptions_accepted or human_corrected\n- Then rerun node run_planning.js"
    );
  }
}

function buildFeaturesListPrompt({ scopePrompt, intentConfirmation }) {
  return `
${scopePrompt}

----------------------------------------
APPROVED INTENT (AUTHORITATIVE)
----------------------------------------

Use the approved intent below as the authoritative understanding for this planning pass.
If the raw human block and the approved intent disagree, the approved intent wins.

INTENT_CONFIRMATION:
${intentConfirmation}

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${safeRead(PATHS.projectContextMd)}

SYSTEM_REGISTRY:
${safeRead(PATHS.systemRegistryMd)}

FILE_REGISTRY:
${safeRead(PATHS.fileRegistryMd)}
`;
}

function buildFeaturesListPromptWithFeedback({
  scopePrompt,
  intentConfirmation,
  featuresFeedback = null,
  previousFeaturesList = "",
  attempt = 1,
  maxAttempts = 3,
}) {
  const feedbackSection = featuresFeedback ? `

----------------------------------------
FEATURES LIST VALIDATION FEEDBACK
----------------------------------------

This is features list generation attempt ${attempt} of ${maxAttempts}.

The previous FEATURES_LIST.md failed deterministic validation.
You must fully revise the features list to satisfy the issues below without expanding scope.

Failure code:
${featuresFeedback.failure_code}

Structured validation feedback:
${JSON.stringify({
  stage: featuresFeedback.stage,
  failure_code: featuresFeedback.failure_code,
  summary: featuresFeedback.summary || {},
  errors: featuresFeedback.errors || [],
}, null, 2)}

Previous invalid FEATURES_LIST.md:
${previousFeaturesList || "none"}

Correction rules:
- Keep features user-level, not technical
- Respect hard exclusions and deferred scope
- Keep selected features narrow and aligned with the next playable win
- Return a full replacement FEATURES_LIST.md, not a diff
` : "";

  return `
${buildFeaturesListPrompt({ scopePrompt, intentConfirmation })}

${feedbackSection}
`;
}

function buildFeatureSelectionPrompt({ selectedFeature, selectionPrompt, featuresList, featureRequestTemplate, intentConfirmation }) {
  const selectionBlock = [
    "Selected Feature:",
    `- ${selectedFeature.number}. ${selectedFeature.title}`,
    "",
    "Refinement (optional):",
    `- ${selectedFeature.purpose || "none"}`,
    "",
    "Must Include:",
    `- ${selectedFeature.purpose || "stay within selected feature scope"}`,
    "",
    "Must Exclude:",
    "- no unrelated systems beyond the selected feature",
    "",
    "Constraints:",
    `- priority: ${selectedFeature.priority || "unspecified"}`,
    "",
    "Notes:",
    `- reason_now: ${selectedFeature.reason_now || "none"}`,
  ].join("\n");

  const prompt = selectionPrompt.replace(
    /\[ HUMAN FEATURE SELECTION START \][\s\S]*?\[ HUMAN FEATURE SELECTION END \]/,
    `[ HUMAN FEATURE SELECTION START ]\n\n${selectionBlock}\n\n[ HUMAN FEATURE SELECTION END ]`
  );

  return `
${prompt}

----------------------------------------
APPROVED INTENT (AUTHORITATIVE)
----------------------------------------

Use the approved intent below to keep the feature request aligned with the human's actual scope.

INTENT_CONFIRMATION:
${intentConfirmation}

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${safeRead(PATHS.projectContextMd)}

SYSTEM_REGISTRY:
${safeRead(PATHS.systemRegistryMd)}

FILE_REGISTRY:
${safeRead(PATHS.fileRegistryMd)}

FEATURES_LIST:
${featuresList}

FEATURE_REQUEST_TEMPLATE:
${featureRequestTemplate}
`;
}

function buildFeatureSelectionPromptWithFeedback({
  selectedFeature,
  selectionPrompt,
  featuresList,
  featureRequestTemplate,
  intentConfirmation,
  featureRequestFeedback = null,
  previousFeatureRequest = "",
  attempt = 1,
  maxAttempts = 3,
}) {
  const basePrompt = buildFeatureSelectionPrompt({
    selectedFeature,
    selectionPrompt,
    featuresList,
    featureRequestTemplate,
    intentConfirmation,
  });

  const feedbackSection = featureRequestFeedback ? `

----------------------------------------
FEATURE REQUEST VALIDATION FEEDBACK
----------------------------------------

This is feature request generation attempt ${attempt} of ${maxAttempts}.

The previous FEATURE_REQUEST.md failed deterministic validation.
You must fully revise the feature request to satisfy the issues below without expanding scope.

Failure code:
${featureRequestFeedback.failure_code}

Structured validation feedback:
${JSON.stringify({
  stage: featureRequestFeedback.stage,
  failure_code: featureRequestFeedback.failure_code,
  summary: featureRequestFeedback.summary || {},
  errors: featureRequestFeedback.errors || [],
}, null, 2)}

Selected feature remains:
- ${selectedFeature.number}. ${selectedFeature.title}

Previous invalid FEATURE_REQUEST.md:
${previousFeatureRequest || "none"}

Correction rules:
- Keep the same selected feature
- Stay within the selected feature only
- Preserve user-visible language
- Return a full replacement FEATURE_REQUEST.md, not a diff
` : "";

  return `
${basePrompt}

${feedbackSection}
`;
}

function buildImplementationPlanPrompt({
  planPrompt,
  featureRequest,
  implementationPlanTemplate,
  intentConfirmation,
  planFeedback = null,
  previousPlan = "",
  attempt = 1,
  maxAttempts = 3,
}) {
  const feedbackSection = planFeedback ? `

----------------------------------------
PLANNING VALIDATION FEEDBACK
----------------------------------------

This is plan generation attempt ${attempt} of ${maxAttempts}.

The previous IMPLEMENTATION_PLAN.md failed deterministic validation.
You must fully revise the plan to satisfy the issues below without expanding feature scope.

Failure code:
${planFeedback.failure_code}

Structured validation feedback:
${JSON.stringify({
  stage: planFeedback.stage,
  failure_code: planFeedback.failure_code,
  summary: planFeedback.summary || {},
  errors: planFeedback.errors || [],
}, null, 2)}

Previous invalid plan:
${previousPlan || "none"}

Correction rules:
- Keep the same feature scope
- Fix the plan structurally instead of explaining the failure
- Prefer revising operation types, ordering, naming, folder usage, and dependency structure when those are the reported issues
- Return a full replacement IMPLEMENTATION_PLAN.md, not a diff
` : "";

  return `
${planPrompt}

----------------------------------------
APPROVED INTENT (AUTHORITATIVE)
----------------------------------------

Use the approved intent below to keep plan sequencing and scope aligned with the human's actual boundaries.

INTENT_CONFIRMATION:
${intentConfirmation}

${feedbackSection}

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${safeRead(PATHS.projectContextMd)}

SYSTEM_REGISTRY:
${safeRead(PATHS.systemRegistryMd)}

FILE_REGISTRY:
${safeRead(PATHS.fileRegistryMd)}

FEATURE_REQUEST:
${featureRequest}

IMPLEMENTATION_PLAN_TEMPLATE:
${implementationPlanTemplate}
`;
}

function parsePlanningFailure(error) {
  const message = String(error?.message || "").trim();
  if (error?.feedback) {
    return {
      ...error.feedback,
      raw_message: message,
      issues: error.feedback.issues || [],
      errors: error.feedback.errors || [],
      summary: error.feedback.summary || {},
    };
  }

  const [firstLine, ...rest] = message.split(/\r?\n/);
  const failureCode = (firstLine || "PLANNING_FAILURE").trim();
  const issues = rest
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^- /, "").trim());

  return {
    stage: "unknown",
    failure_code: failureCode,
    errors: issues.map(issue => ({
      type: "PLAN_DRIFT",
      location: "global",
      message: issue,
      fix_hint: "review_and_revise",
      deterministic_fix_available: false,
    })),
    issues,
    summary: {},
    raw_message: message,
  };
}

function isRetriablePlanFailure(error) {
  const code = String(error?.message || "").split(/\r?\n/)[0]?.trim();
  return [
    "FEATURES_LIST_INVALID",
    "FEATURE_REQUEST_INVALID",
    "PLAN_INVALID",
    "PLAN_DECISION_INVALID",
    "PLAN_TRACEABILITY_INVALID",
    "PLAN_INCOMPLETE",
  ].includes(code);
}

function writePlanFeedbackArtifacts(feedback) {
  writeJson(PATHS.planFeedbackJson, feedback);
  writeText(PATHS.planFeedbackMd, renderFeedbackMarkdown("PLAN_FEEDBACK.md", feedback));
}

function writePlanReconciliationArtifacts(report) {
  writeJson(PATHS.planReconciliationJson, report);
  writeText(PATHS.planReconciliationMd, renderPlanReconciliationMarkdown(report));
}

function writeFeaturesListFeedbackArtifacts(feedback) {
  writeJson(PATHS.featuresListFeedbackJson, feedback);
  writeText(PATHS.featuresListFeedbackMd, renderFeedbackMarkdown("FEATURES_LIST_FEEDBACK.md", feedback));
}

function writeFeatureRequestFeedbackArtifacts(feedback) {
  writeJson(PATHS.featureRequestFeedbackJson, feedback);
  writeText(PATHS.featureRequestFeedbackMd, renderFeedbackMarkdown("FEATURE_REQUEST_FEEDBACK.md", feedback));
}

function generateValidatedFeaturesList({ featuresPrompt, intentConfirmation }) {
  const retryPolicy = getPlanningRetryPolicy("features_list");
  let lastError = null;
  let lastFailure = null;
  let previousFeaturesList = "";
  let stallCount = 0;

  for (let attempt = 1; attempt <= retryPolicy.max_attempts; attempt++) {
    logDivider();
    logSub(`Generating FEATURES_LIST.md (attempt ${attempt}/${retryPolicy.max_attempts})...`);

    const feedback = lastError ? parsePlanningFailure(lastError) : null;
    const featuresList = generateMarkdown(
      buildFeaturesListPromptWithFeedback({
        scopePrompt: featuresPrompt,
        intentConfirmation,
        featuresFeedback: feedback ? {
          ...feedback,
          attempt,
          max_attempts: retryPolicy.max_attempts,
        } : null,
        previousFeaturesList,
        attempt,
        maxAttempts: retryPolicy.max_attempts,
      })
    );

    previousFeaturesList = featuresList;
    writeText(PATHS.featuresListMd, featuresList);

    try {
      const evaluation = assertFeaturesListValid(featuresList, {
        intentConfirmation,
        scopePrompt: featuresPrompt,
      });

      writeFeaturesListFeedbackArtifacts({
        stage: "features_list",
        status: "resolved",
        failure_code: "none",
        errors: [],
        issues: [],
        summary: evaluation.summary,
        attempt,
        max_attempts: retryPolicy.max_attempts,
        retry_policy: retryPolicy,
        next_action: "proceed_to_feature_request",
      });

      return {
        markdown: featuresList,
        features: evaluation.parsed_features || parseFeaturesListMarkdown(featuresList),
      };
    } catch (error) {
      lastError = error;
      const parsedFailure = parsePlanningFailure(error);
      const retryAssessment = assessRetryProgress(lastFailure, parsedFailure);
      stallCount = retryAssessment.stalled ? stallCount + 1 : 0;
      const shouldRetry = shouldContinueRetrying({
        attempt,
        retriable: isRetriablePlanFailure(error),
        policy: retryPolicy,
        stallCount,
      });

      writeFeaturesListFeedbackArtifacts({
        stage: parsedFailure.stage || "features_list",
        status: "needs_revision",
        failure_code: parsedFailure.failure_code,
        errors: parsedFailure.errors || [],
        issues: parsedFailure.issues,
        summary: parsedFailure.summary || {},
        attempt,
        max_attempts: retryPolicy.max_attempts,
        retry_policy: retryPolicy,
        retry_assessment: retryAssessment,
        stall_count: stallCount,
        next_action: shouldRetry
          ? "regenerate_features_list"
          : "stop_and_review",
      });

      lastFailure = parsedFailure;

      if (!shouldRetry) {
        throw error;
      }

      logWarn(`Features list validation failed on attempt ${attempt}/${retryPolicy.max_attempts}`);
      for (const issue of parsedFailure.issues) {
        logSub(issue);
      }
      if (retryAssessment.stalled) {
        logSub(`Retry assessment: stalled (${stallCount}/${retryPolicy.max_stall_cycles})`);
      }
      logSub("Regenerating features list with validation feedback...");
    }
  }

  throw lastError || new Error("FEATURES_LIST_FAILURE");
}

function generateValidatedFeatureRequest({
  selectedFeature,
  selectionPrompt,
  featuresList,
  featureRequestTemplate,
  intentConfirmation,
}) {
  const retryPolicy = getPlanningRetryPolicy("feature_request");
  let lastError = null;
  let lastFailure = null;
  let previousFeatureRequest = "";
  const parsedFeatures = parseFeaturesListMarkdown(featuresList);
  let stallCount = 0;

  for (let attempt = 1; attempt <= retryPolicy.max_attempts; attempt++) {
    logDivider();
    logSub(`Generating FEATURE_REQUEST.md (attempt ${attempt}/${retryPolicy.max_attempts})...`);

    const feedback = lastError ? parsePlanningFailure(lastError) : null;
    const featureRequest = generateMarkdown(
      buildFeatureSelectionPromptWithFeedback({
        selectedFeature,
        selectionPrompt,
        featuresList,
        featureRequestTemplate,
        intentConfirmation,
        featureRequestFeedback: feedback ? {
          ...feedback,
          attempt,
          max_attempts: retryPolicy.max_attempts,
        } : null,
        previousFeatureRequest,
        attempt,
        maxAttempts: retryPolicy.max_attempts,
      })
    );

    previousFeatureRequest = featureRequest;
    writeText(PATHS.featureRequestMd, featureRequest);

    try {
      const evaluation = assertFeatureRequestValid(featureRequest, {
        intentConfirmation,
        selectedFeature,
        features: parsedFeatures,
      });

      writeFeatureRequestFeedbackArtifacts({
        stage: "feature_request",
        status: "resolved",
        failure_code: "none",
        errors: [],
        issues: [],
        summary: evaluation.summary,
        attempt,
        max_attempts: retryPolicy.max_attempts,
        retry_policy: retryPolicy,
        next_action: "proceed_to_implementation_plan",
      });

      return featureRequest;
    } catch (error) {
      lastError = error;
      const parsedFailure = parsePlanningFailure(error);
      const retryAssessment = assessRetryProgress(lastFailure, parsedFailure);
      stallCount = retryAssessment.stalled ? stallCount + 1 : 0;
      const shouldRetry = shouldContinueRetrying({
        attempt,
        retriable: isRetriablePlanFailure(error),
        policy: retryPolicy,
        stallCount,
      });

      writeFeatureRequestFeedbackArtifacts({
        stage: parsedFailure.stage || "feature_request",
        status: "needs_revision",
        failure_code: parsedFailure.failure_code,
        errors: parsedFailure.errors || [],
        issues: parsedFailure.issues,
        summary: parsedFailure.summary || {},
        attempt,
        max_attempts: retryPolicy.max_attempts,
        retry_policy: retryPolicy,
        retry_assessment: retryAssessment,
        stall_count: stallCount,
        next_action: shouldRetry
          ? "regenerate_feature_request"
          : "stop_and_review",
      });

      lastFailure = parsedFailure;

      if (!shouldRetry) {
        throw error;
      }

      logWarn(`Feature request validation failed on attempt ${attempt}/${retryPolicy.max_attempts}`);
      for (const issue of parsedFailure.issues) {
        logSub(issue);
      }
      if (retryAssessment.stalled) {
        logSub(`Retry assessment: stalled (${stallCount}/${retryPolicy.max_stall_cycles})`);
      }
      logSub("Regenerating feature request with validation feedback...");
    }
  }

  throw lastError || new Error("FEATURE_REQUEST_FAILURE");
}

function generateValidatedImplementationPlan({
  planPrompt,
  featureRequest,
  implementationPlanTemplate,
  intentConfirmation,
}) {
  const retryPolicy = getPlanningRetryPolicy("implementation_plan");
  let lastError = null;
  let lastFailure = null;
  let previousPlan = "";
  let stallCount = 0;

  for (let attempt = 1; attempt <= retryPolicy.max_attempts; attempt++) {
    logDivider();
    logSub(`Generating IMPLEMENTATION_PLAN.md (attempt ${attempt}/${retryPolicy.max_attempts})...`);

    const feedback = lastError ? parsePlanningFailure(lastError) : null;
    const implementationPlan = generateMarkdown(
      buildImplementationPlanPrompt({
        planPrompt,
        featureRequest,
        implementationPlanTemplate,
        intentConfirmation,
        planFeedback: feedback ? {
          ...feedback,
          attempt,
          max_attempts: retryPolicy.max_attempts,
        } : null,
        previousPlan,
        attempt,
        maxAttempts: retryPolicy.max_attempts,
      })
    );

    previousPlan = implementationPlan;
    writeText(PATHS.implementationPlanMd, implementationPlan);

    try {
      const planData = syncImplementationPlanJson(AI_OS_ROOT);
      writePlanFeedbackArtifacts({
        stage: "implementation_plan",
        status: "resolved",
        failure_code: "none",
        errors: [],
        issues: [],
        attempt,
        max_attempts: retryPolicy.max_attempts,
        retry_policy: retryPolicy,
        next_action: "proceed_to_execution",
      });
      return {
        markdown: implementationPlan,
        planData,
        reconciliationReport: null,
      };
    } catch (error) {
      lastError = error;
      const parsedFailure = parsePlanningFailure(error);

      const reconciliationReport = reconcileImplementationPlanMarkdown(AI_OS_ROOT, implementationPlan);
      writePlanReconciliationArtifacts(reconciliationReport);

      if (reconciliationReport.applied_fixes.length > 0) {
        writeText(PATHS.implementationPlanMd, reconciliationReport.reconciled_markdown);

        try {
          const planData = syncImplementationPlanJson(AI_OS_ROOT);
          writePlanFeedbackArtifacts({
            stage: parsedFailure.stage || "implementation_plan",
            status: "resolved_via_reconciliation",
            failure_code: parsedFailure.failure_code,
            errors: [],
            issues: [],
            summary: parsedFailure.summary || {},
            reconciliation_applied_fixes: reconciliationReport.applied_fixes,
            attempt,
            max_attempts: retryPolicy.max_attempts,
            retry_policy: retryPolicy,
            next_action: "proceed_to_execution",
          });
          return {
            markdown: reconciliationReport.reconciled_markdown,
            planData,
            reconciliationReport,
          };
        } catch (reconciledError) {
          lastError = reconciledError;
        }
      }

      const finalFailure = parsePlanningFailure(lastError);
      const retryAssessment = assessRetryProgress(lastFailure, finalFailure);
      stallCount = retryAssessment.stalled ? stallCount + 1 : 0;
      const shouldRetry = shouldContinueRetrying({
        attempt,
        retriable: isRetriablePlanFailure(lastError),
        policy: retryPolicy,
        stallCount,
      });
      writePlanFeedbackArtifacts({
        stage: finalFailure.stage || "implementation_plan",
        status: "needs_revision",
        failure_code: finalFailure.failure_code,
        errors: finalFailure.errors || [],
        issues: finalFailure.issues,
        summary: finalFailure.summary || {},
        reconciliation_applied_fixes: reconciliationReport.applied_fixes,
        attempt,
        max_attempts: retryPolicy.max_attempts,
        retry_policy: retryPolicy,
        retry_assessment: retryAssessment,
        stall_count: stallCount,
        next_action: shouldRetry
          ? "regenerate_implementation_plan"
          : "stop_and_review",
      });

      lastFailure = finalFailure;

      if (!shouldRetry) {
        throw lastError;
      }

      logWarn(`Plan validation failed on attempt ${attempt}/${retryPolicy.max_attempts}`);
      for (const fix of reconciliationReport.applied_fixes) {
        logSub(`Reconciler: ${fix}`);
      }
      for (const issue of finalFailure.issues) {
        logSub(issue);
      }
      if (retryAssessment.stalled) {
        logSub(`Retry assessment: stalled (${stallCount}/${retryPolicy.max_stall_cycles})`);
      }
      logSub("Regenerating implementation plan with validation feedback...");
    }
  }

  throw lastError || new Error("PLAN_FAILURE");
}

function generateMarkdown(prompt) {
  const modelConfig = getModelConfig();
  timeStart("Model Generation");
  const result = runModel(prompt, modelConfig);
  timeEnd("Model Generation");
  return stripMarkdownFences(result.raw_text || "");
}

logStep("Planning");

try {
  const intentConfirmation = readText(INTENT_CONFIRMATION_PATH);
  if (!intentConfirmation.trim()) {
    throw new Error(
      "PLANNING_BLOCKED\n- INTENT_CONFIRMATION.md is missing\n- Run node run_planning_intake.js first"
    );
  }

  assertIntentApproved(intentConfirmation);
  logSuccess("Intent confirmation approved");

  const featuresPrompt = readText(path.join(PLANNING_DIR, "1_features_planning_prompt.txt"));
  const selectionPrompt = readText(path.join(PLANNING_DIR, "2_feature_selection_prompt.txt"));
  const planPrompt = readText(path.join(PLANNING_DIR, "3_plan_generation_prompt.txt"));
  const featureRequestTemplate = readText(path.join(PLANNING_DIR, "FEATURE_REQUEST.template.md"));
  const implementationPlanTemplate = readText(path.join(PLANNING_DIR, "IMPLEMENTATION_PLAN.template.md"));

  const { markdown: featuresList, features: parsedFeatures } = generateValidatedFeaturesList({
    featuresPrompt,
    intentConfirmation,
  });
  logSuccess("FEATURES_LIST.md updated");

  const initialFeature = selectInitialFeature(parsedFeatures);

  if (!initialFeature) {
    throw new Error("PLANNING_BLOCKED\n- FEATURES_LIST.md contains no selected or candidate features");
  }

  logSub(`Initial feature: ${initialFeature.number}. ${initialFeature.title}`);

  const featureRequest = generateValidatedFeatureRequest({
    selectedFeature: initialFeature,
    selectionPrompt,
    featuresList,
    featureRequestTemplate,
    intentConfirmation,
  });
  logSuccess("FEATURE_REQUEST.md updated");

  const {
    planData,
    reconciliationReport,
  } = generateValidatedImplementationPlan({
    planPrompt,
    featureRequest,
    implementationPlanTemplate,
    intentConfirmation,
  });
  logSuccess("IMPLEMENTATION_PLAN.md updated");

  const executionGateAssessment = evaluateExecutionGatePolicy({
    aiOsRoot: AI_OS_ROOT,
    intentConfirmation,
    planData,
    reconciliationReport,
    decisionEvaluation: readJson(PATHS.planDecisionEvaluationJson, null),
    traceabilityEvaluation: readJson(PATHS.planTraceabilityEvaluationJson, null),
  });

  writeText(
    PATHS.executionConfirmationMd,
    renderExecutionConfirmationMarkdown({
      intentConfirmation,
      planData,
      reconciliationReport,
      approval: executionGateAssessment.approval,
      throughputAssessment: executionGateAssessment,
    })
  );
  logSuccess("EXECUTION_CONFIRMATION.md updated");

  if (executionGateAssessment.auto_approved) {
    logSuccess(`Gate 2 auto-approved by throughput policy (score ${executionGateAssessment.score}/${executionGateAssessment.threshold})`);
  } else {
    logSub(`Gate 2 requires human review (score ${executionGateAssessment.score}/${executionGateAssessment.threshold})`);
  }

  logDivider();
  logSuccess("Planning complete");
  logSub("Review AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md");
  logSub("If Approval Status is not already approved and it still matches the approved intent, change Approval Status to approved");
  logSub("Then run: node run_ai.js");
  process.exit(0);
} catch (err) {
  logError("Planning failed");
  console.error(err.message);
  process.exit(1);
}
