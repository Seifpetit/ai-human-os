# UI

Current single-page product flow.

## Screen Sequence

### Screen 1. Raw Intent

- User enters a short build request.
- Action: `Continue`
- API:
  - `POST /api/l0/init`
- Output:
  - `decision_graph`
  - `interrogation_plan`

### Screen 2. Interrogation

- User answers one question at a time.
- Domains are shown as progress pills.
- Only precise answers update the decision graph.
- Output:
  - updated `decision_graph`
  - `interrogation_trace`

### Screen 3. Verification

- API:
  - `POST /api/l1/verify`
- If verifier returns flags:
  - user can `Accept`
  - user can `Edit`
  - user can `Accept All`
- Once resolved:
  - frontend compiles L2 and L3

### Screen 4. Build Blueprint

- Final product screen
- Read-only clarity artifact
- Shows:
  - System Overview
  - Execution Flow
  - Assumptions
  - Start Building
  - Modules
  - Dependencies
  - Build Checklist
  - Module Prompts
  - Build Order
  - Contracts
  - File Plan

## Product Summary

```text
Raw Intent
-> Interrogation
-> Verification
-> Build Blueprint
```
