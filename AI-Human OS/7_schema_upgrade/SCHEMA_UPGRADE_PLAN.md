# Schema Upgrade Plan

- generated_at: 2026-04-19T01:32:49.058Z
- detected_gap_family: transport_contracts
- target_schema_section: Transport Contracts

## Rationale

The current plan defines capability and workflow boundaries, but not the concrete runtime transport contract between browser and server. The missing route/method/payload wiring is what blocked client/ui/createRoomClient.js.

## Fields To Add

- transport_mode
- client_transport_owner
- server_transport_owner
- route_contract
- method
- payload_format
- response_format
- dev_runtime_wiring
- transport_prerequisites

## Exact Files To Update

- AI-Human OS/1_planning/3_plan_generation_prompt.txt
- AI-Human OS/1_planning/IMPLEMENTATION_PLAN.template.md
- AI-Human OS/runtime/planning/data_layer.js
- AI-Human OS/runtime/planning/plan_completeness.js
- AI-Human OS/1_planning/IMPLEMENTATION_PLAN.md
- AI-Human OS/runtime/verification/transport_contract_coherence.js
- AI-Human OS/3_execution/7.run_verify.js
- AI-Human OS/3_execution/3.run_operator.js
- AI-Human OS/3_execution/6.run_execute.js
- AI-Human OS/agents/execute_agent.md

## Implementation Order

1. Extend plan prompt to require Transport Contracts when browser/server boundaries are crossed
2. Extend implementation plan template with Transport Contracts fields
3. Parse Transport Contracts into implementation_plan.json
4. Require Transport Contracts in plan completeness for cross-runtime features
5. Repair current IMPLEMENTATION_PLAN.md to make transport explicit
6. Add transport_contract_coherence verifier
7. Pass transport contract slice into target request and execute prompt
