# UI_FLOW.md

## Purpose

This document defines the canonical screen structure, transition rules, and action contracts
for the AI-Human OS console UI.

The UI is a read and approval surface for deterministic pipeline state.
It does not drive the LLM. It does not own state. It reflects what the pipeline knows
and exposes the exact human actions the pipeline is waiting for.

Every button calls a deterministic endpoint.
Every screen transition is triggered by pipeline state, not by UI navigation.

---

## Three-Party Loop

- **Human** — defines meaning, scope, style, and approvals
- **LLM** — produces artifact content inside a bounded file-level task
- **Deterministic code** — owns state, validation, file writes, reset, and progression

The UI renders the current phase and next required human action
based on `GET /api/state`. Nothing else.

---

## Screen Map

```
S1a: Init
S1b: Intake
S2:  Plan
S3:  Execution
```

Screens advance automatically when pipeline state changes.
The human cannot manually navigate between screens.
The UI always shows the screen that matches the current pipeline state.

---

## Screen Detection

Derive current screen from `GET /api/state` polled every 2 seconds:

```
S1a (Init):
  state.workspace.valid !== true
  OR state.memory.project_context_complete !== true

S1b (Intake):
  workspace valid AND project context complete
  AND state.gates.gate1.approval_status !== "approved"

S2 (Plan):
  gate1 === "approved"
  AND state.gates.gate2.approval_status !== "approved"

S3 (Execution):
  gate1 === "approved"
  AND gate2 === "approved"

  Within S3 — Gate 3 substate:
  if state.gates.gate3.approval_status !== "approved"
  OR state.run.lifecycle.status === "commit_gate_blocked":
    show Gate 3 approval view
  else:
    show execution progress view
```

---

## S1a — Init

**Purpose:** Human establishes workspace and project memory before any LLM call.
No LLM is involved in this screen. This is human → deterministic only.

**Primary human actions:**

1. Set workspace root
2. Fill project context fields
3. Fill style/product standards

**Workspace input:**
- Text input: "Paste absolute path to your project folder"
- Button: "Set workspace" → `POST /api/workspace` with `{ root: <value> }`
- On success: show resolved path, mark workspace valid
- On error: show error inline, do not advance
- No native folder picker — browser cannot access server-side filesystem paths

**Project context:**
- Structured form fields mapped to `PROJECT_CONTEXT.md` sections:
  - Project name
  - One-line description
  - What players/users do
  - Core idea
  - Hard constraints
- On submit: `POST /api/artifact/write` with id `project_context_md` and field values
- Fields are pre-populated if file already exists

**Style / product standards:**
- Sub-page or collapsible section within S1a
- Structured fields mapped to `PRODUCT_STANDARDS.md`:
  - Quality level (select: prototype / standard / production / premium)
  - Product tone (select: playful / tactical / serious / minimal / bold)
  - Visual direction (text)
  - Color direction (text)
  - UI density (select: airy / balanced / compact)
- On submit: `POST /api/artifact/write` with id `product_standards_md`

**Gate out of S1a:**
- Deterministic: "Next step" button only enabled when:
  - workspace resolves cleanly
  - project_context_md written successfully
  - product_standards_md written successfully
- Button label: "Next — Generate scope"
- No button click required if pipeline detects all three already complete on load

---

## S1b — Intake

**Purpose:** Human edits the planning prompt. LLM runs intake and produces
INTENT_CONFIRMATION.md. Human reviews and approves or corrects Gate 1.

**Sub-phase A — Edit prompt:**
- Show current content of `1_planning/1_features_planning_prompt.txt`
  fetched via `GET /api/artifact?id=planning_prompt_txt`
- Editable textarea — this is the real file content, not a scratchpad
- Save button: `POST /api/artifact/write` with id `planning_prompt_txt`
- Confirmation: "File saved" before submit is allowed
- Button: "Generate scope" → `POST /api/run/planning_intake`
- During run: disable all buttons, show spinner + live log toggle

**Sub-phase B — Review Gate 1:**
- Appears automatically when `planning_intake` run completes
- Fetch `GET /api/artifact?id=intent_confirmation_md`
- Parse and render as structured sections, not raw markdown:
  - Approved scope (bullet list)
  - Exclusions (bullet list)
  - Ambiguities / open questions (highlighted if present)
  - Assumptions made (highlighted if present)
- If ambiguities or assumptions exist: show warning
  "Review these before approving — the machine made choices you didn't explicitly make"
- Two actions:
  - "Approve Gate 1" → `POST /api/gates/gate1/approve`
  - "Edit prompt" → return to Sub-phase A with current prompt pre-loaded
- Approve advances to S2 automatically via state poll

---

## S2 — Plan

**Purpose:** Human reviews the compiled plan before execution starts.
LLM has already run planning. Human approves Gate 2.

**What is shown:**
- Plain-English summary derived from `implementation_plan_json`:
  - "N operations across M features"
  - List: feature name → file count → operation types
  - No file paths in default view
- Expandable "See full plan":
  - Each operation: file name, operation type, depends_on
  - Still no raw JSON

**Gate 2 substate — if plan not yet compiled:**
- Show button: "Run planning" → `POST /api/run/planning`
- During run: disable buttons, show spinner + live log toggle
- When complete: show plan summary

**Primary action:**
- Button: "Start execution" →
  `POST /api/gates/gate2/approve` then `POST /api/run/ai`
- Gate 2 may be auto-approved by throughput policy — UI shows
  "Auto-approved by throughput policy" label if so

---

## S3 — Execution

**Purpose:** Human monitors execution and approves Gate 3 per cycle.

**Progress bar:**
- Top of screen: "X of N operations complete"
- Derived from `applied_operations.json` vs `implementation_plan_json`

**Operation list:**
- One row per operation
- Each row: file name · operation type · status pill
- Status values:
  - `pending` — not yet started
  - `running` — currently executing
  - `verifying` — verify script running
  - `needs review` — Gate 3 triggered
  - `done` — accepted and committed
  - `failed` — max retries hit, early-stop fired

**Gate 3 substate — inline per operation:**
- Triggered when `state.gates.gate3.approval_status !== "approved"`
  OR `state.run.lifecycle.status === "commit_gate_blocked"`
- That operation row expands inline:
  - Show `commit_confirmation_md` content rendered as structured sections:
    - File path
    - Operation type
    - Verification result summary
    - Content hash
  - Show generated file content in a scrollable code block
  - Two buttons:
    - "Approve" → `POST /api/gates/gate3/approve` → row collapses, next operation starts
    - "Reject" → `POST /api/run/planning_intake` (initiates retry flow — TBD)
- Gate 3 may be auto-approved by throughput policy — show label if so

**Logs:**
- "Show logs" toggle bottom right, collapsed by default
- Uses `GET /api/logs/stream` via EventSource

**Run complete:**
- When operator reaches IMPLEMENTATION COMPLETE:
  - Show summary: operations completed, failed, total retries
  - Button: "Start new feature" → `POST /api/reset` mode `normal`

---

## Dev Mode

Toggle top right, label "Dev mode", persisted in `localStorage`.
Dev mode extends each screen — it does not replace it.

**Added on all screens:**
- Right panel: live log stream always visible (GET /api/logs/stream)
- Left sidebar:
  - Gate 1 / Gate 2 / Gate 3 status cards
  - Each card: approval status · artifact name · last timestamp
  - Click card → show raw artifact content in a modal

**Added on S1b:**
- Show raw `INTENT_CONFIRMATION.md` below the parsed view

**Added on S2:**
- Show raw `implementation_plan_json` below the summary
- Show `plan_traceability_evaluation_json` and `plan_decision_evaluation_json`

**Added on S3:**
- Each operation row: retry count · failure classification (if failed)
- After run complete: full metrics panel
  - Source: `GET /api/artifact?id=run_metrics_json`
  - Shows: cycles attempted · accepted · failed · avg retries · stall events

---

## Disabled State Rules

Disable all action buttons when:
- `GET /api/run` returns `active_run?.status === "running"`
- Show spinner adjacent to the active task name
- No cancel button — the pipeline does not support mid-run interruption

---

## Missing Backend Endpoints

The following endpoints are required by this spec but do not yet exist:

1. `POST /api/artifact/write` — write content to an allowlisted artifact by id
   - Required by: S1a project context fields, S1a style fields, S1b prompt editor
   - Allowlisted ids: `project_context_md`, `product_standards_md`, `planning_prompt_txt`

2. `GET /api/artifact?id=planning_prompt_txt` — read planning prompt file
   - Required by: S1b prompt editor pre-population

These must be added to the backend before S1a and S1b can function correctly.
All other actions use existing endpoints from the backend audit.

---

## Canonical Truth

This spec derives screen state entirely from `GET /api/state`.
The UI never holds authoritative state. If the page reloads, it resumes
at the correct screen by reading pipeline state on mount.

## Compressed Flow

```
Set workspace + fill project context + fill style
→ save planning prompt → run intake → review Gate 1 → approve
→ run planning → review compiled plan → approve Gate 2
→ execution cycles → Gate 3 per cycle → approve
→ run complete → metrics
```
