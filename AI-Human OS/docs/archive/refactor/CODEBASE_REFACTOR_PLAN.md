# CODEBASE_REFACTOR_PLAN

Built from:

- `CODEBASE_MANIFEST.md`
- `CODEBASE_CLEANUP_PLAN.md`
- current repo behavior as of 2026-04-28

## Goal

Refactor the repo so it is easier to navigate, easier to reason about, and less prone to drift.

This plan is not just a delete list.

It is a structure plan for:

- canonical source locations
- clear folder ownership
- source vs generated vs archive separation
- reduced duplicate implementations
- reduced duplicate docs and prompts

## What “more navigable” means

A navigable repo should let a contributor answer these questions quickly:

1. Where is the live frontend?
2. Where is the live backend?
3. Where is the current product flow?
4. Where are the prompts?
5. Where are the generated artifacts?
6. Which docs are canonical?
7. Which paths are legacy or archive-only?

This plan treats navigability as a structural requirement, not a cosmetic one.

## Refactor principles

1. One concern, one canonical home.
2. Source, generated state, and archive material must not be mixed conceptually.
3. Hidden folders must not be the primary documentation source.
4. Duplicate prompt locations must be eliminated.
5. If two implementations own the same responsibility, one must become canonical.
6. Legacy-compatible paths may remain temporarily, but they must be labeled and scheduled for removal or retention.
7. Moves should be staged behind compatibility wrappers when the current runtime depends on hardcoded paths.

## Current structural problems

### 1. Canonical vs duplicate docs were split

Current state:

- canonical product docs now live at:
  - `AI-Human OS/docs/canonical/CLS.md`
  - `AI-Human OS/docs/canonical/UI.md`
  - `AI-Human OS/docs/canonical/HFD.md`
- compatibility stubs exist at:
  - `AI-Human OS/CLS.md`
  - `AI-Human OS/UI.md`
  - `AI-Human OS/HFD.md`
- older docs are archived at:
  - `AI-Human OS/docs/archive/specs/CLS.legacy.md`
  - `AI-Human OS/docs/archive/specs/UI_FLOW.legacy.md`
  - `AI-Human OS/docs/archive/specs/FRONTEND_SCREEN_CONTRACTS.legacy.md`

Remaining risk:

- contributors can still open the top-level stubs before the canonical docs
- older audit/plan files may still refer to pre-move paths until refreshed

### 2. Prompt locations are duplicated

Current state:

- active L0/L1/L1.9 prompts live in:
  - `AI-Human OS/memory/prompts/`
- older prompt copies still exist in:
  - `AI-Human OS/agents/*.txt`
- Screen 4 browser templates are duplicated between:
  - `AI-Human OS/memory/prompts/`
  - `AI-Human OS/console_ui/public/memory/prompts/`

Problem:

- prompt ownership is unclear
- duplicates increase drift risk

### 3. Product flow has two generations of architecture

Current state:

- current console path uses:
  - `run_l0_agent.js`
  - `run_l1_agent.js`
  - `run_l19_agent.js`
  - `ConsoleApp.jsx`
- older deterministic loop still exists:
  - `runtime/orchestrator/loop_orchestrator.js`
  - `runtime/l0/**`
  - `runtime/l1/**`
  - `runtime/l1_5/**`
  - `/api/l1/step`

Problem:

- both paths are in the repo
- one is primary, one is legacy-compatible
- the folder structure does not make that distinction obvious

### 4. L2 exists twice

Current state:

- current Screen 4 path uses inline `compileL2` and `compileL3` in:
  - `AI-Human OS/console_ui/src/ui/ConsoleApp.jsx`
- separate L2 compiler files also exist in:
  - `AI-Human OS/runtime/planning/l2_compiler.js`
  - `AI-Human OS/runtime/planning/l2_primitives.js`
  - `AI-Human OS/runtime/planning/l2_rule_engine.js`

Problem:

- contributors cannot tell which one is authoritative
- both look legitimate

### 5. Some folders are historical phase names, not ownership names

Current state:

- `1_planning/`
- `2_behavior/`
- `3_execution/`
- `4_registry_update/`
- `5_commit/`

Problem:

- good for phase order
- weak for discoverability
- mixes scripts, prompts, templates, and generated review artifacts in the same layer folders

### 6. Repo has two frontends with different purposes

Current state:

- root product app:
  - `client/**`
  - root `vite.config.js`
- console app:
  - `AI-Human OS/console_ui/**`

Problem:

- this is valid, but not obvious
- a new contributor can mistake the root app for the console or vice versa

## Target navigation model

This plan uses a conservative target structure.

It improves navigability without requiring a full rewrite of all hardcoded paths at once.

## Target structure

```text
/
  client/                      # target product web app
  AI-Human OS/
    console_api/               # console backend
    console_ui/                # console frontend
    runtime/                   # executable runtime logic
      agents/                  # current L0/L1/L1.9 agent runners
      product_flow/            # future canonical home for L0/L1/L1.9 orchestration
      planning/
      behavior/
      verification/
      registry/
      recovery/
      workspace/
      model/
    memory/
      prompts/                 # canonical active prompts/templates
      schemas/                 # schemas and deterministic json contracts
      standards/               # project/system/product context docs
      config/                  # throughput/workspace/meta configs
    docs/
      canonical/               # CLS, UI, HFD
      archive/                 # superseded docs and diagrams
    artifacts/
      planning/                # generated planning docs if later moved
      behavior/                # generated behavior docs if later moved
      commit/                  # generated commit artifacts if later moved
    feature_archive/           # historical archived feature packs
```

## Important note

This is a target model, not an immediate move list.

Short term, we should preserve the existing runtime paths and introduce the structure in stages.

## Canonical ownership after refactor

### Docs

- Canonical:
  - `AI-Human OS/docs/canonical/CLS.md`
  - `AI-Human OS/docs/canonical/UI.md`
  - `AI-Human OS/docs/canonical/HFD.md`
- Compatibility stubs:
  - `AI-Human OS/CLS.md`
  - `AI-Human OS/UI.md`
  - `AI-Human OS/HFD.md`
- Archive:
  - `AI-Human OS/docs/archive/specs/*`
  - `AI-Human OS/docs/archive/diagrams/*`

### Prompts

- Canonical:
  - `AI-Human OS/memory/prompts/`
- Only browser-served copies may exist under:
  - `AI-Human OS/console_ui/public/memory/prompts/`
- No second prompt source under `AI-Human OS/agents/*.txt`

### Product flow

- Canonical current path:
  - `AI-Human OS/runtime/agents/`
  - `AI-Human OS/console_api/server.js`
  - `AI-Human OS/console_ui/src/ui/ConsoleApp.jsx`
- Legacy-compatible path:
  - `AI-Human OS/runtime/orchestrator/`
  - `AI-Human OS/runtime/l0/`
  - `AI-Human OS/runtime/l1/`
  - `AI-Human OS/runtime/l1_5/`

### Generated artifacts

- Keep runtime/generated review artifacts separate from source in classification and docs
- Long-term, optionally move generated markdown under `AI-Human OS/artifacts/**`
- Short-term, keep current locations to avoid breaking runtime

## Refactor phases

## Phase 0: Label the repo

Goal:

- make intent obvious before moving code

Changes:

1. update `README.md`
2. add a short `AI-Human OS/README.md` explaining:
   - what lives here
   - what is canonical
   - where the active entrypoints are
3. keep `CODEBASE_MANIFEST.md`, `CODEBASE_CLEANUP_PLAN.md`, and this plan at repo root during the cleanup period

Success criteria:

- a contributor can tell the difference between:
  - root product app
  - console app
  - AI-Human OS runtime

## Phase 1: Canonical docs and doc archive

Goal:

- one obvious documentation path

Changes:

1. create:
   - `AI-Human OS/docs/canonical/`
   - `AI-Human OS/docs/archive/`
2. move canonical docs into `docs/canonical/`
   - `CLS.md`
   - `UI.md`
   - `HFD.md`
3. keep top-level doc stubs to preserve compatibility
4. move legacy docs into archive:
   - `AI-Human OS/docs/archive/specs/CLS.legacy.md`
   - `AI-Human OS/docs/archive/specs/UI_FLOW.legacy.md`
   - `AI-Human OS/docs/archive/specs/FRONTEND_SCREEN_CONTRACTS.legacy.md`
5. move diagrams/pdf review assets under `docs/archive/diagrams/`
6. update `README.md` and references to point at canonical docs first

Success criteria:

- archived docs no longer compete with canonical docs
- canonical docs live in one obvious place

## Phase 2: Prompt consolidation

Goal:

- one prompt home

Changes:

1. keep `AI-Human OS/memory/prompts/` as canonical
2. remove unused prompt duplicates under `AI-Human OS/agents/*.txt`
3. remove stale L3 prompt files not used by the current path
4. keep only browser-served prompt copies that are actually needed by the console
5. document which prompt copies are:
   - runtime-read
   - browser-served

Success criteria:

- every active prompt has one source of truth
- browser prompt copies are explicit mirrors, not independent sources

## Phase 3: Product flow separation

Goal:

- make “current flow” and “legacy flow” visibly different

Changes:

1. introduce:
   - `AI-Human OS/runtime/product_flow/`
2. move current product-flow modules there over time:
   - `runtime/agents/`
   - current L0/L1/L1.9 composition helpers
3. move older deterministic loop path into a clearly named legacy folder if retained:
   - `AI-Human OS/runtime/legacy_product_flow/`
4. if `/api/l1/step` remains supported, document it as compatibility only
5. if `/api/l1/step` is no longer needed, delete it and remove the legacy runtime path

Success criteria:

- one glance tells you which product flow is current
- legacy code is either clearly labeled or removed

## Phase 4: L2/L3 canonicalization

Goal:

- one authoritative compiler path

Changes:

Choose one of these:

### Option A: Promote runtime L2

- make `AI-Human OS/runtime/planning/l2_compiler.js` canonical
- move Screen 4 to consume runtime L2
- remove inline `compileL2` from `ConsoleApp.jsx`

### Option B: Keep inline L2/L3 for the console

- keep `compileL2` and `compileL3` in `ConsoleApp.jsx`
- remove unused runtime L2 compiler files

Recommendation:

- choose one explicitly
- do not leave both active-looking indefinitely

Success criteria:

- there is one obvious L2 compiler implementation
- there is one obvious L3 build blueprint implementation

## Phase 5: Memory folder navigation

Goal:

- make `memory/` easier to scan by role

Current `memory/` mixes:

- prompts
- schemas
- config
- standards/docs

Target subdivision:

```text
AI-Human OS/memory/
  prompts/
  schemas/
  config/
  standards/
```

Suggested moves:

- `decision_schema.json` -> `memory/schemas/`
- `repair_instructions_schema.json` -> `memory/schemas/`
- `CANONICAL_DEFINITIONS.json` -> `memory/schemas/` or `memory/config/`
- `DRIFT_SCORING.json` -> `memory/config/`
- `DRIFT_TYPES.json` -> `memory/config/`
- `META_SYSTEM_STATES.json` -> `memory/config/`
- `THROUGHPUT_POLICY.json` -> `memory/config/`
- `WORKSPACE_CONFIG.json` -> `memory/config/`
- `PROJECT_CONTEXT.md` -> `memory/standards/`
- `PRODUCT_STANDARDS.md` -> `memory/standards/`
- `UI_PATTERNS.md` -> `memory/standards/`
- `SYSTEM_REGISTRY.md` -> `memory/standards/`
- `FILE_REGISTRY.md` should stay where the runtime expects it unless registry logic is updated together

Success criteria:

- `memory/` is browsable by type, not by filename memory

## Phase 6: Artifact folder clarification

Goal:

- make generated state easy to distinguish from source

Short-term:

- keep existing artifact paths to avoid breaking the runtime
- document them as generated

Long-term:

- move review/generation outputs under:
  - `AI-Human OS/artifacts/planning/`
  - `AI-Human OS/artifacts/behavior/`
  - `AI-Human OS/artifacts/commit/`

This phase should only happen after a path adapter exists in `data_layer.js`.

Success criteria:

- generated docs stop looking like authored source

## Phase 7: Root/frontend clarification

Goal:

- make the two frontend surfaces explicit

Current:

- `client/**` = product app
- `AI-Human OS/console_ui/**` = console app

Suggested documentation outcome:

- root `README.md` explicitly names both
- optional future rename:
  - `client/` -> `app_client/` or `product_web/`
  - only if you want naming clarity badly enough to justify the churn

Success criteria:

- no one confuses the product app with the orchestration console

## Phase 8: Archive strategy

Goal:

- preserve useful history without letting it compete with live source

Archive candidates:

- `AI_HUMAN_OS_DATA_FLOW_REVIEW.md`
- `.docs` diagrams, PDFs, and older screen-contract docs
- historical design-review artifacts

Keep in archive:

- `AI-Human OS/feature_archive/**`

Success criteria:

- history is preserved
- history is not mistaken for canonical structure

## Files to remove early

These are the highest-confidence early removals:

- `AI-Human OS/memory/decision_graph_template.json`
- `AI-Human OS/runtime/l1/question_generator.js`
- `AI-Human OS/memory/prompts/start.template.txt`
- `AI-Human OS/console_ui/public/memory/prompts/start.template.txt`
- `AI-Human OS/memory/prompts/l3_DATA MODEL.txt`
- `AI-Human OS/memory/prompts/l3_FLOW IMPLEMENTATION.txt`
- `AI-Human OS/memory/prompts/l3_INTERFACE CONTRACT.txt`
- `AI-Human OS/memory/prompts/l3_MODULE GENERATION.txt`
- `AI-Human OS/memory/prompts/l3_START BUILD.txt`
- old prompt duplicates in `AI-Human OS/agents/*.txt` except `execute_agent.md`

## Files to keep until a deliberate decision is made

- `AI-Human OS/runtime/orchestrator/loop_orchestrator.js`
- `AI-Human OS/runtime/l0/**`
- `AI-Human OS/runtime/l1/**`
- `AI-Human OS/runtime/l1_5/**`
- `AI-Human OS/runtime/planning/l2_compiler.js`
- `AI-Human OS/runtime/planning/l2_primitives.js`
- `AI-Human OS/runtime/planning/l2_rule_engine.js`
- `AI-Human OS/runtime/planning/planning_agent_system.js`
- root `client/**`

## Recommended execution order

1. Update `README.md`
2. Establish canonical docs folder
3. Archive hidden/stale docs
4. Consolidate prompts
5. Remove obvious stale files
6. Decide current vs legacy product flow
7. Decide canonical L2/L3 compiler path
8. Restructure `memory/`
9. Consider artifact-folder split only after adapters exist

## Deliverables for the refactor itself

When this plan is executed, the refactor should produce:

1. a final folder map
2. a canonical docs location
3. a canonical prompts location
4. a canonical product-flow path
5. a canonical L2/L3 path
6. an archive folder for non-live docs and diagrams
7. updated README and subsystem README files

## Success test

A new contributor should be able to answer, in under five minutes:

- what app runs at the root
- what app runs in the console
- where to edit current prompts
- where to edit current docs
- where generated artifacts go
- which code path is current vs legacy

If that test is not satisfied, the refactor is incomplete.
