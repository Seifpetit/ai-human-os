# CLS

Contract Layers Schema

## Purpose

CLS defines the current enforced pipeline as contract boundaries.

- A layer is a phase boundary in the system.
- A contract is the artifact one layer hands to the next, plus the invariants the next layer is allowed to assume.
- If a contract is not satisfied, the pipeline must block, retry, or fail explicitly.

## Layer Map

### L1. Intent Intake / Gate 1

- Producer: `node run_planning_intake.js`
- Input: raw human scope prompt
- Output: `AI-Human OS/1_planning/INTENT_CONFIRMATION.md`
- Consumer: `node run_planning.js`
- Contract:
  - approved scope is explicit
  - exclusions and deferred scope are explicit
  - ambiguities, open questions, and assumptions are explicit
  - human must set `Approval Status: approved`
  - human must resolve ambiguity with `clear`, `assumptions_accepted`, or `human_corrected`

### L2. Features Planning

- Producer: planning stage 1 LLM
- Input: approved `INTENT_CONFIRMATION.md`
- Output: `AI-Human OS/1_planning/FEATURES_LIST.md`
- Consumer: planning stage 2
- Contract:
  - features are user-level, not implementation-level
  - selected features align with approved intent
  - out-of-scope or deferred features are not pulled forward
  - deterministic validation must pass before stage 2 runs

### L3. Feature Request Refinement

- Producer: planning stage 2 LLM
- Input: `FEATURES_LIST.md`
- Output: `AI-Human OS/1_planning/FEATURE_REQUEST.md`
- Consumer: planning stage 3
- Contract:
  - request name matches the selected feature
  - user-visible outcomes are explicit
  - constraints and anti-patterns are explicit
  - request does not silently expand into other features
  - deterministic validation must pass before stage 3 runs

### L4. Implementation Planning

- Producer: planning stage 3 LLM
- Input: `FEATURE_REQUEST.md`
- Output: `AI-Human OS/1_planning/IMPLEMENTATION_PLAN.md`
- Consumer: deterministic planning compiler
- Contract:
  - plan declares concrete operations, file paths, and dependency order
  - delivery surfaces, workflow contracts, capability dependencies, and cross-file contracts are explicit where needed
  - stage retries are driven by deterministic feedback until valid or halted

### L5. Planning Compiler / Traceability

- Producer: deterministic compiler via `syncImplementationPlanJson`
- Input:
  - `IMPLEMENTATION_PLAN.md`
  - `FEATURE_REQUEST.md`
  - `FEATURES_LIST.md`
- Output:
  - `AI-Human OS/data/implementation_plan.json`
  - `AI-Human OS/data/plan_decision_evaluation.json`
  - `AI-Human OS/data/plan_traceability_evaluation.json`
- Consumer: Gate 2 and execution operator
- Contract:
  - plan is structurally valid
  - dependency references are resolvable
  - plan decisions are valid
  - plan completeness checks pass
  - plan still traces back to the approved feature
  - scope-creep operations are rejected

### L6. Gate 2: Compiled Plan Approval

- Producer: deterministic renderer
- Input:
  - approved `INTENT_CONFIRMATION.md`
  - compiled `implementation_plan.json`
- Output: `AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md`
- Consumer: `node run_ai.js`
- Contract:
  - human sees approved intent snapshot vs compiled plan snapshot
  - the actual execution-ready shape is rendered into a review artifact
  - Gate 2 may auto-approve under `AI-Human OS/memory/THROUGHPUT_POLICY.json` only if deterministic score and drift thresholds pass
  - execution is blocked until `Approval Status: approved`

### L7. Selective Behavior Simulation (`2_behavior`)

- Producer: deterministic trigger in the operator plus 4 staged LLM calls
- Input:
  - current feature request
  - current implementation plan
  - current operation focus
- Output:
  - `AI-Human OS/2_behavior/SCENARIOS.md`
  - `AI-Human OS/2_behavior/STATE_FLOW.md`
  - `AI-Human OS/2_behavior/RECONCILIATION_RULE.md`
  - `AI-Human OS/2_behavior/SIMULATION_REPORT.md`
  - `AI-Human OS/data/behavior_state.json`
- Consumer: typed target request and execute agent
- Contract:
  - this layer runs only for behavior-sensitive work
  - trigger cases include state ownership, server sync, shared contracts, workflow boundaries, or capability-dependent operations
  - simulation report must pass
  - outputs define behavioral policy before code generation
  - cached behavior output is only reusable for the same feature and plan hash

### L8. Operator / Typed Request Boundary

- Producer: `node AI-Human OS/3_execution/3.run_operator.js`
- Input:
  - `implementation_plan.json`
  - `applied_operations.json`
  - file registry and runtime memory
  - behavior contract when required
- Output:
  - `AI-Human OS/data/target_file_request.json`
  - `AI-Human OS/3_execution/TARGET_FILE_REQUEST.md`
- Consumer: execute agent
- Contract:
  - exactly one operation is selected
  - exactly one target file is requested
  - request carries the required interface, capability dependencies, workflow contracts, cross-file contracts, product constraints, and behavior contract
  - retries stay within the same operation key

### L9. File Generation

- Producer: `node AI-Human OS/3_execution/6.run_execute.js`
- Input: `target_file_request.json`
- Output: target file on disk plus `AI-Human OS/data/execution_result.json`
- Consumer: verifier
- Contract:
  - generation is scoped to the current request only
  - behavior-sensitive operations must honor the behavior contract
  - existing verified artifacts may only be reused if operation key, content hash, and behavior plan hash still match

### L10. Verification

- Producer: `node AI-Human OS/3_execution/7.run_verify.js`
- Input:
  - target file on disk
  - current request
  - compiled plan context
- Output: `AI-Human OS/data/verify_result.json`
- Consumer: Gate 3 / acceptance path
- Contract:
  - only `status: pass` for the current operation key makes the artifact eligible for acceptance
  - syntax, semantic, capability, workflow, scaffold, cross-file, and product checks must pass or be explicitly warned/skipped by policy

### L11. Gate 3: Verified Artifact Approval

- Producer: deterministic renderer
- Input:
  - current request
  - current verified file
  - current `execution_result.json`
  - current `verify_result.json`
- Output: `AI-Human OS/5_commit/COMMIT_CONFIRMATION.md`
- Consumer:
  - registry update
  - commit step
  - combined commit path
- Contract:
  - the exact verified artifact is rendered into a review artifact
  - Gate 3 may auto-approve under `AI-Human OS/memory/THROUGHPUT_POLICY.json` only if verification passed and the artifact stays within the safety thresholds
  - approval is bound to `operation_key`
  - approval is bound to `content_hash`
  - if the file changes after verification, approval becomes stale automatically

### L12. Acceptance: Registry + Applied State

- Producer:
  - `node AI-Human OS/4_registry_update/run_registry_update.js`
  - `node AI-Human OS/5_commit/run_commit.js`
  - `node AI-Human OS/4_registry_update/run_commit_with_registry.js`
- Input:
  - Gate 3 approved artifact
  - current request
  - current verify result
- Output:
  - `AI-Human OS/data/file_registry.json`
  - `AI-Human OS/data/applied_operations.json`
  - `AI-Human OS/data/execution_history.jsonl`
- Consumer: next operator cycle and future planning/execution runs
- Contract:
  - only approved, verified artifacts may mutate accepted registry state
  - only approved, verified artifacts may mark an operation as completed
  - accepted state becomes the new baseline for future runs

### L13. Metrics / Observability

- Producer: `node AI-Human OS/3_execution/1.run_full.js`
- Input:
  - cycle outcomes
  - run lifecycle status
- Output:
  - `AI-Human OS/data/cycle_metrics.jsonl`
  - `AI-Human OS/data/run_metrics.json`
  - human-readable report via `node run_metrics_report.js`
- Consumer: reporting and operator visibility
- Contract:
  - one metric row per finished cycle
  - one run summary per run
  - metrics are canonical telemetry, not inferred summaries

### L14. Throughput Policy / Retry Control

- Producer: deterministic policy loader in `AI-Human OS/runtime/throughput/throughput_policy.js`
- Input:
  - `AI-Human OS/memory/THROUGHPUT_POLICY.json`
  - Gate 2 plan assessments
  - Gate 3 verification assessments
  - execution failure signatures
- Output:
  - conditional Gate 2 auto-approval
  - conditional Gate 3 auto-approval
  - adaptive retry limits and early-stop decisions
- Consumer:
  - planning gate renderer
  - commit gate renderer
  - `node AI-Human OS/3_execution/1.run_full.js`
- Contract:
  - throughput is increased by conditional gating and retry control, not by bypassing contracts
  - auto-approval decisions remain visible inside the gate docs
  - retries remain bounded by deterministic classification policy

## Gate Summary

- Gate 1: human approves `INTENT_CONFIRMATION.md`
- Gate 2: `EXECUTION_CONFIRMATION.md` is approved by human or auto-approved by throughput policy
- Gate 3: `COMMIT_CONFIRMATION.md` is approved by human or auto-approved by throughput policy

## Canonical Truth by Phase

- Scope truth: `INTENT_CONFIRMATION.md`
- Planning truth: `FEATURES_LIST.md`, `FEATURE_REQUEST.md`, `IMPLEMENTATION_PLAN.md`
- Compiled execution truth: `implementation_plan.json`
- Behavioral truth when required: `SCENARIOS.md`, `STATE_FLOW.md`, `RECONCILIATION_RULE.md`, `SIMULATION_REPORT.md`
- Operation truth: `target_file_request.json`
- Artifact truth: target file on disk + `execution_result.json` + `verify_result.json`
- Acceptance truth: `file_registry.json` + `applied_operations.json` + `execution_history.jsonl`
- Telemetry truth: `cycle_metrics.jsonl` + `run_metrics.json`
- Throughput policy truth: `THROUGHPUT_POLICY.json`

## Compressed Flow

Human intent
-> Gate 1 approved scope
-> staged planning
-> deterministic compiler and traceability
-> Gate 2 approved compiled plan
-> selective behavior simulation for stateful operations
-> one typed target request
-> one file generation
-> deterministic verification
-> Gate 3 approved verified artifact
-> registry update and applied-state commit
-> metrics
