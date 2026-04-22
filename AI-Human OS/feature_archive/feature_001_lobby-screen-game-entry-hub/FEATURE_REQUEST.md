# Feature Request

## Name
Lobby Screen (Game Entry Hub)

## What is it?
A simple web-based entry screen where players land when opening the game.  
It presents basic options to start playing, such as creating or joining a room, using minimal UI elements.  
The lobby acts as the central starting point before any gameplay begins.

## What should the user feel or see?
- A clear starting point immediately after opening the game  
- Simple, obvious buttons to choose how to play  
- No friction or setup before entering a game  

## Where does this live in the system?
- client/ui/layout (main entry screen before gameplay)

## Constraints (important)
- must be a webgame-accessible lobby (runs in browser)
- must use simple dummy buttons (no complex UI)
- must not rely on heavy backend logic or systems
- must respect input → update → render flow without side effects

## What should NOT happen
- no authentication system or user accounts
- no complex navigation, overlays, or multi-step flows

## Notes (optional)
- this is a projection-only UI layer and should not create or mutate game state directly  
- server authority remains unchanged; this screen only routes user intent
