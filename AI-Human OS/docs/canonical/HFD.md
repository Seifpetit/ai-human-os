# HFD

Whole Flow Diagram for the current product.

## Flow

1. Human enters raw intent on Screen 1.
2. Frontend calls `POST /api/l0/init`.
3. L0 agent returns `decision_graph`.
4. L1 compiler returns `interrogation_plan`.
5. Screen 2 asks one question at a time.
6. Frontend classifies each answer locally.
7. Precise answers update `decision_graph.domains`.
8. When questioning ends, frontend calls `POST /api/l1/verify`.
9. If flags are returned, Screen 3 resolves them explicitly.
10. Once the graph is complete, frontend runs deterministic L2.
11. L2 returns `implementation_plan`.
12. Frontend runs deterministic L3.
13. L3 returns `build_spec`.
14. Screen 4 renders the final build blueprint.

## Compressed Form

```text
Raw intent
-> decision graph
-> interrogation plan
-> domain answers
-> verification
-> implementation plan
-> build blueprint
```

## Out Of Scope

Older planning/execution material is not part of the current product.

Historical reference material lives under `AI-Human OS/docs/archive/`.
