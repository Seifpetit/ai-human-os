import fs from "fs";
import path from "path";

const DEFAULT_CONFIG = {
  version: 1,
  workspace_root: "",
  notes: [
    "workspace_root is the target project directory that AI-Human OS will mutate (write code into).",
    "workspace_root must be explicitly selected before planning or execution can run.",
    "workspace_root must stay separate from the repo that contains AI-Human OS.",
    "You can override this at runtime with the env var: AI_HUMAN_OS_WORKSPACE_ROOT",
  ],
};

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAbsoluteDir(value) {
  if (!value) return "";
  const resolved = path.resolve(String(value));
  return resolved;
}

function normalizeComparablePath(value) {
  return normalizeAbsoluteDir(value)
    .replace(/\//g, path.sep)
    .replace(/[\\\/]+$/, "")
    .toLowerCase();
}

function isSameOrNestedPath(candidatePath, basePath) {
  const normalizedCandidate = normalizeComparablePath(candidatePath);
  const normalizedBase = normalizeComparablePath(basePath);

  if (!normalizedCandidate || !normalizedBase) {
    return false;
  }

  return normalizedCandidate === normalizedBase || normalizedCandidate.startsWith(`${normalizedBase}${path.sep}`);
}

function getConfigPath(aiOsRoot) {
  return path.join(aiOsRoot, "memory", "WORKSPACE_CONFIG.json");
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export function loadWorkspaceConfig(aiOsRoot, { persistDefaults = false } = {}) {
  const configPath = getConfigPath(aiOsRoot);

  if (!fs.existsSync(configPath)) {
    return { config: DEFAULT_CONFIG, configPath };
  }

  const loaded = readJson(configPath, null);
  if (!isObject(loaded)) {
    if (persistDefaults) {
      writeJson(configPath, DEFAULT_CONFIG);
    }
    return { config: DEFAULT_CONFIG, configPath };
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...loaded,
  };

  if (persistDefaults && JSON.stringify(merged) !== JSON.stringify(loaded)) {
    writeJson(configPath, merged);
  }

  return { config: merged, configPath };
}

export function setWorkspaceRoot(aiOsRoot, workspaceRoot) {
  const configPath = getConfigPath(aiOsRoot);
  const { config } = loadWorkspaceConfig(aiOsRoot, { persistDefaults: true });

  const normalized = normalizeAbsoluteDir(workspaceRoot);
  const next = {
    ...config,
    workspace_root: normalized,
  };
  writeJson(configPath, next);
  return { config: next, configPath };
}

export function resolveProjectRoot(aiOsRoot) {
  const { config, configPath } = loadWorkspaceConfig(aiOsRoot);

  const envOverride = normalizeAbsoluteDir(process.env.AI_HUMAN_OS_WORKSPACE_ROOT || "");
  const configured = normalizeAbsoluteDir(config.workspace_root || "");

  let source = "default";
  if (envOverride) source = "env";
  else if (configured) source = "config";

  const candidate = envOverride || configured;
  const projectRoot = normalizeAbsoluteDir(candidate);

  if (!candidate) {
    return {
      ok: false,
      projectRoot: "",
      source,
      configPath,
      error: "workspace_root_not_selected",
    };
  }

  const exists = fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory();
  if (!exists) {
    return {
      ok: false,
      projectRoot,
      source,
      configPath,
      error: "workspace_root_not_a_directory",
    };
  }

  return {
    ok: true,
    projectRoot,
    source,
    configPath,
  };
}

export function assertWorkspaceRootReady(aiOsRoot, resolvedWorkspace = null) {
  const resolved = resolvedWorkspace || resolveProjectRoot(aiOsRoot);

  if (!resolved?.ok) {
    throw new Error(resolved?.error || "workspace_root_invalid");
  }

  if (!resolved.projectRoot || resolved.source === "default") {
    throw new Error("workspace_root_not_selected");
  }

  const repoRoot = normalizeAbsoluteDir(path.dirname(aiOsRoot));
  const workspaceRoot = normalizeAbsoluteDir(resolved.projectRoot);

  if (
    isSameOrNestedPath(workspaceRoot, repoRoot) ||
    isSameOrNestedPath(repoRoot, workspaceRoot)
  ) {
    throw new Error("workspace_root_must_be_separate_from_ai_human_os_repo");
  }

  return {
    ...resolved,
    projectRoot: workspaceRoot,
    repoRoot,
  };
}
