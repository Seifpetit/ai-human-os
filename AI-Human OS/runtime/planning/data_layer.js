import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { assertPlanCompleteness } from "./plan_completeness.js";
import { assertPlanDecisions, evaluatePlanDecisions } from "./decision_evaluator.js";
import { assertPlanTraceability, evaluatePlanTraceability } from "./plan_traceability.js";
import { resolveProjectRoot } from "../workspace/workspace_config.js";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf-8").digest("hex");
}

function workspaceIdFromRoot(workspaceRoot) {
  const normalized = path.resolve(String(workspaceRoot || "")).replace(/\\/g, "/").toLowerCase();
  return `ws_${sha256(normalized).slice(0, 12)}`;
}

export function getRuntimePaths(aiOsRoot) {
  const dataRootDir = path.join(aiOsRoot, "data");
  ensureDir(dataRootDir);

  const resolved = resolveProjectRoot(aiOsRoot);
  const workspaceRoot = resolved.ok ? resolved.projectRoot : path.dirname(aiOsRoot);
  const workspaceId = workspaceIdFromRoot(workspaceRoot);
  const workspaceDataDir = path.join(dataRootDir, "workspaces", workspaceId);
  ensureDir(workspaceDataDir);

  return {
    aiOsRoot,
    dataRootDir,
    dataDir: workspaceDataDir,
    workspace: {
      id: workspaceId,
      root: workspaceRoot,
      source: resolved.ok ? resolved.source : "default",
      configPath: resolved.ok ? resolved.configPath : path.join(aiOsRoot, "memory", "WORKSPACE_CONFIG.json"),
      ok: resolved.ok,
      error: resolved.ok ? "none" : resolved.error || "workspace_root_not_a_directory",
    },
    implementationPlanMd: path.join(aiOsRoot, "1_planning/IMPLEMENTATION_PLAN.md"),
    implementationPlanJson: path.join(workspaceDataDir, "implementation_plan.json"),
    planDecisionEvaluationJson: path.join(workspaceDataDir, "plan_decision_evaluation.json"),
    planTraceabilityEvaluationJson: path.join(workspaceDataDir, "plan_traceability_evaluation.json"),
    planFeedbackJson: path.join(workspaceDataDir, "plan_feedback.json"),
    planReconciliationJson: path.join(workspaceDataDir, "plan_reconciliation.json"),
    featuresListFeedbackJson: path.join(workspaceDataDir, "features_list_feedback.json"),
    featureRequestFeedbackJson: path.join(workspaceDataDir, "feature_request_feedback.json"),
    featureRequestMd: path.join(aiOsRoot, "1_planning/FEATURE_REQUEST.md"),
    featuresListMd: path.join(aiOsRoot, "1_planning/FEATURES_LIST.md"),
    executionConfirmationMd: path.join(aiOsRoot, "1_planning/EXECUTION_CONFIRMATION.md"),
    planFeedbackMd: path.join(aiOsRoot, "1_planning/PLAN_FEEDBACK.md"),
    planReconciliationMd: path.join(aiOsRoot, "1_planning/PLAN_RECONCILIATION.md"),
    featuresListFeedbackMd: path.join(aiOsRoot, "1_planning/FEATURES_LIST_FEEDBACK.md"),
    featureRequestFeedbackMd: path.join(aiOsRoot, "1_planning/FEATURE_REQUEST_FEEDBACK.md"),
    scenariosMd: path.join(aiOsRoot, "2_behavior/SCENARIOS.md"),
    stateFlowMd: path.join(aiOsRoot, "2_behavior/STATE_FLOW.md"),
    reconciliationRuleMd: path.join(aiOsRoot, "2_behavior/RECONCILIATION_RULE.md"),
    simulationReportMd: path.join(aiOsRoot, "2_behavior/SIMULATION_REPORT.md"),
    projectContextMd: path.join(aiOsRoot, "memory/PROJECT_CONTEXT.md"),
    systemRegistryMd: path.join(aiOsRoot, "memory/SYSTEM_REGISTRY.md"),
    fileRegistryMd: path.join(aiOsRoot, "memory/FILE_REGISTRY.md"),
    productStandardsMd: path.join(aiOsRoot, "memory/PRODUCT_STANDARDS.md"),
    uiPatternsMd: path.join(aiOsRoot, "memory/UI_PATTERNS.md"),
    designTokensJson: path.join(aiOsRoot, "memory/DESIGN_TOKENS.json"),
    driftTypesJson: path.join(aiOsRoot, "memory/DRIFT_TYPES.json"),
    driftScoringJson: path.join(aiOsRoot, "memory/DRIFT_SCORING.json"),
    metaSystemStatesJson: path.join(aiOsRoot, "memory/META_SYSTEM_STATES.json"),
    throughputPolicyJson: path.join(aiOsRoot, "memory/THROUGHPUT_POLICY.json"),
    canonicalDefinitionsJson: path.join(aiOsRoot, "memory/CANONICAL_DEFINITIONS.json"),
    workspaceConfigJson: path.join(aiOsRoot, "memory/WORKSPACE_CONFIG.json"),
    fileRegistryJson: path.join(workspaceDataDir, "file_registry.json"),
    targetRequestMd: path.join(aiOsRoot, "3_execution/TARGET_FILE_REQUEST.md"),
    targetRequestJson: path.join(workspaceDataDir, "target_file_request.json"),
    executionResultJson: path.join(workspaceDataDir, "execution_result.json"),
    verifyResultJson: path.join(workspaceDataDir, "verify_result.json"),
    cycleMetricsJsonl: path.join(workspaceDataDir, "cycle_metrics.jsonl"),
    runMetricsJson: path.join(workspaceDataDir, "run_metrics.json"),
    consoleSnapshotsJson: path.join(workspaceDataDir, "console_artifact_snapshots.json"),
    behaviorStateJson: path.join(workspaceDataDir, "behavior_state.json"),
    appliedOperationsJson: path.join(workspaceDataDir, "applied_operations.json"),
    executionHistoryJsonl: path.join(workspaceDataDir, "execution_history.jsonl"),
    commitConfirmationMd: path.join(aiOsRoot, "5_commit/COMMIT_CONFIRMATION.md"),
    appliedStateMd: path.join(aiOsRoot, "5_commit/APPLIED_STATE.md"),
  };
}

export function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function writeJsonl(filePath, rows) {
  ensureDir(path.dirname(filePath));
  const content = rows.map(row => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, content ? content + "\n" : "", "utf-8");
}

export function appendJsonl(filePath, row) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`, "utf-8");
}

function parseListBlock(block) {
  if (!block) return [];

  return block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-*]/.test(line))
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter(line => line !== "---" && line !== "--");
}

function parseDependencies(depBlock) {
  const deps = parseListBlock(depBlock);
  if (deps.length === 1 && deps[0].toLowerCase() === "none") {
    return [];
  }
  return deps;
}

function extractSingleField(block, fieldName, cycle) {
  const matches = [...block.matchAll(new RegExp(`- ${fieldName}:\\s*(.+)`, "g"))]
    .map(match => match[1]?.trim())
    .filter(Boolean);

  if (matches.length === 0) {
    return "";
  }

  if (matches.length > 1) {
    throw new Error(`PLAN_INVALID\n- Cycle ${cycle} declares multiple '${fieldName}' fields`);
  }

  return matches[0];
}

function formatOperationKey(cycle) {
  return `op_${String(cycle).padStart(3, "0")}`;
}

function componentNameFromFilePath(filePath) {
  const base = path.basename(filePath || "", path.extname(filePath || ""));
  return base || "";
}

function inferSemanticRequirements(operation, operationsByKey) {
  const requirements = {
    must_import: [],
    must_use: [],
    must_not_use: [],
    must_preserve: [],
  };

  const purpose = (operation.purpose || "").toLowerCase();
  const filePath = operation.file_path || "";

  if (purpose.includes("integrate") && filePath.includes("/layout/")) {
    for (const depKey of operation.depends_on || []) {
      const dep = operationsByKey.get(depKey);
      if (!dep) continue;

      if (dep.file_path.includes("/components/")) {
        requirements.must_import.push(dep.file_path);
        requirements.must_use.push(componentNameFromFilePath(dep.file_path));
      }
    }

    if (requirements.must_use.length > 0) {
      requirements.must_not_use.push("<button");
    }
  }

  if (purpose.includes("finalize projection behavior")) {
    requirements.must_preserve.push("projection_only");
  }

  return requirements;
}

function extractSection(markdown, label) {
  const raw = markdown.match(new RegExp(`## ${label}\\r?\\n([\\s\\S]*?)(?:\\r?\\n## |$)`))?.[1]?.trim() || "";

  return raw
    .replace(/\r?\n---[\s\S]*$/, "")
    .trim();
}

function parseDeliverySurfaces(markdown) {
  const block = extractSection(markdown, "Delivery Surfaces");

  return {
    render_surface: block.match(/- render_surface:\s*(.+)/)?.[1]?.trim() || "",
    style_surface: block.match(/- style_surface:\s*(.+)/)?.[1]?.trim() || "",
    runtime_entry_surface: block.match(/- runtime_entry_surface:\s*(.+)/)?.[1]?.trim() || "",
  };
}

function parseBrowserScaffold(markdown) {
  const block = extractSection(markdown, "Browser Scaffold");

  return {
    html_entry: block.match(/- html_entry:\s*(.+)/)?.[1]?.trim() || "",
    dom_mount_entry: block.match(/- dom_mount_entry:\s*(.+)/)?.[1]?.trim() || "",
    mount_target: block.match(/- mount_target:\s*(.+)/)?.[1]?.trim() || "",
    scaffold_strategy: block.match(/- scaffold_strategy:\s*(.+)/)?.[1]?.trim() || "",
  };
}

function parseCapabilityDependencyItem(block) {
  return {
    capability: block.match(/- capability:\s*(.+)/)?.[1]?.trim() || "",
    status: block.match(/\s+- status:\s*(.+)/)?.[1]?.trim() || "",
    rationale: block.match(/\s+- rationale:\s*(.+)/)?.[1]?.trim() || "",
    required_contracts: parseListBlock(block.match(/\s+- required_contracts:\s*([\s\S]*?)(?:\r?\n\s+- existing_surfaces:|$)/)?.[1] || ""),
    existing_surfaces: parseListBlock(block.match(/\s+- existing_surfaces:\s*([\s\S]*?)(?:\r?\n\s+- prerequisite_operations:|$)/)?.[1] || ""),
    prerequisite_operations: parseListBlock(block.match(/\s+- prerequisite_operations:\s*([\s\S]*?)(?:\r?\n\s+- plan_action:|$)/)?.[1] || ""),
    plan_action: block.match(/\s+- plan_action:\s*(.+)/)?.[1]?.trim() || "",
  };
}

function parseCapabilityDependencies(markdown) {
  const block = extractSection(markdown, "Capability Dependencies");

  if (!block) return [];

  return block
    .split(/\r?\n(?=- capability:)/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => parseCapabilityDependencyItem(item))
    .filter(item => item.capability);
}

function parsePipeList(block) {
  if (!block) return [];

  return block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function parseCsvValue(value) {
  if (!value || /^none$/i.test(value)) return [];

  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parsePipeFields(line) {
  return line
    .split("|")
    .map(part => part.trim())
    .filter(Boolean);
}

function parseCrossFileContracts(markdown) {
  const block = extractSection(markdown, "Cross-File Contracts");
  const childComponentsBlock = block.match(/- child_components:\s*([\s\S]*?)(?:\r?\n- prop_contracts:|$)/)?.[1] || "";
  const propContractsBlock = block.match(/- prop_contracts:\s*([\s\S]*?)$/)?.[1] || "";

  const childComponents = parsePipeList(childComponentsBlock).map(line => {
    const fields = parsePipeFields(line);
    const filePath = fields[0] || "";
    const fieldMap = Object.fromEntries(
      fields.slice(1).map(field => {
        const [key, ...rest] = field.split("=");
        return [String(key || "").trim(), rest.join("=").trim()];
      })
    );

    return {
      file_path: filePath,
      export_name: fieldMap.export || "",
      class_hooks: parseCsvValue(fieldMap.hooks),
      props: parseCsvValue(fieldMap.props),
    };
  }).filter(item => item.file_path);

  const propContracts = parsePipeList(propContractsBlock).map(line => {
    const fieldMap = Object.fromEntries(
      parsePipeFields(line).map(field => {
        const [key, ...rest] = field.split("=");
        return [String(key || "").trim(), rest.join("=").trim()];
      })
    );

    return {
      parent_file_path: fieldMap.parent || "",
      child_symbol: fieldMap.child || "",
      props: parseCsvValue(fieldMap.props),
    };
  }).filter(item => item.parent_file_path && item.child_symbol);

  return {
    surface_family: block.match(/- surface_family:\s*(.+)/)?.[1]?.trim() || "",
    style_owner: block.match(/- style_owner:\s*(.+)/)?.[1]?.trim() || "",
    render_uses_style_surface: block.match(/- render_uses_style_surface:\s*(.+)/)?.[1]?.trim() || "",
    child_components: childComponents,
    prop_contracts: propContracts,
  };
}

function parseWorkflowContracts(markdown) {
  const block = extractSection(markdown, "Workflow Contracts");

  return {
    workflow_mode: block.match(/- workflow_mode:\s*(.+)/)?.[1]?.trim() || "",
    action_owner: block.match(/- action_owner:\s*(.+)/)?.[1]?.trim() || "",
    request_boundary: block.match(/- request_boundary:\s*(.+)/)?.[1]?.trim() || "",
    response_boundary: block.match(/- response_boundary:\s*(.+)/)?.[1]?.trim() || "",
    state_owner: block.match(/- state_owner:\s*(.+)/)?.[1]?.trim() || "",
    server_authority_boundary: block.match(/- server_authority_boundary:\s*(.+)/)?.[1]?.trim() || "",
    success_surface: block.match(/- success_surface:\s*(.+)/)?.[1]?.trim() || "",
    failure_surface: block.match(/- failure_surface:\s*(.+)/)?.[1]?.trim() || "",
  };
}

export function parseImplementationPlanMarkdown(markdown) {
  const feature = extractSection(markdown, "Feature");
  const goal = extractSection(markdown, "Goal");
  const deliverySurfaces = parseDeliverySurfaces(markdown);
  const browserScaffold = parseBrowserScaffold(markdown);
  const capabilityDependencies = parseCapabilityDependencies(markdown);
  const crossFileContracts = parseCrossFileContracts(markdown);
  const workflowContracts = parseWorkflowContracts(markdown);
  const dependencyReasoning = extractSection(markdown, "Dependency reasoning");
  const touchedSystemAreas = parseListBlock(extractSection(markdown, "Touched system areas"));
  const riskPoints = parseListBlock(extractSection(markdown, "Risk points"));
  const verificationChecklist = parseListBlock(extractSection(markdown, "Verification checklist"));
  const notes = parseListBlock(extractSection(markdown, "Notes"));

  const parsedOperations = [...markdown.matchAll(/### Cycle (\d+)([\s\S]*?)(?=### Cycle \d+|$)/g)]
    .map(match => {
      const cycle = Number(match[1]);
      const block = match[2];
      const filePath = extractSingleField(block, "file", cycle);
      const operationType = extractSingleField(block, "type", cycle);
      const purpose = extractSingleField(block, "purpose", cycle);
      const dependsRaw = block.match(/- depends_on:\s*([\s\S]*?)(?:\r?\n\r?\n|$)/)?.[1] || "";
      const dependsOn = parseDependencies(dependsRaw);

      if (!filePath || !operationType) return null;

      return {
        cycle,
        operation_key: formatOperationKey(cycle),
        file_path: filePath,
        operation_type: operationType,
        purpose: purpose || "",
        depends_on_refs: dependsOn,
      };
    })
    .filter(Boolean);

  const operations = parsedOperations.map((operation, index) => {
    const resolvedDependsOn = (operation.depends_on_refs || []).map(depRef => {
      const matchingPrior = parsedOperations
        .slice(0, index)
        .filter(candidate => `${candidate.file_path}::${candidate.operation_type}` === depRef);

      if (matchingPrior.length === 0) {
        return depRef;
      }

      return matchingPrior[matchingPrior.length - 1].operation_key;
    });

    return {
      cycle: operation.cycle,
      operation_key: operation.operation_key,
      file_path: operation.file_path,
      operation_type: operation.operation_type,
      purpose: operation.purpose,
      depends_on: resolvedDependsOn,
      legacy_ref: `${operation.file_path}::${operation.operation_type}`,
    };
  });

  const operationsByKey = new Map(operations.map(operation => [operation.operation_key, operation]));
  const knownOperationKeys = new Set(operations.map(operation => operation.operation_key));
  const danglingDependencies = operations.flatMap(operation =>
    (operation.depends_on || [])
      .filter(dep => !knownOperationKeys.has(dep))
      .map(dep => `${operation.operation_key} -> ${dep}`)
  );

  if (danglingDependencies.length > 0) {
    throw new Error(`PLAN_INVALID\n${danglingDependencies.map(item => `- Unknown dependency reference ${item}`).join("\n")}`);
  }

  const enrichedOperations = operations.map(operation => ({
    ...operation,
    semantic_requirements: inferSemanticRequirements(operation, operationsByKey),
  }));

  return {
    feature,
    goal,
    delivery_surfaces: deliverySurfaces,
    browser_scaffold: browserScaffold,
    capability_dependencies: capabilityDependencies,
    cross_file_contracts: crossFileContracts,
    workflow_contracts: workflowContracts,
    dependency_reasoning: dependencyReasoning,
    touched_system_areas: touchedSystemAreas,
    risk_points: riskPoints,
    verification_checklist: verificationChecklist,
    notes,
    operations: enrichedOperations,
  };
}

export function syncImplementationPlanJson(aiOsRoot) {
  const paths = getRuntimePaths(aiOsRoot);
  const markdown = safeRead(paths.implementationPlanMd);
  const parsed = parseImplementationPlanMarkdown(markdown);
  const featuresList = safeRead(paths.featuresListMd);
  const featureRequest = safeRead(paths.featureRequestMd);
  const resolvedProjectRoot = resolveProjectRoot(aiOsRoot);
  const projectRoot = resolvedProjectRoot.ok ? resolvedProjectRoot.projectRoot : path.dirname(aiOsRoot);
  const decisionEvaluation = evaluatePlanDecisions(parsed, {
    aiOsRoot,
    projectRoot,
  });
  const traceabilityEvaluation = evaluatePlanTraceability({
    featuresListMarkdown: featuresList,
    featureRequestMarkdown: featureRequest,
    planData: parsed,
  });
  writeJson(paths.planDecisionEvaluationJson, decisionEvaluation);
  writeJson(paths.planTraceabilityEvaluationJson, traceabilityEvaluation);
  assertPlanDecisions(parsed, {
    aiOsRoot,
    projectRoot,
  });
  assertPlanTraceability({
    featuresListMarkdown: featuresList,
    featureRequestMarkdown: featureRequest,
    planData: parsed,
  });
  assertPlanCompleteness(featureRequest, parsed, {
    projectRoot,
  });
  writeJson(paths.implementationPlanJson, parsed);
  return parsed;
}

function renderScalarList(values, fallback = "none") {
  if (!values || values.length === 0) {
    return [`- ${fallback}`];
  }

  return values.map(value => `- ${value}`);
}

function renderIndentedList(values, fallback = "none", indent = "  ") {
  if (!values || values.length === 0) {
    return [`${indent}- ${fallback}`];
  }

  return values.map(value => `${indent}- ${value}`);
}

function renderChildComponents(childComponents) {
  if (!childComponents || childComponents.length === 0) {
    return ["  - none | export=none | hooks=none | props=none"];
  }

  return childComponents.map(child => {
    const hooks = (child.class_hooks || []).join(",") || "none";
    const props = (child.props || []).join(",") || "none";
    return `  - ${child.file_path} | export=${child.export_name || "none"} | hooks=${hooks} | props=${props}`;
  });
}

function renderPropContracts(propContracts) {
  if (!propContracts || propContracts.length === 0) {
    return ["  - parent=none | child=none | props=none"];
  }

  return propContracts.map(contract => {
    const props = (contract.props || []).join(",") || "none";
    return `  - parent=${contract.parent_file_path || "none"} | child=${contract.child_symbol || "none"} | props=${props}`;
  });
}

function renderCapabilityDependencies(capabilityDependencies) {
  if (!capabilityDependencies || capabilityDependencies.length === 0) {
    return [
      "- capability: none",
      "  - status: missing",
      "  - rationale: none",
      "  - required_contracts:",
      "    - none",
      "  - existing_surfaces:",
      "    - none",
      "  - prerequisite_operations:",
      "    - none",
      "  - plan_action: reuse_existing",
    ];
  }

  const lines = [];

  for (const dependency of capabilityDependencies) {
    lines.push(
      `- capability: ${dependency.capability || "none"}`,
      `  - status: ${dependency.status || "missing"}`,
      `  - rationale: ${dependency.rationale || "none"}`,
      "  - required_contracts:",
      ...renderIndentedList(dependency.required_contracts, "none", "    "),
      "  - existing_surfaces:",
      ...renderIndentedList(dependency.existing_surfaces, "none", "    "),
      "  - prerequisite_operations:",
      ...renderIndentedList(dependency.prerequisite_operations, "none", "    "),
      `  - plan_action: ${dependency.plan_action || "reuse_existing"}`
    );
  }

  return lines;
}

export function renderImplementationPlanMarkdown(planData) {
  const operationsByKey = new Map((planData.operations || []).map(operation => [operation.operation_key, operation]));
  const deliverySurfaces = planData.delivery_surfaces || {};
  const browserScaffold = planData.browser_scaffold || {};
  const crossFileContracts = planData.cross_file_contracts || {};
  const workflowContracts = planData.workflow_contracts || {};

  const lines = [
    "# Implementation Plan",
    "",
    "## Feature",
    planData.feature || "<name>",
    "",
    "## Goal",
    planData.goal || "<1-2 lines describing what this plan achieves>",
    "",
    "---",
    "",
    "## Delivery Surfaces",
    `- render_surface: ${deliverySurfaces.render_surface || "not_required"}`,
    `- style_surface: ${deliverySurfaces.style_surface || "not_required"}`,
    `- runtime_entry_surface: ${deliverySurfaces.runtime_entry_surface || "not_required"}`,
    "",
    "---",
    "",
    "## Browser Scaffold",
    `- html_entry: ${browserScaffold.html_entry || "not_required"}`,
    `- dom_mount_entry: ${browserScaffold.dom_mount_entry || "not_required"}`,
    `- mount_target: ${browserScaffold.mount_target || "not_required"}`,
    `- scaffold_strategy: ${browserScaffold.scaffold_strategy || "not_required"}`,
    "",
    "---",
    "",
    "## Capability Dependencies",
    ...renderCapabilityDependencies(planData.capability_dependencies),
    "",
    "---",
    "",
    "## Cross-File Contracts",
    `- surface_family: ${crossFileContracts.surface_family || "none"}`,
    `- style_owner: ${crossFileContracts.style_owner || "none"}`,
    `- render_uses_style_surface: ${crossFileContracts.render_uses_style_surface || "not_required"}`,
    "- child_components:",
    ...renderChildComponents(crossFileContracts.child_components),
    "- prop_contracts:",
    ...renderPropContracts(crossFileContracts.prop_contracts),
    "",
    "---",
    "",
    "## Workflow Contracts",
    `- workflow_mode: ${workflowContracts.workflow_mode || "projection_only"}`,
    `- action_owner: ${workflowContracts.action_owner || "none"}`,
    `- request_boundary: ${workflowContracts.request_boundary || "not_required"}`,
    `- response_boundary: ${workflowContracts.response_boundary || "not_required"}`,
    `- state_owner: ${workflowContracts.state_owner || "none"}`,
    `- server_authority_boundary: ${workflowContracts.server_authority_boundary || "not_required"}`,
    `- success_surface: ${workflowContracts.success_surface || "not_required"}`,
    `- failure_surface: ${workflowContracts.failure_surface || "not_required"}`,
    "",
    "---",
    "",
    "## Sequence of cycles",
    "",
  ];

  for (const operation of planData.operations || []) {
    const dependencyRefs = (operation.depends_on || [])
      .map(dep => operationsByKey.get(dep))
      .filter(Boolean)
      .map(dep => `${dep.file_path}::${dep.operation_type}`);

    lines.push(
      `### Cycle ${operation.cycle}`,
      `- file: ${operation.file_path}`,
      `- type: ${operation.operation_type}`,
      `- purpose: ${operation.purpose || "none"}`,
      "- depends_on:",
      ...renderScalarList(dependencyRefs, "none"),
      ""
    );
  }

  lines.push(
    "---",
    "",
    "## Dependency reasoning",
    planData.dependency_reasoning || "none",
    "",
    "---",
    "",
    "## Touched system areas",
    ...renderScalarList(planData.touched_system_areas, "none"),
    "",
    "---",
    "",
    "## Risk points",
    ...renderScalarList(planData.risk_points, "none"),
    "",
    "---",
    "",
    "## Verification checklist",
    ...renderScalarList(planData.verification_checklist, "none"),
    "",
    "---",
    "",
    "## Notes",
    ...renderScalarList(planData.notes, "none"),
    ""
  );

  return lines.join("\n");
}

function normalizeRequiredFlag(value) {
  return String(value || "").toLowerCase().includes("required");
}

function parseInterfaceLines(block, sectionName) {
  const match = block.match(new RegExp(`## ${sectionName}[\\s\\S]*?(?:\\*|-) inputs:[\\s\\S]*?(?:\\r?\\n(?:\\*|-) outputs:|\\r?\\n---|$)`, "i"));
  return match ? match[0] : "";
}

function parseInputEntries(block) {
  const lines = block
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^[-*]/.test(line))
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);

  return lines.map(line => {
    const match = line.match(/^(.+?)\s*\((required|optional)\)$/i);
    if (match) {
      return {
        name: match[1].trim(),
        required: normalizeRequiredFlag(match[2]),
      };
    }

    return {
      name: line,
      required: false,
    };
  });
}

function parseScalarField(block, fieldName) {
  const match = block.match(new RegExp(`(?:\\*|-)\\s*${fieldName}:\\s*(.*)`));
  return match ? match[1].trim() : "";
}

function parseCsvField(block, fieldName) {
  const value = parseScalarField(block, fieldName);
  if (!value || value === "none") return [];
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseFileRegistryMarkdown(markdown) {
  const files = {};
  const entryMatches = [...markdown.matchAll(/### file:\s*(.+)\r?\n([\s\S]*?)(?=### file:|$)/g)];

  for (const match of entryMatches) {
    const filePath = match[1].trim();
    const block = match[2];

    if (filePath.includes("<relative_path>")) continue;

    const inputsSection = block.match(/(?:\*|-)\s*inputs:\s*([\s\S]*?)(?:\r?\n(?:\*|-)\s*outputs:|\r?\n---|$)/i)?.[1] || "";
    const outputsSection = block.match(/(?:\*|-)\s*outputs:\s*([\s\S]*?)(?:\r?\n---|\r?\n## |\r?\n(?:\*|-)\s*allowed_symbols:|$)/i)?.[1] || "";
    const allowedSection = block.match(/(?:\*|-)\s*allowed_symbols:\s*([\s\S]*?)(?:\r?\n(?:\*|-)\s*forbidden_symbols:|\r?\n---|$)/i)?.[1] || "";
    const forbiddenSection = block.match(/(?:\*|-)\s*forbidden_symbols:\s*([\s\S]*?)(?:\r?\n---|$)/i)?.[1] || "";

    files[filePath] = {
      responsibility: parseScalarField(block, "responsibility"),
      imports: parseCsvField(block, "imports"),
      exports: parseCsvField(block, "exports"),
      reads: parseCsvField(block, "reads"),
      writes: parseCsvField(block, "writes"),
      dependencies: parseCsvField(block, "dependencies"),
      interface: {
        inputs: parseInputEntries(inputsSection),
        outputs: parseListBlock(outputsSection),
      },
      symbols: {
        allowed: parseListBlock(allowedSection),
        forbidden: parseListBlock(forbiddenSection),
      },
      contracts: {
        surface_family: parseScalarField(block, "surface_family"),
        style_owner: parseScalarField(block, "style_owner"),
        class_hooks: parseCsvField(block, "class_hooks"),
        prop_inputs: parseCsvField(block, "prop_inputs"),
        workflow_mode: parseScalarField(block, "workflow_mode"),
        action_owner: parseScalarField(block, "action_owner"),
        request_boundary: parseScalarField(block, "request_boundary"),
        response_boundary: parseScalarField(block, "response_boundary"),
        state_owner: parseScalarField(block, "state_owner"),
        server_authority_boundary: parseScalarField(block, "server_authority_boundary"),
        allowed_callers: parseCsvField(block, "allowed_callers"),
      },
      history: [],
    };
  }

  return {
    version: 1,
    files,
  };
}

export function renderFileRegistryMarkdown(registry) {
  const lines = [
    "# File Registry",
    "",
    "## Purpose",
    "",
    "Defines evolving interface contracts for files generated by the system.",
    "",
    "This registry is:",
    "",
    "* bootstrapped automatically by the system",
    "* refined over time through validation",
    "* used to enforce consistency across files",
    "",
    "---",
    "",
    "## System Behavior",
    "",
    "* If a file has no entry:",
    "  -> system creates one (bootstrap)",
    "",
    "* If a file has an entry:",
    "  -> system validates against it (strict mode)",
    "",
    "* If mismatch occurs:",
    "  -> pipeline fails",
    "",
    "---",
    "",
    "## Entry Structure",
    "",
    "### file: <relative_path>",
    "",
    "* responsibility:",
    "* imports:",
    "* exports:",
    "* reads:",
    "* writes:",
    "* key_symbols:",
    "* dependencies:",
    "* surface_family:",
    "* style_owner:",
    "* class_hooks:",
    "* prop_inputs:",
    "* workflow_mode:",
    "* action_owner:",
    "* request_boundary:",
    "* response_boundary:",
    "* state_owner:",
    "* server_authority_boundary:",
    "* allowed_callers:",
    "",
    "---",
    "",
    "## Interface Contract",
    "",
    "* inputs:",
    "",
    "  * <name> (required|optional)",
    "",
    "* outputs:",
    "",
    "  * <event or effect>",
    "",
    "---",
    "",
    "## Symbol Rules",
    "",
    "* allowed_symbols:",
    "",
    "  * <symbol>",
    "",
    "* forbidden_symbols:",
    "",
    "  * <symbol>",
    "",
    "---",
    "",
    "---",
    "",
    "## Notes",
    "",
    "* This file is append-only (by system)",
    "* Entries are created automatically",
    "* You should NOT manually edit entries during normal operation",
    "* Over time, this becomes the system's type memory",
    "",
    "---",
  ];

  for (const [filePath, entry] of Object.entries(registry.files || {})) {
    const inputLines = (entry.interface?.inputs || []).length
      ? entry.interface.inputs.map(input => `  * ${input.name} (${input.required ? "required" : "optional"})`)
      : ["  * none"];

    const outputLines = (entry.interface?.outputs || []).length
      ? entry.interface.outputs.map(output => `  * ${output}`)
      : ["  * none"];

    const allowedLines = (entry.symbols?.allowed || []).length
      ? entry.symbols.allowed.map(symbol => `  * ${symbol}`)
      : ["  * none"];

    const forbiddenLines = (entry.symbols?.forbidden || []).length
      ? entry.symbols.forbidden.map(symbol => `  * ${symbol}`)
      : ["  * none"];

    lines.push(
      "",
      `### file: ${filePath}`,
      "",
      `* responsibility: ${entry.responsibility || "none"}`,
      `* imports: ${(entry.imports || []).join(", ") || "none"}`,
      `* exports: ${(entry.exports || []).join(", ") || "none"}`,
      `* reads: ${(entry.reads || []).join(", ") || "none"}`,
      `* writes: ${(entry.writes || []).join(", ") || "none"}`,
      `* key_symbols: ${(entry.symbols?.allowed || []).join(", ") || "none"}`,
      `* dependencies: ${(entry.dependencies || []).join(", ") || "none"}`,
      `* surface_family: ${entry.contracts?.surface_family || "none"}`,
      `* style_owner: ${entry.contracts?.style_owner || "none"}`,
      `* class_hooks: ${(entry.contracts?.class_hooks || []).join(", ") || "none"}`,
      `* prop_inputs: ${(entry.contracts?.prop_inputs || []).join(", ") || "none"}`,
      `* workflow_mode: ${entry.contracts?.workflow_mode || "none"}`,
      `* action_owner: ${entry.contracts?.action_owner || "none"}`,
      `* request_boundary: ${entry.contracts?.request_boundary || "none"}`,
      `* response_boundary: ${entry.contracts?.response_boundary || "none"}`,
      `* state_owner: ${entry.contracts?.state_owner || "none"}`,
      `* server_authority_boundary: ${entry.contracts?.server_authority_boundary || "none"}`,
      `* allowed_callers: ${(entry.contracts?.allowed_callers || []).join(", ") || "none"}`,
      "",
      "---",
      "",
      "## Interface Contract",
      "",
      "* inputs:",
      "",
      ...inputLines,
      "",
      "* outputs:",
      "",
      ...outputLines,
      "",
      "---",
      "",
      "## Symbol Rules",
      "",
      "* allowed_symbols:",
      "",
      ...allowedLines,
      "",
      "* forbidden_symbols:",
      "",
      ...forbiddenLines,
      "",
      "---"
    );
  }

  return lines.join("\n") + "\n";
}

export function syncFileRegistryJson(aiOsRoot, options = {}) {
  const paths = getRuntimePaths(aiOsRoot);
  let registry = readJson(paths.fileRegistryJson, null);

  if (!registry || options.forceRebuild === true) {
    registry = parseFileRegistryMarkdown(safeRead(paths.fileRegistryMd));
    writeJson(paths.fileRegistryJson, registry);
  }

  fs.writeFileSync(paths.fileRegistryMd, renderFileRegistryMarkdown(registry), "utf-8");
  return registry;
}

export function buildTargetRequest(baseRequest, options = {}) {
  const registryEntry = options.registryEntry || null;
  const capabilityDependencies = selectRelevantCapabilityDependencies(baseRequest, options.capabilityDependencies || []);
  const crossFileContracts = selectRelevantCrossFileContracts(baseRequest, options.crossFileContracts || {});
  const workflowContracts = selectRelevantWorkflowContracts(baseRequest, options.workflowContracts || {});
  const browserScaffold = options.browserScaffold || {};
  const deliverySurfaces = options.deliverySurfaces || {};

  return {
    request_id: options.requestId || `req_${Date.now()}`,
    feature: options.feature || "",
    goal: options.goal || "",
    operation_key: baseRequest.operation_key || `${baseRequest.file_path}::${baseRequest.file_type}`,
    file_path: baseRequest.file_path,
    operation_type: baseRequest.file_type,
    planned_operation_type: baseRequest.planned_operation_type || baseRequest.file_type,
    effective_operation_type: baseRequest.effective_operation_type || baseRequest.file_type,
    purpose: baseRequest.purpose || "",
    dependencies: Array.isArray(baseRequest.dependencies) ? baseRequest.dependencies : [],
    required_interface: {
      inputs: registryEntry?.interface?.inputs || [],
      outputs: registryEntry?.interface?.outputs || [],
      allowed_symbols: registryEntry?.symbols?.allowed || [],
      forbidden_symbols: registryEntry?.symbols?.forbidden || [],
    },
    semantic_requirements: baseRequest.semantic_requirements || {
      must_import: [],
      must_use: [],
      must_not_use: [],
      must_preserve: [],
    },
    product_requirements: options.productRequirements?.product_standards || {},
    ui_pattern_requirements: options.productRequirements?.ui_patterns || {},
    styling_contract: options.productRequirements?.product_standards?.styling_contract || {},
    design_token_refs: {
      source_file: options.memoryRefs?.design_tokens_json || "",
      required_usage: Boolean(options.productRequirements?.design_tokens),
    },
    delivery_surfaces: deliverySurfaces,
    browser_scaffold: browserScaffold,
    capability_dependencies: capabilityDependencies,
    cross_file_contracts: crossFileContracts,
    workflow_contracts: workflowContracts,
    behavior_contract: options.behaviorContract || {
      required: false,
      status: "skipped",
      simulation_status: "not_required",
      trigger_reasons: [],
      artifact_paths: {},
      summary: {},
    },
    constraints: options.constraints || [
      "no global state mutation",
      "no new systems",
      "respect system architecture",
      "do not modify unrelated files",
      "stay within file scope",
    ],
    memory_refs: options.memoryRefs || {},
    feedback: options.feedback || null,
    generated_at: new Date().toISOString(),
  };
}

function selectRelevantCapabilityDependencies(baseRequest, dependencies) {
  const filePath = baseRequest.file_path || "";
  const operationRef = filePath && baseRequest.planned_operation_type
    ? `${filePath}::${baseRequest.planned_operation_type}`
    : "";

  return (dependencies || []).filter(dependency =>
    (dependency.required_contracts || []).includes(filePath) ||
    (dependency.prerequisite_operations || []).includes(operationRef)
  );
}

function selectRelevantCrossFileContracts(baseRequest, contracts) {
  const filePath = baseRequest.file_path || "";
  const mustUse = new Set(baseRequest.semantic_requirements?.must_use || []);
  const childComponents = contracts.child_components || [];
  const isStyleOwner = filePath === contracts.style_owner;
  const isRenderSurface = filePath === contracts.render_surface;
  const touchesIntegratedChildren = mustUse.size > 0;

  let relevantChildren = [];

  if (isStyleOwner) {
    relevantChildren = childComponents;
  } else if (touchesIntegratedChildren) {
    relevantChildren = childComponents.filter(child =>
      child.file_path === filePath || mustUse.has(child.export_name)
    );
  } else {
    relevantChildren = childComponents.filter(child => child.file_path === filePath);
  }

  const relevantSymbols = new Set(relevantChildren.map(child => child.export_name));
  const relevantPropContracts = (contracts.prop_contracts || []).filter(contract => {
    if (contract.parent_file_path === filePath) {
      return touchesIntegratedChildren ? mustUse.has(contract.child_symbol) : false;
    }

    return relevantSymbols.has(contract.child_symbol);
  });

  return {
    surface_family: contracts.surface_family || "",
    style_owner: contracts.style_owner || "",
    render_uses_style_surface: contracts.render_uses_style_surface || "",
    child_components: relevantChildren,
    prop_contracts: relevantPropContracts,
  };
}

function selectRelevantWorkflowContracts(baseRequest, contracts) {
  const filePath = baseRequest.file_path || "";
  const relevant = {
    workflow_mode: contracts.workflow_mode || "",
    action_owner: contracts.action_owner || "",
    request_boundary: contracts.request_boundary || "",
    response_boundary: contracts.response_boundary || "",
    state_owner: contracts.state_owner || "",
    server_authority_boundary: contracts.server_authority_boundary || "",
    success_surface: contracts.success_surface || "",
    failure_surface: contracts.failure_surface || "",
  };

  const relevantFiles = new Set([
    relevant.action_owner,
    relevant.request_boundary,
    relevant.response_boundary,
    relevant.state_owner,
    relevant.success_surface,
    relevant.failure_surface,
  ].filter(Boolean).filter(value => value !== "not_required"));

  if (relevantFiles.size === 0 || relevantFiles.has(filePath) || filePath.includes("/ui/")) {
    return relevant;
  }

  return {
    workflow_mode: relevant.workflow_mode,
    action_owner: "",
    request_boundary: "not_required",
    response_boundary: "not_required",
    state_owner: "",
    server_authority_boundary: relevant.server_authority_boundary,
    success_surface: "not_required",
    failure_surface: "not_required",
  };
}

export function renderTargetRequestMarkdown(request) {
  const lines = [
    "# TARGET FILE REQUEST",
    "",
    `- request_id: ${request.request_id}`,
    `- operation_key: ${request.operation_key}`,
    `- file_path: ${request.file_path}`,
    `- operation_type: ${request.operation_type}`,
    `- purpose: ${request.purpose || "none"}`,
    `- dependencies: ${(request.dependencies || []).join(", ") || "none"}`,
    "",
    "## Required Interface",
    "",
    `- inputs: ${(request.required_interface?.inputs || []).map(input => input.name || input).join(", ") || "none"}`,
    `- outputs: ${(request.required_interface?.outputs || []).join(", ") || "none"}`,
    `- allowed_symbols: ${(request.required_interface?.allowed_symbols || []).join(", ") || "none"}`,
    `- forbidden_symbols: ${(request.required_interface?.forbidden_symbols || []).join(", ") || "none"}`,
    "",
    "## Product Requirements",
    `- quality_level: ${request.product_requirements?.quality_level || "none"}`,
    `- tone: ${request.product_requirements?.preferred_tone || "none"}`,
    `- accessibility_baseline: ${request.product_requirements?.accessibility_baseline || "none"}`,
    `- button_hierarchy: ${request.ui_pattern_requirements?.button_hierarchy || "none"}`,
    `- token_source: ${request.design_token_refs?.source_file || "none"}`,
    `- styling_contract_mode: ${request.styling_contract?.mode || "none"}`,
    `- styling_hooks: ${request.styling_contract?.styling_hooks || "none"}`,
    `- token_usage_mode: ${request.styling_contract?.token_usage_mode || "none"}`,
    `- inline_styles: ${request.styling_contract?.inline_styles || "none"}`,
    `- local_token_objects: ${request.styling_contract?.local_token_objects || "none"}`,
    `- hardcoded_colors: ${request.styling_contract?.hardcoded_colors || "none"}`,
    "",
    "## Browser Scaffold",
    `- html_entry: ${request.browser_scaffold?.html_entry || "none"}`,
    `- dom_mount_entry: ${request.browser_scaffold?.dom_mount_entry || "none"}`,
    `- mount_target: ${request.browser_scaffold?.mount_target || "none"}`,
    `- scaffold_strategy: ${request.browser_scaffold?.scaffold_strategy || "none"}`,
    "",
    "## Capability Dependencies",
    `- capabilities: ${(request.capability_dependencies || []).map(item => `${item.capability}:${item.status}:${item.plan_action}`).join(", ") || "none"}`,
    `- required_contracts: ${(request.capability_dependencies || []).flatMap(item => item.required_contracts || []).join(", ") || "none"}`,
    `- prerequisite_operations: ${(request.capability_dependencies || []).flatMap(item => item.prerequisite_operations || []).join(", ") || "none"}`,
    "",
    "## Delivery Surfaces",
    `- render_surface: ${request.delivery_surfaces?.render_surface || "none"}`,
    `- style_surface: ${request.delivery_surfaces?.style_surface || "none"}`,
    `- runtime_entry_surface: ${request.delivery_surfaces?.runtime_entry_surface || "none"}`,
    "",
    "## Cross-File Contracts",
    `- surface_family: ${request.cross_file_contracts?.surface_family || "none"}`,
    `- style_owner: ${request.cross_file_contracts?.style_owner || "none"}`,
    `- render_uses_style_surface: ${request.cross_file_contracts?.render_uses_style_surface || "none"}`,
    `- child_components: ${(request.cross_file_contracts?.child_components || []).map(item => item.export_name || item.file_path).join(", ") || "none"}`,
    `- prop_contracts: ${(request.cross_file_contracts?.prop_contracts || []).map(item => `${item.child_symbol}:${(item.props || []).join("|") || "none"}`).join(", ") || "none"}`,
    "",
    "## Workflow Contracts",
    `- workflow_mode: ${request.workflow_contracts?.workflow_mode || "none"}`,
    `- action_owner: ${request.workflow_contracts?.action_owner || "none"}`,
    `- request_boundary: ${request.workflow_contracts?.request_boundary || "none"}`,
    `- response_boundary: ${request.workflow_contracts?.response_boundary || "none"}`,
    `- state_owner: ${request.workflow_contracts?.state_owner || "none"}`,
    `- server_authority_boundary: ${request.workflow_contracts?.server_authority_boundary || "none"}`,
    `- success_surface: ${request.workflow_contracts?.success_surface || "none"}`,
    `- failure_surface: ${request.workflow_contracts?.failure_surface || "none"}`,
    "",
    "## Behavior Contract",
    `- required: ${request.behavior_contract?.required ? "true" : "false"}`,
    `- status: ${request.behavior_contract?.status || "skipped"}`,
    `- simulation_status: ${request.behavior_contract?.simulation_status || "not_required"}`,
    `- trigger_reasons: ${(request.behavior_contract?.trigger_reasons || []).join(", ") || "none"}`,
    `- scenarios_md: ${request.behavior_contract?.artifact_paths?.scenarios_md || "none"}`,
    `- state_flow_md: ${request.behavior_contract?.artifact_paths?.state_flow_md || "none"}`,
    `- reconciliation_rule_md: ${request.behavior_contract?.artifact_paths?.reconciliation_rule_md || "none"}`,
    `- simulation_report_md: ${request.behavior_contract?.artifact_paths?.simulation_report_md || "none"}`,
    "",
    "## Constraints",
    ...(request.constraints || []).map(item => `- ${item}`),
    "",
    "## Feedback",
    request.feedback ? `- ${request.feedback.feedback_type || request.feedback.type}` : "- none",
    "",
    "## JSON Payload",
    "",
    "```json",
    JSON.stringify(request, null, 2),
    "```",
    "",
  ];

  return lines.join("\n");
}

export function writeTargetRequest(aiOsRoot, request) {
  const paths = getRuntimePaths(aiOsRoot);
  writeJson(paths.targetRequestJson, request);
  fs.writeFileSync(paths.targetRequestMd, renderTargetRequestMarkdown(request), "utf-8");
}

export function readTargetRequest(aiOsRoot) {
  const paths = getRuntimePaths(aiOsRoot);
  const jsonRequest = readJson(paths.targetRequestJson, null);

  if (jsonRequest) return jsonRequest;

  const markdown = safeRead(paths.targetRequestMd);
  const filePath = markdown.match(/file_path=(.+)/)?.[1]?.trim() || markdown.match(/- file_path:\s*(.+)/)?.[1]?.trim();
  const operationType = markdown.match(/file_type=(.+)/)?.[1]?.trim() || markdown.match(/- operation_type:\s*(.+)/)?.[1]?.trim();
  const purpose = markdown.match(/purpose=(.+)/)?.[1]?.trim() || markdown.match(/- purpose:\s*(.+)/)?.[1]?.trim();
  const dependencies = (markdown.match(/dependencies=(.+)/)?.[1] || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => item !== "none");

  if (!filePath) return null;

  const request = buildTargetRequest({
    file_path: filePath,
    file_type: operationType || "unknown",
    purpose: purpose || "",
    dependencies,
  });

  writeTargetRequest(aiOsRoot, request);
  return request;
}

function parseAppliedStateMarkdown(markdown) {
  const completedOperationKeys = [...markdown.matchAll(/- (.+::.+)/g)]
    .map(match => match[1].trim())
    .filter(Boolean);

  const history = [...markdown.matchAll(/- cycle_id:\s*(.+)\r?\n\s+file:\s*(.+)\r?\n\s+type:\s*(.+)(?:\r?\n\s+planned_type:\s*(.+))?(?:\r?\n\s+effective_type:\s*(.+))?\r?\n\s+timestamp:\s*(.+)/g)]
    .map(match => ({
      cycle_id: match[1].trim(),
      file_path: match[2].trim(),
      operation_type: match[3].trim(),
      timestamp: match[6].trim(),
      operation_key: `${match[2].trim()}::${match[3].trim()}`,
      status: "committed",
      planned_operation_type: match[4]?.trim() || match[3].trim(),
      effective_operation_type: match[5]?.trim() || match[3].trim(),
    }));

  return {
    last_sync: markdown.match(/## Last sync\r?\n(.+)/)?.[1]?.trim() || new Date().toISOString(),
    completed_operation_keys: [...new Set(completedOperationKeys)],
    history,
  };
}

export function renderAppliedStateMarkdown(appliedOperations, history) {
  const lines = [
    "# Applied State",
    "",
    "## Last sync",
    appliedOperations.last_sync || new Date().toISOString(),
    "",
    "---",
    "",
    "## Completed Operations",
    ...(appliedOperations.completed_operation_keys || []).map(key => `- ${key}`),
    "",
    "---",
    "",
    "## Execution History",
    "",
  ];

  for (const entry of history) {
    lines.push(
      `- cycle_id: ${entry.cycle_id}`,
      `  file: ${entry.file_path}`,
      `  type: ${entry.operation_type}`,
      `  planned_type: ${entry.planned_operation_type || entry.operation_type}`,
      `  effective_type: ${entry.effective_operation_type || entry.operation_type}`,
      `  timestamp: ${entry.timestamp}`
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function syncAppliedState(aiOsRoot) {
  const paths = getRuntimePaths(aiOsRoot);
  let appliedOperations = readJson(paths.appliedOperationsJson, null);
  let history = readJsonl(paths.executionHistoryJsonl);

  if (!appliedOperations) {
    const migrated = parseAppliedStateMarkdown(safeRead(paths.appliedStateMd));
    appliedOperations = {
      last_sync: migrated.last_sync,
      completed_operation_keys: migrated.completed_operation_keys,
    };

    if (!history.length && migrated.history.length) {
      history = migrated.history;
      writeJsonl(paths.executionHistoryJsonl, history);
    }

    writeJson(paths.appliedOperationsJson, appliedOperations);
  }

  fs.writeFileSync(
    paths.appliedStateMd,
    renderAppliedStateMarkdown(appliedOperations, history),
    "utf-8"
  );

  return { appliedOperations, history };
}
