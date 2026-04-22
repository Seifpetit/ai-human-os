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
    - completeness checks
    - scaffold checks
    - capability checks
    - deterministic plan reconciliation when safe
15. If still invalid:
    - structured plan feedback JSON + markdown is written
    - stage retry policy applies
    - early stop triggers if feedback stalls
16. Deterministic code emits `AI-Human OS/data/implementation_plan.json`

## Execution Flow

17. Deterministic code runs `node run_ai.js`
18. A `run_id` is opened for the execution run
19. One cycle is one operation and one file across all retries
20. Deterministic code selects the next operation from `implementation_plan.json`
21. Deterministic code builds the typed target request
22. LLM runs `AI-Human OS/agents/execute_agent.md` through `AI-Human OS/3_execution/6.run_execute.js`
23. LLM generates exactly one file
24. Deterministic code verifies the file through `AI-Human OS/3_execution/7.run_verify.js`
25. If verification fails:
    - failure is classified
    - retry feedback is injected
    - the same cycle retries until convergence or max retries
26. If verification passes:
    - registry update runs
    - commit runs
    - the cycle is accepted

## Metrics Flow

27. Deterministic code writes one record per finished cycle to `AI-Human OS/data/cycle_metrics.jsonl`
28. Deterministic code writes one run summary to `AI-Human OS/data/run_metrics.json`

## Compressed Form

Human intent -> LLM understanding -> Human approval -> LLM planning stages -> deterministic planning compiler/reconciler -> compiled plan -> one-file execution cycles -> deterministic verification/recovery -> commit -> metrics
