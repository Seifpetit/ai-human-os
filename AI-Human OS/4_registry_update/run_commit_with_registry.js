import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

import { ensureCommitConfirmationApproved } from "../runtime/commit/commit_confirmation.js";
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
const PROJECT_ROOT = path.dirname(AI_OS_ROOT);

logStep("Commit + Registry Step");

logDivider();
logSub("Checking human commit gate...");

try {
  const context = ensureCommitConfirmationApproved({
    aiOsRoot: AI_OS_ROOT,
    projectRoot: PROJECT_ROOT,
  });
  if (context.approval?.source === "throughput_policy_auto_approve") {
    logSuccess(`Commit confirmation auto-approved for ${context.filePath}`);
  } else {
    logSuccess(`Commit confirmation approved for ${context.filePath}`);
  }
} catch (err) {
  logError("Commit gate blocked");
  console.error(err.message);
  process.exit(1);
}

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
