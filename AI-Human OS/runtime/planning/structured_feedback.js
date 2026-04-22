export function createFeedbackError({
  type = "PLAN_DRIFT",
  location = "global",
  message = "",
  fix_hint = "review_and_revise",
  deterministic_fix_available = false,
}) {
  return {
    type,
    location,
    message,
    fix_hint,
    deterministic_fix_available,
  };
}

export function errorListToMessages(errors = []) {
  return (errors || []).map(error => error.message).filter(Boolean);
}

export function buildPlanningFailureError({
  failure_code,
  stage,
  errors = [],
  summary = {},
  extra = {},
}) {
  const normalizedErrors = errors.map(error => createFeedbackError(error));
  const messageLines = [
    failure_code,
    ...normalizedErrors.map(error => `- ${error.message}`),
  ];

  const error = new Error(messageLines.join("\n"));
  error.feedback = {
    stage,
    failure_code,
    errors: normalizedErrors,
    issues: errorListToMessages(normalizedErrors),
    summary,
    ...extra,
  };

  return error;
}

export function renderFeedbackMarkdown(title, feedback) {
  const errors = feedback.errors || [];
  const lines = [
    `# ${title}`,
    "",
    "## Status",
    `- ${feedback.status || "needs_revision"}`,
    "",
    "## Failure Code",
    `- ${feedback.failure_code || "none"}`,
    "",
    "## Attempt",
    `- ${feedback.attempt || 1} / ${feedback.max_attempts || 1}`,
    "",
    "## Errors",
  ];

  if (errors.length === 0) {
    lines.push("- none");
  } else {
    for (const error of errors) {
      lines.push(`- [${error.type}] ${error.location}: ${error.message}`);
      lines.push(`  fix_hint: ${error.fix_hint || "review_and_revise"}`);
      lines.push(`  deterministic_fix_available: ${error.deterministic_fix_available ? "true" : "false"}`);
    }
  }

  lines.push(
    "",
    "## Next Action",
    `- ${feedback.next_action || "review"}`,
    ""
  );

  return lines.join("\n");
}
