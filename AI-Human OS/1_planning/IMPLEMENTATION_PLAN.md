# Implementation Plan

## Feature
Create Multiplayer Room

## Goal
Add a server-authoritative room creation flow that starts from the existing lobby UI, creates a joinable multiplayer session on the server, and returns a visible success or failure result to the player without making the client the source of truth.

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
- scaffold_strategy: reuse_existing

---

## Capability Dependencies
- capability: multiplayer_room_creation
  - status: missing
  - rationale: the feature depends on a reusable server-authoritative room-creation capability, not just a lobby button or client adapter
  - required_contracts:
    - shared/multiplayer/CreateRoomCommand.js
    - shared/multiplayer/CreateRoomResult.js
    - server/core/update/createRoomSession.js
    - server/core/state/roomRegistry.js
    - server/core/input/createRoomRequest.js
    - client/ui/createRoomClient.js
  - existing_surfaces:
    - none
  - prerequisite_operations:
    - shared/multiplayer/CreateRoomCommand.js::new_file
    - shared/multiplayer/CreateRoomResult.js::new_file
    - server/core/domain/createRoomRecord.js::new_file
    - server/core/state/roomRegistry.js::new_file
    - server/core/update/createRoomSession.js::new_file
    - server/core/render/projectCreateRoomResult.js::new_file
    - server/core/input/createRoomRequest.js::new_file
    - server/main.js::new_file
    - vite.config.js::edit_existing_file
    - client/ui/createRoomClient.js::new_file
  - plan_action: establish_first

---

## Cross-File Contracts
- surface_family: lobby-layout
- style_owner: client/ui/layout/LobbyLayout.css
- render_uses_style_surface: required
- child_components:
  - client/ui/components/CreateRoomButton.js | export=CreateRoomButton | hooks=lobby-layout__action,lobby-layout__action--primary | props=onClick,disabled,label
  - client/ui/components/JoinRoomButton.js | export=JoinRoomButton | hooks=lobby-layout__action,lobby-layout__action--secondary | props=onClick
  - client/ui/feedback/RoomCreationStatus.js | export=RoomCreationStatus | hooks=lobby-layout__status,lobby-layout__status--pending,lobby-layout__status--success,lobby-layout__status--error,lobby-layout__room-code | props=phase,message,roomCode
- prop_contracts:
  - parent=client/ui/layout/LobbyLayout.js | child=CreateRoomButton | props=onClick,disabled,label
  - parent=client/ui/layout/LobbyLayout.js | child=JoinRoomButton | props=onClick
  - parent=client/ui/layout/LobbyLayout.js | child=RoomCreationStatus | props=phase,message,roomCode

---

## Workflow Contracts
- workflow_mode: server_authoritative
- action_owner: client/ui/layout/LobbyLayout.js
- request_boundary: client/ui/createRoomClient.js
- response_boundary: shared/multiplayer/CreateRoomResult.js
- state_owner: server/core/state/roomRegistry.js
- server_authority_boundary: only server/core/update/createRoomSession.js may create and register a joinable room
- success_surface: client/ui/feedback/RoomCreationStatus.js
- failure_surface: client/ui/feedback/RoomCreationStatus.js

---

## Sequence of cycles

### Cycle 1
- file: shared/multiplayer/CreateRoomCommand.js
- type: new_file
- purpose: define the shared request contract for room creation so client and server agree on the create-room input shape without duplicating assumptions
- depends_on: none

### Cycle 2
- file: shared/multiplayer/CreateRoomResult.js
- type: new_file
- purpose: define the shared response contract that exposes only the room creation result needed by the client, including joinable-room confirmation data
- depends_on: none

### Cycle 3
- file: server/core/domain/createRoomRecord.js
- type: new_file
- purpose: introduce the pure domain factory that derives a new room record and its initial joinable state from validated create-room input
- depends_on:
  - shared/multiplayer/CreateRoomCommand.js::new_file

### Cycle 4
- file: server/core/state/roomRegistry.js
- type: new_file
- purpose: create the authoritative server-owned room registry that stores created rooms and their joinable availability
- depends_on:
  - server/core/domain/createRoomRecord.js::new_file

### Cycle 5
- file: server/core/update/createRoomSession.js
- type: new_file
- purpose: add the update-layer operation that validates a create-room command, creates a room through the domain layer, and writes it into authoritative server state
- depends_on:
  - shared/multiplayer/CreateRoomCommand.js::new_file
  - server/core/domain/createRoomRecord.js::new_file
  - server/core/state/roomRegistry.js::new_file

### Cycle 6
- file: server/core/render/projectCreateRoomResult.js
- type: new_file
- purpose: add the render projection that converts authoritative room creation state into the shared client-safe result payload
- depends_on:
  - shared/multiplayer/CreateRoomResult.js::new_file
  - server/core/update/createRoomSession.js::new_file

### Cycle 7
- file: server/core/input/createRoomRequest.js
- type: new_file
- purpose: introduce the input boundary that receives the room creation request, parses it into the shared command shape, invokes the update layer, and returns the projected result
- depends_on:
  - shared/multiplayer/CreateRoomCommand.js::new_file
  - server/core/update/createRoomSession.js::new_file
  - server/core/render/projectCreateRoomResult.js::new_file

### Cycle 8
- file: server/main.js
- type: new_file
- purpose: expose the minimal server runtime entry that makes the room creation request boundary reachable from the browser-facing client
- depends_on:
  - server/core/input/createRoomRequest.js::new_file

### Cycle 9
- file: vite.config.js
- type: edit_existing_file
- purpose: wire the existing browser runtime to the server room-creation boundary so the lobby UI can reach the authoritative create-room flow during development
- depends_on:
  - server/main.js::new_file

### Cycle 10
- file: client/ui/createRoomClient.js
- type: new_file
- purpose: isolate the client request boundary that sends the create-room command to the server and normalizes the shared result for the lobby render surface
- depends_on:
  - shared/multiplayer/CreateRoomCommand.js::new_file
  - shared/multiplayer/CreateRoomResult.js::new_file
  - vite.config.js::edit_existing_file

### Cycle 11
- file: client/ui/feedback/RoomCreationStatus.js
- type: new_file
- purpose: add the inline feedback surface that renders pending, success, and failure outcomes for room creation near the primary action
- depends_on:
  - shared/multiplayer/CreateRoomResult.js::new_file

### Cycle 12
- file: client/ui/components/CreateRoomButton.js
- type: edit_existing_file
- purpose: extend the primary action button so the lobby can express disabled and loading-adjacent create-room states without changing button ownership
- depends_on:
  - client/ui/feedback/RoomCreationStatus.js::new_file

### Cycle 13
- file: client/ui/layout/LobbyLayout.css
- type: edit_existing_file
- purpose: add the shared style hooks for room creation feedback, success emphasis, and room-code presentation while preserving the existing lobby surface family
- depends_on:
  - client/ui/feedback/RoomCreationStatus.js::new_file
  - client/ui/components/CreateRoomButton.js::edit_existing_file

### Cycle 14
- file: client/ui/layout/LobbyLayout.js
- type: edit_existing_file
- purpose: connect player input, create-room intent dispatch, and inline room creation result rendering inside the existing browser-visible lobby without taking authority away from the server
- depends_on:
  - client/ui/createRoomClient.js::new_file
  - client/ui/feedback/RoomCreationStatus.js::new_file
  - client/ui/components/CreateRoomButton.js::edit_existing_file
  - client/ui/layout/LobbyLayout.css::edit_existing_file

---

## Dependency reasoning
The plan establishes the shared request and response contracts first so both sides of the feature use the same boundaries. Server work then follows the required architecture order of domain, state, update, render, and input before exposing a runtime entry. Once that authoritative path exists, the client request boundary can target it safely, and the browser-facing lobby surface can add feedback and success projection last. This keeps room truth on the server, keeps UI work viewable through the existing scaffold, and avoids circular dependencies between lobby rendering and backend session creation.

---

## Touched system areas
- input
- update
- state
- render
- ui
- data

---

## Risk points
- introducing client-generated room identifiers instead of creating them on the server
- exposing more room state to the client than the shared response contract requires
- wiring the browser dev runtime to a missing or mismatched server endpoint
- drifting the lobby status hooks away from the declared shared style surface
- accidentally expanding the existing join action into a separate join-room workflow during room-creation work

---

## Verification checklist
- the create-room flow is initiated from the existing lobby render surface and remains viewable through `client/ui/App.js`, `client/main.js`, and `index.html`
- the client sends a shared create-room command through `client/ui/createRoomClient.js` instead of creating room state locally
- the server creates the room only through `server/core/update/createRoomSession.js` and stores it in `server/core/state/roomRegistry.js`
- the response returned to the client matches `shared/multiplayer/CreateRoomResult.js` and confirms the room is joinable
- success and failure feedback render inline through `client/ui/feedback/RoomCreationStatus.js`
- the create-room button reflects pending or unavailable states without changing ownership of the primary action
- the join-room UI remains non-authoritative and unchanged beyond coexistence with the new create-room flow
- browser-facing features are viewable through the declared delivery surfaces when applicable

---

## Notes
- this plan stays limited to room creation and joinable-room confirmation; it does not implement room joining, matchmaking, or in-room gameplay
- the existing browser scaffold is reused, so no new HTML or DOM mount files are needed
- if room codes or room ids need a final product decision, that decision should be made inside the shared response contract before client render work begins
