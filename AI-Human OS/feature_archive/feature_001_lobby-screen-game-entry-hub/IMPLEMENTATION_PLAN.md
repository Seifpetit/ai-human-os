## Feature
Lobby Screen (Game Entry Hub)

## Goal
Provide a minimal, projection-only browser lobby that players can actually see and use as the game entry screen, without introducing state mutation or backend logic.

---

## Delivery Surfaces
- render_surface: client/ui/layout/LobbyLayout.js
- style_surface: client/ui/layout/LobbyLayout.css
- runtime_entry_surface: client/ui/App.js

---

## Browser Scaffold
- html_entry: index.html
- dom_mount_entry: client/main.js
- mount_target: root
- scaffold_strategy: create_if_missing

---

## Cross-File Contracts
- surface_family: lobby-layout
- style_owner: client/ui/layout/LobbyLayout.css
- render_uses_style_surface: required
- child_components:
  - client/ui/components/CreateRoomButton.js | export=CreateRoomButton | hooks=lobby-layout__action,lobby-layout__action--primary | props=onClick
  - client/ui/components/JoinRoomButton.js | export=JoinRoomButton | hooks=lobby-layout__action,lobby-layout__action--secondary | props=onClick
- prop_contracts:
  - parent=client/ui/layout/LobbyLayout.js | child=CreateRoomButton | props=onClick
  - parent=client/ui/layout/LobbyLayout.js | child=JoinRoomButton | props=onClick

---

## Workflow Contracts
- workflow_mode: projection_only
- action_owner: client/ui/layout/LobbyLayout.js
- request_boundary: not_required
- response_boundary: not_required
- state_owner: client/ui/layout/LobbyLayout.js
- server_authority_boundary: not_required
- success_surface: client/ui/layout/LobbyLayout.js
- failure_surface: client/ui/layout/LobbyLayout.js

---

## Sequence of cycles

### Cycle 1
- file: index.html
- type: new_file
- purpose: create the browser html entry that defines the reusable root mount target for UI features
- depends_on: none

### Cycle 2
- file: client/ui/layout/LobbyLayout.js
- type: new_file
- purpose: introduce the main lobby layout container that defines the browser entry screen structure and render projection
- depends_on:
  - index.html::new_file

### Cycle 3
- file: client/ui/components/CreateRoomButton.js
- type: edit_existing_file
- purpose: adapt the create-room button to be compatible with lobby usage and keep it projection-only and intent-emitting
- depends_on:
  - client/ui/layout/LobbyLayout.js::new_file

### Cycle 4
- file: client/ui/components/JoinRoomButton.js
- type: new_file
- purpose: introduce a second lobby action button for joining a room with matching simplicity and projection-only behavior
- depends_on:
  - client/ui/layout/LobbyLayout.js::new_file

### Cycle 5
- file: client/ui/layout/LobbyLayout.css
- type: new_file
- purpose: define the minimal non-blocking style surface for the lobby layout and button hierarchy using shared class hooks
- depends_on:
  - client/ui/layout/LobbyLayout.js::new_file

### Cycle 6
- file: client/ui/App.js
- type: new_file
- purpose: provide the runtime entry surface that renders the lobby screen in the browser-facing client UI
- depends_on:
  - client/ui/layout/LobbyLayout.js::new_file
  - client/ui/layout/LobbyLayout.css::new_file

### Cycle 7
- file: client/main.js
- type: new_file
- purpose: provide the DOM mount entry that renders the runtime entry surface into the reusable browser scaffold
- depends_on:
  - client/ui/App.js::new_file
  - index.html::new_file

### Cycle 8
- file: client/ui/layout/LobbyLayout.js
- type: edit_existing_file
- purpose: integrate CreateRoomButton and JoinRoomButton into the layout, define their visual placement, and align markup with the declared style surface
- depends_on:
  - client/ui/components/CreateRoomButton.js::edit_existing_file
  - client/ui/components/JoinRoomButton.js::new_file
  - client/ui/layout/LobbyLayout.css::new_file

### Cycle 9
- file: client/ui/layout/LobbyLayout.js
- type: edit_existing_file
- purpose: finalize projection behavior by ensuring no state mutation occurs and all interactions remain pure intent signals inside the browser-visible lobby
- depends_on:
  - client/ui/layout/LobbyLayout.js::edit_existing_file
  - client/ui/App.js::new_file

---

## Dependency reasoning
The layout shell must exist first because it anchors both the lobby buttons and the styling hooks. The button files can then be aligned to the lobby surface. The style surface is introduced before final integration so the layout markup can target a concrete shared styling layer instead of inventing local token objects. The runtime entry surface is added after the layout and styles exist so the lobby becomes viewable in the browser. Final layout refinement happens only after buttons, styles, and app entry are available.

---

## Touched system areas
- ui
- render
- input

---

## Risk points
- accidentally introducing state mutation inside UI components
- planning a browser-facing feature without a viewable runtime surface
- drifting from minimal dummy-button constraints into navigation or backend behavior
- mismatching CSS class hooks between the layout and the shared style surface
- child components exposing hooks or props that drift from the declared lobby contract

--- 

## Verification checklist
- lobby is viewable through the declared runtime entry surface
- lobby layout renders without requiring backend or state setup
- buttons are visible, clickable, and emit intent only
- no writes occur to state from the UI layer
- layout and buttons use the declared style surface instead of inline token objects
- child components expose the declared lobby-layout action hooks
- layout passes the declared intent props to child buttons
- browser-facing feature is viewable through the declared delivery surfaces

--- 

## Notes
- routing of button intent to actual game logic is still deferred
- visual styling should remain minimal and non-blocking
- this feature now includes the minimum browser delivery surfaces needed to make the lobby actually viewable
