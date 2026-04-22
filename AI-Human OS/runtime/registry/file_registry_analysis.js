import path from "path";
import { analyzeJsxAst, getComponentPropNames, getJsxElementNames } from "../verification/jsx_ast_contracts.js";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractImports(content) {
  const analysis = analyzeJsxAst(content);
  return (analysis.imports || []).map(entry => ({
    statement: entry.statement,
    source: entry.source,
    importedNames: entry.imported_names || [],
  }));
}

function inferOutputs(content, inputs, jsxElements) {
  const outputs = [];

  if (/onClick\s*=/.test(content) && inputs.some(input => input.name === "onClick")) {
    outputs.push("onClick event");
  }

  if (jsxElements.length > 0) {
    outputs.push("renders UI");
  }

  return unique(outputs);
}

function inferResponsibility(filePath, exportedNames, jsxElements, requestPurpose) {
  if (requestPurpose) return requestPurpose;
  if (jsxElements.length > 0) return `renders ${path.basename(filePath)}`;
  if (exportedNames.length > 0) return `exports ${exportedNames.join(", ")}`;
  return "";
}

export function analyzeFileForRegistry({ filePath, content, requestPurpose = "", requestDependencies = [], requestContracts = {} }) {
  const analysis = analyzeJsxAst(content);
  const imports = extractImports(content);
  const jsxElements = getJsxElementNames(analysis);
  const defaultExport = analysis.exports?.default_export || "";
  const namedExports = analysis.exports?.named_exports || [];
  const componentName = defaultExport || namedExports[0] || path.basename(filePath, path.extname(filePath));
  const inputEntries = getComponentPropNames(analysis, componentName).map(name => ({ name, required: false }));

  const exportList = [];
  if (defaultExport) {
    exportList.push(`default ${defaultExport}`);
  } else if (/export\s+default\b/.test(content)) {
    exportList.push("default export");
  }

  for (const named of namedExports) {
    exportList.push(named);
  }

  const reads = unique([
    ...inputEntries.map(entry => entry.name),
  ]);

  const outputs = inferOutputs(content, inputEntries, jsxElements);

  const allowedSymbols = unique([
    ...inputEntries.map(entry => entry.name),
    ...imports.flatMap(entry => entry.importedNames).filter(name => /^[A-Z]/.test(name)),
  ]);

  return {
    responsibility: inferResponsibility(filePath, exportList, jsxElements, requestPurpose),
    imports: unique(imports.map(entry => entry.source)),
    exports: unique(exportList),
    reads,
    writes: [],
    dependencies: unique(requestDependencies),
    interface: {
      inputs: inputEntries,
      outputs,
    },
    symbols: {
      allowed: allowedSymbols,
      forbidden: [],
    },
    contracts: {
      surface_family: requestContracts.cross_file_contracts?.surface_family || "",
      style_owner: requestContracts.cross_file_contracts?.style_owner || "",
      class_hooks: (requestContracts.cross_file_contracts?.child_components || [])
        .find(item => item.file_path === filePath)?.class_hooks || [],
      prop_inputs: inputEntries.map(entry => entry.name),
      workflow_mode: requestContracts.workflow_contracts?.workflow_mode || "",
      action_owner: requestContracts.workflow_contracts?.action_owner || "",
      request_boundary: requestContracts.workflow_contracts?.request_boundary || "",
      response_boundary: requestContracts.workflow_contracts?.response_boundary || "",
      state_owner: requestContracts.workflow_contracts?.state_owner || "",
      server_authority_boundary: requestContracts.workflow_contracts?.server_authority_boundary || "",
      allowed_callers: unique(requestDependencies),
    },
  };
}
