import { execFileSync } from "child_process";

const pythonCommand = process.env.PYTHON || "python";

execFileSync(
  pythonCommand,
  ["AI-Human OS/8_metrics/render_metrics_report.py"],
  {
    stdio: "inherit",
  }
);
