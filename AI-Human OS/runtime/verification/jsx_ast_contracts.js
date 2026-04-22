function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function splitTopLevelCsv(value) {
  const parts = [];
  let current = "";
  let depth = 0;

  for (const char of String(value || "")) {
    if (char === "{" || char === "[" || char === "(") depth += 1;
    if (char === "}" || char === "]" || char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

function extractImportStatements(content) {
  return (content.match(/^\s*import[\s\S]*?;?\s*$/gm) || []).map(line => line.trim()).filter(Boolean);
}

function extractImportedNames(importStatement) {
  const withoutPrefix = importStatement.replace(/^\s*import\s+/, "");
  const [clause] = withoutPrefix.split(/\s+from\s+/);
  if (!clause) return [];

  const names = [];
  const trimmedClause = clause.trim();

  if (trimmedClause.startsWith("{")) {
    for (const part of splitTopLevelCsv(trimmedClause.replace(/^\{|\}$/g, ""))) {
      const [left, alias] = part.split(/\s+as\s+/i);
      names.push((alias || left || "").trim());
    }
  } else {
    const [defaultPart, namedPart] = splitTopLevelCsv(trimmedClause);
    if (defaultPart && !defaultPart.includes("{") && !defaultPart.startsWith("*")) {
      names.push(defaultPart.trim());
    }

    if (namedPart && namedPart.includes("{")) {
      for (const part of splitTopLevelCsv(namedPart.replace(/^\s*\{|\}\s*$/g, ""))) {
        const [left, alias] = part.split(/\s+as\s+/i);
        names.push((alias || left || "").trim());
      }
    }
  }

  return unique(names);
}

function extractImportSource(importStatement) {
  return importStatement.match(/\sfrom\s+['"]([^'"]+)['"]/)?.[1] || "";
}

function extractExportedSymbols(content) {
  const names = [];
  const namedRegex = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  let match;

  while ((match = namedRegex.exec(content)) !== null) {
    names.push(match[1]);
  }

  const defaultName =
    content.match(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)/)?.[1] ||
    content.match(/export\s+default\s+([A-Za-z_$][\w$]*)/)?.[1] ||
    "";

  return {
    default_export: defaultName || (/export\s+default\b/.test(content) ? "default export" : ""),
    named_exports: unique(names),
  };
}

function extractFunctionLikeParams(content) {
  const entries = [];
  const patterns = [
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g,
    /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g,
    /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*=>/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      entries.push({
        name: match[1],
        raw_params: match[2] || "",
      });
    }
  }

  return entries;
}

function extractPropNamesFromParams(rawParams) {
  const trimmed = String(rawParams || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return splitTopLevelCsv(trimmed.slice(1, -1))
      .map(part => part.split("=")[0].split(":")[0].trim())
      .filter(Boolean);
  }

  return splitTopLevelCsv(trimmed)
    .map(part => part.split("=")[0].trim())
    .filter(Boolean);
}

function extractJsxElements(content) {
  const elements = [];
  const regex = /<\s*([A-Za-z][\w.-]*)\b([^>]*)>/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const elementName = match[1];
    const props = unique(
      [...match[2].matchAll(/([A-Za-z_$][\w$-]*)\s*=/g)].map(propMatch => propMatch[1])
    );

    elements.push({
      name: elementName,
      props,
    });
  }

  return elements;
}

function detectStateMutation(content) {
  const mutations = [];

  if (/\bsetState\s*\(/.test(content)) mutations.push("setState");
  if (/\bdispatch\s*\(/.test(content)) mutations.push("dispatch");
  if (/\bstore\.[A-Za-z_$][\w$]*\s*=/.test(content)) mutations.push("store_assignment");
  if (/\bstate\.[A-Za-z_$][\w$]*\s*=/.test(content)) mutations.push("state_assignment");

  return unique(mutations);
}

function detectNetworkCalls(content) {
  const network = [];

  if (/\bfetch\s*\(/.test(content)) network.push("fetch");
  if (/new\s+WebSocket\s*\(/.test(content)) network.push("WebSocket");
  if (/\bsocket\.(emit|send)\s*\(/.test(content)) network.push("socket");
  if (/\bio\s*\(/.test(content)) network.push("io");

  return unique(network);
}

export function analyzeJsxAst(content) {
  const imports = extractImportStatements(content).map(statement => ({
    statement,
    source: extractImportSource(statement),
    imported_names: extractImportedNames(statement),
  }));
  const exports = extractExportedSymbols(content);
  const functionParams = extractFunctionLikeParams(content).map(entry => ({
    ...entry,
    prop_names: extractPropNamesFromParams(entry.raw_params),
  }));
  const jsxElements = extractJsxElements(content);

  return {
    imports,
    exports,
    function_params: functionParams,
    jsx_elements: jsxElements,
    state_mutations: detectStateMutation(content),
    network_calls: detectNetworkCalls(content),
  };
}

export function getComponentPropNames(analysis, componentName) {
  const component = (analysis.function_params || []).find(entry => entry.name === componentName);
  return component?.prop_names || [];
}

export function getJsxElementProps(analysis, elementName) {
  return unique(
    (analysis.jsx_elements || [])
      .filter(element => element.name === elementName)
      .flatMap(element => element.props || [])
  );
}

export function getImportedSymbols(analysis) {
  return unique((analysis.imports || []).flatMap(entry => entry.imported_names || []));
}

export function getJsxElementNames(analysis) {
  return unique((analysis.jsx_elements || []).map(entry => entry.name));
}
