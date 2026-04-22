import { execSync } from "child_process";

execSync(`node "AI-Human OS/7_schema_upgrade/detect_contract_gap.js"`, { stdio: "inherit" });
execSync(`node "AI-Human OS/7_schema_upgrade/upgrade_schema_proposal.js"`, { stdio: "inherit" });
