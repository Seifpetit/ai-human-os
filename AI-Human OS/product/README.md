# Product

This is the current app.

It consists of:

- `api/`: the minimal backend used by Screen 1 and Screen 3
- `ui/`: the React single-page flow
- `runtime/`: product-only model runners
- `prompts/`: product-only L0/L1/L1.9 prompts

## Product Boundary

The product ends at Screen 4.

```text
Raw Intent
-> Interrogation
-> Verification
-> Build Blueprint
```

Screen 4 is the final artifact.
