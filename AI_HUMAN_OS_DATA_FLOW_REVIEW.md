# AI-Human OS Data Flow Review

## Purpose

This document rewrites the review around the correct upgrade order for `AI-Human OS`.

It is no longer organized as:
- quick pass over folders
- then deep pass over execution

It is now organized as:
- system layers
- what each layer is responsible for
- what is already stable
- what is still missing
- the conceptual implementation plan for each upgrade layer

The goal is to make future upgrades deliberate instead of reactive.

---

## Bird's-Eye View

`AI-Human OS` is now best understood as a layered deterministic shell around an LLM.

The full system shape is:

1. Human intent layer
2. Product standards layer
3. Planning layer
4. Execution layer
5. Verification layer
6. Registry / memory layer
7. Commit / applied-state layer

The most important correction discovered during implementation is:

- the system was originally good at planning file operations
- but weak at planning delivery surfaces

That means it could generate component files for a UI feature without planning the browser-visible runtime surface that makes the feature real.

So the key missing layer was inside planning:

**delivery-surface planning**

---

## Current Stability Summary

These modules are stable enough for now:

- `run.js`
- `reset.js`
- `AI-Human OS/runtime/data_layer.js`
- `AI-Human OS/runtime/model_adapter.js`
- unique operation identity using `op_001`, `op_002`, ...
- JSON-first runtime state
- structured execution result / verify result / applied state flow
- plan completeness gate
- file-type-aware verifier base

These areas still need upgrade:

- delivery-surface awareness for first browser-facing UI features
- cross-file UI surface coherence beyond render/style/runtime basics
- AST-based JS/JSX verification instead of partial heuristic checks
- richer registry truth for real interfaces and cross-file contracts
- stricter execution-history fidelity when effective runtime behavior differs from authored plan
- explicit browser scaffold awareness

---

## Layer 1: Human Intent

### Role

This layer describes the requested product outcome.

Example:
- "build a browser lobby"
- "players land there first"
- "simple dummy buttons"
- "projection-only UI"

### Stable

- `FEATURE_REQUEST.md` already captures intent reasonably well
- the human-readable request format is useful and should stay

### Missing

- some feature requests describe user-visible outcomes without forcing planning to represent the files needed to make those outcomes real

### Upgrade Plan

Conceptually:

1. Keep feature requests human-readable.
2. Continue treating them as outcome descriptions, not implementation plans.
3. Strengthen downstream planning so it must translate human-visible outcomes into delivery surfaces.

No major structural rewrite is needed here.

---

## Layer 2: Product Standards

### Role

This layer defines:
- quality level
- product tone
- UI patterns
- design tokens
- styling contract

### Stable

These files now exist and are useful:

- `AI-Human OS/memory/PRODUCT_STANDARDS.md`
- `AI-Human OS/memory/UI_PATTERNS.md`
- `AI-Human OS/memory/DESIGN_TOKENS.json`

The styling contract is now explicit, for example:
- `className` hooks required
- inline style objects forbidden for user-facing layout styling
- local token objects forbidden
- hardcoded colors forbidden

### Missing

- product standards are still stronger than the system's cross-file enforcement
- they define how a surface should be implemented, but verification is still catching only part of that contract

### Upgrade Plan

Conceptually:

1. Keep standards in memory files.
2. Continue parsing them into typed request payloads.
3. Gradually convert more standards from prose into deterministic verifier rules.

Near-term focus:
- keep styling contract explicit
- add more cross-file contract enforcement, not looser prompts

---

## Layer 3: Planning

### Role

Planning should answer:
- what operations are needed?
- in what dependency order?
- what files make the feature real in the target environment?

### Stable

Planning now has:

- unique operation identities
- operation-level dependencies
- typed `implementation_plan.json`
- a deterministic completeness gate

### The Missing Layer That Was Discovered

The missing planning layer was:

**delivery-surface planning**

This means planning must explicitly decide:
- what is the render surface?
- what is the style surface?
- what is the runtime entry surface?
- if a browser-facing UI feature has no runtime surface yet, does the plan create one?

### Why This Matters

Without this layer, the system could produce:
- `LobbyLayout.js`
- buttons

and still claim success, even though the feature was not actually viewable in browser.

### Current Upgrade Already Implemented

Planning now includes:

- `render_surface`
- `style_surface`
- `runtime_entry_surface`

and a deterministic check in:

- `AI-Human OS/runtime/plan_completeness.js`

This now fails under-scoped browser/UI plans before execution starts.

### Conceptual Implementation Plan For This Layer

1. Keep the `IMPLEMENTATION_PLAN.md` template.
2. Require `Delivery Surfaces` in every plan.
3. For browser-facing or screen/UI features:
   - require a concrete render surface
   - require a concrete style surface
   - require a runtime entry surface or explicit `not_required`
4. Fail planning if those surfaces are missing.

### Next Planning Upgrade After This

After delivery-surface planning, the next planning-level upgrade is:

**cross-file contract planning**

Meaning:
- plan must not only name the files
- it should also declare the shared contract that ties those files together

Examples:
- shared class-hook family
- ownership of style surface
- render surface must consume style surface
- child components must align with shared surface conventions

---

## Layer 4: Execution

### Role

Execution takes one planned operation and generates one file under deterministic control.

### Stable

Execution is now materially stronger than at the start:

- provider-specific logic moved into `runtime/model_adapter.js`
- default model is `gpt-5.4`
- structured success/failure envelopes exist
- typed target request exists
- execution logs provider/model metadata

### Missing

- execution still relies on the plan and verifier to catch missing cross-file coherence
- it is intentionally file-scoped, so it should not be expected to invent missing planning layers

### Conceptual Implementation Plan For This Layer

1. Keep execution file-scoped.
2. Keep model adapter isolated from pipeline logic.
3. Keep target request typed and explicit.
4. Push more "what must be true" into request contracts rather than prompt prose.

No major redesign is needed here now.

---

## Layer 5: Verification

### Role

Verification decides whether a generated operation is acceptable before registry update and commit.

### Stable

Verification now supports:

- JS/CSS branching
- semantic requirement checks
- product requirement checks
- basic UI surface coherence checks

### Missing

Verification is still the main growth area.

Current weakness:
- it is still stronger at file-local correctness than at whole-surface correctness

It can now catch:
- local syntax issues
- token misuse
- missing style hooks in some contexts
- some render/style/runtime inconsistencies

But it is still weaker at:
- child-component hook coherence
- full prop/interface alignment across files
- AST-based JSX understanding

### Current Upgrade Already Implemented

The current system now has:

- `AI-Human OS/runtime/ui_surface_coherence.js`

This helper checks:
- render surface class hooks against style surface selectors
- runtime entry imports and renders the declared render surface

That is a meaningful new deterministic layer.

### Conceptual Implementation Plan For This Layer

#### Phase 1: Keep current local checks

- syntax
- product rules
- semantic requirements

#### Phase 2: Keep current surface checks

- render/style/runtime coherence

#### Phase 3: Add next coherence checks

The next deterministic checks should be:

1. child component class-hook coherence
   - if shared CSS expects button classes, child components must expose them

2. prop contract coherence
   - if parent passes `onClick`, child must accept it
   - if child expects `disabled`, parent use should align

3. AST-based JSX verification
   - replace remaining heuristic JS/JSX checks with actual parsing

### Recommended Order Inside Verification

1. file-local correctness
2. product rule correctness
3. delivery-surface correctness
4. child-component coherence
5. richer interface coherence

---

## Layer 6: Registry / Memory

### Role

This layer is the system's persistent memory of what files exist and what contracts they expose.

### Stable

Registry is now better than before:

- JSON is source of truth
- markdown is a projection
- registry analysis records imports/exports/inputs/outputs/history

### Missing

Registry is still not production-grade as a real contract memory.

Current weakness:
- richer cross-file contracts are not yet represented strongly enough
- CSS / surface relationships are not modeled deeply
- some interface extraction still depends on shallow heuristics

### Conceptual Implementation Plan For This Layer

1. Keep `file_registry.json` as source of truth.
2. Continue regenerating `FILE_REGISTRY.md` as a human view.
3. Upgrade entries to store more contract facts, such as:
   - expected surface family
   - class-hook ownership
   - component-to-style relationships
   - prop contracts across parent/child boundaries
4. Use registry not only as memory of files, but as memory of surfaces.

This layer should eventually support stronger verification, not replace it.

---

## Layer 7: Commit / Applied State

### Role

This layer records:
- what operations are completed
- what happened historically

### Stable

This is mostly stable now:

- `applied_operations.json`
- `execution_history.jsonl`
- `APPLIED_STATE.md` as projection

### Missing

The main weakness here is not structure anymore.
It is truthfulness in edge cases.

Example:
- a plan says `edit_existing_file`
- runtime can still record something effectively closer to `new_file` in some bootstrap cases

That means the state model is structurally sound but not perfectly faithful yet.

### Conceptual Implementation Plan For This Layer

1. Keep current state split.
2. Prefer recording authored operation intent, not only effective runtime behavior.
3. If effective behavior differs from planned behavior, log both explicitly instead of silently collapsing them.

This is a later polish step, not the next top priority.

---

## Recommended Upgrade Order

This is the exact order recommended going forward.

### 1. Delivery-Surface Planning

This is the big missing layer that had to be added first.

Goal:
- make browser-facing UI features impossible to under-plan

Implementation direction:
- require render surface
- require style surface
- require runtime entry surface or explicit `not_required`
- fail incomplete plans before execution

Status:
- introduced
- should stay

### 2. Cross-File Coherence Enforcement

Goal:
- make files prove they fit together as one surface

Implementation direction:
- compare JSX hooks vs CSS selectors
- compare render surface vs runtime entry
- then expand into child-component hook coherence and prop coherence

Status:
- partially introduced
- still needs expansion

### 3. AST-Based Verifier

Goal:
- stop relying on fragile heuristic JSX checks

Implementation direction:
- use a real JS/JSX parser
- verify imports, JSX elements, props, and exports structurally

Status:
- still needed

### 4. Browser Scaffold Awareness

Goal:
- make the system distinguish between:
  - existing runtime already present
  - missing runtime that must be scaffolded

Implementation direction:
- planning should inspect whether a frontend runtime already exists
- if yes, plan should target it
- if no, plan should add minimal scaffold or equivalent mounting path

Status:
- still needed

### 5. Registry Upgrade

Goal:
- make memory truthful enough to support production-grade multi-file validation

Implementation direction:
- richer surface-aware registry entries
- stronger cross-file interface memory

Status:
- still needed

---

## Bottom Line

The system is no longer just a document-driven code generator.

It is now a layered deterministic shell with:
- typed runtime state
- explicit planning surfaces
- file-scoped generation
- local verification
- early cross-file coherence enforcement

The biggest missing layer was inside planning:

**delivery-surface planning**

The next real upgrade after that is:

**stronger cross-file coherence enforcement**

because once the system knows what files are needed, it must also know whether those files actually fit together as one real product surface.

That is the correct path toward a production-grade deterministic AI implementation pipeline.
