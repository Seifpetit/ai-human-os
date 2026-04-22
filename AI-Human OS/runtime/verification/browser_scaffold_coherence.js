import fs from "fs";
import path from "path";

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isNotRequired(value) {
  return normalize(value) === "not_required";
}

export function checkBrowserScaffoldCoherence({ projectRoot, request, planData }) {
  const scaffold = request?.browser_scaffold || planData?.browser_scaffold || {};
  const delivery = planData?.delivery_surfaces || {};
  const filePath = request?.file_path || "";
  const htmlEntry = scaffold.html_entry || "";
  const domMountEntry = scaffold.dom_mount_entry || "";
  const mountTarget = scaffold.mount_target || "";
  const runtimeEntry = delivery.runtime_entry_surface || "";
  const relevant = new Set([htmlEntry, domMountEntry, runtimeEntry].filter(Boolean).filter(value => !isNotRequired(value)));

  if (relevant.size === 0 || !relevant.has(filePath)) {
    return {
      applicable: false,
      skipped: true,
      reason: "request_outside_browser_scaffold",
      failures: [],
    };
  }

  const failures = [];

  if (filePath === htmlEntry && !isNotRequired(htmlEntry)) {
    const html = safeRead(path.join(projectRoot, htmlEntry));

    if (!isNotRequired(mountTarget) && !new RegExp(`id=["']${mountTarget}["']`).test(html)) {
      failures.push(`HTML entry does not define mount target id '${mountTarget}'`);
    }

    if (!isNotRequired(domMountEntry)) {
      const normalizedMount = domMountEntry.replace(/\\/g, "/");
      if (!html.includes(normalizedMount) && !html.includes(`/${normalizedMount}`)) {
        failures.push(`HTML entry does not load declared dom_mount_entry '${domMountEntry}'`);
      }
    }
  }

  if (filePath === domMountEntry && !isNotRequired(domMountEntry)) {
    const mountContent = safeRead(path.join(projectRoot, domMountEntry));

    if (!/createRoot\s*\(/.test(mountContent)) {
      failures.push("DOM mount entry does not call createRoot");
    }

    if (!isNotRequired(mountTarget) && !new RegExp(`getElementById\\(["']${mountTarget}["']\\)`).test(mountContent)) {
      failures.push(`DOM mount entry does not mount to declared target '${mountTarget}'`);
    }

    if (!isNotRequired(runtimeEntry)) {
      const runtimeStem = path.basename(runtimeEntry, path.extname(runtimeEntry));
      if (!new RegExp(`import\\s+${runtimeStem}\\s+from\\s+["'][^"']*${runtimeStem}["']`).test(mountContent)) {
        failures.push(`DOM mount entry does not import declared runtime entry surface '${runtimeStem}'`);
      }

      const rendersRuntime =
        new RegExp(`<\\s*${runtimeStem}\\b`).test(mountContent) ||
        new RegExp(`createElement\\(\\s*${runtimeStem}\\s*[,) ]`).test(mountContent);

      if (!rendersRuntime) {
        failures.push(`DOM mount entry does not render declared runtime entry surface '${runtimeStem}'`);
      }
    }
  }

  if (filePath === runtimeEntry && !isNotRequired(runtimeEntry)) {
    const runtimeContent = safeRead(path.join(projectRoot, runtimeEntry));
    const renderStem = path.basename(delivery.render_surface || "", path.extname(delivery.render_surface || ""));

    if (renderStem) {
      if (!new RegExp(`import\\s+${renderStem}\\s+from\\s+["'][^"']*${renderStem}["']`).test(runtimeContent)) {
        failures.push(`Runtime entry surface does not import declared render surface '${renderStem}'`);
      }

      if (!new RegExp(`<\\s*${renderStem}\\b`).test(runtimeContent)) {
        failures.push(`Runtime entry surface does not render declared render surface '${renderStem}'`);
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
