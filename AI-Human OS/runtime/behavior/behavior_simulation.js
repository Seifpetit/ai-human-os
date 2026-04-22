import fs from "fs";
import path from "path";
import { createHash } from "crypto";

import { getModelConfig, runModel } from "../model/model_adapter.js";
import {
  getRuntimePaths,
  readJson,
  safeRead,
  writeJson,
} from "../planning/data_layer.js";

function sha256(value) {
  return createHash("sha256").update(value || "", "utf-8").digest("hex");
}

function stripMarkdownFences(value) {
  const trimmed = String(value || "").trim();
  const fenced = trimmed.match(/^```(?:md|markdown)?\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(content || "").trim() + "\n", "utf-8");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function parseListBlock(block) {
  return String(block || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^- /.test(line))
    .map(line => line.replace(/^- /, "").trim())
    .filter(Boolean);
}

function isNoneList(items) {
  return items.length === 0 || (items.length === 1 && /^none$/i.test(items[0]));
}

function getBehaviorFiles(aiOsRoot) {
  const behaviorDir = path.join(aiOsRoot, "2_behavior");

  return {
    scenarioPrompt: path.join(behaviorDir, "1. scenario_generation_prompt.txt"),
    stateFlowPrompt: path.join(behaviorDir, "2. state_flow_generation_prompt.txt"),
    reconciliationPrompt: path.join(behaviorDir, "3. reconciliation_rule_generation_prompt.txt"),
    simulationPrompt: path.join(behaviorDir, "4. simulation_prompt.txt"),
    scenariosTemplate: path.join(behaviorDir, "SCENARIOS.template.md"),
    stateFlowTemplate: path.join(behaviorDir, "STATE_FLOW.template.md"),
    reconciliationTemplate: path.join(behaviorDir, "RECONCILIATION_RULE.template.md"),
    simulationTemplate: path.join(behaviorDir, "SIMULATION_REPORT.template.md"),
  };
}

function relevantCapabilityDependencies(baseRequest, planData) {
  const filePath = baseRequest.file_path || "";
  const operationRef = `${filePath}::${baseRequest.planned_operation_type || baseRequest.file_type || ""}`;

  return (planData?.capability_dependencies || []).filter(dependency =>
    (dependency.required_contracts || []).includes(filePath) ||
    (dependency.prerequisite_operations || []).includes(operationRef)
  );
}

function evaluateBehaviorRequirement({ baseRequest, planData }) {
  const filePath = baseRequest.file_path || "";
  const purpose = normalizeText(baseRequest.purpose);
  const workflowContracts = planData?.workflow_contracts || {};
  const capabilities = relevantCapabilityDependencies(baseRequest, planData);
  const workflowFiles = new Set([
    workflowContracts.action_owner,
    workflowContracts.request_boundary,
    workflowContracts.response_boundary,
    workflowContracts.state_owner,
    workflowContracts.success_surface,
    workflowContracts.failure_surface,
  ].filter(Boolean).filter(value => normalizeText(value) !== "not_required"));
  const reasons = [];

  if (filePath.startsWith("server/")) {
    reasons.push("server surface");
  }

  if (filePath.startsWith("shared/")) {
    reasons.push("shared contract");
  }

  if (/\/(state|update|input|render)\//.test(filePath)) {
    reasons.push("stateful system surface");
  }

  if (workflowFiles.has(filePath) && normalizeText(workflowContracts.workflow_mode) !== "projection_only") {
    reasons.push("workflow boundary");
  }

  if (capabilities.length > 0) {
    reasons.push("capability dependency");
  }

  if (/\b(state|sync|server|request|response|authoritative|registry|session|command|result|transition|event)\b/.test(purpose)) {
    reasons.push("behavior-sensitive purpose");
  }

  return {
    required: reasons.length > 0,
    trigger_reasons: unique(reasons),
    capability_labels: unique(capabilities.map(item => item.capability).filter(Boolean)),
  };
}

function extractSection(markdown, heading) {
  const escaped = escapeRegExp(heading);
  return markdown.match(new RegExp(`## ${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`, "i"))?.[1]?.trim() || "";
}

function validateScenarios(markdown) {
  const blocks = [...String(markdown || "").matchAll(/##\s+Scenario\s+\d+[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n##\s+Scenario\s+\d+|$)/gi)];
  const issues = [];

  if (blocks.length < 2) {
    issues.push("SCENARIOS.md must contain at least 2 scenarios");
  }

  for (const [index, match] of blocks.entries()) {
    const steps = String(match[1] || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /^- step\b/i.test(line));

    if (steps.length < 3 || steps.length > 6) {
      issues.push(`Scenario ${index + 1} must contain between 3 and 6 concrete steps`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`BEHAVIOR_GENERATION_INVALID\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }
}

function validateStateFlow(markdown) {
  const sections = [...String(markdown || "").matchAll(/##\s+([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/g)];
  const issues = [];

  if (sections.length === 0) {
    issues.push("STATE_FLOW.md must contain at least one lifecycle section");
  }

  for (const [index, match] of sections.entries()) {
    const block = String(match[2] || "");
    const statesBlock = block.match(/states:\s*([\s\S]*?)(?:\r?\ntransitions:|$)/i)?.[1] || "";
    const transitionsBlock = block.match(/transitions:\s*([\s\S]*?)$/i)?.[1] || "";
    const states = parseListBlock(statesBlock);
    const transitions = parseListBlock(transitionsBlock);

    if (states.length === 0) {
      issues.push(`State flow section ${index + 1} must declare at least one state`);
    }

    if (transitions.length === 0) {
      issues.push(`State flow section ${index + 1} must declare at least one transition`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`BEHAVIOR_GENERATION_INVALID\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }
}

function validateReconciliationRule(markdown) {
  const corePolicy = extractSection(markdown, "Core Policy");
  const rules = parseListBlock(extractSection(markdown, "Rules"));
  const conflictCases = [...String(markdown || "").matchAll(/- case:\s*(.+)\r?\n\s*resolution:\s*(.+)/gi)];
  const issues = [];

  if (!corePolicy) {
    issues.push("RECONCILIATION_RULE.md must declare a concrete core policy");
  }

  if (rules.length === 0) {
    issues.push("RECONCILIATION_RULE.md must declare at least one deterministic rule");
  }

  if (conflictCases.length === 0) {
    issues.push("RECONCILIATION_RULE.md must declare at least one conflict case with a resolution");
  }

  if (issues.length > 0) {
    throw new Error(`BEHAVIOR_GENERATION_INVALID\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }
}

function extractListForLabel(block, label) {
  const escaped = escapeRegExp(label);
  const match = String(block || "").match(new RegExp(`${escaped}:\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n(?:issues|analysis|status):|$)`, "i"));
  return parseListBlock(match?.[1] || "");
}

function parseSimulationReport(markdown) {
  const scenarioMatches = [...String(markdown || "").matchAll(/##\s+Scenario\s+\d+[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n---\r?\n|\r?\n##\s+Summary|$)/gi)];
  const summaryBlock = extractSection(markdown, "Summary");

  const scenarios = scenarioMatches.map((match, index) => {
    const block = String(match[1] || "");
    const status = block.match(/status:\s*\r?\n-\s*(pass|fail)/i)?.[1]?.trim().toLowerCase() || "";
    return {
      scenario_index: index + 1,
      status,
      issues: extractListForLabel(block, "issues"),
      analysis: extractListForLabel(block, "analysis"),
    };
  });

  return {
    scenarios,
    summary: {
      critical_issues: parseListBlock(summaryBlock.match(/critical_issues:\s*([\s\S]*?)(?:\r?\nmissing_states:|$)/i)?.[1] || ""),
      missing_states: parseListBlock(summaryBlock.match(/missing_states:\s*([\s\S]*?)(?:\r?\nambiguous_rules:|$)/i)?.[1] || ""),
      ambiguous_rules: parseListBlock(summaryBlock.match(/ambiguous_rules:\s*([\s\S]*?)(?:\r?\nrecommended_actions:|$)/i)?.[1] || ""),
      recommended_actions: parseListBlock(summaryBlock.match(/recommended_actions:\s*([\s\S]*?)$/i)?.[1] || ""),
    },
  };
}

function validateSimulationReport(markdown) {
  const parsed = parseSimulationReport(markdown);
  const issues = [];

  if (parsed.scenarios.length === 0) {
    issues.push("SIMULATION_REPORT.md must contain at least one scenario result");
  }

  for (const scenario of parsed.scenarios) {
    if (!["pass", "fail"].includes(scenario.status)) {
      issues.push(`Simulation scenario ${scenario.scenario_index} must declare status pass or fail`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`BEHAVIOR_GENERATION_INVALID\n${issues.map(issue => `- ${issue}`).join("\n")}`);
  }

  return parsed;
}

function buildSimulationSummary(parsedReport) {
  const failedScenarios = parsedReport.scenarios.filter(item => item.status !== "pass");

  return {
    scenario_count: parsedReport.scenarios.length,
    failed_scenarios: failedScenarios.length,
    critical_issue_count: isNoneList(parsedReport.summary.critical_issues) ? 0 : parsedReport.summary.critical_issues.length,
    missing_state_count: isNoneList(parsedReport.summary.missing_states) ? 0 : parsedReport.summary.missing_states.length,
    ambiguous_rule_count: isNoneList(parsedReport.summary.ambiguous_rules) ? 0 : parsedReport.summary.ambiguous_rules.length,
    recommended_action_count: isNoneList(parsedReport.summary.recommended_actions) ? 0 : parsedReport.summary.recommended_actions.length,
  };
}

function assertSimulationPass(parsedReport) {
  const failedScenarios = parsedReport.scenarios.filter(item => item.status !== "pass");
  const failures = [];

  if (failedScenarios.length > 0) {
    failures.push(`${failedScenarios.length} simulated scenario(s) failed`);
  }

  if (!isNoneList(parsedReport.summary.critical_issues)) {
    failures.push(`critical issues remain: ${parsedReport.summary.critical_issues.join("; ")}`);
  }

  if (!isNoneList(parsedReport.summary.missing_states)) {
    failures.push(`missing states remain: ${parsedReport.summary.missing_states.join("; ")}`);
  }

  if (!isNoneList(parsedReport.summary.ambiguous_rules)) {
    failures.push(`ambiguous rules remain: ${parsedReport.summary.ambiguous_rules.join("; ")}`);
  }

  if (failures.length > 0) {
    throw new Error(`BEHAVIOR_SIMULATION_FAILED\n${failures.map(item => `- ${item}`).join("\n")}`);
  }
}

function generateMarkdown(prompt) {
  const result = runModel(prompt, getModelConfig());
  return stripMarkdownFences(result.raw_text || "");
}

function buildPrompt(basePrompt, currentFocus, fileEntries) {
  const parts = [
    basePrompt.trim(),
    "",
    "----------------------------------------",
    "CURRENT EXECUTION FOCUS",
    "----------------------------------------",
    "",
    currentFocus.trim(),
    "",
    "----------------------------------------",
    "FILE CONTENTS",
    "----------------------------------------",
    "",
  ];

  for (const entry of fileEntries) {
    parts.push(`${entry.label}:`, entry.content || "none", "");
  }

  return parts.join("\n");
}

function relativeArtifactPath(aiOsRoot, filePath) {
  return path.relative(path.dirname(aiOsRoot), filePath).replace(/\\/g, "/");
}

function buildBehaviorContract({
  aiOsRoot,
  feature,
  requirement,
  status,
  simulationStatus,
  planHash,
  summary,
}) {
  const paths = getRuntimePaths(aiOsRoot);

  return {
    required: requirement.required,
    status,
    simulation_status: simulationStatus,
    trigger_reasons: requirement.trigger_reasons,
    capability_labels: requirement.capability_labels,
    feature: feature || "",
    plan_hash: planHash,
    artifact_paths: {
      scenarios_md: relativeArtifactPath(aiOsRoot, paths.scenariosMd),
      state_flow_md: relativeArtifactPath(aiOsRoot, paths.stateFlowMd),
      reconciliation_rule_md: relativeArtifactPath(aiOsRoot, paths.reconciliationRuleMd),
      simulation_report_md: relativeArtifactPath(aiOsRoot, paths.simulationReportMd),
    },
    summary,
  };
}

export function ensureBehaviorSimulation({
  aiOsRoot,
  planData,
  featureRequestMarkdown,
  baseRequest,
}) {
  const paths = getRuntimePaths(aiOsRoot);
  const behaviorFiles = getBehaviorFiles(aiOsRoot);
  const requirement = evaluateBehaviorRequirement({ baseRequest, planData });

  if (!requirement.required) {
    return {
      contract: {
        required: false,
        status: "skipped",
        simulation_status: "not_required",
        trigger_reasons: [],
        capability_labels: [],
        feature: planData?.feature || "",
        plan_hash: "",
        artifact_paths: {},
        summary: {},
      },
      memoryRefs: {},
    };
  }

  const featureRequest = featureRequestMarkdown || safeRead(paths.featureRequestMd);
  const implementationPlan = safeRead(paths.implementationPlanMd);
  const feature = planData?.feature || "";
  const planHash = `sha256:${sha256(`${featureRequest}\n---\n${implementationPlan}`)}`;
  const existingState = readJson(paths.behaviorStateJson, null);
  const focusLines = [
    `- feature: ${feature || "none"}`,
    `- operation_key: ${baseRequest.operation_key || "none"}`,
    `- file_path: ${baseRequest.file_path || "none"}`,
    `- planned_operation_type: ${baseRequest.planned_operation_type || baseRequest.file_type || "none"}`,
    `- purpose: ${baseRequest.purpose || "none"}`,
    `- behavior trigger reasons: ${requirement.trigger_reasons.join(", ") || "none"}`,
    `- relevant capability labels: ${requirement.capability_labels.join(", ") || "none"}`,
  ].join("\n");

  const artifactExists =
    fs.existsSync(paths.scenariosMd) &&
    fs.existsSync(paths.stateFlowMd) &&
    fs.existsSync(paths.reconciliationRuleMd) &&
    fs.existsSync(paths.simulationReportMd);

  if (
    existingState?.feature === feature &&
    existingState?.plan_hash === planHash &&
    existingState?.simulation_status === "pass" &&
    artifactExists
  ) {
    const parsedReport = validateSimulationReport(safeRead(paths.simulationReportMd));
    assertSimulationPass(parsedReport);

    return {
      contract: buildBehaviorContract({
        aiOsRoot,
        feature,
        requirement,
        status: "reused_existing",
        simulationStatus: "pass",
        planHash,
        summary: buildSimulationSummary(parsedReport),
      }),
      memoryRefs: {
        scenarios_md: paths.scenariosMd,
        state_flow_md: paths.stateFlowMd,
        reconciliation_rule_md: paths.reconciliationRuleMd,
        simulation_report_md: paths.simulationReportMd,
      },
    };
  }

  const projectContext = safeRead(paths.projectContextMd);
  const systemRegistry = safeRead(paths.systemRegistryMd);

  const scenarios = generateMarkdown(buildPrompt(
    safeRead(behaviorFiles.scenarioPrompt),
    focusLines,
    [
      { label: "PROJECT_CONTEXT.md", content: projectContext },
      { label: "SYSTEM_REGISTRY.md", content: systemRegistry },
      { label: "FEATURE_REQUEST.md", content: featureRequest },
      { label: "IMPLEMENTATION_PLAN.md", content: implementationPlan },
      { label: "SCENARIOS.md (TEMPLATE)", content: safeRead(behaviorFiles.scenariosTemplate) },
    ]
  ));
  writeText(paths.scenariosMd, scenarios);
  validateScenarios(scenarios);

  const stateFlow = generateMarkdown(buildPrompt(
    safeRead(behaviorFiles.stateFlowPrompt),
    focusLines,
    [
      { label: "PROJECT_CONTEXT.md", content: projectContext },
      { label: "SYSTEM_REGISTRY.md", content: systemRegistry },
      { label: "FEATURE_REQUEST.md", content: featureRequest },
      { label: "SCENARIOS.md", content: scenarios },
      { label: "STATE_FLOW.md (TEMPLATE)", content: safeRead(behaviorFiles.stateFlowTemplate) },
    ]
  ));
  writeText(paths.stateFlowMd, stateFlow);
  validateStateFlow(stateFlow);

  const reconciliationRule = generateMarkdown(buildPrompt(
    safeRead(behaviorFiles.reconciliationPrompt),
    focusLines,
    [
      { label: "PROJECT_CONTEXT.md", content: projectContext },
      { label: "SYSTEM_REGISTRY.md", content: systemRegistry },
      { label: "FEATURE_REQUEST.md", content: featureRequest },
      { label: "SCENARIOS.md", content: scenarios },
      { label: "STATE_FLOW.md", content: stateFlow },
      { label: "RECONCILIATION_RULE.md (TEMPLATE)", content: safeRead(behaviorFiles.reconciliationTemplate) },
    ]
  ));
  writeText(paths.reconciliationRuleMd, reconciliationRule);
  validateReconciliationRule(reconciliationRule);

  const simulationReport = generateMarkdown(buildPrompt(
    safeRead(behaviorFiles.simulationPrompt),
    focusLines,
    [
      { label: "PROJECT_CONTEXT.md", content: projectContext },
      { label: "SYSTEM_REGISTRY.md", content: systemRegistry },
      { label: "IMPLEMENTATION_PLAN.md", content: implementationPlan },
      { label: "SCENARIOS.md", content: scenarios },
      { label: "STATE_FLOW.md", content: stateFlow },
      { label: "RECONCILIATION_RULE.md", content: reconciliationRule },
      { label: "SIMULATION_REPORT.md (TEMPLATE)", content: safeRead(behaviorFiles.simulationTemplate) },
    ]
  ));
  writeText(paths.simulationReportMd, simulationReport);
  const parsedReport = validateSimulationReport(simulationReport);
  const summary = buildSimulationSummary(parsedReport);
  let simulationStatus = "pass";

  try {
    assertSimulationPass(parsedReport);
  } catch (error) {
    simulationStatus = "fail";
    writeJson(paths.behaviorStateJson, {
      feature,
      plan_hash: planHash,
      simulation_status: simulationStatus,
      generated_at: new Date().toISOString(),
      trigger_reasons: requirement.trigger_reasons,
      summary,
      artifact_paths: {
        scenarios_md: paths.scenariosMd,
        state_flow_md: paths.stateFlowMd,
        reconciliation_rule_md: paths.reconciliationRuleMd,
        simulation_report_md: paths.simulationReportMd,
      },
    });
    throw error;
  }

  writeJson(paths.behaviorStateJson, {
    feature,
    plan_hash: planHash,
    simulation_status: simulationStatus,
    generated_at: new Date().toISOString(),
    trigger_reasons: requirement.trigger_reasons,
    summary,
    artifact_paths: {
      scenarios_md: paths.scenariosMd,
      state_flow_md: paths.stateFlowMd,
      reconciliation_rule_md: paths.reconciliationRuleMd,
      simulation_report_md: paths.simulationReportMd,
    },
  });

  return {
    contract: buildBehaviorContract({
      aiOsRoot,
      feature,
      requirement,
      status: "generated",
      simulationStatus: "pass",
      planHash,
      summary,
    }),
    memoryRefs: {
      scenarios_md: paths.scenariosMd,
      state_flow_md: paths.stateFlowMd,
      reconciliation_rule_md: paths.reconciliationRuleMd,
      simulation_report_md: paths.simulationReportMd,
    },
  };
}
