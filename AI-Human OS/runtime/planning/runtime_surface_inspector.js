import fs from "fs";
import path from "path";

function exists(projectRoot, relativePath) {
  if (!relativePath) return false;
  return fs.existsSync(path.join(projectRoot, relativePath));
}

export function inspectRuntimeSurfaces({ projectRoot, planData }) {
  const delivery = planData?.delivery_surfaces || {};
  const browserScaffold = planData?.browser_scaffold || {};
  const defaultRuntimeCandidates = [
    "client/ui/App.js",
    "client/ui/index.js",
    "client/main.js",
  ];
  const defaultHtmlCandidates = [
    "index.html",
    "client/index.html",
  ];

  return {
    render_surface_exists: exists(projectRoot, delivery.render_surface),
    style_surface_exists: exists(projectRoot, delivery.style_surface),
    runtime_entry_surface_exists: exists(projectRoot, delivery.runtime_entry_surface),
    existing_runtime_candidates: defaultRuntimeCandidates.filter(candidate => exists(projectRoot, candidate)),
    html_entry_exists: exists(projectRoot, browserScaffold.html_entry),
    dom_mount_entry_exists: exists(projectRoot, browserScaffold.dom_mount_entry),
    existing_html_candidates: defaultHtmlCandidates.filter(candidate => exists(projectRoot, candidate)),
  };
}
