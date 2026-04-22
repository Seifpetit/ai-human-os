import fs from "fs";
import path from "path";

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

function extractImportedSymbols(content) {
  return new Set(
    [...content.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["']/g)].map(match => match[1])
  );
}

function extractJsxElements(content) {
  return new Set(
    [...content.matchAll(/<\s*([A-Z][A-Za-z0-9_]*)\b/g)].map(match => match[1])
  );
}

export function checkUiSurfaceCoherence({ projectRoot, request, planData }) {
  const delivery = planData?.delivery_surfaces || {};
  const crossFileContracts = planData?.cross_file_contracts || {};
  const surfaces = [
    delivery.render_surface,
    delivery.style_surface,
    delivery.runtime_entry_surface,
  ].filter(Boolean);

  if (!surfaces.includes(request?.file_path)) {
    return {
      applicable: false,
      skipped: true,
      reason: "request_outside_delivery_surface",
      failures: [],
    };
  }

  const renderPath = delivery.render_surface ? path.join(projectRoot, delivery.render_surface) : "";
  const stylePath = delivery.style_surface ? path.join(projectRoot, delivery.style_surface) : "";
  const runtimePath = delivery.runtime_entry_surface ? path.join(projectRoot, delivery.runtime_entry_surface) : "";

  if (!renderPath || !stylePath || !runtimePath) {
    return {
      applicable: true,
      skipped: true,
      reason: "delivery_surfaces_missing",
      failures: [],
    };
  }

  if (!fs.existsSync(renderPath) || !fs.existsSync(stylePath) || !fs.existsSync(runtimePath)) {
    return {
      applicable: true,
      skipped: true,
      reason: "surface_incomplete",
      failures: [],
    };
  }

  const renderContent = safeRead(renderPath);
  const styleContent = safeRead(stylePath);
  const runtimeContent = safeRead(runtimePath);

  const renderClasses = extractClassNamesFromJsx(renderContent);
  const styleSelectors = extractCssSelectors(styleContent);
  const runtimeImports = extractImportedSymbols(runtimeContent);
  const runtimeJsx = extractJsxElements(runtimeContent);
  const childOwnedHooks = new Set(
    (crossFileContracts.child_components || []).flatMap(component => component.class_hooks || [])
  );

  const failures = [];

  for (const className of renderClasses) {
    if (className.startsWith("lobby-layout") && !styleSelectors.has(className)) {
      failures.push(`Render surface uses class hook '${className}' but style surface does not define it`);
    }
  }

  for (const selector of styleSelectors) {
    if (childOwnedHooks.has(selector)) {
      continue;
    }

    if (selector.startsWith("lobby-layout__action") && !renderClasses.has(selector)) {
      failures.push(`Style surface defines '${selector}' but render surface does not use that class hook`);
    }
  }

  const renderSymbol = path.basename(delivery.render_surface, path.extname(delivery.render_surface));
  if (!runtimeImports.has(renderSymbol)) {
    failures.push(`Runtime entry surface does not import declared render surface symbol '${renderSymbol}'`);
  }

  if (!runtimeJsx.has(renderSymbol)) {
    failures.push(`Runtime entry surface does not render declared render surface symbol '${renderSymbol}'`);
  }

  return {
    applicable: true,
    skipped: false,
    reason: "",
    failures,
    surfaces: delivery,
  };
}
