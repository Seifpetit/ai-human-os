import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getModelConfig, runModel } from "../runtime/model/model_adapter.js";
import { getRuntimePaths, safeRead, syncImplementationPlanJson } from "../runtime/planning/data_layer.js";
import { assertWorkspaceRootReady } from "../runtime/workspace/workspace_config.js";
import {
  logStep,
  logSub,
  logSuccess,
  logError,
  logDivider,
  timeStart,
  timeEnd,
} from "../3_execution/run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const NEXT_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(NEXT_DIR);
assertWorkspaceRootReady(AI_OS_ROOT);
const PATHS = getRuntimePaths(AI_OS_ROOT);
const ARCHIVE_ROOT = path.join(AI_OS_ROOT, "feature_archive");

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.trim() + "\n", "utf-8");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function parseCurrentFeatureName(markdown) {
  return markdown.match(/^## Name\r?\n(.+)$/m)?.[1]?.trim() || "";
}

function parseFeaturesList(markdown) {
  return [...markdown.matchAll(/##\s+(\d+)\.\s+(.+)\r?\n([\s\S]*?)(?=\r?\n---\r?\n|\r?\n##\s+\d+\.|$)/g)]
    .map(match => {
      const body = match[3] || "";
      return {
        number: Number(match[1]),
        title: match[2].trim(),
        purpose: body.match(/- \*\*purpose:\*\*\s*(.+)/)?.[1]?.trim() || "",
        reason_now: body.match(/- \*\*reason_now:\*\*\s*(.+)/)?.[1]?.trim() || "",
        priority: body.match(/- \*\*priority:\*\*\s*(.+)/)?.[1]?.trim() || "",
        status: body.match(/- \*\*status:\*\*\s*(.+)/)?.[1]?.trim() || "",
      };
    });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "feature";
}

function archiveCurrentFeature({ currentFeatureName, features }) {
  const currentFeature = features.find(feature => feature.title === currentFeatureName);
  if (!currentFeature || !currentFeatureName) {
    return null;
  }

  const archiveDir = path.join(
    ARCHIVE_ROOT,
    `feature_${String(currentFeature.number).padStart(3, "0")}_${slugify(currentFeature.title)}`
  );

  const featureRequest = readText(PATHS.featureRequestMd);
  const implementationPlan = readText(PATHS.implementationPlanMd);
  const scenarios = readText(path.join(AI_OS_ROOT, "2_behavior/SCENARIOS.md"));
  const stateFlow = readText(path.join(AI_OS_ROOT, "2_behavior/STATE_FLOW.md"));
  const reconciliationRule = readText(path.join(AI_OS_ROOT, "2_behavior/RECONCILIATION_RULE.md"));
  const simulationReport = readText(path.join(AI_OS_ROOT, "2_behavior/SIMULATION_REPORT.md"));
  const syncedPlan = syncImplementationPlanJson(AI_OS_ROOT);
  const newFilePaths = (syncedPlan.operations || [])
    .filter(operation => operation.operation_type === "new_file")
    .map(operation => operation.file_path);

  writeText(path.join(archiveDir, "FEATURE_REQUEST.md"), featureRequest);
  writeText(path.join(archiveDir, "IMPLEMENTATION_PLAN.md"), implementationPlan);
  writeText(path.join(archiveDir, "SCENARIOS.md"), scenarios);
  writeText(path.join(archiveDir, "STATE_FLOW.md"), stateFlow);
  writeText(path.join(archiveDir, "RECONCILIATION_RULE.md"), reconciliationRule);
  writeText(path.join(archiveDir, "SIMULATION_REPORT.md"), simulationReport);
  writeJson(path.join(archiveDir, "manifest.json"), {
    feature_number: currentFeature.number,
    feature_title: currentFeature.title,
    slug: slugify(currentFeature.title),
    archived_at: new Date().toISOString(),
    new_file_paths: newFilePaths,
  });

  return archiveDir;
}

function selectNextFeature(features, currentFeatureName) {
  const currentIndex = features.findIndex(feature => feature.title === currentFeatureName);
  const searchStart = currentIndex >= 0 ? currentIndex + 1 : 0;
  const tail = features.slice(searchStart);

  const preferredSelected = tail.find(feature => feature.status === "selected");
  if (preferredSelected) return preferredSelected;

  const preferredCandidate = tail.find(feature => feature.status === "candidate");
  if (preferredCandidate) return preferredCandidate;

  return null;
}

function replaceHumanSelectionBlock(prompt, selectionBlock) {
  return prompt.replace(
    /\[ HUMAN FEATURE SELECTION START \][\s\S]*?\[ HUMAN FEATURE SELECTION END \]/,
    `[ HUMAN FEATURE SELECTION START ]\n\n${selectionBlock}\n\n[ HUMAN FEATURE SELECTION END ]`
  );
}

function stripMarkdownFences(value) {
  const trimmed = String(value || "").trim();
  const fenced = trimmed.match(/^```(?:md|markdown)?\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildFeatureSelectionPrompt({ nextFeature, selectionPrompt, featuresList, featureRequestTemplate }) {
  const selectionBlock = [
    "Selected Feature:",
    `- ${nextFeature.number}. ${nextFeature.title}`,
    "",
    "Refinement (optional):",
    `- ${nextFeature.purpose || "none"}`,
    "",
    "Must Include:",
    `- ${nextFeature.purpose || "stay within selected feature scope"}`,
    "",
    "Must Exclude:",
    "- no unrelated systems beyond the selected feature",
    "",
    "Constraints:",
    `- priority: ${nextFeature.priority || "unspecified"}`,
    "",
    "Notes:",
    `- reason_now: ${nextFeature.reason_now || "none"}`,
  ].join("\n");

  const prompt = replaceHumanSelectionBlock(selectionPrompt, selectionBlock);

  return `
${prompt}

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${safeRead(PATHS.projectContextMd)}

SYSTEM_REGISTRY:
${safeRead(PATHS.systemRegistryMd)}

FILE_REGISTRY:
${safeRead(PATHS.fileRegistryMd)}

FEATURES_LIST:
${featuresList}

FEATURE_REQUEST_TEMPLATE:
${featureRequestTemplate}
`;
}

function buildImplementationPlanPrompt({ planPrompt, featureRequest, implementationPlanTemplate }) {
  return `
${planPrompt}

----------------------------------------
SYSTEM MEMORY
----------------------------------------

PROJECT_CONTEXT:
${safeRead(PATHS.projectContextMd)}

SYSTEM_REGISTRY:
${safeRead(PATHS.systemRegistryMd)}

FILE_REGISTRY:
${safeRead(PATHS.fileRegistryMd)}

FEATURE_REQUEST:
${featureRequest}

IMPLEMENTATION_PLAN_TEMPLATE:
${implementationPlanTemplate}
`;
}

function generateMarkdown(prompt) {
  const modelConfig = getModelConfig();
  timeStart("Model Generation");
  const result = runModel(prompt, modelConfig);
  timeEnd("Model Generation");
  return stripMarkdownFences(result.raw_text || "");
}

logStep("Next Feature Planning");

try {
  const currentFeatureRequest = readText(PATHS.featureRequestMd);
  const currentFeatureName = parseCurrentFeatureName(currentFeatureRequest);
  const featuresList = readText(path.join(AI_OS_ROOT, "1_planning/FEATURES_LIST.md"));
  const features = parseFeaturesList(featuresList);
  const nextFeature = selectNextFeature(features, currentFeatureName);

  if (!nextFeature) {
    logError("No next feature found after current feature");
    process.exit(1);
  }

  logSub(`Current feature: ${currentFeatureName || "none"}`);
  logSuccess(`Next feature: ${nextFeature.number}. ${nextFeature.title}`);

  logDivider();
  logSub("Archiving current feature...");
  const archiveDir = archiveCurrentFeature({
    currentFeatureName,
    features,
  });
  if (archiveDir) {
    logSuccess(`Archived current feature to ${path.relative(AI_OS_ROOT, archiveDir)}`);
  } else {
    logSub("No current feature archive created");
  }

  const selectionPrompt = readText(path.join(AI_OS_ROOT, "1_planning/2_feature_selection_prompt.txt"));
  const planPrompt = readText(path.join(AI_OS_ROOT, "1_planning/3_plan_generation_prompt.txt"));
  const featureRequestTemplate = readText(path.join(AI_OS_ROOT, "1_planning/FEATURE_REQUEST.template.md"));
  const implementationPlanTemplate = readText(path.join(AI_OS_ROOT, "1_planning/IMPLEMENTATION_PLAN.template.md"));

  logDivider();
  logSub("Generating FEATURE_REQUEST.md...");
  const featureRequestPrompt = buildFeatureSelectionPrompt({
    nextFeature,
    selectionPrompt,
    featuresList,
    featureRequestTemplate,
  });
  const featureRequest = generateMarkdown(featureRequestPrompt);
  writeText(PATHS.featureRequestMd, featureRequest);
  logSuccess("FEATURE_REQUEST.md updated");

  logDivider();
  logSub("Generating IMPLEMENTATION_PLAN.md...");
  const implementationPlanPrompt = buildImplementationPlanPrompt({
    planPrompt,
    featureRequest,
    implementationPlanTemplate,
  });
  const implementationPlan = generateMarkdown(implementationPlanPrompt);
  writeText(PATHS.implementationPlanMd, implementationPlan);
  syncImplementationPlanJson(AI_OS_ROOT);
  logSuccess("IMPLEMENTATION_PLAN.md updated");

  logDivider();
  logSuccess("Next feature planning complete");
  process.exit(0);
} catch (err) {
  logError("Next feature planning failed");
  console.error(err.message);
  process.exit(1);
}
