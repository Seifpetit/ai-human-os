# Project Context

## Purpose

This system exists to let a human and an AI build a codebase safely through controlled, one-file generation cycles.

The system is designed to:
- preserve architecture integrity
- externalize project memory
- keep decisions legible across sessions
- allow fresh AI instances to work from files instead of hidden conversation history

The system is not the product itself. It is the operating layer used to generate product files.

[ HUMAN PROJECT DESCRIPTION START ]
Gravity Ball — Simple Summary

What it is:
A multiplayer physics game where players don't control the ball directly.

What players do:
They click to create gravity wells that pull the ball toward them.

Core Idea:
There is one ball in the world.
Every player adds forces, not movement.
The ball moves based on combined forces (physics).

How it works:
Server runs the physics 60 times per second.
It calculates: where the ball is, how fast it's moving, and how all gravity wells affect it.
Then sends that state to all players.
Clients only see and send input — they don't decide anything.

The Hard Parts:
1. Force Math — all wells combine: Ball acceleration = sum of all pulls.
2. Lag Problem — a player clicks based on what they see, but the server is already ahead.
   Decision: trust the click as-is. Server = absolute authority. No retroactive adjustment.

Rules:
- Server = absolute authority
- No client-side prediction (for now)
- One file per cycle
- Think through edge cases before coding

One-Line Version:
Players compete by shaping gravity in real time, while a server-controlled physics system decides the outcome.
[ HUMAN PROJECT DESCRIPTION END ]

## Architecture Law

input → update → state → render

## Folder Structure Template

project/
  server/
    core/
      input/
      update/
      state/
      render/
      domain/
      utils/
  client/
    ui/
      components/
      layout/
      feedback/
      overlay/
  shared/
  data/
  assets/
  docs/

## Core Invariants

- one responsibility per file
- explicit ownership
- mutation is controlled
- render does not create truth
- append-only registries
- server is sole source of truth
- client is read-only observer

## Philosophy

clarity
modularity
determinism
restraint
continuity