# Reconciliation Rules

## Core Policy
Lobby is UI-only. No state mutation is allowed.  
All interactions are captured but do not produce authoritative changes.

## Rules
- input events are captured but do not modify state
- no server communication is triggered from lobby interactions
- UI remains consistent regardless of repeated or rapid inputs
- system always returns to idle state after processing input

## Conflict Cases
- case: rapid multiple clicks on buttons
  resolution: all inputs are ignored after capture; no state change occurs

- case: input received during render cycle
  resolution: input is queued and processed next cycle without mutation

- case: inconsistent UI state due to re-render
  resolution: UI re-renders from static source with no dependency on prior input

- case: accidental state mutation introduced
  resolution: reject mutation and enforce render-only behavior