import fs from "fs";
import path from "path";
import { buildPlanningFailureError, createFeedbackError, errorListToMessages } from "./structured_feedback.js";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function listProjectFiles(projectRoot) {
  const ignoreDirs = new Set(["node_modules", ".git", "dist", "coverage", "AI-Human OS"]);
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) {
          continue;
        }

        walk(fullPath);
        continue;
      }

      files.push(relativePath);
    }
  }

  walk(projectRoot);
  return files;
}

function safeLineCount(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return 0;
  }

  return fs.readFileSync(filePath, "utf-8").split(/\r?\n/).length;
}

function stemFromFilePath(filePath) {
  return path.basename(filePath || "", path.extname(filePath || "")).toLowerCase();
}

function tokenizeName(name) {
  return String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);
}

function hasRepeatedTokens(name) {
  const tokens = tokenizeName(name);
  const seen = new Set();

  for (const token of tokens) {
    if (seen.has(token)) {
      return true;
    }

    seen.add(token);
  }

  return false;
}

function detectNamePattern(name) {
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) return "pascal";
  if (/^[a-z][A-Za-z0-9]*$/.test(name)) return "camel_or_flat";
  if (/^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(name)) return "dotted";
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name)) return "kebab";
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name)) return "snake";
  return "unknown";
}

function mostFrequent(values) {
  const counts = new Map();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let bestValue = "";
  let bestCount = -1;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return bestValue;
}

function otherOption(options, preferredOption) {
  return options.find(option => option !== preferredOption) || options[0];
}

function selectOptionFromEvidence(config, evidence, positiveOrientation, tieBreaker) {
  const options = config.options || [];
  const scores = Object.fromEntries(options.map(option => [option, 0]));

  for (const [criterion, weight] of Object.entries(config.criteria || {})) {
    const preferredOption = positiveOrientation[criterion];
    const inverseOption = otherOption(options, preferredOption);
    const winningOption = evidence[criterion] ? preferredOption : inverseOption;
    scores[winningOption] += Math.abs(Number(weight) || 0);
  }

  let selected = tieBreaker || options[0] || "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const option of options) {
    if ((scores[option] || 0) > bestScore) {
      bestScore = scores[option] || 0;
      selected = option;
    }
  }

  const orderedScores = [...options]
    .map(option => scores[option] || 0)
    .sort((left, right) => right - left);

  return {
    scores,
    selected_option: selected,
    score_gap: (orderedScores[0] || 0) - (orderedScores[1] || 0),
  };
}

function collectRoleMap(planData) {
  const roleMap = new Map();

  function addRole(filePath, category, role) {
    if (!filePath || filePath === "not_required") return;

    if (!roleMap.has(filePath)) {
      roleMap.set(filePath, []);
    }

    roleMap.get(filePath).push({ category, role });
  }

  const delivery = planData.delivery_surfaces || {};
  addRole(delivery.render_surface, "delivery", "render_surface");
  addRole(delivery.style_surface, "delivery", "style_surface");
  addRole(delivery.runtime_entry_surface, "delivery", "runtime_entry_surface");

  const crossFile = planData.cross_file_contracts || {};
  addRole(crossFile.style_owner, "cross_file", "style_owner");
  for (const child of crossFile.child_components || []) {
    addRole(child.file_path, "cross_file", "child_component");
  }

  const workflow = planData.workflow_contracts || {};
  addRole(workflow.action_owner, "workflow", "action_owner");
  addRole(workflow.request_boundary, "workflow", "request_boundary");
  addRole(workflow.response_boundary, "workflow", "response_boundary");
  addRole(workflow.state_owner, "workflow", "state_owner");
  addRole(workflow.success_surface, "workflow", "success_surface");
  addRole(workflow.failure_surface, "workflow", "failure_surface");

  for (const dependency of planData.capability_dependencies || []) {
    for (const contract of dependency.required_contracts || []) {
      addRole(contract, "capability", dependency.capability || "required_contract");
    }
  }

  return roleMap;
}

function loadDecisionFramework(aiOsRoot) {
  const base = path.join(aiOsRoot, "decision_framework");

  return {
    file_creation: readJson(path.join(base, "decision_file_creation.json")),
    file_split: readJson(path.join(base, "decision_file_split.json")),
    folder_creation: readJson(path.join(base, "decision_folder_creation.json")),
    naming: readJson(path.join(base, "decision_naming.json")),
  };
}

function evaluateFileCreation(planData, workspace, framework) {
  const config = framework.file_creation;
  const positiveOrientation = {
    new_responsibility: "create_new_file",
    existing_file_matches: "edit_existing_file",
    responsibility_overlap: "edit_existing_file",
    file_size_limit_exceeded: "create_new_file",
  };

  return (planData.operations || []).map(operation => {
    const absPath = path.join(workspace.projectRoot, operation.file_path);
    const stem = stemFromFilePath(operation.file_path);
    const stemMatchCount = workspace.fileStems.filter(item => item === stem).length;
    const targetExists = fs.existsSync(absPath);
    const evidence = {
      new_responsibility: !targetExists && stemMatchCount === 0,
      existing_file_matches: targetExists,
      responsibility_overlap: targetExists || stemMatchCount > 0,
      file_size_limit_exceeded: targetExists && safeLineCount(absPath) > 300,
    };
    const scoring = selectOptionFromEvidence(
      config,
      evidence,
      positiveOrientation,
      operation.operation_type === "new_file" ? "create_new_file" : "edit_existing_file"
    );
    const actualOption = operation.operation_type === "new_file" ? "create_new_file" : "edit_existing_file";

    return {
      decision: config.decision,
      subject: operation.file_path,
      actual_option: actualOption,
      selected_option: scoring.selected_option,
      score_gap: scoring.score_gap,
      scores: scoring.scores,
      evidence,
      mismatch: actualOption !== scoring.selected_option,
    };
  });
}

function evaluateFileSplit(planData, roleMap, workspace, framework) {
  const config = framework.file_split;
  const positiveOrientation = {
    line_count_over_300: "split_file",
    multiple_responsibilities_detected: "split_file",
    low_cohesion: "split_file",
  };
  const operationCountByFile = new Map();

  for (const operation of planData.operations || []) {
    operationCountByFile.set(operation.file_path, (operationCountByFile.get(operation.file_path) || 0) + 1);
  }

  return [...operationCountByFile.keys()].map(filePath => {
    const absPath = path.join(workspace.projectRoot, filePath);
    const roles = roleMap.get(filePath) || [];
    const roleCategories = new Set(roles.map(role => role.category));
    const fileExists = fs.existsSync(absPath);
    const evidence = {
      line_count_over_300: fileExists && safeLineCount(absPath) > 300,
      multiple_responsibilities_detected: (operationCountByFile.get(filePath) || 0) > 1 || roles.length > 2,
      low_cohesion: roleCategories.size > 1,
    };
    const scoring = selectOptionFromEvidence(config, evidence, positiveOrientation, "keep_file");

    return {
      decision: config.decision,
      subject: filePath,
      actual_option: "keep_file",
      selected_option: scoring.selected_option,
      score_gap: scoring.score_gap,
      scores: scoring.scores,
      evidence,
      mismatch: scoring.selected_option === "split_file",
    };
  });
}

function evaluateFolderCreation(planData, workspace, framework) {
  const config = framework.folder_creation;
  const positiveOrientation = {
    related_files_count_ge_3: "create_folder",
    new_domain_introduced: "create_folder",
    naming_grouping_needed: "create_folder",
  };
  const byDirectory = new Map();

  for (const operation of planData.operations || []) {
    const dirPath = path.dirname(operation.file_path).replace(/\\/g, "/");
    if (!byDirectory.has(dirPath)) {
      byDirectory.set(dirPath, []);
    }

    byDirectory.get(dirPath).push(operation.file_path);
  }

  return [...byDirectory.entries()].map(([dirPath, filePaths]) => {
    const absDir = path.join(workspace.projectRoot, dirPath);
    const actualOption = fs.existsSync(absDir) ? "reuse_existing" : "create_folder";
    const stems = filePaths.map(filePath => stemFromFilePath(filePath));
    const tokenOverlap = stems
      .map(stem => tokenizeName(stem))
      .flat()
      .filter(Boolean);
    const evidence = {
      related_files_count_ge_3: filePaths.length >= 3,
      new_domain_introduced: !fs.existsSync(absDir) && dirPath !== ".",
      naming_grouping_needed: new Set(tokenOverlap).size < tokenOverlap.length,
    };
    const scoring = selectOptionFromEvidence(config, evidence, positiveOrientation, actualOption);

    return {
      decision: config.decision,
      subject: dirPath,
      actual_option: actualOption,
      selected_option: scoring.selected_option,
      score_gap: scoring.score_gap,
      scores: scoring.scores,
      evidence,
      mismatch: actualOption !== scoring.selected_option,
    };
  });
}

function evaluateNaming(planData, workspace, framework) {
  const config = framework.naming;
  const positiveOrientation = {
    matches_existing_pattern: "accept_name",
    avoids_duplicate_concepts: "accept_name",
    consistent_suffix_usage: "accept_name",
  };

  return (planData.operations || []).map(operation => {
    const filePath = operation.file_path;
    const dirPath = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const siblings = workspace.files
      .filter(existingPath => path.dirname(existingPath) === dirPath && existingPath !== filePath)
      .map(existingPath => path.basename(existingPath, path.extname(existingPath)));
    const siblingPatterns = siblings.map(detectNamePattern).filter(pattern => pattern !== "unknown");
    const expectedPattern = siblingPatterns.length > 0 ? mostFrequent(siblingPatterns) : "";
    const siblingSuffixes = siblings
      .map(name => name.match(/([A-Z][a-z0-9]+)$/)?.[1] || "")
      .filter(Boolean);
    const expectedSuffix = siblingSuffixes.length > 0 ? mostFrequent(siblingSuffixes) : "";
    const duplicateStemCount = workspace.fileStems.filter(item => item === stemFromFilePath(filePath)).length;
    const evidence = {
      matches_existing_pattern: expectedPattern ? detectNamePattern(baseName) === expectedPattern : detectNamePattern(baseName) !== "unknown",
      avoids_duplicate_concepts: duplicateStemCount === 0 && !hasRepeatedTokens(baseName),
      consistent_suffix_usage: expectedSuffix ? baseName.endsWith(expectedSuffix) : true,
    };
    const scoring = selectOptionFromEvidence(config, evidence, positiveOrientation, "accept_name");

    return {
      decision: config.decision,
      subject: filePath,
      actual_option: "accept_name",
      selected_option: scoring.selected_option,
      score_gap: scoring.score_gap,
      scores: scoring.scores,
      evidence,
      mismatch: scoring.selected_option === "reject_name",
    };
  });
}

function buildWorkspaceIndex(projectRoot) {
  const files = listProjectFiles(projectRoot);

  return {
    projectRoot,
    files,
    fileStems: files.map(stemFromFilePath),
  };
}

export function evaluatePlanDecisions(planData, options = {}) {
  const aiOsRoot = options.aiOsRoot;
  const projectRoot = options.projectRoot;

  if (!aiOsRoot || !projectRoot) {
    throw new Error("Decision evaluator requires aiOsRoot and projectRoot");
  }

  const framework = loadDecisionFramework(aiOsRoot);
  const workspace = buildWorkspaceIndex(projectRoot);
  const roleMap = collectRoleMap(planData);

  const fileCreation = evaluateFileCreation(planData, workspace, framework);
  const fileSplit = evaluateFileSplit(planData, roleMap, workspace, framework);
  const folderCreation = evaluateFolderCreation(planData, workspace, framework);
  const naming = evaluateNaming(planData, workspace, framework);

  const errors = [
    ...fileCreation
      .filter(item => item.mismatch)
      .map(item => createFeedbackError({
        type: "PLAN_DRIFT",
        location: item.subject,
        message: `File creation decision mismatch for '${item.subject}': plan chose ${item.actual_option} but evaluator selected ${item.selected_option}`,
        fix_hint: item.selected_option === "edit_existing_file" ? "convert_to_edit_existing_file" : "convert_to_new_file",
        deterministic_fix_available: true,
      })),
    ...fileSplit
      .filter(item => item.mismatch)
      .map(item => createFeedbackError({
        type: "RESPONSIBILITY_DRIFT",
        location: item.subject,
        message: `File split decision mismatch for '${item.subject}': evaluator selected split_file`,
        fix_hint: "split_file_or_reduce_responsibility",
        deterministic_fix_available: false,
      })),
    ...folderCreation
      .filter(item => item.mismatch)
      .map(item => createFeedbackError({
        type: "PLAN_DRIFT",
        location: item.subject,
        message: `Folder creation decision mismatch for '${item.subject}': plan implies ${item.actual_option} but evaluator selected ${item.selected_option}`,
        fix_hint: item.selected_option === "reuse_existing" ? "reuse_existing_folder" : "create_missing_folder",
        deterministic_fix_available: false,
      })),
    ...naming
      .filter(item => item.mismatch)
      .map(item => createFeedbackError({
        type: "SEMANTIC_DRIFT",
        location: item.subject,
        message: `Naming decision mismatch for '${item.subject}': evaluator selected reject_name`,
        fix_hint: "rename_to_match_existing_pattern",
        deterministic_fix_available: false,
      })),
  ];

  return {
    ok: errors.length === 0,
    generated_at: new Date().toISOString(),
    summary: {
      issue_count: errors.length,
      file_creation_mismatches: fileCreation.filter(item => item.mismatch).length,
      file_split_mismatches: fileSplit.filter(item => item.mismatch).length,
      folder_creation_mismatches: folderCreation.filter(item => item.mismatch).length,
      naming_mismatches: naming.filter(item => item.mismatch).length,
    },
    errors,
    issues: errorListToMessages(errors),
    evaluations: {
      file_creation: fileCreation,
      file_split: fileSplit,
      folder_creation: folderCreation,
      naming,
    },
  };
}

export function assertPlanDecisions(planData, options = {}) {
  const evaluation = evaluatePlanDecisions(planData, options);

  if (!evaluation.ok) {
    throw buildPlanningFailureError({
      failure_code: "PLAN_DECISION_INVALID",
      stage: "implementation_plan",
      errors: evaluation.errors,
      summary: evaluation.summary,
    });
  }

  return evaluation;
}
