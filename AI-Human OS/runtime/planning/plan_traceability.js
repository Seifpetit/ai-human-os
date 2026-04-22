import { buildPlanningFailureError, createFeedbackError, errorListToMessages } from "./structured_feedback.js";
import { parseFeatureRequestMarkdown, parseFeaturesListMarkdown } from "./upstream_planning_evaluator.js";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function tokenize(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean);
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "up",
  "with",
  "without",
  "now",
  "later",
  "feature",
  "features",
  "player",
  "players",
  "game",
  "system",
  "app",
  "flow",
  "screen",
]);

function significantTokens(value) {
  return tokenize(value).filter(token => token.length >= 4 && !STOPWORDS.has(token));
}

function getOverlapTokens(text, phrase) {
  const textTokens = new Set(significantTokens(text));
  const phraseTokens = significantTokens(phrase);

  return unique(phraseTokens.filter(token => textTokens.has(token)));
}

function hasStrongOverlap(text, phrase) {
  const overlapTokens = getOverlapTokens(text, phrase);
  const phraseTokens = significantTokens(phrase);

  if (phraseTokens.length === 0) {
    return false;
  }

  if (phraseTokens.length === 1) {
    return overlapTokens.length === 1;
  }

  return overlapTokens.length >= Math.min(2, phraseTokens.length);
}

function selectedFeatures(features) {
  return (features || []).filter(feature => normalizeText(feature.status) === "selected");
}

function findPrimaryFeature(features, featureRequest) {
  const selected = selectedFeatures(features);
  const requestName = normalizeText(featureRequest?.name);

  return (
    selected.find(feature => normalizeText(feature.title) === requestName) ||
    selected[0] ||
    null
  );
}

function shouldCheckConstraint(value) {
  const normalized = normalizeText(value);
  const tokens = significantTokens(value);

  if (!normalized || tokens.length < 2) {
    return false;
  }

  if (normalized.startsWith("priority:")) {
    return false;
  }

  if (normalized.includes("no unrelated systems beyond")) {
    return false;
  }

  return true;
}

function buildApprovedAnchors(primaryFeature, featureRequest) {
  return [
    primaryFeature?.title,
    primaryFeature?.purpose,
    primaryFeature?.reason_now,
    featureRequest?.name,
    featureRequest?.what_is_it,
    ...(featureRequest?.user_feel || []),
    ...(featureRequest?.constraints || []).filter(shouldCheckConstraint),
    featureRequest?.notes,
  ].filter(Boolean);
}

function buildApprovedCorpus(primaryFeature, featureRequest) {
  return buildApprovedAnchors(primaryFeature, featureRequest)
    .concat(featureRequest?.where_it_lives || [])
    .join(" ");
}

function buildPlanPositiveCorpus(planData) {
  return [
    planData?.feature,
    planData?.goal,
    ...(planData?.operations || []).flatMap(operation => [operation.file_path, operation.purpose]),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildPlanCoverageCorpus(planData) {
  const delivery = planData?.delivery_surfaces || {};
  const browser = planData?.browser_scaffold || {};
  const workflow = planData?.workflow_contracts || {};
  const capability = (planData?.capability_dependencies || []).flatMap(dependency => [
    dependency.capability,
    dependency.rationale,
    ...(dependency.required_contracts || []),
    ...(dependency.existing_surfaces || []),
  ]);

  return [
    buildPlanPositiveCorpus(planData),
    ...(planData?.touched_system_areas || []),
    ...(planData?.risk_points || []),
    ...(planData?.verification_checklist || []),
    ...(planData?.notes || []),
    planData?.dependency_reasoning,
    delivery.render_surface,
    delivery.style_surface,
    delivery.runtime_entry_surface,
    browser.html_entry,
    browser.dom_mount_entry,
    browser.mount_target,
    browser.scaffold_strategy,
    workflow.workflow_mode,
    workflow.action_owner,
    workflow.request_boundary,
    workflow.response_boundary,
    workflow.state_owner,
    workflow.server_authority_boundary,
    workflow.success_surface,
    workflow.failure_surface,
    ...capability,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildCoverageResult(items, planCorpus) {
  const relevantItems = unique((items || []).filter(Boolean));
  const covered = [];
  const missing = [];

  for (const item of relevantItems) {
    if (hasStrongOverlap(planCorpus, item)) {
      covered.push(item);
    } else {
      missing.push(item);
    }
  }

  return {
    total: relevantItems.length,
    covered,
    missing,
  };
}

function buildOperationTraceability(operation, anchors, locations) {
  const text = `${operation?.file_path || ""} ${operation?.purpose || ""}`;
  const anchorMatches = anchors
    .map(anchor => ({
      anchor,
      overlap_tokens: getOverlapTokens(text, anchor),
      matched: hasStrongOverlap(text, anchor),
    }))
    .filter(entry => entry.matched);

  const locationMatches = (locations || [])
    .map(location => ({
      location,
      overlap_tokens: getOverlapTokens(text, location),
      matched: hasStrongOverlap(text, location),
    }))
    .filter(entry => entry.matched);

  return {
    operation_key: operation?.operation_key || "",
    file_path: operation?.file_path || "",
    purpose: operation?.purpose || "",
    traceable: anchorMatches.length > 0 || locationMatches.length > 0,
    matched_anchors: anchorMatches.map(entry => entry.anchor),
    matched_locations: locationMatches.map(entry => entry.location),
    overlap_tokens: unique([
      ...anchorMatches.flatMap(entry => entry.overlap_tokens),
      ...locationMatches.flatMap(entry => entry.overlap_tokens),
    ]),
  };
}

function buildConflictingFeatureSignals(features, primaryFeature, planPositiveCorpus, approvedCorpus) {
  const approvedTokens = new Set(significantTokens(approvedCorpus));
  const planTokens = new Set(significantTokens(planPositiveCorpus));
  const normalizedPlan = normalizeText(planPositiveCorpus);

  return (features || [])
    .filter(feature => normalizeText(feature.title) !== normalizeText(primaryFeature?.title))
    .map(feature => {
      const uniqueTitleTokens = significantTokens(feature.title).filter(token => !approvedTokens.has(token));
      const overlapTokens = uniqueTitleTokens.filter(token => planTokens.has(token));
      const flagged = uniqueTitleTokens.length === 1
        ? normalizedPlan.includes(normalizeText(feature.title))
        : uniqueTitleTokens.length > 1 && unique(overlapTokens).length >= Math.min(2, uniqueTitleTokens.length);

      return {
        feature_title: feature.title,
        overlap_tokens: unique(overlapTokens),
        flagged,
      };
    })
    .filter(signal => signal.flagged);
}

export function evaluatePlanTraceability({
  featuresListMarkdown,
  featureRequestMarkdown,
  planData,
}) {
  const features = parseFeaturesListMarkdown(featuresListMarkdown || "");
  const featureRequest = parseFeatureRequestMarkdown(featureRequestMarkdown || "");
  const primaryFeature = findPrimaryFeature(features, featureRequest);
  const approvedAnchors = buildApprovedAnchors(primaryFeature, featureRequest);
  const approvedCorpus = buildApprovedCorpus(primaryFeature, featureRequest);
  const planPositiveCorpus = buildPlanPositiveCorpus(planData);
  const planCoverageCorpus = buildPlanCoverageCorpus(planData);
  const errors = [];

  if (!primaryFeature) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "FEATURES_LIST -> selected feature",
      message: "IMPLEMENTATION_PLAN.md cannot be traced because FEATURES_LIST.md has no selected feature matching the current feature request",
      fix_hint: "select_the_feature_being_planned",
    }));
  }

  if (normalizeText(planData?.feature) !== normalizeText(featureRequest?.name)) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Feature",
      message: `IMPLEMENTATION_PLAN.md feature '${planData?.feature || "none"}' must match FEATURE_REQUEST.md name '${featureRequest?.name || "none"}'`,
      fix_hint: "rename_plan_feature_to_match_feature_request",
    }));
  }

  if (primaryFeature && normalizeText(primaryFeature.title) !== normalizeText(featureRequest?.name)) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "FEATURE_REQUEST -> selected feature",
      message: `FEATURE_REQUEST.md name '${featureRequest?.name || "none"}' must map to a selected feature in FEATURES_LIST.md`,
      fix_hint: "align_feature_request_with_selected_feature",
    }));
  }

  const goalAnchor = [primaryFeature?.title, primaryFeature?.purpose, primaryFeature?.reason_now, featureRequest?.what_is_it]
    .filter(Boolean)
    .join(" ");

  if (goalAnchor && !hasStrongOverlap(planData?.goal || "", goalAnchor)) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Goal",
      message: "IMPLEMENTATION_PLAN.md goal no longer clearly reflects the approved feature request and selected feature",
      fix_hint: "rewrite_goal_to_match_approved_feature_scope",
    }));
  }

  const outcomeCoverage = buildCoverageResult(featureRequest?.user_feel || [], planCoverageCorpus);
  for (const missingOutcome of outcomeCoverage.missing) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## What should the user feel or see?",
      message: `IMPLEMENTATION_PLAN.md does not show clear coverage for approved outcome: '${missingOutcome}'`,
      fix_hint: "add_plan_coverage_for_missing_user_outcome",
    }));
  }

  const locationCoverage = buildCoverageResult(featureRequest?.where_it_lives || [], planCoverageCorpus);
  for (const missingLocation of locationCoverage.missing) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Where does this live in the system?",
      message: `IMPLEMENTATION_PLAN.md does not trace back to approved system area: '${missingLocation}'`,
      fix_hint: "add_or_realign_plan_operations_for_declared_system_area",
    }));
  }

  const constraintCoverage = buildCoverageResult(
    (featureRequest?.constraints || []).filter(shouldCheckConstraint),
    planCoverageCorpus
  );
  for (const missingConstraint of constraintCoverage.missing) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Constraints (important)",
      message: `IMPLEMENTATION_PLAN.md does not preserve approved constraint: '${missingConstraint}'`,
      fix_hint: "realign_plan_with_feature_constraint",
    }));
  }

  const operationTraceability = (planData?.operations || []).map(operation =>
    buildOperationTraceability(operation, approvedAnchors, featureRequest?.where_it_lives || [])
  );
  const untraceableOperations = operationTraceability.filter(operation => !operation.traceable);

  for (const operation of untraceableOperations) {
    errors.push(createFeedbackError({
      type: "SEMANTIC_DRIFT",
      location: operation.operation_key || operation.file_path || "unknown_operation",
      message: `Scope creep flag: operation '${operation.file_path}' cannot be traced back to the approved feature request`,
      fix_hint: "remove_or_rejustify_untraceable_operation",
    }));
  }

  const conflictingFeatures = primaryFeature
    ? buildConflictingFeatureSignals(features, primaryFeature, planPositiveCorpus, approvedCorpus)
    : [];

  for (const conflict of conflictingFeatures) {
    errors.push(createFeedbackError({
      type: "SEMANTIC_DRIFT",
      location: "IMPLEMENTATION_PLAN",
      message: `Scope creep flag: IMPLEMENTATION_PLAN.md appears to expand into another feature from FEATURES_LIST.md: '${conflict.feature_title}'`,
      fix_hint: "remove_scope_creep_into_other_feature",
    }));
  }

  return {
    ok: errors.length === 0,
    summary: {
      selected_feature: primaryFeature?.title || "none",
      plan_feature: planData?.feature || "none",
      outcome_total: outcomeCoverage.total,
      outcome_missing: outcomeCoverage.missing.length,
      location_total: locationCoverage.total,
      location_missing: locationCoverage.missing.length,
      constraint_total: constraintCoverage.total,
      constraint_missing: constraintCoverage.missing.length,
      scope_creep_flagged_operations: untraceableOperations.length,
      conflicting_feature_mentions: conflictingFeatures.length,
    },
    errors,
    issues: errorListToMessages(errors),
    operation_traceability: operationTraceability,
    coverage: {
      outcomes: outcomeCoverage,
      locations: locationCoverage,
      constraints: constraintCoverage,
    },
    scope_creep: {
      flagged: untraceableOperations.length > 0 || conflictingFeatures.length > 0,
      untraceable_operations: untraceableOperations,
      conflicting_features: conflictingFeatures,
    },
  };
}

export function assertPlanTraceability(input) {
  const evaluation = evaluatePlanTraceability(input);

  if (!evaluation.ok) {
    throw buildPlanningFailureError({
      failure_code: "PLAN_TRACEABILITY_INVALID",
      stage: "implementation_plan",
      errors: evaluation.errors,
      summary: evaluation.summary,
      extra: {
        coverage: evaluation.coverage,
        scope_creep: evaluation.scope_creep,
      },
    });
  }

  return evaluation;
}
