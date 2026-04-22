import { buildPlanningFailureError, createFeedbackError, errorListToMessages } from "./structured_feedback.js";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function extractSection(markdown, heading, level = "##") {
  const escapedLevel = level.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`${escapedLevel}\\s+${escapedHeading}\\r?\\n([\\s\\S]*?)(?=\\r?\\n${escapedLevel}\\s+|$)`));
  return match?.[1]?.trim() || "";
}

function parseListBlock(block) {
  if (!block) return [];

  return block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-*]/.test(line))
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter(line => line.toLowerCase() !== "none");
}

function parseFeaturesListMarkdown(markdown) {
  return [...markdown.matchAll(/##\s+(\d+)\.\s+(.+)\r?\n([\s\S]*?)(?=\r?\n---\r?\n|\r?\n##\s+\d+\.|$)/g)]
    .map(match => {
      const body = match[3] || "";
      return {
        number: Number(match[1]),
        title: match[2].trim(),
        purpose: body.match(/- \*\*purpose:\*\*\s*(.+)/)?.[1]?.trim() || "",
        reason_now: body.match(/- \*\*reason_now:\*\*\s*(.+)/)?.[1]?.trim() || "",
        priority: body.match(/- \*\*priority:\*\*\s*(.+)/)?.[1]?.trim() || "",
        status: body.match(/- \*\*status:\*\*\s*(.+)/)?.[1]?.trim() || "",
      };
    });
}

function parseFeatureRequestMarkdown(markdown) {
  return {
    name: extractSection(markdown, "Name"),
    what_is_it: extractSection(markdown, "What is it?"),
    user_feel: parseListBlock(extractSection(markdown, "What should the user feel or see?")),
    where_it_lives: parseListBlock(extractSection(markdown, "Where does this live in the system?")),
    constraints: parseListBlock(extractSection(markdown, "Constraints (important)")),
    must_not_happen: parseListBlock(extractSection(markdown, "What should NOT happen")),
    notes: extractSection(markdown, "Notes (optional)"),
  };
}

function parseIntentConfirmationMarkdown(markdown) {
  return {
    project_identity: extractSection(markdown, "Project Identity", "###"),
    next_playable_win: extractSection(markdown, "Next Playable Win", "###"),
    player_promise_right_now: parseListBlock(extractSection(markdown, "Player Promise Right Now", "###")),
    must_include_now: parseListBlock(extractSection(markdown, "Must Include Now", "###")),
    must_stay_out_now: parseListBlock(extractSection(markdown, "Must Stay Out Now", "###")),
    budget_and_constraints: parseListBlock(extractSection(markdown, "Budget And Constraints", "###")),
    deferred_until_later: parseListBlock(extractSection(markdown, "Deferred Until Later", "###")),
  };
}

function parseScopePromptBudget(markdown) {
  const block = markdown.match(/\[ HUMAN SCOPE INPUT START \]([\s\S]*?)\[ HUMAN SCOPE INPUT END \]/)?.[1] || "";
  const match = block.match(/Feature Budget:\s*\r?\n([^\r\n]+)/i);

  if (!match) {
    return null;
  }

  const digits = match[1].match(/(\d+)/);
  return digits ? Number(digits[1]) : null;
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
  "now",
  "later",
  "player",
  "players",
  "game",
]);

function significantTokens(value) {
  return tokenize(value).filter(token => token.length >= 4 && !STOPWORDS.has(token));
}

function hasStrongOverlap(text, phrase) {
  const textTokens = new Set(significantTokens(text));
  const phraseTokens = significantTokens(phrase);

  if (phraseTokens.length === 0) {
    return false;
  }

  const overlapCount = phraseTokens.filter(token => textTokens.has(token)).length;
  if (phraseTokens.length === 1) {
    return overlapCount === 1;
  }

  return overlapCount >= Math.min(2, phraseTokens.length);
}

function hasTechnicalSignal(value) {
  return /\b(system|pipeline|engine|backend|transport|registry|contract|boundary|schema|adapter|api|latency|sync|state broadcast)\b/i.test(String(value || ""));
}

function selectInitialFeature(features) {
  return (
    features.find(feature => feature.status === "selected") ||
    features.find(feature => feature.status === "candidate") ||
    null
  );
}

export function validateFeaturesList(markdown, options = {}) {
  const features = parseFeaturesListMarkdown(markdown);
  const intent = parseIntentConfirmationMarkdown(options.intentConfirmation || "");
  const featureBudget = parseScopePromptBudget(options.scopePrompt || "");
  const errors = [];
  const validPriorities = new Set(["high", "medium", "low"]);
  const validStatuses = new Set(["candidate", "selected", "deferred", "blocked"]);
  const selected = features.filter(feature => normalizeText(feature.status) === "selected");
  const seenTitles = new Set();

  if (features.length === 0) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "FEATURES_LIST",
      message: "FEATURES_LIST.md must contain at least one feature",
      fix_hint: "add_at_least_one_user_level_feature",
    }));
  }

  for (const feature of features) {
    const titleKey = normalizeText(feature.title);

    if (!feature.title || !feature.purpose || !feature.reason_now) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: `Feature ${feature.number || "unknown"}`,
        message: `Feature ${feature.number || "unknown"} is missing title, purpose, or reason_now`,
        fix_hint: "fill_required_feature_fields",
      }));
    }

    if (!validPriorities.has(normalizeText(feature.priority))) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: `Feature '${feature.title || feature.number}'`,
        message: `Feature '${feature.title || feature.number}' has invalid priority '${feature.priority}'`,
        fix_hint: "use_priority_high_medium_or_low",
      }));
    }

    if (!validStatuses.has(normalizeText(feature.status))) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: `Feature '${feature.title || feature.number}'`,
        message: `Feature '${feature.title || feature.number}' has invalid status '${feature.status}'`,
        fix_hint: "use_status_candidate_selected_deferred_or_blocked",
      }));
    }

    if (titleKey) {
      if (seenTitles.has(titleKey)) {
        errors.push(createFeedbackError({
          type: "SEMANTIC_DRIFT",
          location: `Feature '${feature.title}'`,
          message: `Feature '${feature.title}' is duplicated`,
          fix_hint: "merge_or_remove_duplicate_feature",
        }));
      }

      seenTitles.add(titleKey);
    }

    if (hasTechnicalSignal(`${feature.title} ${feature.purpose}`)) {
      errors.push(createFeedbackError({
        type: "SEMANTIC_DRIFT",
        location: `Feature '${feature.title}'`,
        message: `Feature '${feature.title}' is written like a technical system instead of a user-level capability`,
        fix_hint: "rewrite_as_user_visible_capability",
      }));
    }
  }

  if (selected.length === 0) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "FEATURES_LIST",
      message: "FEATURES_LIST.md must mark at least one feature as selected",
      fix_hint: "mark_one_feature_as_selected",
    }));
  }

  if (selected.length > 2) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "FEATURES_LIST",
      message: "FEATURES_LIST.md must not mark more than 2 features as selected",
      fix_hint: "reduce_selected_features_to_at_most_two",
    }));
  }

  if (featureBudget !== null && selected.length > featureBudget) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "FEATURES_LIST",
      message: `Selected features exceed the declared feature budget of ${featureBudget}`,
      fix_hint: "reduce_selected_feature_count",
    }));
  }

  const selectedText = selected.map(feature => `${feature.title} ${feature.purpose} ${feature.reason_now}`).join(" ");
  const alignmentTargets = [
    ...intent.must_include_now,
    intent.next_playable_win,
  ].filter(Boolean);

  if (alignmentTargets.length > 0 && selected.length > 0) {
    const hasAlignedSelectedFeature = alignmentTargets.some(target => hasStrongOverlap(selectedText, target));
    if (!hasAlignedSelectedFeature) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: "Selected features",
        message: "Selected features do not clearly align with the approved next playable win or must-include intent",
        fix_hint: "reselect_features_to_match_intent",
      }));
    }
  }

  const excludedTargets = [
    ...intent.must_stay_out_now,
    ...intent.deferred_until_later,
  ].filter(Boolean);
  const activeFeatures = features.filter(feature => ["selected", "candidate"].includes(normalizeText(feature.status)));

  for (const feature of activeFeatures) {
    const featureText = `${feature.title} ${feature.purpose} ${feature.reason_now}`;
    const conflictingTarget = excludedTargets.find(target => hasStrongOverlap(featureText, target));
    if (conflictingTarget) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: `Feature '${feature.title}'`,
        message: `Feature '${feature.title}' conflicts with approved out-of-scope intent: '${conflictingTarget}'`,
        fix_hint: "remove_or_defer_conflicting_feature",
      }));
    }
  }

  return {
    ok: errors.length === 0,
    summary: {
      feature_count: features.length,
      selected_count: selected.length,
      feature_budget: featureBudget,
    },
    errors,
    issues: errorListToMessages(errors),
    parsed_features: features,
  };
}

export function assertFeaturesListValid(markdown, options = {}) {
  const evaluation = validateFeaturesList(markdown, options);

  if (!evaluation.ok) {
    throw buildPlanningFailureError({
      failure_code: "FEATURES_LIST_INVALID",
      stage: "features_list",
      errors: evaluation.errors,
      summary: evaluation.summary,
    });
  }

  return evaluation;
}

export function validateFeatureRequest(markdown, options = {}) {
  const featureRequest = parseFeatureRequestMarkdown(markdown);
  const intent = parseIntentConfirmationMarkdown(options.intentConfirmation || "");
  const selectedFeature = options.selectedFeature || null;
  const features = options.features || [];
  const errors = [];

  if (!featureRequest.name) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Name",
      message: "FEATURE_REQUEST.md is missing a feature name",
      fix_hint: "fill_feature_name",
    }));
  }

  if (selectedFeature && normalizeText(featureRequest.name) !== normalizeText(selectedFeature.title)) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Name",
      message: `FEATURE_REQUEST.md name '${featureRequest.name}' must match selected feature '${selectedFeature.title}'`,
      fix_hint: "rename_feature_request_to_selected_feature",
    }));
  }

  if (featureRequest.what_is_it.length < 30) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## What is it?",
      message: "FEATURE_REQUEST.md section 'What is it?' is too short or missing",
      fix_hint: "expand_feature_description",
    }));
  }

  if (featureRequest.user_feel.length < 2) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## What should the user feel or see?",
      message: "FEATURE_REQUEST.md must declare at least 2 user-visible outcomes",
      fix_hint: "add_more_user_visible_outcomes",
    }));
  }

  if (featureRequest.constraints.length < 2) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## Constraints (important)",
      message: "FEATURE_REQUEST.md must declare at least 2 constraints",
      fix_hint: "add_more_constraints",
    }));
  }

  if (featureRequest.must_not_happen.length < 2) {
    errors.push(createFeedbackError({
      type: "PLAN_DRIFT",
      location: "## What should NOT happen",
      message: "FEATURE_REQUEST.md must declare at least 2 anti-patterns in 'What should NOT happen'",
      fix_hint: "add_more_anti_patterns",
    }));
  }

  if (selectedFeature) {
    const requestText = [
      featureRequest.name,
      featureRequest.what_is_it,
      ...featureRequest.user_feel,
      ...featureRequest.constraints,
      ...featureRequest.must_not_happen,
      featureRequest.notes,
    ].join(" ");

    const expectedText = [
      selectedFeature.title,
      selectedFeature.purpose,
      selectedFeature.reason_now,
    ].join(" ");

    if (!hasStrongOverlap(requestText, expectedText)) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: "FEATURE_REQUEST",
        message: "FEATURE_REQUEST.md does not clearly reflect the selected feature purpose and reason_now",
        fix_hint: "realign_request_with_selected_feature",
      }));
    }
  }

  const otherFeatures = features.filter(feature => !selectedFeature || normalizeText(feature.title) !== normalizeText(selectedFeature.title));
  const requestTextLower = normalizeText([
    featureRequest.what_is_it,
    ...featureRequest.user_feel,
    ...featureRequest.constraints,
    ...featureRequest.must_not_happen,
    featureRequest.notes,
  ].join(" "));

  for (const feature of otherFeatures) {
    if (feature.title && requestTextLower.includes(normalizeText(feature.title))) {
      errors.push(createFeedbackError({
        type: "SEMANTIC_DRIFT",
        location: "FEATURE_REQUEST",
        message: `FEATURE_REQUEST.md appears to expand into another feature: '${feature.title}'`,
        fix_hint: "remove_scope_expansion_into_other_features",
      }));
    }
  }

  const excludedTargets = [
    ...intent.must_stay_out_now,
    ...intent.deferred_until_later,
  ].filter(Boolean);

  const fullRequestText = [
    featureRequest.name,
    featureRequest.what_is_it,
    ...featureRequest.user_feel,
    ...featureRequest.constraints,
    ...featureRequest.must_not_happen,
    featureRequest.notes,
  ].join(" ");

  for (const target of excludedTargets) {
    if (hasStrongOverlap(fullRequestText, target)) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: "FEATURE_REQUEST",
        message: `FEATURE_REQUEST.md conflicts with approved out-of-scope intent: '${target}'`,
        fix_hint: "remove_out_of_scope_content",
      }));
    }
  }

  return {
    ok: errors.length === 0,
    summary: {
      user_outcome_count: featureRequest.user_feel.length,
      constraint_count: featureRequest.constraints.length,
      anti_pattern_count: featureRequest.must_not_happen.length,
    },
    errors,
    issues: errorListToMessages(errors),
    parsed_feature_request: featureRequest,
  };
}

export function assertFeatureRequestValid(markdown, options = {}) {
  const evaluation = validateFeatureRequest(markdown, options);

  if (!evaluation.ok) {
    throw buildPlanningFailureError({
      failure_code: "FEATURE_REQUEST_INVALID",
      stage: "feature_request",
      errors: evaluation.errors,
      summary: evaluation.summary,
    });
  }

  return evaluation;
}

export { parseFeaturesListMarkdown, parseFeatureRequestMarkdown, parseIntentConfirmationMarkdown, selectInitialFeature };
