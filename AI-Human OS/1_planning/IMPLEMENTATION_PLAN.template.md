# Implementation Plan

## Feature
<name>

## Goal
<1–2 lines describing what this plan achieves>

---

## Delivery Surfaces
- render_surface: <path or existing surface or not_required>
- style_surface: <path or existing shared styles or not_required>
- runtime_entry_surface: <path or existing app entry or not_required>

---

## Browser Scaffold
- html_entry: <path to html entry or not_required>
- dom_mount_entry: <path to browser mount file or not_required>
- mount_target: <dom id such as root or not_required>
- scaffold_strategy: create_if_missing | reuse_existing | not_required

---

## Capability Dependencies
- capability: <name such as multiplayer_room_creation or auth_session>
  - status: exists | partial | missing
  - rationale: <why this capability is needed by the feature>
  - required_contracts:
    - <shared contract, server boundary, state owner, client boundary, or none>
  - existing_surfaces:
    - <existing file/boundary or none>
  - prerequisite_operations:
    - <file_path>::<operation_type> or none>
  - plan_action: establish_first | reuse_existing

---

## Cross-File Contracts
- surface_family: <shared class-hook family, e.g. lobby-layout>
- style_owner: <file that owns the shared style surface>
- render_uses_style_surface: required | not_required
- child_components:
  - <file path> | export=<symbol> | hooks=<hook_a,hook_b> | props=<prop_a,prop_b or none>
- prop_contracts:
  - parent=<file path> | child=<symbol> | props=<prop_a,prop_b or none>

---

## Workflow Contracts
- workflow_mode: projection_only | client_action | server_authoritative
- action_owner: <file that owns the primary user intent or action boundary>
- request_boundary: <file or API boundary or not_required>
- response_boundary: <file or payload boundary or not_required>
- state_owner: <file/system that owns authoritative state>
- server_authority_boundary: <rule or file or not_required>
- success_surface: <surface shown on successful action or not_required>
- failure_surface: <surface shown on failed action or not_required>

---

## Sequence of cycles

### Cycle 1
- file: <path>
- type: new_file | edit_existing_file
- purpose: <what this file introduces>
- depends_on: <none or list>

### Cycle 2
- file: <path>
- type: new_file | edit_existing_file
- purpose: <what this file introduces>
- depends_on: <previous files>

### Cycle 3
...

---

## Dependency reasoning
<why this order is correct — short explanation>

---

## Touched system areas
- <state>
- <input>
- <render>
- <ui>
- <data>

---

## Risk points
- <possible mismatch or fragile area>
- <ordering issues>
- <naming consistency risks>

---

## Verification checklist
- <check 1>
- <check 2>
- <check 3>
- <browser-facing features are viewable through the declared delivery surfaces when applicable>

---

## Notes
<any uncertainties or decisions deferred to later cycles>
