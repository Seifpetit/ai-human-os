import path from "path";
import { analyzeJsxAst, getImportedSymbols, getJsxElementNames } from "./jsx_ast_contracts.js";

function normalizePathFragment(value) {
  return String(value || "").replace(/\\/g, "/");
}

export function analyzeJsxLikeFile(content) {
  const analysis = analyzeJsxAst(content);

  return {
    imports: (analysis.imports || []).map(entry => ({
      statement: entry.statement,
      source: entry.source,
      importedNames: entry.imported_names || [],
    })),
    jsxElements: getJsxElementNames(analysis),
  };
}

export function checkSemanticRequirementsWithJsxAnalysis(content, requirements = {}) {
  const analysis = analyzeJsxLikeFile(content);
  const failures = [];
  const importedSymbols = getImportedSymbols(analyzeJsxAst(content));

  for (const importPath of requirements.must_import || []) {
    const importName = path.basename(importPath, path.extname(importPath));
    const importFile = path.basename(importPath);
    const importStem = path.basename(importPath, path.extname(importPath));
    const normalizedImportPath = normalizePathFragment(importPath);

    const found = analysis.imports.some(entry => {
      const source = normalizePathFragment(entry.source);
      const hasName = entry.importedNames.includes(importName) || importedSymbols.includes(importName);
      const hasPath =
        source.endsWith(importFile) ||
        source.endsWith(importStem) ||
        normalizedImportPath.endsWith(source) ||
        source.includes(importStem);

      return hasName && hasPath;
    });

    if (!found) {
      failures.push(`Missing required import for ${importName}`);
    }
  }

  for (const symbol of requirements.must_use || []) {
    if (!analysis.jsxElements.includes(symbol)) {
      failures.push(`Missing required usage of ${symbol}`);
    }
  }

  for (const forbiddenPattern of requirements.must_not_use || []) {
    if (forbiddenPattern === "<button") {
      if (analysis.jsxElements.includes("button")) {
        failures.push(`Forbidden pattern present: ${forbiddenPattern}`);
      }
      continue;
    }

    if (content.includes(forbiddenPattern)) {
      failures.push(`Forbidden pattern present: ${forbiddenPattern}`);
    }
  }

  return {
    analysis,
    failures,
  };
}
