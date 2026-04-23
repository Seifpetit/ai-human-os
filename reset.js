import fs from "fs";
import path from "path";
import readline from "readline";
import { parseImplementationPlanMarkdown, syncImplementationPlanJson, getRuntimePaths } from "./AI-Human OS/runtime/planning/data_layer.js";
import { resolveProjectRoot } from "./AI-Human OS/runtime/workspace/workspace_config.js";

const ROOT = process.cwd();
const AI_OS_ROOT = path.join(ROOT, "AI-Human OS");
const RESOLVED_WORKSPACE = resolveProjectRoot(AI_OS_ROOT);
const WORKSPACE_ROOT = RESOLVED_WORKSPACE.ok ? RESOLVED_WORKSPACE.projectRoot : ROOT;
const RUNTIME_PATHS = getRuntimePaths(AI_OS_ROOT);
const DATA_DIR = RUNTIME_PATHS.dataDir;
const FEATURE_ARCHIVE_DIR = path.join(AI_OS_ROOT, "feature_archive");

const PATHS = {
  projectContext: path.join(AI_OS_ROOT, "memory/PROJECT_CONTEXT.md"),
  systemRegistry: path.join(AI_OS_ROOT, "memory/SYSTEM_REGISTRY.md"),
  fileRegistryMd: path.join(AI_OS_ROOT, "memory/FILE_REGISTRY.md"),
  productStandards: path.join(AI_OS_ROOT, "memory/PRODUCT_STANDARDS.md"),
  productStandardsTemplate: path.join(AI_OS_ROOT, "memory/PRODUCT_STANDARDS.template.md"),
  uiPatterns: path.join(AI_OS_ROOT, "memory/UI_PATTERNS.md"),
  uiPatternsTemplate: path.join(AI_OS_ROOT, "memory/UI_PATTERNS.template.md"),
  designTokens: path.join(AI_OS_ROOT, "memory/DESIGN_TOKENS.json"),
  designTokensTemplate: path.join(AI_OS_ROOT, "memory/DESIGN_TOKENS.template.json"),
  intentConfirmation: path.join(AI_OS_ROOT, "1_planning/INTENT_CONFIRMATION.md"),
  featuresList: path.join(AI_OS_ROOT, "1_planning/FEATURES_LIST.md"),
  featureRequest: path.join(AI_OS_ROOT, "1_planning/FEATURE_REQUEST.md"),
  featureRequestTemplate: path.join(AI_OS_ROOT, "1_planning/FEATURE_REQUEST.template.md"),
  executionConfirmation: path.join(AI_OS_ROOT, "1_planning/EXECUTION_CONFIRMATION.md"),
  implementationPlan: path.join(AI_OS_ROOT, "1_planning/IMPLEMENTATION_PLAN.md"),
  implementationPlanTemplate: path.join(AI_OS_ROOT, "1_planning/IMPLEMENTATION_PLAN.template.md"),
  scenarios: path.join(AI_OS_ROOT, "2_behavior/SCENARIOS.md"),
  scenariosTemplate: path.join(AI_OS_ROOT, "2_behavior/SCENARIOS.template.md"),
  stateFlow: path.join(AI_OS_ROOT, "2_behavior/STATE_FLOW.md"),
  stateFlowTemplate: path.join(AI_OS_ROOT, "2_behavior/STATE_FLOW.template.md"),
  reconciliationRule: path.join(AI_OS_ROOT, "2_behavior/RECONCILIATION_RULE.md"),
  reconciliationRuleTemplate: path.join(AI_OS_ROOT, "2_behavior/RECONCILIATION_RULE.template.md"),
  simulationReport: path.join(AI_OS_ROOT, "2_behavior/SIMULATION_REPORT.md"),
  simulationReportTemplate: path.join(AI_OS_ROOT, "2_behavior/SIMULATION_REPORT.template.md"),
  commitConfirmation: path.join(AI_OS_ROOT, "5_commit/COMMIT_CONFIRMATION.md"),
  appliedState: path.join(AI_OS_ROOT, "5_commit/APPLIED_STATE.md"),
  implementationPlanJson: RUNTIME_PATHS.implementationPlanJson,
  fileRegistryJson: RUNTIME_PATHS.fileRegistryJson,
  targetRequestJson: RUNTIME_PATHS.targetRequestJson,
  targetRequestMd: path.join(AI_OS_ROOT, "3_execution/TARGET_FILE_REQUEST.md"),
  verifyResultJson: RUNTIME_PATHS.verifyResultJson,
  executionResultJson: RUNTIME_PATHS.executionResultJson,
  appliedOperationsJson: RUNTIME_PATHS.appliedOperationsJson,
  executionHistoryJsonl: RUNTIME_PATHS.executionHistoryJsonl,
  cycleMetricsJsonl: RUNTIME_PATHS.cycleMetricsJsonl,
  runMetricsJson: RUNTIME_PATHS.runMetricsJson,
  consoleSnapshotsJson: RUNTIME_PATHS.consoleSnapshotsJson,
};

const PROJECT_CONTEXT_TEMPLATE = `# Project Context

## Purpose

This system exists to let a human and an AI build a codebase safely through controlled, one-file generation cycles.

The system is designed to:
- preserve architecture integrity
- externalize project memory
- keep decisions legible across sessions
- allow fresh AI instances to work from files instead of hidden conversation history

The system is not the product itself. It is the operating layer used to generate product files.

[ HUMAN PROJECT DESCRIPTION START ]
[ HUMAN PROJECT DESCRIPTION END ]

## Architecture Law

input -> update -> state -> render

## Folder Structure Template

project/
  server/
    core/
      input/
      update/
      state/
      render/
      domain/
      utils/
  client/
    ui/
      components/
      layout/
      feedback/
      overlay/
  shared/
  data/
  assets/
  docs/

## Core Invariants

- one responsibility per file
- explicit ownership
- mutation is controlled
- render does not create truth
- append-only registries
- server is sole source of truth
- client is read-only observer

## Philosophy

clarity
modularity
determinism
restraint
continuity
`;

const SYSTEM_REGISTRY_TEMPLATE = `# System Registry

## Global State Shape

state = {
  input: {},
  update: {},
  domain: {},
  ui: {},
  data: {},
  render: {},
  meta: {}
}

## Ownership Rules

- update owns mutation
- render is read-only
- input captures only
- domain is pure

## Read / Write Rules

- reads are explicit
- writes follow ownership
- no hidden side effects

## Architecture Invariants

- input -> update -> state -> render
- no reversed flow
- no mixed responsibilities

## Shared Symbols

- state
- commands
- derivations
- render projections

## Append Log
`;

const FILE_REGISTRY_TEMPLATE = `# File Registry

## Purpose

Defines evolving interface contracts for files generated by the system.

This registry is:

* bootstrapped automatically by the system
* refined over time through validation
* used to enforce consistency across files

---

## System Behavior

* If a file has no entry:
  -> system creates one (bootstrap)

* If a file has an entry:
  -> system validates against it (strict mode)

* If mismatch occurs:
  -> pipeline fails

---

## Entry Structure

### file: <relative_path>

* responsibility:
* imports:
* exports:
* reads:
* writes:
* key_symbols:
* dependencies:

---

## Interface Contract

* inputs:

  * <name> (required|optional)

* outputs:

  * <event or effect>

---

## Symbol Rules

* allowed_symbols:

  * <symbol>

* forbidden_symbols:

  * <symbol>

---

---

## Notes

* This file is append-only (by system)
* Entries are created automatically
* You should NOT manually edit entries during normal operation
* Over time, this becomes the system's type memory

---
`;

const FEATURES_LIST_TEMPLATE = `# FEATURES_LIST.md

---
`;

const APPLIED_STATE_TEMPLATE = `# Applied State

## Last sync
<timestamp>

---

## Completed Operations

---

## Execution History

`;

const EMPTY_FILE_REGISTRY_JSON = {
  version: 1,
  files: {}
};

const EMPTY_APPLIED_OPERATIONS_JSON = {
  last_sync: "<timestamp>",
  completed_operation_keys: []
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true, recursive: false });
  }
}

function parseCurrentFeatureName(markdown) {
  return markdown.match(/^## Name\r?\n(.+)$/m)?.[1]?.trim() || "";
}

function parseJsonl(filePath) {
  return safeRead(filePath)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseAppliedStateOperations(markdown) {
  return [...markdown.matchAll(/- (.+)::(.+)/g)].map(match => ({
    file_path: match[1].trim(),
    operation_type: match[2].trim(),
    operation_key: `${match[1].trim()}::${match[2].trim()}`
  }));
}

function getTrackedOperations() {
  const history = parseJsonl(PATHS.executionHistoryJsonl);
  if (history.length > 0) {
    return history.map(entry => ({
      file_path: entry.file_path,
      operation_type: entry.operation_type,
      operation_key: entry.operation_key
    }));
  }

  return parseAppliedStateOperations(safeRead(PATHS.appliedState));
}

function getPlannedNewFileOperations() {
  if (!fs.existsSync(PATHS.implementationPlan)) {
    return [];
  }

  const plan = syncImplementationPlanJson(AI_OS_ROOT);
  return (plan.operations || [])
    .filter(operation => operation.operation_type === "new_file" && operation.file_path)
    .map(operation => ({
      file_path: operation.file_path,
      operation_type: operation.operation_type,
      operation_key: operation.operation_key,
    }));
}

function getManifestNewFileOperations(manifestPath) {
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    : null;

  return (manifest?.new_file_paths || []).map(filePath => ({
    file_path: filePath,
    operation_type: "new_file",
    operation_key: `${filePath}::new_file`,
  }));
}

function getCurrentPlanData() {
  if (!fs.existsSync(PATHS.implementationPlan)) {
    return null;
  }

  try {
    return parseImplementationPlanMarkdown(safeRead(PATHS.implementationPlan));
  } catch {
    return null;
  }
}

function collectPreservedPathsFromPlan(planData) {
  if (!planData) return new Set();

  const preserved = new Set();
  const plannedNewFiles = new Set(
    (planData.operations || [])
      .filter(operation => operation.operation_type === "new_file")
      .map(operation => operation.file_path)
      .filter(Boolean)
  );

  function preserveIfReusable(filePath) {
    if (!filePath || filePath === "none" || filePath === "not_required") return;
    if (plannedNewFiles.has(filePath)) return;
    preserved.add(filePath);
  }

  const browserScaffold = planData.browser_scaffold || {};
  const deliverySurfaces = planData.delivery_surfaces || {};
  const crossFileContracts = planData.cross_file_contracts || {};
  const workflowContracts = planData.workflow_contracts || {};

  if (browserScaffold.scaffold_strategy === "reuse_existing") {
    preserveIfReusable(browserScaffold.html_entry);
    preserveIfReusable(browserScaffold.dom_mount_entry);
  }

  preserveIfReusable(deliverySurfaces.render_surface);
  preserveIfReusable(deliverySurfaces.style_surface);
  preserveIfReusable(deliverySurfaces.runtime_entry_surface);
  preserveIfReusable(crossFileContracts.style_owner);

  for (const child of crossFileContracts.child_components || []) {
    preserveIfReusable(child.file_path);
  }

  preserveIfReusable(workflowContracts.action_owner);
  preserveIfReusable(workflowContracts.request_boundary);
  preserveIfReusable(workflowContracts.response_boundary);
  preserveIfReusable(workflowContracts.state_owner);
  preserveIfReusable(workflowContracts.success_surface);
  preserveIfReusable(workflowContracts.failure_surface);

  return preserved;
}

function isInsideRoot(targetPath) {
  const relative = path.relative(WORKSPACE_ROOT, targetPath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function deleteGeneratedFiles(extraOperations = [], options = {}) {
  const operations = [...getTrackedOperations(), ...getPlannedNewFileOperations(), ...extraOperations];
  const preservedPaths = options.preservedPaths || new Set();
  const seen = new Set();
  const deleted = [];
  const skipped = [];

  for (const op of operations) {
    if (!op?.file_path || seen.has(op.file_path)) continue;
    seen.add(op.file_path);

    const absolutePath = path.join(WORKSPACE_ROOT, op.file_path);
    if (!isInsideRoot(absolutePath)) {
      skipped.push(`${op.file_path} (outside workspace root)`);
      continue;
    }

    if (preservedPaths.has(op.file_path)) {
      skipped.push(`${op.file_path} (preserved by current plan)`);
      continue;
    }

    if (op.operation_type !== "new_file") {
      skipped.push(`${op.file_path} (${op.operation_type} cannot be safely restored without backups)`);
      continue;
    }

    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { force: true, recursive: false });
      deleted.push(op.file_path);
    }
  }

  return { deleted, skipped };
}

function listArchivedFeatures() {
  if (!fs.existsSync(FEATURE_ARCHIVE_DIR)) {
    return [];
  }

  return fs.readdirSync(FEATURE_ARCHIVE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dirPath = path.join(FEATURE_ARCHIVE_DIR, entry.name);
      const manifestPath = path.join(dirPath, "manifest.json");
      const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
        : null;

      return {
        dir_name: entry.name,
        dir_path: dirPath,
        manifest_path: manifestPath,
        feature_number: manifest?.feature_number || null,
        feature_title: manifest?.feature_title || entry.name,
        archived_at: manifest?.archived_at || "",
      };
    })
    .sort((a, b) => {
      if (a.feature_number == null || b.feature_number == null) {
        return a.feature_title.localeCompare(b.feature_title);
      }
      return a.feature_number - b.feature_number;
    });
}

function resetRuntimeState() {
  ensureDir(DATA_DIR);

  writeJson(PATHS.fileRegistryJson, EMPTY_FILE_REGISTRY_JSON);
  writeJson(PATHS.appliedOperationsJson, EMPTY_APPLIED_OPERATIONS_JSON);
  writeText(PATHS.executionHistoryJsonl, "");
  writeText(PATHS.appliedState, APPLIED_STATE_TEMPLATE);
  writeText(PATHS.fileRegistryMd, FILE_REGISTRY_TEMPLATE);

  removeIfExists(PATHS.intentConfirmation);
  removeIfExists(PATHS.executionConfirmation);
  removeIfExists(PATHS.commitConfirmation);
  removeIfExists(PATHS.implementationPlanJson);
  removeIfExists(PATHS.targetRequestJson);
  removeIfExists(PATHS.targetRequestMd);
  removeIfExists(PATHS.verifyResultJson);
  removeIfExists(PATHS.executionResultJson);
  removeIfExists(PATHS.cycleMetricsJsonl);
  removeIfExists(PATHS.runMetricsJson);
  removeIfExists(PATHS.consoleSnapshotsJson);
}

function resetNormal() {
  const planData = getCurrentPlanData();
  const preservedPaths = collectPreservedPathsFromPlan(planData);
  const files = deleteGeneratedFiles([], { preservedPaths });
  resetRuntimeState();
  return files;
}

function restoreArchivedFeature(archive) {
  if (!archive) {
    throw new Error("Missing archive selection");
  }

  const extraOperations = getManifestNewFileOperations(archive.manifest_path);
  const files = deleteGeneratedFiles(extraOperations);
  resetRuntimeState();

  writeText(PATHS.featureRequest, safeRead(path.join(archive.dir_path, "FEATURE_REQUEST.md")));
  writeText(PATHS.implementationPlan, safeRead(path.join(archive.dir_path, "IMPLEMENTATION_PLAN.md")));
  writeText(PATHS.scenarios, safeRead(path.join(archive.dir_path, "SCENARIOS.md")));
  writeText(PATHS.stateFlow, safeRead(path.join(archive.dir_path, "STATE_FLOW.md")));
  writeText(PATHS.reconciliationRule, safeRead(path.join(archive.dir_path, "RECONCILIATION_RULE.md")));
  writeText(PATHS.simulationReport, safeRead(path.join(archive.dir_path, "SIMULATION_REPORT.md")));

  return {
    ...files,
    restored_archive: archive,
  };
}

function copyTemplate(templatePath, targetPath) {
  const template = safeRead(templatePath);
  if (!template) {
    throw new Error(`Missing template: ${templatePath}`);
  }
  writeText(targetPath, template);
}

function resetHard() {
  const files = deleteGeneratedFiles();
  resetRuntimeState();

  writeText(PATHS.projectContext, PROJECT_CONTEXT_TEMPLATE);
  writeText(PATHS.systemRegistry, SYSTEM_REGISTRY_TEMPLATE);
  writeText(PATHS.fileRegistryMd, FILE_REGISTRY_TEMPLATE);
  copyTemplate(PATHS.productStandardsTemplate, PATHS.productStandards);
  copyTemplate(PATHS.uiPatternsTemplate, PATHS.uiPatterns);
  copyTemplate(PATHS.designTokensTemplate, PATHS.designTokens);
  writeText(PATHS.featuresList, FEATURES_LIST_TEMPLATE);

  copyTemplate(PATHS.featureRequestTemplate, PATHS.featureRequest);
  copyTemplate(PATHS.implementationPlanTemplate, PATHS.implementationPlan);
  copyTemplate(PATHS.scenariosTemplate, PATHS.scenarios);
  copyTemplate(PATHS.stateFlowTemplate, PATHS.stateFlow);
  copyTemplate(PATHS.reconciliationRuleTemplate, PATHS.reconciliationRule);
  copyTemplate(PATHS.simulationReportTemplate, PATHS.simulationReport);

  return files;
}

function printSummary(kind, result) {
  console.log("");
  console.log(`${kind} complete.`);
  console.log("");

  if (result.restored_archive) {
    console.log("Restored archived feature:");
    console.log(`- ${result.restored_archive.feature_number || "?"}. ${result.restored_archive.feature_title}`);
    console.log("");
  }

  if (result.deleted.length > 0) {
    console.log("Deleted generated files:");
    for (const file of result.deleted) {
      console.log(`- ${file}`);
    }
    console.log("");
  } else {
    console.log("Deleted generated files:");
    console.log("- none");
    console.log("");
  }

  if (result.skipped.length > 0) {
    console.log("Skipped files:");
    for (const file of result.skipped) {
      console.log(`- ${file}`);
    }
    console.log("");
  }

  console.log("Runtime state reset:");
  console.log(`- ${path.relative(ROOT, PATHS.fileRegistryJson).replace(/\\/g, "/")}`);
  console.log(`- ${path.relative(ROOT, PATHS.appliedOperationsJson).replace(/\\/g, "/")}`);
  console.log(`- ${path.relative(ROOT, PATHS.executionHistoryJsonl).replace(/\\/g, "/")}`);
  console.log("- AI-Human OS/5_commit/APPLIED_STATE.md");
  console.log("- AI-Human OS/memory/FILE_REGISTRY.md");
  console.log("- AI-Human OS/1_planning/INTENT_CONFIRMATION.md (removed)");
  console.log("- AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md (removed)");
  console.log("- AI-Human OS/5_commit/COMMIT_CONFIRMATION.md (removed)");
  console.log("");
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function hasArg(flag) {
  return process.argv.includes(flag);
}

function printArchivesJson() {
  const archives = listArchivedFeatures().map(item => ({
    dir_name: item.dir_name,
    feature_number: item.feature_number,
    feature_title: item.feature_title,
    archived_at: item.archived_at,
  }));
  console.log(JSON.stringify({ ok: true, archives }, null, 2));
}

function runMode(mode, archiveDirName = "") {
  if (mode === "normal") {
    const result = resetNormal();
    printSummary("Normal reset", result);
    return;
  }

  if (mode === "archive") {
    const archives = listArchivedFeatures();
    const archive = archives.find(item => item.dir_name === archiveDirName) || null;
    if (!archive) {
      throw new Error("Archive mode requires a valid --archive <dir_name> selection.");
    }
    const result = restoreArchivedFeature(archive);
    printSummary("Archive restore reset", result);
    return;
  }

  if (mode === "hard") {
    const result = resetHard();
    printSummary("Hard reset", result);
    return;
  }

  throw new Error(`Unknown mode '${mode}'. Expected normal, archive, or hard.`);
}

async function promptChoice() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const currentFeatureName = parseCurrentFeatureName(safeRead(PATHS.featureRequest));
  const archives = listArchivedFeatures();

  console.log("Choose reset mode:");
  console.log("1. Normal reset");
  console.log(`   Resets the current active feature${currentFeatureName ? ` (${currentFeatureName})` : ""}.`);
  console.log("   Deletes generated new-file outputs from recorded cycles and resets runtime/applied state.");
  console.log("");
  console.log("2. Restore archived feature");
  console.log("   Restores archived planning/behavior docs for a generated feature and resets runtime/applied state.");
  console.log("");
  console.log("3. Hard reset");
  console.log("   Resets memory/planning/behavior files to templates and resets runtime/applied state.");
  console.log("   Also deletes generated new-file outputs from recorded cycles.");
  console.log("");

  const answer = await new Promise(resolve => {
    rl.question("Enter 1, 2, or 3: ", input => resolve(input.trim()));
  });

  let archive = null;
  if (answer === "2") {
    if (archives.length === 0) {
      rl.close();
      throw new Error("No archived features available to restore.");
    }

    console.log("");
    console.log("Available archived features:");
    archives.forEach((item, index) => {
      console.log(`${index + 1}. ${item.feature_number || "?"}. ${item.feature_title}`);
    });
    console.log("");

    const archiveChoice = await new Promise(resolve => {
      rl.question(`Choose archive (1-${archives.length}): `, input => resolve(input.trim()));
    });

    const archiveIndex = Number(archiveChoice) - 1;
    archive = archives[archiveIndex] || null;

    if (!archive) {
      rl.close();
      throw new Error("Invalid archive selection.");
    }
  }

  rl.close();
  return {
    answer,
    archive,
  };
}

async function main() {
  if (hasArg("--list-archives-json")) {
    printArchivesJson();
    return;
  }

  const mode = getArgValue("--mode");
  if (mode) {
    runMode(mode, getArgValue("--archive"));
    return;
  }

  const { answer, archive } = await promptChoice();

  if (answer === "1") {
    const result = resetNormal();
    printSummary("Normal reset", result);
    return;
  }

  if (answer === "2") {
    const result = restoreArchivedFeature(archive);
    printSummary("Archive restore reset", result);
    return;
  }

  if (answer === "3") {
    const result = resetHard();
    printSummary("Hard reset", result);
    return;
  }

  console.error("Invalid choice. No changes were made.");
  process.exit(1);
}

main().catch(err => {
  console.error("Reset failed.");
  console.error(err.message);
  process.exit(1);
});
