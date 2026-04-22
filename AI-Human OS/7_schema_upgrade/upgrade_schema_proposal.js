import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getRuntimePaths, readJson, writeJson } from "../runtime/planning/data_layer.js";

const __filename = fileURLToPath(import.meta.url);
const UPGRADE_DIR = path.dirname(__filename);
const AI_OS_ROOT = path.dirname(UPGRADE_DIR);
const PATHS = getRuntimePaths(AI_OS_ROOT);

const REPORT_JSON_PATH = path.join(PATHS.dataDir, "schema_gap_report.json");
const PROPOSAL_JSON_PATH = path.join(PATHS.dataDir, "schema_upgrade_proposal.json");
const PROPOSAL_MD_PATH = path.join(UPGRADE_DIR, "SCHEMA_UPGRADE_PLAN.md");

function buildProposal(report) {
  const common = {
    primary_layer: "planning",
    secondary_layer: "verification",
    tertiary_layer: "execution",
  };

  if (report.detected_gap_family === "transport_contracts") {
    return {
      ...common,
      schema_section: "Transport Contracts",
      fields: [
        "transport_mode",
        "client_transport_owner",
        "server_transport_owner",
        "route_contract",
        "method",
        "payload_format",
        "response_format",
        "dev_runtime_wiring",
        "transport_prerequisites",
      ],
      rationale:
        "The current plan defines capability and workflow boundaries, but not the concrete runtime transport contract between browser and server. The missing route/method/payload wiring is what blocked client/ui/createRoomClient.js.",
      exact_files_to_update: report.recommended_files || [],
      implementation_order: [
        "Extend plan prompt to require Transport Contracts when browser/server boundaries are crossed",
        "Extend implementation plan template with Transport Contracts fields",
        "Parse Transport Contracts into implementation_plan.json",
        "Require Transport Contracts in plan completeness for cross-runtime features",
        "Repair current IMPLEMENTATION_PLAN.md to make transport explicit",
        "Add transport_contract_coherence verifier",
        "Pass transport contract slice into target request and execute prompt",
      ],
    };
  }

  if (report.detected_gap_family === "capability_dependencies") {
    return {
      ...common,
      schema_section: "Capability Dependencies",
      fields: [
        "capability",
        "status",
        "rationale",
        "required_contracts",
        "existing_surfaces",
        "prerequisite_operations",
        "plan_action",
      ],
      rationale:
        "Consumer files are being scheduled before prerequisite contracts of the underlying capability are modeled or established.",
      exact_files_to_update: report.recommended_files || [],
      implementation_order: [
        "Extend plan prompt to require capability dependency analysis",
        "Extend implementation plan template with Capability Dependencies",
        "Parse capability dependencies into implementation_plan.json",
        "Require capability dependencies in plan completeness",
        "Add capability contract coherence verifier",
        "Pass capability dependency slice into target request and execute prompt",
      ],
    };
  }

  return {
    ...common,
    schema_section: "Unknown Contract Gap",
    fields: [],
    rationale: report.why_this_is_a_schema_gap || "No rationale available.",
    exact_files_to_update: report.recommended_files || [],
    implementation_order: [
      "Review schema gap report",
      "Name the missing contract family",
      "Add planning schema",
      "Add completeness and verifier support",
      "Add minimal execution payload support",
    ],
  };
}

function renderMarkdown(report, proposal) {
  const lines = [
    "# Schema Upgrade Plan",
    "",
    `- generated_at: ${new Date().toISOString()}`,
    `- detected_gap_family: ${report.detected_gap_family}`,
    `- target_schema_section: ${proposal.schema_section}`,
    "",
    "## Rationale",
    "",
    proposal.rationale,
    "",
    "## Fields To Add",
    "",
    ...(proposal.fields.length > 0 ? proposal.fields.map(field => `- ${field}`) : ["- none"]),
    "",
    "## Exact Files To Update",
    "",
    ...(proposal.exact_files_to_update || []).map(file => `- ${file}`),
    "",
    "## Implementation Order",
    "",
    ...(proposal.implementation_order || []).map((step, index) => `${index + 1}. ${step}`),
    "",
  ];

  return lines.join("\n");
}

function main() {
  const report = readJson(REPORT_JSON_PATH, null);
  if (!report) {
    throw new Error("Missing schema_gap_report.json. Run detect_contract_gap.js first.");
  }

  const proposal = buildProposal(report);
  writeJson(PROPOSAL_JSON_PATH, proposal);
  fs.writeFileSync(PROPOSAL_MD_PATH, renderMarkdown(report, proposal), "utf-8");
  console.log(`Schema upgrade plan written: ${PROPOSAL_MD_PATH}`);
}

main();
