import fs from "fs";
import path from "path";
import { createHash } from "crypto";

import {
  getRuntimePaths,
  readJson,
  readTargetRequest,
  safeRead,
} from "../planning/data_layer.js";
import { evaluateCommitGatePolicy } from "../throughput/throughput_policy.js";

function sha256(value) {
  return createHash("sha256").update(value || "", "utf-8").digest("hex");
}

function readBulletField(markdown, label) {
  return markdown.match(new RegExp(`${label}:\\s*(?:\\r?\\n)?-\\s*(.+)`, "i"))?.[1]?.trim() || "";
}

function renderBulletList(items, fallback = "none") {
  if (!items || items.length === 0) {
    return [`- ${fallback}`];
  }

  return items.map(item => `- ${item}`);
}

function formatCheckEntry(check) {
  if (!check?.name) {
    return "";
  }

  if (check.detail) {
    return `${check.name}: ${check.detail}`;
  }

  return check.name;
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.trim() + "\n", "utf-8");
}

function summarizeChecks(verifyResult, status) {
  return (verifyResult?.checks || [])
    .filter(check => check.status === status)
    .map(formatCheckEntry)
    .filter(Boolean);
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
    `- attempt_number: ${assessment.signals?.attempt_number ?? 0}`,
    `- warning_count: ${assessment.signals?.warning_count ?? 0}`,
    `- risky_warning_count: ${assessment.signals?.risky_warning_count ?? 0}`,
    `- behavior_required: ${assessment.signals?.behavior_required ? "true" : "false"}`,
    `- file_size_bytes: ${assessment.signals?.file_size_bytes ?? 0}`,
    `- blockers: ${(assessment.blockers || []).join(", ") || "none"}`,
  ];
}

export function renderCommitConfirmationMarkdown({
  request,
  executionResult,
  verifyResult,
  contentHash,
  filePath,
  fileSize,
  approval = null,
  throughputAssessment = null,
}) {
  const warningChecks = summarizeChecks(verifyResult, "warn");
  const passedChecks = summarizeChecks(verifyResult, "pass");
  const failedChecks = summarizeChecks(verifyResult, "fail");
  const approvalStatus = approval?.status || "needs_human_review";
  const approvalSource = approval?.source || "human_review_required";
  const approvalReasons = approval?.reasons || ["none"];
  const lines = [
    "# COMMIT_CONFIRMATION.md",
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
    "- Review the verified artifact summary below and inspect the exact file path if needed.",
    "- If this file is acceptable to enter the registry and applied state, change Approval Status to `approved` when it is not already approved.",
    "- If Approval Source is `throughput_policy_auto_approve`, the system approved this gate automatically under policy. You can still switch Approval Status back to `needs_human_review` if you want a manual stop.",
    "- If it is not acceptable, patch the file or planning inputs and rerun `node run_ai.js`.",
    "- Do not allow registry update or commit until Approval Status is `approved`.",
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
    "Allowed Skipped Warnings:",
    ...renderBulletList(throughputAssessment?.warning_summary?.allowed_skipped_warnings || []),
    "",
    "Risky Warnings:",
    ...renderBulletList(throughputAssessment?.warning_summary?.risky_warnings || []),
    "",
    "---",
    "",
    "## Verified Artifact Identity",
    "",
    "Operation Key:",
    `- ${request?.operation_key || "none"}`,
    "",
    "Request Id:",
    `- ${request?.request_id || "none"}`,
    "",
    "File Path:",
    `- ${filePath || request?.file_path || "none"}`,
    "",
    "Operation Type:",
    `- ${request?.effective_operation_type || request?.operation_type || "unknown"}`,
    "",
    "Content Hash:",
    `- ${contentHash || "none"}`,
    "",
    "File Size Bytes:",
    `- ${fileSize || 0}`,
    "",
    "---",
    "",
    "## Requested Outcome Snapshot",
    "",
    "Feature:",
    `- ${request?.feature || "none"}`,
    "",
    "Goal:",
    `- ${request?.goal || "none"}`,
    "",
    "Purpose:",
    `- ${request?.purpose || "none"}`,
    "",
    "Dependencies:",
    ...renderBulletList(request?.dependencies || []),
    "",
    "---",
    "",
    "## Execution Snapshot",
    "",
    "Execution Status:",
    `- ${executionResult?.status || "unknown"}`,
    "",
    "Attempt Number:",
    `- ${executionResult?.attempt_number || 0}`,
    "",
    "Model:",
    `- ${executionResult?.provider && executionResult?.model ? `${executionResult.provider}:${executionResult.model}` : "not_applicable"}`,
    "",
    "---",
    "",
    "## Verification Snapshot",
    "",
    "Verification Status:",
    `- ${verifyResult?.status || "unknown"}`,
    "",
    "Passed Checks:",
    `- ${passedChecks.length}`,
    "",
    "Warning Checks:",
    `- ${warningChecks.length}`,
    "",
    "Failed Checks:",
    `- ${failedChecks.length}`,
    "",
    "Verification Warnings:",
    ...renderBulletList(warningChecks),
    "",
    "Verification Failures:",
    ...renderBulletList(failedChecks),
    "",
    "---",
    "",
    "## Commit Consequence",
    "",
    "- Registry update will treat this file as accepted contract state for the target path.",
    "- Commit will mark this operation as completed in applied runtime state.",
    "- Future planning and execution will assume this file is the accepted baseline.",
    "",
    "## Specific Review Questions",
    "",
    "- Does this verified file still match the approved intent and compiled plan for this operation?",
    "- Are any verifier warnings acceptable to carry into registry state?",
    "- Are you comfortable marking this operation as completed and using this file as the new baseline?",
    "",
    "## Exact File To Inspect",
    "",
    `- ${filePath || request?.file_path || "none"}`,
  ];

  return lines.join("\n");
}

export function getCommitConfirmationState(markdown, {
  operationKey,
  contentHash,
}) {
  if (!markdown || !markdown.trim()) {
    return "missing";
  }

  const approvalStatus = readBulletField(markdown, "Approval Status").toLowerCase();
  const approvedOperationKey = readBulletField(markdown, "Operation Key");
  const approvedContentHash = readBulletField(markdown, "Content Hash");
  const matchesCurrentArtifact =
    approvedOperationKey === String(operationKey || "") &&
    approvedContentHash === String(contentHash || "");

  if (approvalStatus === "approved" && matchesCurrentArtifact) {
    return "approved_current";
  }

  if (matchesCurrentArtifact) {
    return "pending_current";
  }

  return "stale";
}

export function buildCommitConfirmationContext({
  aiOsRoot,
  projectRoot,
}) {
  const paths = getRuntimePaths(aiOsRoot);
  const request = readTargetRequest(aiOsRoot);

  if (!request) {
    throw new Error(
      "COMMIT_GATE_BLOCKED\n- target_file_request.json not found\n- Run the execution cycle before attempting registry update or commit"
    );
  }

  const relativePath = request.file_path || "";
  if (!relativePath) {
    throw new Error(
      "COMMIT_GATE_BLOCKED\n- file_path is missing from the current target request\n- Regenerate the current target request before attempting registry update or commit"
    );
  }

  const fullPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      "COMMIT_GATE_BLOCKED\n- The current target file does not exist on disk\n- Run execution and verification before attempting registry update or commit"
    );
  }

  const verifyResult = readJson(paths.verifyResultJson, null);
  if (verifyResult?.status !== "pass" || verifyResult?.operation_key !== request.operation_key) {
    throw new Error(
      "COMMIT_GATE_BLOCKED\n- The current file is not verified for the current operation\n- Run verification successfully before attempting registry update or commit"
    );
  }

  const executionResult = readJson(paths.executionResultJson, null);
  const content = fs.readFileSync(fullPath, "utf-8");
  const contentHash = `sha256:${sha256(content)}`;

  if (!executionResult || executionResult.operation_key !== request.operation_key || executionResult.file_path !== relativePath) {
    throw new Error(
      "COMMIT_GATE_BLOCKED\n- The execution artifact does not match the current operation\n- Re-run the current execution cycle before attempting registry update or commit"
    );
  }

  if (executionResult.content_hash !== contentHash) {
    throw new Error(
      "COMMIT_GATE_BLOCKED\n- The file content changed after the last verified execution artifact was recorded\n- Re-run verification for the current file before attempting registry update or commit"
    );
  }

  return {
    paths,
    request,
    executionResult,
    verifyResult,
    filePath: relativePath,
    fullPath,
    fileSize: Buffer.byteLength(content, "utf-8"),
    content,
    contentHash,
  };
}

export function ensureCommitConfirmationApproved({
  aiOsRoot,
  projectRoot,
}) {
  const context = buildCommitConfirmationContext({
    aiOsRoot,
    projectRoot,
  });
  const existingMarkdown = safeRead(context.paths.commitConfirmationMd);
  const state = getCommitConfirmationState(existingMarkdown, {
    operationKey: context.request.operation_key,
    contentHash: context.contentHash,
  });
  const throughputAssessment = evaluateCommitGatePolicy({
    aiOsRoot,
    context,
  });
  const approval = throughputAssessment.approval;

  if (state === "approved_current") {
    return {
      ...context,
      throughputAssessment,
      approval,
    };
  }

  if (throughputAssessment.auto_approved) {
    writeText(
      context.paths.commitConfirmationMd,
      renderCommitConfirmationMarkdown({
        ...context,
        approval,
        throughputAssessment,
      })
    );
    return {
      ...context,
      throughputAssessment,
      approval,
    };
  }

  if (state !== "pending_current") {
    writeText(
      context.paths.commitConfirmationMd,
      renderCommitConfirmationMarkdown({
        ...context,
        approval,
        throughputAssessment,
      })
    );
  }

  throw new Error(
    "COMMIT_GATE_BLOCKED\n- COMMIT_CONFIRMATION.md is not approved for the current verified artifact\n- Review AI-Human OS/5_commit/COMMIT_CONFIRMATION.md\n- Confirm the operation key and content hash still match the file you want to accept\n- Change Approval Status to approved before registry update or commit"
  );
}
