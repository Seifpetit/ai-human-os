# Reconciliation Rules

## Core Policy
Local updates are optimistic. Server is final authority.

## Rules
- local updates apply immediately
- server responses overwrite local state
- stale responses are ignored
- failed requests revert local state

## Conflict Cases
- case: stale response arrives
  resolution: ignore if older than current state

- case: server rejects update
  resolution: revert local change and mark error