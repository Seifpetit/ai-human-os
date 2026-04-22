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

- `AI-Human OS/data/cycle_metrics.jsonl`
- `AI-Human OS/data/run_metrics.json`

`node run_ai.js` now initializes those artifacts at run start, so metrics exist even for zero-cycle or preflight-failed runs.

## Throughput Policy

Throughput is now controlled by `AI-Human OS/memory/THROUGHPUT_POLICY.json`.

- Gate 2 can auto-approve narrow, low-drift compiled plans
- Gate 3 can auto-approve low-risk verified artifacts
- execution retries are bounded by classification-specific limits and stop early when the same failure signature repeats

The gates still exist. Auto-approval only changes who satisfies the gate: human or deterministic policy. The decision is written directly into `EXECUTION_CONFIRMATION.md` and `COMMIT_CONFIRMATION.md`.

## Notes

- The repo currently has no formal test script in `package.json`.
- Pipeline state and metrics are persisted under `AI-Human OS/data/`.
- Planning compiler evaluations include decision and cross-stage traceability artifacts under `AI-Human OS/data/`.
- Selective behavior-simulation state is persisted under `AI-Human OS/data/behavior_state.json`.
- Human-readable metrics output is generated under `AI-Human OS/data/metrics_report/`.
- The generated diagrams are stored in `AI-Human OS/.docs/`.
