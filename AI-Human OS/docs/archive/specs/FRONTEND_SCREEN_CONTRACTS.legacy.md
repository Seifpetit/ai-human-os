# Frontend Screen Contracts

Target schema for the AI-Human OS human-facing console.

This document defines the intended screen model for the frontend before implementation.
It is a product contract, not a backend contract.

---

## Purpose

The frontend must be phase-based, not artifact-based.

The human should experience a guided workflow:

1. Init
2. Intake
3. Intent Review
4. Plan Review
5. Execution
6. Artifact Review only when blocked
7. Complete

The frontend must not assume the project is already initialized.

---

## Global Rules

- One screen = one human decision.
- User mode must never expose raw JSON.
- User mode must never expose internal planning ladder artifacts by default.
- Logs stay hidden in user mode unless the current screen explicitly allows them.
- Dev mode may expose raw artifacts, logs, and metrics, but must not change the primary flow.
- Gate 3 review is conditional. It is not a permanent top-level screen.
- The frontend must start from phase detection, not from folder contents guessed by the UI.

---

## Screen Detection Order

Detection must be evaluated in this order:

1. `Init`
2. `Intake`
3. `Intent Review`
4. `Plan Review`
5. `Artifact Review`
6. `Execution`
7. `Complete`

This order matters. Earlier screens win if their trigger is true.

---

## Screen Contracts

### Screen 1: Init

**Trigger**

- `workspace_root` is missing, invalid, or not yet confirmed by the human for the current project
- OR project context is not initialized enough to run intake

**Human Objective**

- choose the target project root
- define the project idea
- ensure the system has a valid base context before planning starts

**Visible**

- workspace path input
- current workspace status
- project idea / project context entry point
- explicit explanation that this is project initialization, not planning yet

**Primary Action**

- `Set Workspace`
- then `Continue to Intake` when initialization requirements are satisfied

**Hidden**

- all gates
- planning artifacts
- execution timeline
- logs
- metrics

**Backend Data Needed**

- `GET /api/workspace`
- workspace validation result
- project context readiness indicator

**Success Transition**

- move to `Intake`

**Failure Surface**

- invalid workspace path
- missing initialization inputs
- explicit blocking message only

---

### Screen 2: Intake

**Trigger**

- workspace is valid
- project context is initialized enough to run intake
- `INTENT_CONFIRMATION.md` does not yet exist

**Human Objective**

- provide raw human scope for the first machine interpretation pass

**Visible**

- planning prompt source path
- concise note explaining that the human must edit the source file directly
- `Run Intake` button

**Primary Action**

- `Run Intake`

**Hidden**

- Gate 1 approval controls
- plan summary
- execution state
- internal planning stage files

**Backend Data Needed**

- planning prompt source path
- task runner for `planning_intake`
- running state from `GET /api/run`

**Success Transition**

- when `INTENT_CONFIRMATION.md` exists, move to `Intent Review`

**Failure Surface**

- intake run failed
- show a simple blocking message, not raw logs in user mode

---

### Screen 3: Intent Review

**Trigger**

- `INTENT_CONFIRMATION.md` exists
- `gate1.approval_status !== "approved"`

**Human Objective**

- verify the machine understanding of the intended scope

**Visible**

- `INTENT_CONFIRMATION.md`
- `Approve Gate 1`
- `Edit`
- `Reload`

**Primary Action**

- `Approve Gate 1`

**Secondary Actions**

- `Edit`
- `Reload`

**Hidden**

- plan summary
- execution controls
- logs in user mode

**Backend Data Needed**

- `GET /api/artifact?id=intent_confirmation_md`
- `POST /api/gates/gate1/approve`

**Success Transition**

- move to `Plan Review`

**Failure Surface**

- show file path and manual edit instruction

---

### Screen 4: Plan Review

**Trigger**

- `gate1.approval_status === "approved"`
- `gate2.approval_status !== "approved"`

**Human Objective**

- approve what the system is actually about to build

**Visible**

- human summary of compiled plan
- file count
- operation count
- list of planned operations
- Gate 2 approval action

**Primary Action**

- `Approve Gate 2 and Start Execution`

**Hidden**

- raw `FEATURES_LIST.md`
- raw `FEATURE_REQUEST.md`
- raw `IMPLEMENTATION_PLAN.md`
- logs by default

**Backend Data Needed**

- `GET /api/artifact?id=implementation_plan_json`
- `GET /api/artifact?id=execution_confirmation_md`
- `POST /api/gates/gate2/approve`
- task runner for `ai`

**Success Transition**

- move to `Execution`

**Failure Surface**

- plan missing
- Gate 2 artifact missing
- planning failure summary only

---

### Screen 5: Execution

**Trigger**

- `gate1.approval_status === "approved"`
- `gate2.approval_status === "approved"`
- Gate 3 is not currently blocking
- run is not complete

**Human Objective**

- track progress through operations and continue the run

**Visible**

- progress bar
- operation list
- current operation
- simple status pills
- optional logs toggle in user mode

**Primary Action**

- `Run Next Cycle`

**Hidden**

- raw planning internals
- raw registry state
- full logs by default

**Backend Data Needed**

- `GET /api/state`
- `GET /api/artifact?id=implementation_plan_json`
- `GET /api/timeline`
- task runner for `ai`
- `GET /api/run`

**Status Model**

- `pending`
- `running`
- `verifying`
- `needs review`
- `done`
- `failed`

**Success Transition**

- remain on `Execution` while work remains
- move to `Complete` when run is complete

**Failure Surface**

- cycle failure summary
- optional logs

---

### Screen 6: Artifact Review

**Trigger**

- `gate3.approval_status !== "approved"`
- OR `run.lifecycle.status === "commit_gate_blocked"`

**Human Objective**

- approve the exact verified artifact before it enters accepted state

**Visible**

- `COMMIT_CONFIRMATION.md`
- affected operation context
- `Approve Gate 3`

**Primary Action**

- `Approve Gate 3`

**Hidden**

- unrelated artifacts
- global dashboard noise

**Backend Data Needed**

- `GET /api/artifact?id=commit_confirmation_md`
- `POST /api/gates/gate3/approve`
- `GET /api/state`

**Success Transition**

- return to `Execution`

**Failure Surface**

- approval failure message only

---

### Screen 7: Complete

**Trigger**

- `run.lifecycle.status === "completed"`

**Human Objective**

- understand outcome and decide what to do next

**Visible**

- completion state
- high-level metrics
- next step options

**Primary Action**

- `View Metrics`
- optionally `Start New Run`

**Hidden**

- planning internals
- raw artifact noise unless dev mode is enabled

**Backend Data Needed**

- `GET /api/artifact?id=run_metrics_json`
- optional metrics report trigger

**Success Transition**

- end state

---

## Dev Mode Contract

Dev mode extends the current screen. It does not replace it.

Dev mode may add:

- live logs
- raw artifact inspection
- gate status rail
- retry counts
- failure classification
- metrics panel

Dev mode must not change:

- screen order
- primary action
- primary artifact

---

## Hidden Internal Artifacts In User Mode

The following artifacts are internal by default and must not be primary-screen content in user mode:

- `FEATURES_LIST.md`
- `FEATURE_REQUEST.md`
- `IMPLEMENTATION_PLAN.md`
- `plan_decision_evaluation.json`
- `plan_traceability_evaluation.json`
- `execution_result.json`
- `verify_result.json`
- raw registry files
- raw metrics JSON

These may appear in dev mode only.

---

## Current Backend Gaps

The frontend schema above requires data the backend does not fully expose yet.

Missing or weakly defined backend inputs:

- project context readiness for `Init`
- canonical `current_screen` or equivalent phase signal
- explicit separation between `Init` and `Intake`
- human-safe summary endpoints for plan and execution state

Until those exist, the frontend may derive phases heuristically, but the product contract remains the target truth.

---

## Implementation Principle

The frontend must feel like a guided workflow:

- initialize project
- submit scope
- approve machine understanding
- approve execution plan
- monitor execution
- review exact artifact when blocked
- finish cleanly

It must not feel like a generic operator dashboard.
