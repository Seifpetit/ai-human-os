import fs from "fs";
import path from "path";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function operationRefForRequest(request) {
  const filePath = request?.file_path || "";
  const operationType =
    request?.planned_operation_type ||
    request?.effective_operation_type ||
    request?.operation_type ||
    "";

  return filePath && operationType ? `${filePath}::${operationType}` : "";
}

function matchesCapabilityDependency(request, dependency) {
  const filePath = request?.file_path || "";
  const operationRef = operationRefForRequest(request);
  const requiredContracts = dependency?.required_contracts || [];
  const prerequisiteOperations = dependency?.prerequisite_operations || [];

  return (
    requiredContracts.includes(filePath) ||
    prerequisiteOperations.includes(operationRef)
  );
}

function filePathFromOperationRef(operationRef) {
  return String(operationRef || "").split("::")[0]?.trim() || "";
}

export function checkCapabilityContractCoherence({ projectRoot, request, planData }) {
  const capabilityDependencies = planData?.capability_dependencies || [];
  const relevantDependencies = capabilityDependencies.filter(dependency =>
    matchesCapabilityDependency(request, dependency)
  );

  if (relevantDependencies.length === 0) {
    return {
      applicable: false,
      skipped: true,
      reason: "request_outside_capability_dependencies",
      failures: [],
      missing_contracts: [],
      capability_labels: [],
    };
  }

  const failures = [];
  const missingContracts = [];
  const capabilityLabels = [];
  const currentFile = request?.file_path || "";
  const currentOperationRef = operationRefForRequest(request);

  for (const dependency of relevantDependencies) {
    const status = normalize(dependency.status);
    const planAction = normalize(dependency.plan_action);
    const label = dependency.capability || "unknown_capability";
    capabilityLabels.push(label);

    if (!["missing", "partial"].includes(status) || planAction !== "establish_first") {
      continue;
    }

    const prerequisiteOperations = dependency.prerequisite_operations || [];
    const prerequisiteIndex = prerequisiteOperations.indexOf(currentOperationRef);
    let unresolvedContracts = [];

    if (prerequisiteIndex >= 0) {
      unresolvedContracts = prerequisiteOperations
        .slice(0, prerequisiteIndex)
        .map(filePathFromOperationRef)
        .filter(Boolean)
        .filter(contractPath => contractPath !== "none")
        .filter(contractPath => !fs.existsSync(path.join(projectRoot, contractPath)));
    } else {
      unresolvedContracts = (dependency.required_contracts || [])
        .filter(Boolean)
        .filter(contractPath => contractPath !== "none")
        .filter(contractPath => contractPath !== currentFile)
        .filter(contractPath => !fs.existsSync(path.join(projectRoot, contractPath)));
    }

    if (unresolvedContracts.length > 0) {
      missingContracts.push(...unresolvedContracts);
      failures.push(
        `Capability '${label}' is ${status} and still lacks required contracts before '${currentFile}': ${unresolvedContracts.join(", ")}`
      );
    }
  }

  return {
    applicable: true,
    skipped: false,
    reason: "",
    failures,
    missing_contracts: [...new Set(missingContracts)],
    capability_labels: [...new Set(capabilityLabels)],
  };
}
