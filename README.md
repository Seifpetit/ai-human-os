# ai-human-os

Deterministic orchestration around LLM-driven code generation. Planning, sequencing, verification, registry updates, and recovery are owned by code; the model is constrained to scoped file generation.

## Overview

This repository contains two connected pieces:

- `AI-Human OS/`: the planning and execution pipeline
- `client/`, `server/`, `shared/`: a small multiplayer game surface used as the current target project

The pipeline compiles human intent into an ordered plan, executes one operation at a time, verifies the generated file, records runtime state, and writes per-cycle metrics.

High-level flow:

```text
Human intent -> planning intake -> approval -> staged planning
-> deterministic plan compiler -> execution confirmation gate
-> selective behavior simulation for stateful operations
-> one-file execution cycles
-> verification -> commit confirmation gate
-> registry update -> runtime-state commit -> metrics
```

The canonical flow description lives in [AI-Human OS/HFD.md](AI-Human%20OS/HFD.md).
The canonical contract spec lives in [AI-Human OS/.docs/CLS.md](AI-Human%20OS/.docs/CLS.md).

## Repository Layout

- `AI-Human OS/0_init`: initialization prompts and memory bootstrapping
- `AI-Human OS/1_planning`: intent intake and staged plan generation
- `AI-Human OS/2_behavior`: behavior/state-flow artifacts
- `AI-Human OS/3_execution`: operator, execute, and verify steps
- `AI-Human OS/4_registry_update`: file registry synchronization
- `AI-Human OS/5_commit`: applied-state updates
- `AI-Human OS/runtime`: deterministic runtime modules
- `AI-Human OS/data`: compiled plan, execution artifacts, verifier output, and metrics
- `client/`: Vite + React browser client
- `server/`: local server runtime in JavaScript
- `shared/`: shared multiplayer command/result contracts

## Stack

- Node.js
- Vite
- React 18
- JavaScript ES modules
- Codex CLI by default for model execution via `AI-Human OS/runtime/model/model_adapter.js`

## Local Development

Install dependencies:

```bash
npm install
```

Run the browser app:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

## Pipeline Entry Points

Planning intake:

```bash
node run_planning_intake.js
```

Planning:

```bash
node run_planning.js
```

Gate 2 review:

```text
Review AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md
If Approval Status is not already approved, change it to approved
```

Gate 3 review:

```text
Review AI-Human OS/5_commit/COMMIT_CONFIRMATION.md
If Approval Status is not already approved, change it to approved
```

Execution:

```bash
node run_ai.js
```

For operations that touch server authority, shared contracts, state ownership, or sync boundaries, the operator now runs the `AI-Human OS/2_behavior/` simulation chain before file generation and blocks execution if the simulation report does not pass.

Schema upgrade path:

```bash
node run_schema_upgrade.js
```

Metrics report:

```bash
node run_metrics_report.js
```

Direct Python entrypoint:

```bash
python "AI-Human OS/8_metrics/render_metrics_report.py"
```

The reporter treats these files as the canonical metric inputs:

- `AI-Human OS/data/workspaces/<workspace_id>/cycle_metrics.jsonl`
- `AI-Human OS/data/workspaces/<workspace_id>/run_metrics.json`

`node run_ai.js` now initializes those artifacts at run start, so metrics exist even for zero-cycle or preflight-failed runs.

Note: metrics and runtime state are workspace-scoped under `AI-Human OS/data/workspaces/<workspace_id>/...` when using the Phase 2 workspace root selector.

## Throughput Policy

Throughput is now controlled by `AI-Human OS/memory/THROUGHPUT_POLICY.json`.

- Gate 2 can auto-approve narrow, low-drift compiled plans
- Gate 3 can auto-approve low-risk verified artifacts
- execution retries are bounded by classification-specific limits and stop early when the same failure signature repeats

The gates still exist. Auto-approval only changes who satisfies the gate: human or deterministic policy. The decision is written directly into `EXECUTION_CONFIRMATION.md` and `COMMIT_CONFIRMATION.md`.

## Notes

- The repo currently has no formal test script in `package.json`.
- Pipeline state and metrics are persisted under `AI-Human OS/data/workspaces/<workspace_id>/...`.
- Planning compiler evaluations include decision and cross-stage traceability artifacts under `AI-Human OS/data/workspaces/<workspace_id>/`.
- Selective behavior-simulation state is persisted under `AI-Human OS/data/workspaces/<workspace_id>/behavior_state.json`.
- Human-readable metrics output is generated under `AI-Human OS/data/metrics_report/`.
- The generated diagrams are stored in `AI-Human OS/.docs/`.

## Human Console

This repo includes a minimal local “Human Console” UI for the AI-Human OS pipeline (gate approvals, artifact viewing, and live logs).

Start the local console API:

```bash
npm run console:api
```

Start the console UI (separate Vite app):

```bash
npm run console:ui
```

Then open `http://127.0.0.1:5174`.

Safety model:
- The console can only edit `Approval Status` for Gate 1/2/3 docs.
- The console can only run an allowlisted set of pipeline entrypoints.

What the console now includes:
- left-side CLS stepper with a clear "YOU ARE HERE" state
- artifact viewer for the current gate and the live planning/execution artifacts
- workspace-root selector for targeting a different project directory
- live log stream for allowlisted pipeline commands
- artifact search and pinned artifacts for fast review
- artifact diff view backed by workspace-scoped snapshot history
- cycle timeline with jump-to-artifact shortcuts
- blocked-state summaries derived from canonical run and verifier artifacts

## Human Console Workspace Root

The console can target a different project directory (where code is generated/modified) via:

- UI field: "Set Workspace" in the Human Console
- config file: `AI-Human OS/memory/WORKSPACE_CONFIG.json`
- env override: `AI_HUMAN_OS_WORKSPACE_ROOT` (takes precedence over config)

The pipeline will still read/write its own AI-Human OS artifacts in this repo, but file generation, verification, registry reads, and commit checks resolve target files under the selected workspace root.

Runtime state for each workspace is isolated under:

- `AI-Human OS/data/workspaces/<workspace_id>/implementation_plan.json`
- `AI-Human OS/data/workspaces/<workspace_id>/target_file_request.json`
- `AI-Human OS/data/workspaces/<workspace_id>/execution_result.json`
- `AI-Human OS/data/workspaces/<workspace_id>/verify_result.json`
- `AI-Human OS/data/workspaces/<workspace_id>/cycle_metrics.jsonl`
- `AI-Human OS/data/workspaces/<workspace_id>/run_metrics.json`
- `AI-Human OS/data/workspaces/<workspace_id>/console_artifact_snapshots.json`
