# TARGET FILE REQUEST

## File Path

<relative path, e.g. client/ui/components/Button.js>

---

## File Type

<new_file | edit_existing_file>

---

## Purpose

<What this file is supposed to do, in one or two sentences>

---

## Responsibilities

* <responsibility 1>
* <responsibility 2>
* <responsibility 3>

---

## Explicit Requirements

* must <do X>
* must <expose Y>
* must <integrate with Z>

---

## Explicit Non-Responsibilities (FORBIDDEN)

* must NOT <do something outside scope>
* must NOT <introduce new system>
* must NOT <handle logic that belongs elsewhere>

---

## Inputs

* <data / props / inputs this file receives>
* <source of those inputs (if known)>

---

## Outputs

* <what this file produces or emits>
* <events, callbacks, return values, rendering, etc.>

---

## Dependencies

* <list of files / modules this file depends on>
* <or “none” if standalone>

---

## Browser Scaffold

* html_entry: <path or not_required>
* dom_mount_entry: <path or not_required>
* mount_target: <dom id or not_required>
* scaffold_strategy: <create_if_missing | reuse_existing | not_required>

---

## Capability Dependencies

* capabilities: <relevant capability=status=... action=... or none>
* required_contracts: <relevant contract files/boundaries or none>
* prerequisite_operations: <relevant plan operations or none>

---

## Cross-File Contracts

* surface_family: <shared class-hook family or none>
* style_owner: <style owner file or none>
* render_uses_style_surface: <required | not_required>
* child_component_contracts: <relevant child exports / hooks / props>
* prop_contracts: <relevant parent -> child prop contract declarations>

---

## Workflow Contracts

* workflow_mode: <projection_only | client_action | server_authoritative | none>
* action_owner: <file or none>
* request_boundary: <file/API boundary or not_required>
* response_boundary: <file/payload boundary or not_required>
* state_owner: <file/system or none>
* server_authority_boundary: <rule or not_required>
* success_surface: <surface or not_required>
* failure_surface: <surface or not_required>

---

## Integration Points

* <where this file is used in the system>
* <who calls it or renders it>

---

## Behavioral Constraints

* <must follow rule from STATE_FLOW if applicable>
* <must respect server/client boundary>
* <must remain pure if required>

---

## Architectural Constraints

* follow SYSTEM_REGISTRY rules
* no state mutation unless explicitly allowed
* respect input → update → state → render flow

---

## Implementation Pattern (CRITICAL)

* <function/component signature (e.g. export default function X(ctx))>
* <rendering or execution pattern (e.g. render(ctx), pure function, etc.)>
* <interaction model (e.g. onClick, contains, event handlers)>
* <composition pattern (e.g. calls child components directly)>
* <forbidden patterns (e.g. no DOM manipulation, no hooks, no async, etc.)>

---

## Notes

<any clarifications, edge cases, simplifications, or assumptions>
