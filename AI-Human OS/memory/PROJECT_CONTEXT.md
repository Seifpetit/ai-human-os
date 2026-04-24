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
What the product is:

What players/users do:

Core idea:

How it works:

Hard parts:

Rules / constraints:

One-line version:

[ HUMAN PROJECT DESCRIPTION END ]

## Architecture Law

input -> update -> state -> render

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
