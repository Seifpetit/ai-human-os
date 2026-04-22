function lower(value) {
  return String(value || "").toLowerCase();
}

export function classifyFailure(input = {}) {
  const verifyResult = input.verifyResult || null;
  const executionResult = input.executionResult || null;
  const request = input.request || null;
  const planData = input.planData || null;
  const text = input.text || "";

  const capabilityDependencies = planData?.capability_dependencies || [];
  const requestFilePath = request?.file_path || "";
  const requestOperationRef = requestFilePath && (request?.planned_operation_type || request?.effective_operation_type || request?.operation_type)
    ? `${requestFilePath}::${request?.planned_operation_type || request?.effective_operation_type || request?.operation_type}`
    : "";
  const relevantCapabilityDependency = capabilityDependencies.find(dependency =>
    (dependency.required_contracts || []).includes(requestFilePath) ||
    (dependency.prerequisite_operations || []).includes(requestOperationRef)
  );

  if (verifyResult?.status === "fail") {
    const failingChecks = (verifyResult.errors || []).map(entry => lower(entry.name));

    if (failingChecks.includes("capability_contract_coherence")) return "missing_capability_contract";
    if (failingChecks.includes("ui_surface_coherence")) return "ui_surface_mismatch";
    if (failingChecks.includes("cross_file_contract_coherence")) return "cross_file_contract_mismatch";
    if (failingChecks.includes("workflow_state_coherence")) return "workflow_contract_mismatch";
    if (failingChecks.includes("ast_contracts")) return "ast_contract_mismatch";
    if (failingChecks.includes("semantic_requirements")) return "interface_mismatch";
    if (failingChecks.includes("syntax_valid")) return "syntax_failure";
  }

  const reason = lower(executionResult?.reason || "");
  if (reason === "interface_conflict" || reason === "interface_unclear") return "interface_mismatch";
  if (reason === "registry_conflict") return "registry_conflict";
  if (reason === "system_conflict") return "workflow_contract_mismatch";
  if (reason === "insufficient_context" && relevantCapabilityDependency) return "missing_capability_contract";

  const message = lower(text);

  if (message.includes("capability_contract_coherence")) return "missing_capability_contract";
  if (message.includes("commit_gate_blocked")) {
    return message.includes("not approved") ? "commit_confirmation_pending" : "commit_confirmation_missing";
  }
  if (message.includes("behavior_simulation_failed") || message.includes("behavior_generation_invalid")) {
    return "behavior_contract_invalid";
  }
  if (message.includes("interface_mismatch")) return "interface_mismatch";
  if (message.includes("ui_surface_coherence")) return "ui_surface_mismatch";
  if (message.includes("cross_file_contract_coherence")) return "cross_file_contract_mismatch";
  if (message.includes("workflow_state_coherence")) return "workflow_contract_mismatch";
  if (message.includes("ast_contracts")) return "ast_contract_mismatch";
  if (message.includes("syntax")) return "syntax_failure";
  if (message.includes("plan_incomplete")) return "plan_incomplete";
  if (message.includes("registry")) return "registry_conflict";
  return "unknown_failure";
}

export function buildRetryFeedback({ classification, retryCount }) {
  const focusMap = {
    missing_capability_contract: ["capability_dependencies", "required_contracts", "prerequisite_operations"],
    interface_mismatch: ["required_interface", "registry_contracts"],
    ui_surface_mismatch: ["delivery_surfaces", "parent_owned_class_hooks"],
    cross_file_contract_mismatch: ["cross_file_contracts", "render_style_alignment", "prop_alignment"],
    workflow_contract_mismatch: ["workflow_contracts", "state_ownership", "server_authority_boundary"],
    ast_contract_mismatch: ["imports", "exports", "prop_signatures"],
    syntax_failure: ["syntax", "export_shape"],
    registry_conflict: ["required_interface", "allowed_symbols"],
    plan_incomplete: ["implementation_plan"],
    behavior_contract_invalid: ["scenarios", "state_flow", "reconciliation_rule", "simulation_report"],
    commit_confirmation_missing: ["human_review_gate"],
    commit_confirmation_pending: ["human_review_gate"],
    unknown_failure: ["minimal_change"],
  };

  return {
    feedback_type: classification,
    source: "pipeline_retry",
    retry_count: retryCount,
    focus_areas: focusMap[classification] || focusMap.unknown_failure,
  };
}
