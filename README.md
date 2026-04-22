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
-> deterministic plan compiler -> one-file execution cycles
-> verification -> registry update -> runtime-state commit -> metrics
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

Execution:

```bash
node run_ai.js
```

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

## Notes

- The repo currently has no formal test script in `package.json`.
- Pipeline state and metrics are persisted under `AI-Human OS/data/`.
- Human-readable metrics output is generated under `AI-Human OS/data/metrics_report/`.
- The generated diagrams are stored in `AI-Human OS/.docs/`.
