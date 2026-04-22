function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionBlock(markdown, heading) {
  const escapedHeading = escapeRegExp(heading);
  return markdown.match(new RegExp(`### ${escapedHeading}\\r?\\n([\\s\\S]*?)(?:\\r?\\n### |$)`, "i"))?.[1]?.trim() || "";
}

function extractScalarSection(markdown, heading) {
  const block = extractSectionBlock(markdown, heading);
  return block || "none";
}

function extractBulletItems(markdown, heading) {
  return extractSectionBlock(markdown, heading)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function extractBulletItemsAny(markdown, headings) {
  for (const heading of headings) {
    const items = extractBulletItems(markdown, heading);
    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

function readStatus(markdown, label) {
  return markdown.match(new RegExp(`${escapeRegExp(label)}:\\s*(?:\\r?\\n)?-\\s*(.+)`, "i"))?.[1]?.trim().toLowerCase() || "";
}

function isNoneList(items) {
  if (!items || items.length === 0) {
    return true;
  }

  return items.length === 1 && /^none$/i.test(items[0]);
}

function renderBulletList(items, fallback = "none") {
  if (isNoneList(items)) {
    return [`- ${fallback}`];
  }

  return items.map(item => `- ${item}`);
}

function summarizeOperationTypes(operations) {
  const counts = new Map();

  for (const operation of operations || []) {
    const key = operation.operation_type || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  if (counts.size === 0) {
    return "none";
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
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

function summarizeTouchedAreas(operations) {
  const counts = new Map();

  for (const operation of operations || []) {
    const area = normalizeArea(operation.file_path);
    counts.set(area, (counts.get(area) || 0) + 1);
  }

  if (counts.size === 0) {
    return "none";
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}=${count}`)
    .join(", ");
}

function renderAssessmentLines(assessment) {
  if (!assessment) {
    return ["- none"];
  }

  return [
    `- enabled: ${assessment.enabled ? "true" : "false"}`,
    `- auto_approved: ${assessment.auto_approved ? "true" : "false"}`,
    `- score: ${assessment.score}`,
    `- threshold: ${assessment.threshold}`,
    `- total_cycles: ${assessment.signals?.total_cycles ?? 0}`,
    `- touched_areas: ${(assessment.signals?.touched_areas || []).join(", ") || "none"}`,
    `- reconciliation_fix_count: ${assessment.signals?.reconciliation_fix_count ?? 0}`,
    `- ambiguity_resolution_status: ${assessment.signals?.ambiguity_resolution_status || "not_set"}`,
    `- blockers: ${(assessment.blockers || []).join(", ") || "none"}`,
  ];
}

function buildSpecificReviewQuestions({
  planData,
  intentConfirmation,
  reconciliationReport,
}) {
  const operations = planData.operations || [];
  const touchedAreas = [...new Set(operations.map(operation => normalizeArea(operation.file_path)))];
  const assumptions = extractBulletItemsAny(intentConfirmation, [
    "Assumptions I Am Making To Proceed",
    "Assumptions I Am Making",
  ]);
  const mustStayOut = extractBulletItems(intentConfirmation, "Must Stay Out Now");
  const deferred = extractBulletItems(intentConfirmation, "Deferred Until Later");
  const ambiguityStatus = readStatus(intentConfirmation, "Ambiguity Resolution Status");
  const questions = [];

  if (touchedAreas.length > 1) {
    questions.push(`Did you intend this pass to touch multiple system areas: ${touchedAreas.join(", ")}?`);
  }

  if (operations.length > 8) {
    questions.push(`Did you intend a plan this wide (${operations.length} file operations) for the next playable win?`);
  }

  if ((reconciliationReport?.applied_fixes || []).length > 0) {
    questions.push("The compiler changed some authored plan details during reconciliation. Is that still acceptable before execution starts?");
  }

  if (ambiguityStatus === "assumptions_accepted" || !isNoneList(assumptions)) {
    questions.push("The plan is still proceeding on assumptions carried forward from gate 1. Are those assumptions still acceptable for execution?");
  }

  if (!isNoneList(mustStayOut)) {
    questions.push("Do the planned files below still respect the scope exclusions from Must Stay Out Now?");
  }

  if (!isNoneList(deferred)) {
    questions.push("Did anything that was explicitly deferred slip into this compiled plan?");
  }

  if (questions.length === 0) {
    questions.push("Does the compiled plan below still match the approved intent closely enough to begin execution?");
  }

  return questions;
}

export function renderExecutionConfirmationMarkdown({
  intentConfirmation,
  planData,
  reconciliationReport = null,
  approval = null,
  throughputAssessment = null,
}) {
  const operations = planData.operations || [];
  const uniqueFiles = [...new Set(operations.map(operation => operation.file_path).filter(Boolean))];
  const deliverySurfaces = planData.delivery_surfaces || {};
  const browserScaffold = planData.browser_scaffold || {};
  const assumptions = extractBulletItemsAny(intentConfirmation, [
    "Assumptions I Am Making To Proceed",
    "Assumptions I Am Making",
  ]);
  const risks = extractBulletItems(intentConfirmation, "Open Questions Or Risks");
  const questions = buildSpecificReviewQuestions({
    planData,
    intentConfirmation,
    reconciliationReport,
  });
  const reconciliationNotes = (reconciliationReport?.applied_fixes || []).length > 0
    ? reconciliationReport.applied_fixes
    : ["none"];
  const approvalStatus = approval?.status || "needs_human_review";
  const approvalSource = approval?.source || "human_review_required";
  const approvalReasons = approval?.reasons || ["none"];

  const lines = [
    "# EXECUTION_CONFIRMATION.md",
    "",
    "## HUMAN REVIEW FIRST - EDIT HERE",
    "",
    "Approval Status:",
    `- ${approvalStatus}`,
    "",
    "Approval Source:",
    `- ${approvalSource}`,
    "",
    "What to do:",
    "- Compare the approved intent snapshot below with the compiled plan snapshot.",
    "- If they still match and Approval Status is not already `approved`, change Approval Status to `approved`.",
    "- If Approval Source is `throughput_policy_auto_approve`, the system approved this gate automatically under policy. You can still change Approval Status back to `needs_human_review` if you want a manual stop.",
    "- If the plan feels broader, narrower, or semantically off, revise planning inputs and rerun `node run_planning.js`.",
    "- Do not run `node run_ai.js` until Approval Status is `approved`.",
    "",
    "Human Notes:",
    ...renderBulletList(approvalReasons),
    "",
    "---",
    "",
    "## Throughput Policy Assessment",
    "",
    ...renderAssessmentLines(throughputAssessment),
    "",
    "---",
    "",
    "## Approved Intent Snapshot",
    "",
    "### Project Identity",
    extractScalarSection(intentConfirmation, "Project Identity"),
    "",
    "### Next Playable Win",
    extractScalarSection(intentConfirmation, "Next Playable Win"),
    "",
    "### Player Promise Right Now",
    ...renderBulletList(extractBulletItems(intentConfirmation, "Player Promise Right Now")),
    "",
    "### Must Include Now",
    ...renderBulletList(extractBulletItems(intentConfirmation, "Must Include Now")),
    "",
    "### Must Stay Out Now",
    ...renderBulletList(extractBulletItems(intentConfirmation, "Must Stay Out Now")),
    "",
    "### Deferred Until Later",
    ...renderBulletList(extractBulletItems(intentConfirmation, "Deferred Until Later")),
    "",
    "### Gate 1 Ambiguity Snapshot",
    `- ambiguity_resolution_status: ${readStatus(intentConfirmation, "Ambiguity Resolution Status") || "not_set"}`,
    ...renderBulletList(assumptions, "assumptions_none"),
    "",
    "### Open Questions Or Risks",
    ...renderBulletList(risks),
    "",
    "---",
    "",
    "## Compiled Plan Snapshot",
    "",
    "### Feature",
    planData.feature || "none",
    "",
    "### Goal",
    planData.goal || "none",
    "",
    "### Delivery Surfaces",
    `- render_surface: ${deliverySurfaces.render_surface || "not_required"}`,
    `- style_surface: ${deliverySurfaces.style_surface || "not_required"}`,
    `- runtime_entry_surface: ${deliverySurfaces.runtime_entry_surface || "not_required"}`,
    "",
    "### Browser Scaffold",
    `- html_entry: ${browserScaffold.html_entry || "not_required"}`,
    `- dom_mount_entry: ${browserScaffold.dom_mount_entry || "not_required"}`,
    `- mount_target: ${browserScaffold.mount_target || "not_required"}`,
    `- scaffold_strategy: ${browserScaffold.scaffold_strategy || "not_required"}`,
    "",
    "### Plan Shape",
    `- total_cycles: ${operations.length}`,
    `- total_files_touched: ${uniqueFiles.length}`,
    `- operation_types: ${summarizeOperationTypes(operations)}`,
    `- touched_areas: ${summarizeTouchedAreas(operations)}`,
    "",
    "### Planned File Operations",
    ...(operations.length > 0
      ? operations.map(operation => `- ${operation.operation_key} | ${operation.operation_type} | ${operation.file_path}`)
      : ["- none"]),
    "",
    "### Compiler Reconciliation Notes",
    ...renderBulletList(reconciliationNotes),
    "",
    "### Specific Review Questions",
    ...renderBulletList(questions),
    "",
  ];

  return lines.join("\n");
}

export function assertExecutionConfirmationApproved(markdown) {
  const status = readStatus(markdown, "Approval Status");
  if (status !== "approved") {
    throw new Error(
      "EXECUTION_BLOCKED\n- EXECUTION_CONFIRMATION.md is not approved\n- Review AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md\n- Change Approval Status to approved before running node run_ai.js"
    );
  }
}
