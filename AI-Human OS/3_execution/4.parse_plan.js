import { syncImplementationPlanJson } from "../runtime/planning/data_layer.js";

export function getImplementationPlan(aiOsRoot) {
  return syncImplementationPlanJson(aiOsRoot);
}

export function getNextCycle(planData, completedOperationKeys) {
  const completed = new Set(completedOperationKeys || []);
  let blockedCount = 0;

  for (const operation of planData.operations || []) {
    if (completed.has(operation.operation_key)) {
      continue;
    }

    const depsSatisfied = (operation.depends_on || []).every(dep => completed.has(dep));
    if (!depsSatisfied) {
      blockedCount++;
      continue;
    }

    return {
      status: "runnable",
      file: operation.file_path,
      type: operation.operation_type,
      purpose: operation.purpose,
      depends: operation.depends_on || [],
      cycle: operation.cycle,
      operationKey: operation.operation_key,
      legacyRef: operation.legacy_ref,
      semanticRequirements: operation.semantic_requirements || {
        must_import: [],
        must_use: [],
        must_not_use: [],
        must_preserve: [],
      },
    };
  }

  const remaining = (planData.operations || []).filter(operation => !completed.has(operation.operation_key));

  if (remaining.length === 0) {
    return {
      status: "complete",
    };
  }

  return {
    status: "blocked",
    blocked_count: blockedCount,
    remaining: remaining.map(operation => ({
      operation_key: operation.operation_key,
      file_path: operation.file_path,
      depends_on: operation.depends_on || [],
    })),
  };
}
