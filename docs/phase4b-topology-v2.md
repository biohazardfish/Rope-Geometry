# Phase 4B topology v2

This evidence format is separate from the metric rope interchange schema. No knot coordinates, lengths or derived geometry are supplied. `polyline` and `point` are **drawing coordinates in the source photograph's pixel plane**, not physical positions. Image overlays are approximate annotations of visible fragments, not photogrammetry.

- `target`: selected version and local-video interval. The local filename alone does not identify a single variant.
- `sources`: independent construction and release sequences; `crossingTransferAllowed: false` until a strand-level correspondence is demonstrated. Similar bundle operations do not establish that correspondence.
- `evidence`: stable ID, source, image or local-frame locator, cached asset and SHA256. Hash checks establish file identity, never the truth of an interpretation.
- `states`: source-specific completed or construction snapshots with a fixed projection. Each segment has two material nodes, a local role, source evidence, status, drawing trace, and nullable material ordinal.
- `physical-end`: actual E0/E1 labels, deliberately unbound until visible strand identity is known. `open-observation-port` terminates an observed fragment, not the physical rope. `fold` joins two bight limbs. Crossings never add material graph nodes.
- `orderedMaterialPath`: null until the E0-to-E1 segment sequence is supported. The current row order is an inventory, not a material sequence.
- `crossings`: exactly two individual participating fragments, explicit over/under, two visits, state/projection, evidence and rationale. `localOrder` follows the oriented local trace, not necessarily E0-to-E1 material direction; `materialOrdinal` is null until global direction and position are known. The two recorded crossings are construction-only. An incomplete inventory containing zero final records does not assert a crossing-free final knot.
- `crossingLocalOrders`: separately recorded local source order used to catch inconsistent visits. This is a consistency constraint, not independent proof of the source interpretation.
- `unknownConnections`: precise observation gaps, inspected intervals and camera requirements. No hypothetical rear-cuff permutation is encoded.
- `legacyReview` / `confirmedAudit`: dispositions of all 12 historical unknowns and re-audit of former confirmations. The original files remain historical artifacts.

`OBSERVED` means a particular source-local feature was visually identified. `SUPPORTED` records an evidence-backed interpretive claim with a written reason. `PENDING_REVIEW` remains open. These are different from human approval of the complete reconstruction.

Validation exposes separate results:

1. `inventoryValid`: IDs, connectivity references, local crossings, statuses and source records are internally consistent. The report also checks cached asset hashes.
2. `observedGraph.complete` / `completeMaterialPath`: full continuous E0-to-E1 path, valid fold, no unresolved observation ports, winding and complete final crossing ledger. These **fail for the delivered partial dataset**.
3. `referenceStatus`: full-path gates plus a recorded source review. Software never establishes visual truth itself; `topologyVerified` is not automatically promoted.

The graph contains nine components: seven visible-fragment components (six isolated traces plus the joined bight) and two unbound endpoint labels. It does not assert nine ropes. Fourteen observation ports require further continuity evidence.

All four SVG views and the viewer consume this JSON. Unadjudicated overlaps between drawn traces are masked with `?`, not assigned an implied over/under by paint order. The completed image's core is explicitly masked as unknown. The wrapping view has no guessed backside joins. The material view is an inventory with the observed fold connection, not a continuous traversal.

Negative tests catch a removed fold, structurally misconnected cuff fragments, changed local crossing order, missing visits, inconsistent O/U, construction/final-state mixing and missing evidence. They cannot detect a visually false but internally consistent permutation of hidden strands. Preventing that error requires observable continuity, which is currently missing.
