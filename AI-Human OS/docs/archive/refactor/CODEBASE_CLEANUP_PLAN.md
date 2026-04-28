# CODEBASE_CLEANUP_PLAN

Derived from `CODEBASE_MANIFEST.md` on 2026-04-28.

## What the labels mean

- Safe delete: no active caller found on the current primary runtime path, and the file is clearly superseded or duplicated.
- Archive instead of delete: not part of the current runtime, but still useful as historical reference, design history, or audit evidence.
- Keep for now: currently active, currently reachable, or plausibly still part of a supported secondary path.
- Promote or remove: implemented code exists, but the repo currently has two competing versions of the same responsibility. Pick one and remove the loser.

## Current primary paths

- Root demo app:
  - `npm run dev`
  - `vite.config.js`
  - `client/main.js`
  - `client/ui/**`
- Console product flow:
  - `npm run console:api`
  - `npm run console:ui`
  - `AI-Human OS/console_api/server.js`
  - `AI-Human OS/console_ui/src/ui/ConsoleApp.jsx`
  - `AI-Human OS/runtime/agents/run_l0_agent.js`
  - `AI-Human OS/runtime/agents/run_l1_agent.js`
  - `AI-Human OS/runtime/agents/run_l19_agent.js`
- Existing execution pipeline:
  - `run_ai.js`
  - `AI-Human OS/3_execution/**`
  - `AI-Human OS/runtime/verification/**`
  - `AI-Human OS/runtime/behavior/**`
  - `AI-Human OS/runtime/planning/**`

## Phase 1: Safe deletes

These are the cleanest removals because they are either replaced, duplicated, or clearly no longer used on the active path.

- Delete `AI-Human OS/memory/decision_graph_template.json`
  - Superseded by `AI-Human OS/runtime/l0/decision_graph_initializer.js`
  - Current L0 uses domain extraction, not the old flat template
- Delete `AI-Human OS/runtime/l1/question_generator.js`
  - Replaced by `AI-Human OS/runtime/l1/question_agent.js`
  - Current `l1_interrogator.js` imports `question_agent.js`, not `question_generator.js`
- Delete `AI-Human OS/memory/prompts/start.template.txt`
  - Current Screen 4 start prompt is built deterministically in `compileL3`
- Delete `AI-Human OS/console_ui/public/memory/prompts/start.template.txt`
  - Same reason as above
- Delete these unused L3 prompt files:
  - `AI-Human OS/memory/prompts/l3_DATA MODEL.txt`
  - `AI-Human OS/memory/prompts/l3_FLOW IMPLEMENTATION.txt`
  - `AI-Human OS/memory/prompts/l3_INTERFACE CONTRACT.txt`
  - `AI-Human OS/memory/prompts/l3_MODULE GENERATION.txt`
  - `AI-Human OS/memory/prompts/l3_START BUILD.txt`
- Delete these old prompt copies if you are standardizing on `AI-Human OS/memory/prompts/**`:
  - `AI-Human OS/agents/l0_agent.txt`
  - `AI-Human OS/agents/l1_compiler_agent.txt`
  - `AI-Human OS/agents/l1_verifier_agent.txt`
  - `AI-Human OS/agents/init_agent.txt`
  - `AI-Human OS/agents/plan_agent.txt`
  - `AI-Human OS/agents/behavior_agent.txt`
  - `AI-Human OS/agents/commit_agent.txt`

Do not delete:

- `AI-Human OS/agents/execute_agent.md`
  - It is still consumed by `AI-Human OS/3_execution/6.run_execute.js`

## Phase 2: Docs to merge, replace, or remove

### Replace

- Replace `README.md`
  - It is materially stale
  - It still says backend is FastAPI/PostgreSQL
  - It pointed at the old hidden `.docs` CLS path before the doc move
  - It still describes the console flow as in progress

### Make canonical

- Keep `AI-Human OS/docs/canonical/CLS.md` as canonical
- Keep `AI-Human OS/docs/canonical/UI.md` as canonical
- Keep `AI-Human OS/docs/canonical/HFD.md` as current backend/execution flow reference
- Keep `AI-Human OS/CLS.md`, `AI-Human OS/UI.md`, and `AI-Human OS/HFD.md` only as compatibility stubs

### Remove or archive duplicates

- `AI-Human OS/docs/archive/specs/CLS.legacy.md`
  - Archived duplicate/superseded contract spec
- `AI-Human OS/docs/archive/specs/UI_FLOW.legacy.md`
  - Older screen model, not the current `L0 -> L1 -> L19 -> L3_RESULT` UI
- `AI-Human OS/docs/archive/specs/FRONTEND_SCREEN_CONTRACTS.legacy.md`
  - Intended screen model, not current implemented screen model

Recommended action:

- Keep them archived, not canonical.
- Point all current references at `AI-Human OS/docs/canonical/`.

## Phase 3: Legacy but reachable paths

These are not dead. They are just no longer on the current primary console flow.

### Keep for now if you want fallback compatibility

- `AI-Human OS/runtime/orchestrator/loop_orchestrator.js`
- `AI-Human OS/runtime/l0/**`
- `AI-Human OS/runtime/l1/**`
- `AI-Human OS/runtime/l1_5/**`
- `POST /api/l1/step` in `AI-Human OS/console_api/server.js`

Why:

- The backend still exposes `/api/l1/step`
- The old deterministic question loop still works as a secondary path

### Remove later if you want one L0/L1 architecture only

If you decide the new product flow is the only supported path:

- remove `/api/l1/step`
- remove `loop_orchestrator.js`
- remove the old deterministic `runtime/l0`, `runtime/l1`, `runtime/l1_5` stack
- keep only:
  - `run_l0_agent.js`
  - `run_l1_agent.js`
  - `run_l19_agent.js`
  - Screen 1 to Screen 4 flow in `ConsoleApp.jsx`

Do this only as a dedicated consolidation pass, not mixed with unrelated cleanup.

## Phase 4: Promote or remove duplicate L2/L3 implementations

You currently have two versions of L2/L3 behavior:

- Inline implementation inside `AI-Human OS/console_ui/src/ui/ConsoleApp.jsx`
- Separate planning runtime files:
  - `AI-Human OS/runtime/planning/l2_compiler.js`
  - `AI-Human OS/runtime/planning/l2_primitives.js`
  - `AI-Human OS/runtime/planning/l2_rule_engine.js`

Pick one direction:

- Promote runtime L2:
  - move Screen 4 to use `runtime/planning/l2_compiler.js`
  - delete inline `compileL2`
  - keep `l2_primitives.js` and `l2_rule_engine.js`
- Or keep inline L2:
  - delete `runtime/planning/l2_compiler.js`
  - delete `runtime/planning/l2_primitives.js`
  - delete `runtime/planning/l2_rule_engine.js`

Current recommendation:

- Keep them for now.
- They are not safe deletes yet because they represent a credible canonical L2 direction.
- Decide this after the console flow stabilizes.

## Phase 5: Metadata/spec modules to review

These are not clearly active runtime dependencies on the current path:

- `AI-Human OS/runtime/planning/planning_agent_system.js`
- `AI-Human OS/runtime/semantics/canonical_definitions.js`

Recommended action:

- Keep for one review pass.
- If they are only descriptive/spec artifacts and no code path imports them, either:
  - archive them under docs/specs
  - or delete them

## Phase 6: Root app vs console app

You currently have two separate frontend surfaces:

- Root demo app:
  - `vite.config.js`
  - `client/**`
- Console product:
  - `AI-Human OS/console_ui/**`

Keep both if:

- the root `client/**` app is still your target generated product
- the console is your orchestration surface

Archive or remove the root demo app if:

- it is only an old prototype
- the project has fully shifted to console-first operation

Do not remove it casually. It is still a valid runnable app.

## Phase 7: Archive instead of delete

These are good archive candidates instead of deletion:

- `AI_HUMAN_OS_DATA_FLOW_REVIEW.md`
  - useful design-history/audit artifact
- `AI-Human OS/docs/archive/diagrams/*.pdf`
- `AI-Human OS/docs/archive/diagrams/*.svg`
- `AI-Human OS/docs/archive/diagrams/*.png`
  - keep if they are still useful in presentations or architectural reviews
  - otherwise move under an explicit docs archive
- `AI-Human OS/feature_archive/**`
  - already correctly archived

## Phase 8: Generated state policy

Do not treat these as source code cleanup targets:

- `AI-Human OS/1_planning/*.md`
- `AI-Human OS/2_behavior/*.md`
- `AI-Human OS/5_commit/APPLIED_STATE.md`
- `AI-Human OS/data/**`

These are runtime artifacts or review artifacts.

Cleanup policy for them should be:

- reset
- archive
- or workspace rotation

not normal source deletion.

## Recommended order of operations

1. Update `README.md`
2. Delete the safe-delete prompt/template duplicates
3. Delete `decision_graph_template.json`
4. Delete `runtime/l1/question_generator.js`
5. Decide what to do with hidden `.docs` markdown duplicates
6. Decide whether old `/api/l1/step` flow remains supported
7. Decide whether runtime L2 or inline L2 is canonical
8. Only then remove deeper legacy modules

## Suggested execution batches

### Batch A: Zero-risk cleanup

- remove safe prompt/template duplicates
- remove `decision_graph_template.json`
- remove `runtime/l1/question_generator.js`

### Batch B: Documentation cleanup

- rewrite `README.md`
- keep `AI-Human OS/docs/canonical/` as canonical
- keep top-level `AI-Human OS/CLS.md`, `AI-Human OS/UI.md`, and `AI-Human OS/HFD.md` as stubs only
- archive stale docs under `AI-Human OS/docs/archive/`

### Batch C: Path consolidation

- choose one L0/L1 path
- choose one L2 path
- remove the losing path only after tests/manual flow check

## Notable warnings

- `AI-Human OS/console_api/server.js` still contains compatibility routes and old-state endpoints. Do not delete related legacy code until you decide whether compatibility matters.
- `AI-Human OS/console_ui/src/ui/ConsoleApp.jsx` still contains some unused helpers/components. These are cleanup candidates, but they are lower priority than the duplicated prompt/doc/runtime paths.
- `README.md` is the highest-value doc fix because it currently misstates the stack and the canonical doc locations.
