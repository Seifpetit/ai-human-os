import { inspectRuntimeSurfaces } from "./runtime_surface_inspector.js";
import { buildPlanningFailureError, createFeedbackError, errorListToMessages } from "./structured_feedback.js";

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function hasConcreteSurface(value) {
  const normalized = normalizeValue(value);
  if (!normalized) return false;

  return ![
    "none",
    "missing",
    "unknown",
    "not specified",
    "<path or existing surface or not_required>",
    "<path or existing shared styles or not_required>",
    "<path or existing app entry or not_required>",
  ].includes(normalized);
}

function isNotRequired(value) {
  return normalizeValue(value) === "not_required";
}

function hasConcreteText(value) {
  const normalized = normalizeValue(value);
  return Boolean(normalized) && !["none", "missing", "unknown", "not specified"].includes(normalized);
}

function inferWorkflowFeature(featureRequest, planData) {
  const haystack = [
    featureRequest,
    planData?.feature,
    planData?.goal,
    ...(planData?.touched_system_areas || []),
    ...(planData?.risk_points || []),
  ]
    .map(item => String(item || "").toLowerCase())
    .join(" ");

  return /multiplayer|room|session|server|network|join|create/.test(haystack);
}

function inferCapabilityDependentFeature(featureRequest, planData) {
  const haystack = [
    featureRequest,
    planData?.feature,
    planData?.goal,
    ...(planData?.touched_system_areas || []),
    ...(planData?.risk_points || []),
    ...(planData?.verification_checklist || []),
  ]
    .map(item => String(item || "").toLowerCase())
    .join(" ");

  return /multiplayer|room|session|server|network|join|create|auth|login|signup|checkout|payment|chat|matchmaking/.test(haystack);
}

function inferBrowserFacingUi(featureRequest, planData) {
  const request = String(featureRequest || "").toLowerCase();
  const feature = String(planData?.feature || "").toLowerCase();
  const goal = String(planData?.goal || "").toLowerCase();
  const touchedAreas = new Set((planData?.touched_system_areas || []).map(item => String(item).toLowerCase()));
  const filePaths = (planData?.operations || []).map(operation => String(operation.file_path || "").toLowerCase());

  return (
    request.includes("runs in browser") ||
    request.includes("browser") ||
    request.includes("web-based") ||
    request.includes("webgame-accessible") ||
    request.includes("screen") ||
    request.includes("players land") ||
    feature.includes("screen") ||
    goal.includes("screen") ||
    touchedAreas.has("ui") ||
    filePaths.some(filePath => filePath.includes("client/ui/"))
  );
}

export function validatePlanCompleteness(featureRequest, planData, options = {}) {
  const errors = [];
  const deliverySurfaces = planData?.delivery_surfaces || {};
  const browserScaffold = planData?.browser_scaffold || {};
  const capabilityDependencies = planData?.capability_dependencies || [];
  const crossFileContracts = planData?.cross_file_contracts || {};
  const workflowContracts = planData?.workflow_contracts || {};
  const browserFacingUi = inferBrowserFacingUi(featureRequest, planData);
  const workflowFeature = inferWorkflowFeature(featureRequest, planData);
  const capabilityDependentFeature = inferCapabilityDependentFeature(featureRequest, planData);
  const surfaceInspection = options.projectRoot
    ? inspectRuntimeSurfaces({ projectRoot: options.projectRoot, planData })
    : null;
  const operationRefs = new Set((planData?.operations || []).map(operation => `${operation.file_path}::${operation.operation_type}`));

  if (capabilityDependentFeature) {
    if (capabilityDependencies.length === 0) {
      errors.push(createFeedbackError({
        type: "CONTRACT_DRIFT",
        location: "Capability Dependencies",
        message: "Capability-dependent feature must declare at least one concrete capability dependency",
        fix_hint: "add_capability_dependency_entries",
      }));
    }

    for (const dependency of capabilityDependencies) {
      const label = dependency.capability || "unknown";
      const status = normalizeValue(dependency.status);
      const planAction = normalizeValue(dependency.plan_action);

      if (!hasConcreteText(dependency.capability)) {
        errors.push(createFeedbackError({
          type: "CONTRACT_DRIFT",
          location: `Capability '${label}'`,
          message: "Capability dependency is missing a concrete capability name",
          fix_hint: "fill_capability_name",
        }));
      }

      if (!["exists", "partial", "missing"].includes(status)) {
        errors.push(createFeedbackError({
          type: "PLAN_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' must declare status as exists, partial, or missing`,
          fix_hint: "use_valid_capability_status",
        }));
      }

      if (!hasConcreteText(dependency.rationale)) {
        errors.push(createFeedbackError({
          type: "PLAN_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' is missing a concrete rationale`,
          fix_hint: "add_capability_rationale",
        }));
      }

      if ((dependency.required_contracts || []).length === 0) {
        errors.push(createFeedbackError({
          type: "CONTRACT_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' must declare at least one required contract`,
          fix_hint: "add_required_contracts",
        }));
      }

      if (!["establish_first", "reuse_existing"].includes(planAction)) {
        errors.push(createFeedbackError({
          type: "PLAN_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' must declare plan_action as establish_first or reuse_existing`,
          fix_hint: "use_valid_plan_action",
        }));
      }

      if ((status === "missing" || status === "partial") && planAction !== "establish_first") {
        errors.push(createFeedbackError({
          type: "PLAN_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' is ${status} and must use plan_action establish_first`,
          fix_hint: "set_plan_action_to_establish_first",
        }));
      }

      if (status === "exists" && planAction !== "reuse_existing") {
        errors.push(createFeedbackError({
          type: "PLAN_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' is exists and must use plan_action reuse_existing`,
          fix_hint: "set_plan_action_to_reuse_existing",
        }));
      }

      if (planAction === "reuse_existing" && (dependency.existing_surfaces || []).length === 0) {
        errors.push(createFeedbackError({
          type: "DEPENDENCY_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' marked reuse_existing but did not declare existing_surfaces`,
          fix_hint: "declare_existing_surfaces",
        }));
      }

      if (planAction === "establish_first" && (dependency.prerequisite_operations || []).length === 0) {
        errors.push(createFeedbackError({
          type: "DEPENDENCY_DRIFT",
          location: `Capability '${label}'`,
          message: `Capability dependency '${label}' marked establish_first but did not declare prerequisite_operations`,
          fix_hint: "declare_prerequisite_operations",
        }));
      }

      for (const prerequisite of dependency.prerequisite_operations || []) {
        if (!operationRefs.has(prerequisite)) {
          errors.push(createFeedbackError({
            type: "DEPENDENCY_DRIFT",
            location: `Capability '${label}'`,
            message: `Capability dependency '${label}' references unknown prerequisite operation '${prerequisite}'`,
            fix_hint: "point_to_existing_operation_reference",
          }));
        }
      }
    }
  }

  if (browserFacingUi) {
    if (!hasConcreteSurface(deliverySurfaces.render_surface)) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Delivery Surfaces",
        message: "Browser-facing UI feature is missing a concrete render_surface in Delivery Surfaces",
        fix_hint: "declare_render_surface",
      }));
    }

    if (!hasConcreteSurface(deliverySurfaces.style_surface)) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Delivery Surfaces",
        message: "Browser-facing UI feature is missing a concrete style_surface in Delivery Surfaces",
        fix_hint: "declare_style_surface",
      }));
    }

    if (!hasConcreteSurface(deliverySurfaces.runtime_entry_surface) && !isNotRequired(deliverySurfaces.runtime_entry_surface)) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Delivery Surfaces",
        message: "Browser-facing UI feature must declare a concrete runtime_entry_surface or explicitly mark it not_required",
        fix_hint: "declare_runtime_entry_surface_or_not_required",
      }));
    }

    if (isNotRequired(deliverySurfaces.runtime_entry_surface) && surfaceInspection && surfaceInspection.existing_runtime_candidates.length === 0) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Delivery Surfaces",
        message: "Browser-facing UI feature marked runtime_entry_surface as not_required but no existing runtime scaffold was detected",
        fix_hint: "declare_or_create_runtime_entry_surface",
      }));
    }

    if (!hasConcreteText(browserScaffold.html_entry) && !isNotRequired(browserScaffold.html_entry)) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Browser Scaffold",
        message: "Browser-facing UI feature must declare a concrete html_entry or explicitly mark it not_required",
        fix_hint: "declare_html_entry_or_not_required",
      }));
    }

    if (!hasConcreteText(browserScaffold.dom_mount_entry) && !isNotRequired(browserScaffold.dom_mount_entry)) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Browser Scaffold",
        message: "Browser-facing UI feature must declare a concrete dom_mount_entry or explicitly mark it not_required",
        fix_hint: "declare_dom_mount_entry_or_not_required",
      }));
    }

    if (!hasConcreteText(browserScaffold.mount_target) && !isNotRequired(browserScaffold.mount_target)) {
      errors.push(createFeedbackError({
        type: "EXECUTION_DRIFT",
        location: "Browser Scaffold",
        message: "Browser-facing UI feature must declare a concrete mount_target or explicitly mark it not_required",
        fix_hint: "declare_mount_target_or_not_required",
      }));
    }

    if (!["create_if_missing", "reuse_existing", "not_required"].includes(normalizeValue(browserScaffold.scaffold_strategy))) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: "Browser Scaffold",
        message: "Browser-facing UI feature must declare scaffold_strategy as create_if_missing, reuse_existing, or not_required",
        fix_hint: "use_valid_scaffold_strategy",
      }));
    }

    if (normalizeValue(browserScaffold.scaffold_strategy) === "reuse_existing" && surfaceInspection) {
      if (surfaceInspection.existing_html_candidates.length === 0 || surfaceInspection.existing_runtime_candidates.length === 0) {
        errors.push(createFeedbackError({
          type: "EXECUTION_DRIFT",
          location: "Browser Scaffold",
          message: "Browser-facing UI feature chose reuse_existing scaffold_strategy but no reusable html/runtime scaffold was detected",
          fix_hint: "switch_to_create_if_missing_or_fix_scaffold_paths",
        }));
      }
    }

    if (!hasConcreteText(crossFileContracts.surface_family)) {
      errors.push(createFeedbackError({
        type: "CONTRACT_DRIFT",
        location: "Cross-File Contracts",
        message: "Browser-facing UI feature is missing a concrete cross-file surface_family",
        fix_hint: "declare_surface_family",
      }));
    }

    if (!hasConcreteText(crossFileContracts.style_owner)) {
      errors.push(createFeedbackError({
        type: "CONTRACT_DRIFT",
        location: "Cross-File Contracts",
        message: "Browser-facing UI feature is missing a concrete cross-file style_owner",
        fix_hint: "declare_style_owner",
      }));
    }

    if (normalizeValue(crossFileContracts.render_uses_style_surface) !== "required" && !isNotRequired(crossFileContracts.render_uses_style_surface)) {
      errors.push(createFeedbackError({
        type: "CONTRACT_DRIFT",
        location: "Cross-File Contracts",
        message: "Browser-facing UI feature must declare render_uses_style_surface as required or not_required",
        fix_hint: "set_render_uses_style_surface",
      }));
    }
  }

  if (workflowFeature) {
    const mode = normalizeValue(workflowContracts.workflow_mode);

    if (!["projection_only", "client_action", "server_authoritative"].includes(mode)) {
      errors.push(createFeedbackError({
        type: "PLAN_DRIFT",
        location: "Workflow Contracts",
        message: "Workflow-driven feature must declare workflow_mode as projection_only, client_action, or server_authoritative",
        fix_hint: "use_valid_workflow_mode",
      }));
    }

    if (!hasConcreteText(workflowContracts.action_owner)) {
      errors.push(createFeedbackError({
        type: "STATE_DRIFT",
        location: "Workflow Contracts",
        message: "Workflow-driven feature is missing a concrete action_owner",
        fix_hint: "declare_action_owner",
      }));
    }

    if (!hasConcreteText(workflowContracts.state_owner)) {
      errors.push(createFeedbackError({
        type: "STATE_DRIFT",
        location: "Workflow Contracts",
        message: "Workflow-driven feature is missing a concrete state_owner",
        fix_hint: "declare_state_owner",
      }));
    }

    if (!hasConcreteText(workflowContracts.server_authority_boundary) && mode !== "projection_only") {
      errors.push(createFeedbackError({
        type: "ARCHITECTURE_DRIFT",
        location: "Workflow Contracts",
        message: "Non-projection workflow feature is missing a concrete server_authority_boundary",
        fix_hint: "declare_server_authority_boundary",
      }));
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    issues: errorListToMessages(errors),
    browser_facing_ui: browserFacingUi,
    workflow_feature: workflowFeature,
    capability_dependent_feature: capabilityDependentFeature,
    surface_inspection: surfaceInspection,
  };
}

export function assertPlanCompleteness(featureRequest, planData, options = {}) {
  const validation = validatePlanCompleteness(featureRequest, planData, options);

  if (!validation.ok) {
    throw buildPlanningFailureError({
      failure_code: "PLAN_INCOMPLETE",
      stage: "implementation_plan",
      errors: validation.errors,
      summary: {
        browser_facing_ui: validation.browser_facing_ui,
        workflow_feature: validation.workflow_feature,
        capability_dependent_feature: validation.capability_dependent_feature,
      },
    });
  }

  return validation;
}
