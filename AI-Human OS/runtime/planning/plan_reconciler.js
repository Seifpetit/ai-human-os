import fs from "fs";
import path from "path";

import { evaluatePlanDecisions } from "./decision_evaluator.js";
import { parseImplementationPlanMarkdown, renderImplementationPlanMarkdown } from "./data_layer.js";
import { assertWorkspaceRootReady } from "../workspace/workspace_config.js";

function clonePlanData(planData) {
  return JSON.parse(JSON.stringify(planData));
}

function renderPlanReconciliationMarkdown(report) {
  const lines = [
    "# PLAN_RECONCILIATION.md",
    "",
    "## Status",
    `- ${report.status || "none"}`,
    "",
    "## Attempted Fixes",
    ...(report.applied_fixes || []).length > 0
      ? report.applied_fixes.map(fix => `- ${fix}`)
      : ["- none"],
    "",
    "## Remaining Issues",
    ...(report.remaining_issues || []).length > 0
      ? report.remaining_issues.map(issue => `- ${issue}`)
      : ["- none"],
    "",
    "## Summary",
    `- original_issue_count: ${report.original_issue_count ?? 0}`,
    `- remaining_issue_count: ${report.remaining_issue_count ?? 0}`,
    `- improved: ${report.improved === true ? "yes" : "no"}`,
    "",
  ];

  return lines.join("\n");
}

function buildOperationIndex(planData) {
  return new Map((planData.operations || []).map(operation => [operation.file_path, operation]));
}

function fileExists(projectRoot, relativePath) {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function reconcileOperationTypes(planData, decisionEvaluation, options = {}) {
  const projectRoot = options.projectRoot;
  const operationsByPath = buildOperationIndex(planData);
  const appliedFixes = [];

  for (const entry of decisionEvaluation.evaluations?.file_creation || []) {
    if (!entry.mismatch) continue;

    const operation = operationsByPath.get(entry.subject);
    if (!operation) continue;

    if (entry.actual_option === "create_new_file" && entry.selected_option === "edit_existing_file") {
      if (fileExists(projectRoot, entry.subject)) {
        operation.operation_type = "edit_existing_file";
        appliedFixes.push(`Converted '${entry.subject}' from new_file to edit_existing_file because the file already exists`);
      }
    }

    if (entry.actual_option === "edit_existing_file" && entry.selected_option === "create_new_file") {
      if (!fileExists(projectRoot, entry.subject)) {
        operation.operation_type = "new_file";
        appliedFixes.push(`Converted '${entry.subject}' from edit_existing_file to new_file because the file does not exist`);
      }
    }
  }

  return appliedFixes;
}

export function reconcileImplementationPlanMarkdown(aiOsRoot, markdown) {
  const projectRoot = assertWorkspaceRootReady(aiOsRoot).projectRoot;
  let parsed;

  try {
    parsed = parseImplementationPlanMarkdown(markdown);
  } catch (error) {
    return {
      status: "not_reconciled",
      applied_fixes: [],
      remaining_issues: [String(error.message || error)],
      original_issue_count: 1,
      remaining_issue_count: 1,
      improved: false,
      reconciled_markdown: markdown,
    };
  }

  const originalEvaluation = evaluatePlanDecisions(parsed, {
    aiOsRoot,
    projectRoot,
  });

  const reconciledPlan = clonePlanData(parsed);
  const appliedFixes = [
    ...reconcileOperationTypes(reconciledPlan, originalEvaluation, { projectRoot }),
  ];

  if (appliedFixes.length === 0) {
    return {
      status: "not_reconciled",
      applied_fixes: [],
      remaining_issues: originalEvaluation.issues || [],
      original_issue_count: originalEvaluation.summary?.issue_count || 0,
      remaining_issue_count: originalEvaluation.summary?.issue_count || 0,
      improved: false,
      reconciled_markdown: markdown,
    };
  }

  const reconciledMarkdown = renderImplementationPlanMarkdown(reconciledPlan);
  const reconciledEvaluation = evaluatePlanDecisions(reconciledPlan, {
    aiOsRoot,
    projectRoot,
  });

  return {
    status: reconciledEvaluation.summary?.issue_count < (originalEvaluation.summary?.issue_count || 0)
      ? "reconciled_with_remaining_issues"
      : "reconciled_no_improvement",
    applied_fixes: appliedFixes,
    remaining_issues: reconciledEvaluation.issues || [],
    original_issue_count: originalEvaluation.summary?.issue_count || 0,
    remaining_issue_count: reconciledEvaluation.summary?.issue_count || 0,
    improved: reconciledEvaluation.summary?.issue_count < (originalEvaluation.summary?.issue_count || 0),
    reconciled_markdown: reconciledMarkdown,
  };
}

export { renderPlanReconciliationMarkdown };
