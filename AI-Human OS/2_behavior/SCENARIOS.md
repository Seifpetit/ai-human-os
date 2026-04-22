# Scenarios

## Scenario 1 — Normal Lobby Entry
- step 1: user opens the web game in the browser
- step 2: system initializes UI render cycle with no prior state
- step 3: LobbyLayout renders as the default entry screen
- step 4: user sees Create Room and Join Room buttons
- step 5: user clicks one button (no backend action yet, only input captured)

## Scenario 2 — Input Without Side Effects (Edge Case)
- step 1: user opens the web game
- step 2: LobbyLayout renders with all UI elements
- step 3: user clicks multiple buttons rapidly
- step 4: input layer captures clicks but no update/state mutation occurs
- step 5: UI remains stable and unchanged (projection-only behavior)