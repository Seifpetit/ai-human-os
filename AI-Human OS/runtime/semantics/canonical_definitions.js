import fs from "fs";
import path from "path";

import { getRuntimePaths, readJson } from "../planning/data_layer.js";

export const DEFAULT_CANONICAL_DEFINITIONS = {
  version: 1,
  definitions: {
    contract: {
      name: "Contract",
      short: "A contract is an artifact plus the invariants its consumer is allowed to assume.",
    },
    contract_layer: {
      name: "Contract Layer",
      short: "A contract layer is a phase boundary where one contract is produced and validated before the system can move forward.",
    },
    cycle: {
      name: "Cycle",
      short: "A cycle is one planned operation_key applied to one target file across zero or more retries.",
    },
    run: {
      name: "Run",
      short: "A run is one invocation of node run_ai.js that attempts to apply zero or more cycles against the current compiled plan and state.",
    },
    complete_run: {
      name: "Complete Run",
      short: "A complete run is a run that finishes with lifecycle.status=completed and no remaining runnable operations for the compiled plan.",
    },
  },
};

export function loadCanonicalDefinitions(aiOsRoot) {
  const paths = getRuntimePaths(aiOsRoot);
  const filePath = paths.canonicalDefinitionsJson;

  if (!fs.existsSync(filePath)) {
    return DEFAULT_CANONICAL_DEFINITIONS;
  }

  const loaded = readJson(filePath, null);
  if (!loaded || typeof loaded !== "object") {
    return DEFAULT_CANONICAL_DEFINITIONS;
  }

  const version = Number(loaded.version || 0);
  if (!Number.isFinite(version) || version <= 0) {
    return DEFAULT_CANONICAL_DEFINITIONS;
  }

  return loaded;
}

export function getCanonicalDefinition(aiOsRoot, key) {
  const defs = loadCanonicalDefinitions(aiOsRoot);
  return defs?.definitions?.[key] || null;
}

export function getCanonicalDefinitionsPath(aiOsRoot) {
  const paths = getRuntimePaths(aiOsRoot);
  return path.normalize(paths.canonicalDefinitionsJson);
}

