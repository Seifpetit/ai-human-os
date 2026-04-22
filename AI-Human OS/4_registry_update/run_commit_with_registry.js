import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

import {
  logStep,
  logSub,
  logSuccess,
  logError,
  logDivider
} from "../3_execution/run_logger.js";

const __filename = fileURLToPath(import.meta.url);
const COMMIT_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(COMMIT_DIR);

logStep("Commit + Registry Step");

logDivider();
logSub("Running registry update...");

try {
  execSync(`node "${AI_OS_ROOT}/4_registry_update/run_registry_update.js"`, {
    stdio: "inherit",
  });
  logSuccess("Registry update complete");
} catch {
  logError("Registry update failed");
  process.exit(1);
}

logDivider();
logSub("Running commit...");

try {
  execSync(`node "${AI_OS_ROOT}/5_commit/run_commit.js"`, {
    stdio: "inherit",
  });
  logSuccess("Commit complete");
} catch {
  logError("Commit failed");
  process.exit(1);
}

logStep("Commit + Registry Done\n");
