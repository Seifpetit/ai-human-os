# HFD

HFD = Whole Flow Diagram

## Planning Flow

1. Human fills `AI-Human OS/1_planning/1_features_planning_prompt.txt`
2. LLM runs `node run_planning_intake.js`
3. LLM generates `AI-Human OS/1_planning/INTENT_CONFIRMATION.md`
4. Human reviews and approves `INTENT_CONFIRMATION.md`
5. LLM runs `node run_planning.js`
6. LLM generates `FEATURES_LIST.md`
7. Deterministic code validates `FEATURES_LIST.md`
8. If invalid:
   - structured feedback JSON + markdown is written
   - stage retry policy applies
   - early stop triggers if feedback stalls
9. LLM generates `FEATURE_REQUEST.md`
10. Deterministic code validates `FEATURE_REQUEST.md`
11. If invalid:
    - structured feedback JSON + markdown is written
    - stage retry policy applies
    - early stop triggers if feedback stalls
12. LLM generates `IMPLEMENTATION_PLAN.md`
13. Deterministic code parses and compiles the plan
14. Deterministic code runs:
    - decision evaluation
    - cross-stage traceability evaluation against `FEATURES_LIST.md` and `FEATURE_REQUEST.md`
    - scope creep detection for operations that cannot be traced back to the approved feature
    - completeness checks
    - scaffold checks
    - capability checks
    - deterministic plan reconciliation when safe
15. If still invalid:
    - structured plan feedback JSON + markdown is written
    - stage retry policy applies
    - early stop triggers if feedback stalls
16. Deterministic code emits `AI-Human OS/data/implementation_plan.json`
17. Deterministic code generates `AI-Human OS/1_planning/EXECUTION_CONFIRMATION.md`
18. Deterministic throughput policy evaluates Gate 2 using `AI-Human OS/memory/THROUGHPUT_POLICY.json`
19. If the Gate 2 policy score and drift thresholds pass:
    - `EXECUTION_CONFIRMATION.md` is auto-approved
    - the approval source is recorded in the doc
20. Otherwise:
    - human reviews the approved intent snapshot against the compiled plan snapshot
    - human changes `Approval Status` in `EXECUTION_CONFIRMATION.md` to `approved`

## Execution Flow

21. Deterministic code runs `node run_ai.js`
22. Preflight blocks unless `EXECUTION_CONFIRMATION.md` exists and is approved
23. A `run_id` is opened for the execution run
24. One cycle is one operation and one file across all retries
25. Deterministic code selects the next operation from `implementation_plan.json`
26. Operator evaluates whether the current operation needs `2_behavior` simulation
27. If the operation touches state management, server sync, shared contracts, or workflow boundaries:
    - `SCENARIOS.md`, `STATE_FLOW.md`, `RECONCILIATION_RULE.md`, and `SIMULATION_REPORT.md` are generated or reused
    - execution is blocked if the simulation report does not pass
28. Deterministic code builds the typed target request, including the behavior contract when required
29. LLM runs `AI-Human OS/agents/execute_agent.md` through `AI-Human OS/3_execution/6.run_execute.js`
30. LLM generates exactly one file
31. Deterministic code verifies the file through `AI-Human OS/3_execution/7.run_verify.js`
32. Deterministic code generates or refreshes `AI-Human OS/5_commit/COMMIT_CONFIRMATION.md`
33. Deterministic throughput policy evaluates Gate 3 using `AI-Human OS/memory/THROUGHPUT_POLICY.json`
34. If the Gate 3 policy score and verification thresholds pass:
    - `COMMIT_CONFIRMATION.md` is auto-approved
    - the approval source is recorded in the doc
35. Otherwise:
    - human reviews the verified artifact summary against the current file
    - human changes `Approval Status` to `approved`
36. Registry update and commit are blocked until `COMMIT_CONFIRMATION.md` is approved for the current operation key and file hash
37. If verification fails:
    - failure is classified
    - retry feedback is injected
    - adaptive retry policy may stop early if the same failure signature repeats
    - the same cycle retries until convergence or retry policy exhaustion
38. If verification passes and Gate 3 is approved:
    - registry update runs
    - commit runs
    - the cycle is accepted

## Metrics Flow

39. Deterministic code writes one record per finished cycle to `AI-Human OS/data/workspaces/<workspace_id>/cycle_metrics.jsonl`
40. Deterministic code writes one run summary to `AI-Human OS/data/workspaces/<workspace_id>/run_metrics.json`

## Compressed Form

Human intent -> LLM understanding -> Human approval -> LLM planning stages -> deterministic planning compiler/reconciler -> compiled plan -> Gate 2 human-or-policy approval -> selective behavior simulation for stateful operations -> one-file execution cycles -> deterministic verification -> Gate 3 human-or-policy approval -> registry update/commit -> metrics
