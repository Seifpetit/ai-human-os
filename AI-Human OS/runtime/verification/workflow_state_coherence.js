import fs from "fs";
import path from "path";
import { analyzeJsxAst } from "./jsx_ast_contracts.js";

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isProjectionOnly(workflow) {
  return normalize(workflow?.workflow_mode) === "projection_only";
}

function isNotRequired(value) {
  return normalize(value) === "not_required";
}

export function checkWorkflowStateCoherence({ projectRoot, request, planData }) {
  const workflow = request?.workflow_contracts || planData?.workflow_contracts || {};
  const filePath = request?.file_path || "";
  const relevantFiles = [
    workflow.action_owner,
    workflow.state_owner,
    planData?.delivery_surfaces?.render_surface,
    planData?.delivery_surfaces?.runtime_entry_surface,
  ].filter(Boolean);

  if (!workflow.workflow_mode || (!relevantFiles.includes(filePath) && !String(filePath).includes("/ui/"))) {
    return {
      applicable: false,
      skipped: true,
      reason: "request_outside_workflow_contracts",
      failures: [],
    };
  }

  const content = safeRead(path.join(projectRoot, filePath));
  const analysis = analyzeJsxAst(content);
  const failures = [];

  if (isProjectionOnly(workflow)) {
    if (analysis.state_mutations.length > 0) {
      failures.push(`Projection-only workflow cannot mutate state directly (${analysis.state_mutations.join(", ")})`);
    }

    if (analysis.network_calls.length > 0) {
      failures.push(`Projection-only workflow cannot trigger network calls (${analysis.network_calls.join(", ")})`);
    }
  }

  if (!isProjectionOnly(workflow) && filePath.includes("/ui/")) {
    if (analysis.state_mutations.some(item => item === "store_assignment" || item === "state_assignment")) {
      failures.push("UI workflow surface directly mutates authoritative state");
    }
  }

  if (!isNotRequired(workflow.request_boundary) && normalize(workflow.workflow_mode) !== "projection_only") {
    if (!workflow.action_owner) {
      failures.push("Workflow contract is missing action_owner for a non-projection workflow");
    }

    if (!workflow.state_owner) {
      failures.push("Workflow contract is missing state_owner for a non-projection workflow");
    }
  }

  return {
    applicable: true,
    skipped: false,
    reason: "",
    failures,
    analysis,
  };
}
