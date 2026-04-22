import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

import {
  getRuntimePaths,
  readJson,
  readTargetRequest,
  writeJson,
} from "../runtime/planning/data_layer.js";
import { checkBrowserScaffoldCoherence } from "../runtime/verification/browser_scaffold_coherence.js";
import { checkCapabilityContractCoherence } from "../runtime/verification/capability_contract_coherence.js";
import { checkCrossFileContractCoherence } from "../runtime/verification/cross_file_contract_coherence.js";
import { checkSemanticRequirementsWithJsxAnalysis } from "../runtime/verification/jsx_semantic_check.js";
import { analyzeJsxAst, getImportedSymbols, getJsxElementNames } from "../runtime/verification/jsx_ast_contracts.js";
import { checkUiSurfaceCoherence } from "../runtime/verification/ui_surface_coherence.js";
import { checkWorkflowStateCoherence } from "../runtime/verification/workflow_state_coherence.js";
import {
  logStep,
  logSub,
  logSuccess,
  logError,
  logWarn
} from "./run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const EXEC_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(EXEC_DIR);
const PROJECT_ROOT = path.dirname(AI_OS_ROOT);
const PATHS = getRuntimePaths(AI_OS_ROOT);

const relativePath = process.argv[2];

if (!relativePath) {
  logError("No file path provided to verifier");
  process.exit(1);
}

const fullPath = path.join(PROJECT_ROOT, relativePath);
const request = readTargetRequest(AI_OS_ROOT);
const planData = readJson(PATHS.implementationPlanJson, null);
const extension = path.extname(relativePath).toLowerCase();
const isCssFile = extension === ".css";
const isJsLikeFile = [".js", ".jsx", ".mjs", ".cjs"].includes(extension) || !extension;
const result = {
  request_id: request?.request_id || null,
  operation_key: request?.operation_key || null,
  status: "pass",
  checks: [],
  errors: [],
};

function pass(name) {
  result.checks.push({ name, status: "pass" });
}

function warn(name, detail) {
  result.checks.push({ name, status: "warn", detail });
}

function fail(name, detail) {
  result.checks.push({ name, status: "fail", detail });
  result.errors.push({ name, detail });
  result.status = "fail";
}

function looksLikeModule(content) {
  return (
    /^\s*import\s/m.test(content) ||
    /^\s*export\s/m.test(content)
  );
}

function looksLikeJsx(content) {
  return (
    /return\s*\(\s*</m.test(content) ||
    /<\s*[A-Za-z][\w.-]*(\s|>|\/)/m.test(content) ||
    /<\/\s*[A-Za-z][\w.-]*\s*>/m.test(content)
  );
}

function runSyntaxCheck(content) {
  const extension = looksLikeModule(content) ? ".mjs" : ".js";
  const tempPath = path.join(
    os.tmpdir(),
    `ai_os_verify_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`
  );

  try {
    fs.writeFileSync(tempPath, content, "utf-8");
    execFileSync("node", ["--check", tempPath], {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return { ok: true };
  } catch (err) {
    const detail = err.stderr?.toString()?.trim() || err.message || "Syntax check failed";
    return { ok: false, detail };
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function checkSemanticRequirements(content, request) {
  return checkSemanticRequirementsWithJsxAnalysis(
    content,
    request?.semantic_requirements || {}
  ).failures;
}

function checkAstContracts(content, request) {
  const failures = [];
  const analysis = analyzeJsxAst(content);
  const importedSymbols = getImportedSymbols(analysis);
  const jsxElementNames = getJsxElementNames(analysis);

  for (const requiredImport of request?.semantic_requirements?.must_import || []) {
    const importName = path.basename(requiredImport, path.extname(requiredImport));
    if (!importedSymbols.includes(importName)) {
      failures.push(`AST contract missing imported symbol '${importName}'`);
    }
  }

  for (const symbol of request?.semantic_requirements?.must_use || []) {
    if (!jsxElementNames.includes(symbol)) {
      failures.push(`AST contract missing JSX usage '${symbol}'`);
    }
  }

  if ((request?.required_interface?.allowed_symbols || []).length > 0) {
    const exported = analysis.exports?.named_exports || [];
    const defaultExport = analysis.exports?.default_export || "";
    const allExports = [...exported, defaultExport].filter(Boolean);
    const missingAllowed = (request.required_interface.allowed_symbols || [])
      .filter(symbol => /^[A-Z]/.test(symbol))
      .filter(symbol => !allExports.includes(symbol) && !importedSymbols.includes(symbol));

    if (missingAllowed.length > 0) {
      failures.push(`AST contract is missing required allowed symbols: ${missingAllowed.join(", ")}`);
    }
  }

  const isDomMountEntry = request?.browser_scaffold?.dom_mount_entry === request?.file_path;
  const isJsTarget = /\.js$/i.test(request?.file_path || "");
  const isDeclaredChildComponent = (request?.cross_file_contracts?.child_components || [])
    .some(component => component.file_path === request?.file_path);
  const declaredDeliverySurfacePaths = new Set([
    request?.browser_scaffold?.dom_mount_entry,
    request?.delivery_surfaces?.runtime_entry_surface,
    request?.delivery_surfaces?.render_surface,
  ].filter(Boolean));

  const targetIsProtectedJsSurface =
    isJsTarget &&
    (
      isDomMountEntry ||
      declaredDeliverySurfacePaths.has(request?.file_path) ||
      isDeclaredChildComponent
    );

  if (targetIsProtectedJsSurface && /<\s*[A-Z][A-Za-z0-9_]*\b/.test(content)) {
    failures.push("Declared browser scaffold/runtime surface uses JSX in a .js file; these surfaces must use plain JS React APIs or a JSX-capable extension");
  }

  return failures;
}

function checkProductRequirements(content, request) {
  const failures = [];
  const qualityLevel = request?.product_requirements?.quality_level || "standard_passing";
  const filePath = request?.file_path || "";
  const isUserFacingLayout = filePath.includes("/ui/layout/");
  const fileExtension = path.extname(filePath).toLowerCase();
  const isCssTarget = fileExtension === ".css";
  const isJsTarget = [".js", ".jsx", ".mjs", ".cjs", ""].includes(fileExtension);
  const stylingContract = request?.styling_contract || {};
  const inlineStylesForbidden = String(stylingContract.inline_styles || "").toLowerCase().includes("forbidden");
  const localTokenObjectsForbidden = String(stylingContract.local_token_objects || "").toLowerCase().includes("forbidden");
  const hardcodedColorsForbidden = String(stylingContract.hardcoded_colors || "").toLowerCase().includes("forbidden");
  const requiresClassHooks = /classname required/i.test(stylingContract.styling_hooks || "");

  if (isUserFacingLayout && isJsTarget && ["standard_passing", "production_ready", "premium_polished"].includes(qualityLevel)) {
    if (/>\s*Lobby\s*</.test(content) && !/>\s*Gravity Ball\s*</.test(content)) {
      failures.push("User-facing layout still uses a generic placeholder heading");
    }

    if (requiresClassHooks && !/className=/.test(content)) {
      failures.push("User-facing layout lacks any styling hook/className for consistent product styling");
    }
  }

  if (isUserFacingLayout && isJsTarget && inlineStylesForbidden && /\bstyle\s*=\s*\{\{/.test(content)) {
    failures.push("User-facing layout uses inline style objects even though the styling contract forbids them");
  }

  if (isUserFacingLayout && isJsTarget && localTokenObjectsForbidden) {
    const localTokenObjectPattern = /\b(?:const|let|var)\s+(?:tokens|theme|colors)\s*=\s*\{/;
    if (localTokenObjectPattern.test(content)) {
      failures.push("User-facing layout defines a local token/theme object even though the styling contract forbids it");
    }
  }

  if (isUserFacingLayout && isCssTarget && requiresClassHooks && !/\.lobby-layout/.test(content)) {
    failures.push("Layout CSS does not define the expected class-hook surface for the user-facing layout");
  }

  if (request?.design_token_refs?.required_usage && hardcodedColorsForbidden) {
    const obviousHexColors = content.match(/#[0-9a-fA-F]{3,8}/g) || [];
    if (obviousHexColors.length > 0) {
      failures.push("File contains hardcoded hex colors while token-backed styling is expected");
    }
  }

  return failures;
}

function checkCssStructure(content, request) {
  const failures = [];
  const classHooks = [...content.matchAll(/\.([A-Za-z0-9_-]+)\s*\{/g)].map(match => match[1]);
  const uniqueHooks = [...new Set(classHooks)];

  if (uniqueHooks.length === 0) {
    failures.push("CSS file does not define any class selectors");
  }

  if (request?.file_path?.includes("/ui/layout/") && !uniqueHooks.some(name => name.startsWith("lobby-layout"))) {
    failures.push("Layout CSS does not define expected lobby-layout class hooks");
  }

  if (!/:root\s*\{/.test(content) && !/var\(--/.test(content)) {
    failures.push("CSS file does not appear to consume shared CSS variables");
  }

  return failures;
}

logStep(`Verifying: ${relativePath}`);
logSub("Checking file existence...");

if (!fs.existsSync(fullPath)) {
  fail("file_exists", "File does not exist");
  writeJson(PATHS.verifyResultJson, result);
  logError("File does not exist");
  process.exit(1);
}

pass("file_exists");
logSuccess("File exists");

logSub("Reading file content...");

const content = fs.readFileSync(fullPath, "utf-8");

if (!content || content.trim().length === 0) {
  fail("file_non_empty", "File is empty");
  writeJson(PATHS.verifyResultJson, result);
  logError("File is empty");
  process.exit(1);
}

pass("file_non_empty");
logSuccess("File has content");

logSub("Checking minimal size...");

if (content.trim().length < 20) {
  fail("minimal_size", "File too small (likely invalid)");
  writeJson(PATHS.verifyResultJson, result);
  logError("File too small (likely invalid)");
  process.exit(1);
}

pass("minimal_size");
logSuccess("Size OK");

if (isJsLikeFile) {
  logSub("Checking JS structure...");

  if (!content.includes("export")) {
    warn("export_detected", "No export detected");
    logWarn("No export detected (might be okay depending on file type)");
  } else {
    pass("export_detected");
    logSuccess("Export detected");
  }
} else if (isCssFile) {
  logSub("Checking CSS structure...");

  const cssFailures = checkCssStructure(content, request);
  if (cssFailures.length > 0) {
    fail("css_structure", cssFailures.join("; "));
    writeJson(PATHS.verifyResultJson, result);
    logError("CSS structure check failed");
    process.exit(1);
  }

  pass("css_structure");
  logSuccess("CSS structure looks valid");
}

logSub("Scanning for bad patterns...");

if (content.includes("TODO") || content.includes("FIXME") || content.includes("???")) {
  fail("unfinished_code", "Unfinished code detected");
  writeJson(PATHS.verifyResultJson, result);
  logError("Unfinished code detected");
  process.exit(1);
}

pass("unfinished_code");
logSuccess("No bad patterns");

if (isJsLikeFile) {
  logSub("Running module-aware syntax check...");

  const syntax = runSyntaxCheck(content);
  const jsxLike = looksLikeJsx(content);

  if (syntax.ok) {
    pass("syntax_valid");
    logSuccess("Syntax looks valid");
  } else if (jsxLike) {
    warn("syntax_valid", `Skipped hard failure for JSX-like content: ${syntax.detail}`);
    logWarn("Node syntax check does not support JSX; recorded warning instead of failure");
  } else {
    fail("syntax_valid", syntax.detail);
    writeJson(PATHS.verifyResultJson, result);
    logError("Syntax check failed");
    process.exit(1);
  }
} else if (isCssFile) {
  warn("syntax_valid", "Skipped JS syntax check for CSS file");
  logWarn("Skipped JS syntax check for CSS file");
}

if (isJsLikeFile) {
  logSub("Checking semantic requirements...");

  const semanticFailures = checkSemanticRequirements(content, request);

  if (semanticFailures.length > 0) {
    fail("semantic_requirements", semanticFailures.join("; "));
    writeJson(PATHS.verifyResultJson, result);
    logError("Semantic requirement check failed");
    process.exit(1);
  }

  pass("semantic_requirements");
  logSuccess("Semantic requirements satisfied");
} else {
  warn("semantic_requirements", "Skipped JS semantic checks for non-JS file");
  logWarn("Skipped JS semantic checks for non-JS file");
}

if (isJsLikeFile) {
  logSub("Checking AST contracts...");

  const astFailures = checkAstContracts(content, request);
  if (astFailures.length > 0) {
    fail("ast_contracts", astFailures.join("; "));
    writeJson(PATHS.verifyResultJson, result);
    logError("AST contract check failed");
    process.exit(1);
  }

  pass("ast_contracts");
  logSuccess("AST contracts satisfied");
} else {
  warn("ast_contracts", "Skipped AST contract checks for non-JS file");
  logWarn("Skipped AST contract checks for non-JS file");
}

logSub("Checking product requirements...");

const productFailures = checkProductRequirements(content, request);

if (productFailures.length > 0) {
  fail("product_requirements", productFailures.join("; "));
  writeJson(PATHS.verifyResultJson, result);
  logError("Product requirement check failed");
  process.exit(1);
}

pass("product_requirements");
logSuccess("Product requirements satisfied");

logSub("Checking UI surface coherence...");

const coherence = checkUiSurfaceCoherence({
  projectRoot: PROJECT_ROOT,
  request,
  planData,
});

if (!coherence.applicable || coherence.skipped) {
  warn("ui_surface_coherence", `Skipped: ${coherence.reason || "not_applicable"}`);
  logWarn(`Skipped UI surface coherence check (${coherence.reason || "not_applicable"})`);
} else if (coherence.failures.length > 0) {
  fail("ui_surface_coherence", coherence.failures.join("; "));
  writeJson(PATHS.verifyResultJson, result);
  logError("UI surface coherence check failed");
  process.exit(1);
} else {
  pass("ui_surface_coherence");
  logSuccess("UI surface coherence satisfied");
}

logSub("Checking cross-file contract coherence...");

const crossFileCoherence = checkCrossFileContractCoherence({
  projectRoot: PROJECT_ROOT,
  request,
  planData,
});

if (!crossFileCoherence.applicable || crossFileCoherence.skipped) {
  warn("cross_file_contract_coherence", `Skipped: ${crossFileCoherence.reason || "not_applicable"}`);
  logWarn(`Skipped cross-file contract coherence check (${crossFileCoherence.reason || "not_applicable"})`);
} else if (crossFileCoherence.failures.length > 0) {
  fail("cross_file_contract_coherence", crossFileCoherence.failures.join("; "));
  writeJson(PATHS.verifyResultJson, result);
  logError("Cross-file contract coherence check failed");
  process.exit(1);
} else {
  pass("cross_file_contract_coherence");
  logSuccess("Cross-file contract coherence satisfied");
}

logSub("Checking capability contract coherence...");

const capabilityCoherence = checkCapabilityContractCoherence({
  projectRoot: PROJECT_ROOT,
  request,
  planData,
});

if (!capabilityCoherence.applicable || capabilityCoherence.skipped) {
  warn("capability_contract_coherence", `Skipped: ${capabilityCoherence.reason || "not_applicable"}`);
  logWarn(`Skipped capability contract coherence check (${capabilityCoherence.reason || "not_applicable"})`);
} else if (capabilityCoherence.failures.length > 0) {
  fail("capability_contract_coherence", capabilityCoherence.failures.join("; "));
  writeJson(PATHS.verifyResultJson, result);
  logError("Capability contract coherence check failed");
  process.exit(1);
} else {
  pass("capability_contract_coherence");
  logSuccess("Capability contract coherence satisfied");
}

logSub("Checking workflow state coherence...");

const workflowCoherence = checkWorkflowStateCoherence({
  projectRoot: PROJECT_ROOT,
  request,
  planData,
});

if (!workflowCoherence.applicable || workflowCoherence.skipped) {
  warn("workflow_state_coherence", `Skipped: ${workflowCoherence.reason || "not_applicable"}`);
  logWarn(`Skipped workflow state coherence check (${workflowCoherence.reason || "not_applicable"})`);
} else if (workflowCoherence.failures.length > 0) {
  fail("workflow_state_coherence", workflowCoherence.failures.join("; "));
  writeJson(PATHS.verifyResultJson, result);
  logError("Workflow state coherence check failed");
  process.exit(1);
} else {
  pass("workflow_state_coherence");
  logSuccess("Workflow state coherence satisfied");
}

logSub("Checking browser scaffold coherence...");

const scaffoldCoherence = checkBrowserScaffoldCoherence({
  projectRoot: PROJECT_ROOT,
  request,
  planData,
});

if (!scaffoldCoherence.applicable || scaffoldCoherence.skipped) {
  warn("browser_scaffold_coherence", `Skipped: ${scaffoldCoherence.reason || "not_applicable"}`);
  logWarn(`Skipped browser scaffold coherence check (${scaffoldCoherence.reason || "not_applicable"})`);
} else if (scaffoldCoherence.failures.length > 0) {
  fail("browser_scaffold_coherence", scaffoldCoherence.failures.join("; "));
  writeJson(PATHS.verifyResultJson, result);
  logError("Browser scaffold coherence check failed");
  process.exit(1);
} else {
  pass("browser_scaffold_coherence");
  logSuccess("Browser scaffold coherence satisfied");
}

writeJson(PATHS.verifyResultJson, result);
logStep("Verification passed");
