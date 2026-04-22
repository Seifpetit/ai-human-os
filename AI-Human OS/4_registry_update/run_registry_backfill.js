import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  getRuntimePaths,
  readJson,
  syncFileRegistryJson,
  writeJson,
} from "../runtime/planning/data_layer.js";
import { analyzeFileForRegistry } from "../runtime/registry/file_registry_analysis.js";
import {
  logStep,
  logSub,
  logSuccess,
  logWarn,
  logError,
} from "../3_execution/run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const REG_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(REG_DIR);
const PROJECT_ROOT = path.dirname(AI_OS_ROOT);
const PATHS = getRuntimePaths(AI_OS_ROOT);

logStep("Registry Backfill");

try {
  let registry = syncFileRegistryJson(AI_OS_ROOT);
  registry = readJson(PATHS.fileRegistryJson, registry);

  const fileEntries = Object.entries(registry.files || {});
  let updatedCount = 0;

  for (const [relativePath, entry] of fileEntries) {
    const fullPath = path.join(PROJECT_ROOT, relativePath);

    if (!fs.existsSync(fullPath)) {
      logWarn(`Skipping missing file: ${relativePath}`);
      continue;
    }

    logSub(`Backfilling ${relativePath}...`);

    const content = fs.readFileSync(fullPath, "utf-8");
    const analyzed = analyzeFileForRegistry({
      filePath: relativePath,
      content,
      requestPurpose: entry.responsibility || "",
      requestDependencies: entry.dependencies || [],
    });

    registry.files[relativePath] = {
      ...entry,
      ...analyzed,
      history: entry.history || [],
    };

    updatedCount++;
  }

  writeJson(PATHS.fileRegistryJson, registry);
  syncFileRegistryJson(AI_OS_ROOT);

  logSuccess(`Backfilled ${updatedCount} registry entr${updatedCount === 1 ? "y" : "ies"}`);
} catch (err) {
  logError("Registry backfill failed");
  console.error(err.message);
  process.exit(1);
}
