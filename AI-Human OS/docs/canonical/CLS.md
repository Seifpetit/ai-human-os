# CLS

Contract Layers Schema for the current product.

The current product ends at Screen 4. It does not include downstream code execution.

## Current Layer Map

### L0. Raw Intent Intake

- Producer: human through Screen 1
- Input: one short intent string
- Output:
  - `decision_graph`
  - `interrogation_plan`
- Boundary:
  - `POST /api/l0/init`

### L1. Interrogation Loop

- Producer: Screen 2
- Input:
  - `decision_graph`
  - `interrogation_plan`
  - human answers
- Output:
  - updated `decision_graph`
  - `interrogation_trace`
- Rule:
  - only precise answers update the graph

### L1.9. Verification

- Producer: product API verifier
- Input:
  - `raw_intent`
  - `decision_graph`
  - `interrogation_trace`
- Output:
  - `status`
  - `flags`
- Boundary:
  - `POST /api/l1/verify`

### L2. Architecture Compilation

- Producer: deterministic frontend compiler
- Input: resolved `decision_graph`
- Output: `implementation_plan`
- Rule:
  - deterministic only
  - no LLM calls

### L3. Build Blueprint Compilation

- Producer: deterministic frontend compiler
- Input:
  - `implementation_plan`
  - `decision_graph`
  - file-based template input
- Output: `build_spec`
- Rule:
  - deterministic only
  - no LLM calls

### Screen 4. Build Blueprint

- Producer: frontend state machine
- Input: `build_spec`
- Output:
  - narrative
  - flow
  - assumptions
  - modules
  - dependencies
  - build order
  - copyable prompts

## Product Boundary

The current product ends here:

```text
Screen 4 / Build Blueprint
```

Anything beyond that is outside the current product and only survives as archived reference material under `AI-Human OS/docs/archive/`.
