# AI-Human OS

`AI-Human OS` is now organized around one current product:

- `product/` = the live Screen 1 to Screen 4 clarity engine
- `docs/` = current product docs and archived historical docs

## Start Here

Current product entrypoints:

- [product/ui/](product/ui/)
- [product/api/](product/api/)
- [product/README.md](product/README.md)

Canonical docs:

- [docs/canonical/CLS.md](docs/canonical/CLS.md)
- [docs/canonical/UI.md](docs/canonical/UI.md)
- [docs/canonical/HFD.md](docs/canonical/HFD.md)

Archived material:

- [docs/archive/](docs/archive/)

## Current Product Scope

The live product ends at Screen 4.

```text
Raw Intent
-> Interrogation
-> Verification
-> Build Blueprint
```

The output is clarity:

- a completed decision graph
- a deterministic implementation plan
- a readable build blueprint
- copyable build prompts

## Folder Map

```text
product/
  api/        minimal API for L0 and L1.9
  ui/         React single-page flow ending at Screen 4
  runtime/    product-only model runners
  prompts/    product-only L0/L1/L1.9 prompts

docs/
  canonical/  current source of truth
  archive/    superseded docs, diagrams, refactor notes

```
