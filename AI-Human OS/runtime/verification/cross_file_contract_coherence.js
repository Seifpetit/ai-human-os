import fs from "fs";
import path from "path";
import { analyzeJsxAst, getComponentPropNames, getImportedSymbols, getJsxElementNames, getJsxElementProps } from "./jsx_ast_contracts.js";

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function extractClassNamesFromJsx(content) {
  const classNames = new Set();
  const matches = content.matchAll(/className\s*=\s*"([^"]+)"/g);

  for (const match of matches) {
    for (const token of match[1].split(/\s+/).map(item => item.trim()).filter(Boolean)) {
      classNames.add(token);
    }
  }

  return classNames;
}

function extractCssSelectors(content) {
  return new Set(
    [...content.matchAll(/\.([A-Za-z0-9_-]+)\s*[{,:]/g)].map(match => match[1])
  );
}

export function checkCrossFileContractCoherence({ projectRoot, request, planData }) {
  const contracts = request?.cross_file_contracts || planData?.cross_file_contracts || {};
  const targetFile = request?.file_path || "";
  const renderSurface = planData?.delivery_surfaces?.render_surface || "";
  const styleSurface = planData?.delivery_surfaces?.style_surface || "";
  const childContracts = contracts.child_components || [];
  const propContracts = contracts.prop_contracts || [];
  const surfaceFamily = String(contracts.surface_family || "").trim();
  const failures = [];

  const relevantChildContract = childContracts.find(item => item.file_path === targetFile) || null;
  const relevantParentContracts = propContracts.filter(item => item.parent_file_path === targetFile);
  const applicable =
    targetFile === renderSurface ||
    targetFile === styleSurface ||
    targetFile === contracts.style_owner ||
    Boolean(relevantChildContract) ||
    relevantParentContracts.length > 0;

  if (!applicable) {
    return {
      applicable: false,
      skipped: true,
      reason: "request_outside_cross_file_contracts",
      failures: [],
    };
  }

  const renderContent = renderSurface ? safeRead(path.join(projectRoot, renderSurface)) : "";
  const styleContent = styleSurface ? safeRead(path.join(projectRoot, styleSurface)) : "";

  if (targetFile === contracts.style_owner && styleContent) {
    const selectors = extractCssSelectors(styleContent);

    if (surfaceFamily && !selectors.has(surfaceFamily)) {
      failures.push(`Style owner does not define the declared surface family '${surfaceFamily}'`);
    }

    for (const child of childContracts) {
      for (const hook of child.class_hooks || []) {
        if (!selectors.has(hook)) {
          failures.push(`Style owner does not define declared child hook '${hook}' for '${child.export_name || child.file_path}'`);
        }
      }
    }
  }

  if (targetFile === renderSurface && renderContent) {
    const renderAst = analyzeJsxAst(renderContent);
    const importedSymbols = new Set(getImportedSymbols(renderAst));
    const jsxElements = new Set(getJsxElementNames(renderAst));

    if (String(contracts.render_uses_style_surface || "").trim().toLowerCase() === "required" && surfaceFamily) {
      const renderClasses = extractClassNamesFromJsx(renderContent);
      const usesFamily = [...renderClasses].some(className => className === surfaceFamily || className.startsWith(`${surfaceFamily}__`) || className.startsWith(`${surfaceFamily}--`));

      if (!usesFamily) {
        failures.push(`Render surface does not use declared surface family '${surfaceFamily}'`);
      }
    }

    for (const child of childContracts) {
      if (child.export_name && !importedSymbols.has(child.export_name)) {
        failures.push(`Render surface does not import declared child component '${child.export_name}'`);
      }

      if (child.export_name && !jsxElements.has(child.export_name)) {
        failures.push(`Render surface does not render declared child component '${child.export_name}'`);
      }

      const elementProps = new Set(getJsxElementProps(renderAst, child.export_name));
      for (const contract of propContracts.filter(item => item.parent_file_path === targetFile && item.child_symbol === child.export_name)) {
        for (const prop of contract.props || []) {
          if (!elementProps.has(prop)) {
            failures.push(`Render surface does not pass declared prop '${prop}' to '${child.export_name}'`);
          }
        }
      }
    }
  }

  if (relevantChildContract) {
    const childPath = path.join(projectRoot, relevantChildContract.file_path);
    const childContent = safeRead(childPath);
    const childClasses = extractClassNamesFromJsx(childContent);
    const childAst = analyzeJsxAst(childContent);
    const params = getComponentPropNames(childAst, relevantChildContract.export_name);

    for (const hook of relevantChildContract.class_hooks || []) {
      if (!childClasses.has(hook)) {
        failures.push(`Child component '${relevantChildContract.export_name || targetFile}' does not expose declared class hook '${hook}'`);
      }
    }

    for (const prop of relevantChildContract.props || []) {
      if (!params.includes(prop)) {
        failures.push(`Child component '${relevantChildContract.export_name || targetFile}' does not accept declared prop '${prop}'`);
      }
    }
  }

  return {
    applicable: true,
    skipped: false,
    reason: "",
    failures,
  };
}
