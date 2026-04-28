# CODEBASE_MANIFEST

Generated from a repo audit on 2026-04-28.

## Scope

- Included: repo source, docs, prompts, templates, configs, scripts, and tracked/untracked first-party files.
- Excluded: `.git/`, `node_modules/`, `dist/`, temporary audit directories, and `AI-Human OS/data/**` runtime data snapshots.
- Total files in this manifest: 193

## Category Definitions

- `REPO_METADATA`: Repository metadata and tooling manifests. Important for setup, but not business/runtime logic.
- `ACTIVE_ENTRYPOINT`: Directly launched or directly mounted entry files on the current repo path.
- `ACTIVE_RUNTIME`: Runtime code or assets used by the current live app, console, planning, execution, verification, registry, or metrics flows.
- `ACTIVE_MEMORY_OR_CONFIG`: Human-maintained or deterministic config/state-of-truth files read by the active runtime.
- `ACTIVE_PROMPT_OR_TEMPLATE`: Prompt or template files deterministically read by active runtime code.
- `LEGACY_REACHABLE`: Still callable or routed from the repo, but not on the current primary console UI path.
- `GENERATED_STATE`: Generated artifact/state files that are outputs of the pipeline, not hand-authored source.
- `ARCHIVE`: Historical feature artifacts kept for reference, not used by the active runtime.
- `DOC_CURRENT`: Human-facing docs that still match the current implemented system closely enough to treat as current reference.
- `DOC_REFERENCE_UNVERIFIED`: Reference docs/diagrams/reviews that may still be useful, but were not validated as canonical in this pass.
- `DOC_STALE`: Docs that are clearly drifted, duplicated, or superseded by newer implemented behavior.
- `STALE_CANDIDATE`: Present in the repo but currently unwired, replaced, duplicated, or otherwise not on the active path.

## Category Counts

- `REPO_METADATA`: 4
- `ACTIVE_ENTRYPOINT`: 21
- `ACTIVE_RUNTIME`: 60
- `ACTIVE_MEMORY_OR_CONFIG`: 19
- `ACTIVE_PROMPT_OR_TEMPLATE`: 23
- `LEGACY_REACHABLE`: 11
- `GENERATED_STATE`: 8
- `ARCHIVE`: 7
- `DOC_CURRENT`: 3
- `DOC_REFERENCE_UNVERIFIED`: 10
- `DOC_STALE`: 4
- `STALE_CANDIDATE`: 23

## Files By Category

### REPO_METADATA (4)

- `.gitignore` - Repository metadata or package/tool manifest.
- `LICENSE` - Repository metadata or package/tool manifest.
- `package-lock.json` - Repository metadata or package/tool manifest.
- `package.json` - Repository metadata or package/tool manifest.

### ACTIVE_ENTRYPOINT (21)

- `AI-Human OS/1_planning/run_planning_agents.js` - Direct planning-stage CLI entry.
- `AI-Human OS/1_planning/run_planning_intake.js` - Direct planning-stage CLI entry.
- `AI-Human OS/1_planning/run_planning.js` - Direct planning-stage CLI entry.
- `AI-Human OS/3_execution/1.run_full.js` - Direct execution-run CLI entry.
- `AI-Human OS/6_next_feature/run_next_feature_plan.js` - Directly launched file on a current repo path.
- `AI-Human OS/7_schema_upgrade/detect_contract_gap.js` - Direct schema-upgrade CLI entry.
- `AI-Human OS/7_schema_upgrade/upgrade_schema_proposal.js` - Direct schema-upgrade CLI entry.
- `AI-Human OS/8_metrics/render_metrics_report.py` - Direct metrics renderer entry.
- `AI-Human OS/console_api/server.js` - Live console API backend.
- `AI-Human OS/console_ui/src/main.jsx` - Live console UI mount entry.
- `AI-Human OS/console_ui/vite.config.js` - Console UI dev/build entry config.
- `client/main.js` - Root demo app mount entry.
- `plan_next_feature.js` - Root wrapper around AI-Human OS CLI flow.
- `reset.js` - Root reset utility for AI-Human OS state.
- `run_ai.js` - Root wrapper around AI-Human OS CLI flow.
- `run_metrics_report.js` - Root wrapper around AI-Human OS CLI flow.
- `run_planning_agents.js` - Root wrapper around AI-Human OS CLI flow.
- `run_planning_intake.js` - Root wrapper around AI-Human OS CLI flow.
- `run_planning.js` - Root wrapper around AI-Human OS CLI flow.
- `run_schema_upgrade.js` - Root wrapper around AI-Human OS CLI flow.
- `vite.config.js` - Root Vite app config for npm run dev.

### ACTIVE_RUNTIME (60)

- `AI-Human OS/3_execution/2.run_state_validate.js` - Used by an active runtime path.
- `AI-Human OS/3_execution/3.run_operator.js` - Used by an active runtime path.
- `AI-Human OS/3_execution/4.parse_plan.js` - Used by an active runtime path.
- `AI-Human OS/3_execution/5.enrich_request.js` - Used by an active runtime path.
- `AI-Human OS/3_execution/6.run_execute.js` - Used by an active runtime path.
- `AI-Human OS/3_execution/7.run_verify.js` - Used by an active runtime path.
- `AI-Human OS/3_execution/run_logger.js` - Used by an active runtime path.
- `AI-Human OS/4_registry_update/run_commit_with_registry.js` - Used by an active runtime path.
- `AI-Human OS/4_registry_update/run_registry_backfill.js` - Used by an active runtime path.
- `AI-Human OS/4_registry_update/run_registry_update.js` - Used by an active runtime path.
- `AI-Human OS/5_commit/run_commit.js` - Used by an active runtime path.
- `AI-Human OS/console_api/select_parent_folder.ps1` - Used by an active runtime path.
- `AI-Human OS/console_ui/index.html` - Used by an active runtime path.
- `AI-Human OS/console_ui/src/ui/api.js` - Console API client wrapper.
- `AI-Human OS/console_ui/src/ui/console.css` - Used by an active runtime path.
- `AI-Human OS/console_ui/src/ui/ConsoleApp.jsx` - Current single-page L0/L1/L1.9/L2/L3 console flow.
- `AI-Human OS/runtime/agents/run_l0_agent.js` - Current LLM agent runner used by console/API path.
- `AI-Human OS/runtime/agents/run_l1_agent.js` - Current LLM agent runner used by console/API path.
- `AI-Human OS/runtime/agents/run_l19_agent.js` - Current LLM agent runner used by console/API path.
- `AI-Human OS/runtime/behavior/behavior_simulation.js` - Behavior simulation runtime used by execution path.
- `AI-Human OS/runtime/commit/commit_confirmation.js` - Used by an active runtime path.
- `AI-Human OS/runtime/model/model_adapter.js` - Used by an active runtime path.
- `AI-Human OS/runtime/planning/agent_utils.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/convergence_guard.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/data_layer.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/decision_evaluator.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/decision_extraction_agent.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/decision_validator.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/execution_confirmation.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/feedback_translator.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/plan_compile.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/plan_completeness.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/plan_reconciler.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/plan_traceability.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/planner_agent.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/planning_orchestrator.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/repair_agent.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/retry_strategy.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/runtime_surface_inspector.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/structured_feedback.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/planning/upstream_planning_evaluator.js` - Planning/execution runtime module used on active path.
- `AI-Human OS/runtime/recovery/execution_metrics.js` - Used by an active runtime path.
- `AI-Human OS/runtime/recovery/retry_feedback.js` - Used by an active runtime path.
- `AI-Human OS/runtime/registry/file_registry_analysis.js` - Used by an active runtime path.
- `AI-Human OS/runtime/requirements/product_requirements.js` - Used by an active runtime path.
- `AI-Human OS/runtime/throughput/throughput_policy.js` - Used by an active runtime path.
- `AI-Human OS/runtime/verification/browser_scaffold_coherence.js` - Verification module used by execution path.
- `AI-Human OS/runtime/verification/capability_contract_coherence.js` - Verification module used by execution path.
- `AI-Human OS/runtime/verification/cross_file_contract_coherence.js` - Verification module used by execution path.
- `AI-Human OS/runtime/verification/jsx_ast_contracts.js` - Verification module used by execution path.
- `AI-Human OS/runtime/verification/jsx_semantic_check.js` - Verification module used by execution path.
- `AI-Human OS/runtime/verification/ui_surface_coherence.js` - Verification module used by execution path.
- `AI-Human OS/runtime/verification/workflow_state_coherence.js` - Verification module used by execution path.
- `AI-Human OS/runtime/workspace/workspace_config.js` - Used by an active runtime path.
- `client/ui/App.js` - Source for the root demo React app.
- `client/ui/components/CreateRoomButton.js` - Source for the root demo React app.
- `client/ui/components/JoinRoomButton.js` - Source for the root demo React app.
- `client/ui/layout/LobbyLayout.css` - Source for the root demo React app.
- `client/ui/layout/LobbyLayout.js` - Source for the root demo React app.
- `index.html` - Used by an active runtime path.

### ACTIVE_MEMORY_OR_CONFIG (19)

- `AI-Human OS/8_metrics/requirements.txt` - Deterministic config or state-of-truth file.
- `AI-Human OS/decision_framework/decision_file_creation.json` - Decision framework input read by planning evaluation.
- `AI-Human OS/decision_framework/decision_file_split.json` - Decision framework input read by planning evaluation.
- `AI-Human OS/decision_framework/decision_folder_creation.json` - Decision framework input read by planning evaluation.
- `AI-Human OS/decision_framework/decision_naming.json` - Decision framework input read by planning evaluation.
- `AI-Human OS/memory/CANONICAL_DEFINITIONS.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/decision_schema.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/DESIGN_TOKENS.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/DRIFT_SCORING.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/DRIFT_TYPES.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/FILE_REGISTRY.md` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/META_SYSTEM_STATES.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/PRODUCT_STANDARDS.md` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/PROJECT_CONTEXT.md` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/repair_instructions_schema.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/SYSTEM_REGISTRY.md` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/THROUGHPUT_POLICY.json` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/UI_PATTERNS.md` - Runtime-read memory/config/schema file.
- `AI-Human OS/memory/WORKSPACE_CONFIG.json` - Runtime-read memory/config/schema file.

### ACTIVE_PROMPT_OR_TEMPLATE (23)

- `AI-Human OS/1_planning/1_features_planning_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/1_planning/2_feature_selection_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/1_planning/3_plan_generation_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/1_planning/FEATURE_REQUEST.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/1_planning/IMPLEMENTATION_PLAN.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/1. scenario_generation_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/2. state_flow_generation_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/3. reconciliation_rule_generation_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/4. simulation_prompt.txt` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/RECONCILIATION_RULE.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/SCENARIOS.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/SIMULATION_REPORT.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/2_behavior/STATE_FLOW.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/3_execution/TARGET_FILE_REQUEST.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/agents/execute_agent.md` - Prompt contract consumed by execute step.
- `AI-Human OS/console_ui/public/memory/prompts/module.template.txt` - Browser-served prompt template consumed by Screen 4.
- `AI-Human OS/memory/DESIGN_TOKENS.template.json` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/memory/PRODUCT_STANDARDS.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.
- `AI-Human OS/memory/prompts/l0_agent.txt` - Prompt/template consumed by current console L0/L1/L1.9/L3 flow.
- `AI-Human OS/memory/prompts/l1_compiler_agent.txt` - Prompt/template consumed by current console L0/L1/L1.9/L3 flow.
- `AI-Human OS/memory/prompts/l1_verifier_agent.txt` - Prompt/template consumed by current console L0/L1/L1.9/L3 flow.
- `AI-Human OS/memory/prompts/module.template.txt` - Prompt/template consumed by current console L0/L1/L1.9/L3 flow.
- `AI-Human OS/memory/UI_PATTERNS.template.md` - Template/prompt consumed by an active deterministic or model-driven stage.

### LEGACY_REACHABLE (11)

- `AI-Human OS/runtime/l0/decision_graph_initializer.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l0/session_state_manager.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1_5/decision_graph_updater.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/completion_checker.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/domain_sequence.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/field_selector.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/l1_interrogator.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/question_agent.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/response_assembler.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/l1/suggested_answer_generator.js` - Still wired or importable, but not on the current primary console path.
- `AI-Human OS/runtime/orchestrator/loop_orchestrator.js` - Still wired or importable, but not on the current primary console path.

### GENERATED_STATE (8)

- `AI-Human OS/1_planning/FEATURE_REQUEST.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/1_planning/FEATURES_LIST.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/1_planning/IMPLEMENTATION_PLAN.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/2_behavior/RECONCILIATION_RULE.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/2_behavior/SCENARIOS.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/2_behavior/SIMULATION_REPORT.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/2_behavior/STATE_FLOW.md` - Generated artifact/state file, not hand-authored source.
- `AI-Human OS/5_commit/APPLIED_STATE.md` - Generated artifact/state file, not hand-authored source.

### ARCHIVE (7)

- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/FEATURE_REQUEST.md` - Historical feature artifact kept for reference only.
- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/IMPLEMENTATION_PLAN.md` - Historical feature artifact kept for reference only.
- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/manifest.json` - Historical feature artifact kept for reference only.
- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/RECONCILIATION_RULE.md` - Historical feature artifact kept for reference only.
- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/SCENARIOS.md` - Historical feature artifact kept for reference only.
- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/SIMULATION_REPORT.md` - Historical feature artifact kept for reference only.
- `AI-Human OS/feature_archive/feature_001_lobby-screen-game-entry-hub/STATE_FLOW.md` - Historical feature artifact kept for reference only.

### DOC_CURRENT (3)

- `AI-Human OS/CLS.md` - Current reference doc aligned with the implemented system.
- `AI-Human OS/HFD.md` - Current reference doc aligned with the implemented system.
- `AI-Human OS/UI.md` - Current reference doc aligned with the implemented system.

### DOC_REFERENCE_UNVERIFIED (10)

- `AI_HUMAN_OS_DATA_FLOW_REVIEW.md` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/ai_human_os_contracts.pdf` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/ai_human_os_contracts.svg` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/ai_human_os_node_contract_flow.svg` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/ai_human_os_pipeline.pdf` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/ai_human_os_pipeline.svg` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/CLS Pipeline and Gate Architecture.png` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/Execution Phase Contract Stack.png` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/pipeline_summary_strip.pdf` - Reference material or diagram not validated as canonical in this pass.
- `AI-Human OS/.docs/pipeline_summary_strip.svg` - Reference material or diagram not validated as canonical in this pass.

### DOC_STALE (4)

- `AI-Human OS/.docs/CLS.md` - Doc is duplicated, superseded, or mismatched with the current implementation.
- `AI-Human OS/.docs/FRONTEND_SCREEN_CONTRACTS.md` - Doc is duplicated, superseded, or mismatched with the current implementation.
- `AI-Human OS/.docs/UI_FLOW.md` - Doc is duplicated, superseded, or mismatched with the current implementation.
- `README.md` - Doc is duplicated, superseded, or mismatched with the current implementation.

### STALE_CANDIDATE (23)

- `AI-Human OS/0_init/init_memory.txt` - Bootstrap note file with no current caller found.
- `AI-Human OS/1_planning/run_planning_agent_pipeline.js` - Redundant planning-agent entry with no current wrapper or route.
- `AI-Human OS/agents/behavior_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/agents/commit_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/agents/init_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/agents/l0_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/agents/l1_compiler_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/agents/l1_verifier_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/agents/plan_agent.txt` - Old prompt location superseded by memory/prompts or no current caller found.
- `AI-Human OS/console_ui/public/memory/prompts/start.template.txt` - Older start prompt template; current L3 builds start_prompt deterministically in code.
- `AI-Human OS/memory/decision_graph_template.json` - Superseded by the current L0 agent/domain extraction path.
- `AI-Human OS/memory/prompts/l3_DATA MODEL.txt` - Older L3 prompt file not used by the current deterministic Screen 4 flow.
- `AI-Human OS/memory/prompts/l3_FLOW IMPLEMENTATION.txt` - Older L3 prompt file not used by the current deterministic Screen 4 flow.
- `AI-Human OS/memory/prompts/l3_INTERFACE CONTRACT.txt` - Older L3 prompt file not used by the current deterministic Screen 4 flow.
- `AI-Human OS/memory/prompts/l3_MODULE GENERATION.txt` - Older L3 prompt file not used by the current deterministic Screen 4 flow.
- `AI-Human OS/memory/prompts/l3_START BUILD.txt` - Older L3 prompt file not used by the current deterministic Screen 4 flow.
- `AI-Human OS/memory/prompts/start.template.txt` - Older start prompt template; current L3 builds start_prompt deterministically in code.
- `AI-Human OS/runtime/l1/question_generator.js` - Replaced by question_agent.js in the current L1 flow.
- `AI-Human OS/runtime/planning/l2_compiler.js` - Implemented but not wired into the current Screen 4 path.
- `AI-Human OS/runtime/planning/l2_primitives.js` - Implemented but not wired into the current Screen 4 path.
- `AI-Human OS/runtime/planning/l2_rule_engine.js` - Implemented but not wired into the current Screen 4 path.
- `AI-Human OS/runtime/planning/planning_agent_system.js` - Metadata/spec module with no active caller found.
- `AI-Human OS/runtime/semantics/canonical_definitions.js` - Helper module not used by the current server/runtime path.
