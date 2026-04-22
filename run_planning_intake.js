import { execSync } from "child_process";

execSync(`node "AI-Human OS/1_planning/run_planning_intake.js"`, {
  stdio: "inherit",
});
