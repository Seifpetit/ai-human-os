import fs from "fs";
import path from "path";

const DEFAULT_CONFIG = {
  version: 1,
  workspace_root: "",
  notes: [
    "workspace_root is the target project directory that AI-Human OS will mutate (write code into).",
    "If workspace_root is empty, the default is the directory that contains this AI-Human OS folder.",
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

export function loadWorkspaceConfig(aiOsRoot) {
  const configPath = getConfigPath(aiOsRoot);

  if (!fs.existsSync(configPath)) {
    writeJson(configPath, DEFAULT_CONFIG);
    return { config: DEFAULT_CONFIG, configPath };
  }

  const loaded = readJson(configPath, null);
  if (!isObject(loaded)) {
    writeJson(configPath, DEFAULT_CONFIG);
    return { config: DEFAULT_CONFIG, configPath };
  }

  const merged = {
    ...DEFAULT_CONFIG,
    ...loaded,
  };

  if (JSON.stringify(merged) !== JSON.stringify(loaded)) {
    writeJson(configPath, merged);
  }

  return { config: merged, configPath };
}

export function setWorkspaceRoot(aiOsRoot, workspaceRoot) {
  const configPath = getConfigPath(aiOsRoot);
  const { config } = loadWorkspaceConfig(aiOsRoot);

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
  const fallback = path.dirname(aiOsRoot);

  const candidate = envOverride || configured || fallback;
  const projectRoot = normalizeAbsoluteDir(candidate);

  let source = "default";
  if (envOverride) source = "env";
  else if (configured) source = "config";

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
