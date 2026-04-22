# System Registry

## Global State Shape

state = {
  input: {},
  update: {},
  domain: {},
  ui: {},
  data: {},
  render: {},
  meta: {}
}

## Ownership Rules

- update owns mutation
- render is read-only
- input captures only
- domain is pure

## Read / Write Rules

- reads are explicit
- writes follow ownership
- no hidden side effects

## Architecture Invariants

- input → update → state → render
- no reversed flow
- no mixed responsibilities

## Shared Symbols

- state
- commands
- derivations
- render projections

## Append Log