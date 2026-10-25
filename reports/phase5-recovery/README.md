# Phase 5 Recovery — local core recovered, integration failed

Phase 5 is **NOT accepted**. This is a bounded recovery experiment, not a verified Somerville Bowline.

## Frozen baseline: all 36 pairs diagnosed before any construction

- 17 insufficient-clearance pairs, 6 sharp-return pairs, 13 doubled-arm offset/routing defects.
- Every pair, original segment IDs, structural roles, closest points and penetration are in [diagnosis.json](diagnosis.json) and [collisions.csv](collisions.csv).
- These are geometric attributions. The old missing signed X and double passage are an incomplete routing specification, not proof that all 36 collisions have a topological cause.
- None of the original 36 disappears on exact subdivision. Their maximum distance discrepancy is 2.7755575615628914e-17 m; maximum penetration remains 9.060448 mm.
- Raw pair counts at 1× / 2× / 4× / 8× are 36 / 494 / 2056 / 8364. Newly exposed local capsule overlaps account for the growth. Coarsening does not demonstrate improvement.

## Incremental local construction

The source is the local Topologist PDF, pages 1–3. Page 1 introduces the wrap/transfer construction; page 2 explicitly allows forming the standing loop directly, then gives over-X and under-entire-cuff; page 3 requires the same return direction. No double-column or optional finishing hitch is imported.

All metric coordinates, the signed loop-root assignment, physical limb pairing and rigid frame are **ASSUMED**. The unchanged Phase 4B evidence layer is authoritative about what has actually been observed.

The exported local model is one open, continuous physical polyline with two endpoints and one working fold. A labelled remote fixture connector temporarily substitutes for the cuff. It is not a second rope and is not a reconstructed cuff. Underpass measurements use the exact saved cuff arcs as external test obstacles. The integration trial removes that substitute.

| Stage | Added relation | Self penetrations | Minimum rope gap (mm) | Minimum column gap (mm) | Gate |
|---|---|---:|---:|---:|---|
| 1 | Standing loop + first passage | 0 | 3.287277 | 8.622154 | PASS (local scope) |
| 2 | Bight over X | 0 | 3.287277 | 8.622154 | PASS (local scope) |
| 3 | Under the four saved cuff runs | 0 | 1.313708 | 2.769419 | PASS (local scope) |
| 4 | Same-direction return | 0 | 1.313708 | 6.241981 | PASS (local scope) |

The four strand-pair root crossings and eight over-X crossings are measured from geometry. Each working limb has two signed +1 passages relative to the chosen loop aperture. Along E0→E1 the return limb has -1 material direction, correctly distinguished from working-bight direction. Material operation order is checked separately.

The underpass crosses all four front cuff lanes for each working limb, with 4.615035 mm minimum surface gap. A shallower attempt had 1.119029 mm penetration despite apparently positive projected clearance; its full failed record is preserved in attempts/.

The loop aperture is an explicit interior region in the chosen local projection, not a source-derived metric surface or proof of knot equivalence. These checks establish the specified local relations in this candidate; they do not certify complete knot topology or mechanical locking.

## Integration trial

The exact 144 saved cuff arc segments were inserted with their coordinates and order unchanged; only four interface connector paths were introduced. The core was not refitted. The global result is **GEOMETRY_FAILED**, with **74 penetrating pairs**, maximum penetration **9.091543 mm**, and **0 column penetrations**. Full pair-level data and locations are in [integrated-trial.json](integrated-trial.json).

This is a failed geometric construction. No demonstrated topological contradiction is claimed. The previously valid cuff is untouched; the most advanced new local geometry is [stage-4.json](../../data/phase5-recovery/stage-4.json), which is not an integrated knot.

## Sampling limitations

[sampling.json](sampling.json) includes 1×/2×/4×/8× checks for the new core and preserved cuff. All raw hits remain reported. Zero at their declared original discretizations is not a sampling-independent certificate. Original-parent grouping explains the new local overlaps; it is never an acceptance exclusion.

## Remaining constraints

- **core-cuff-embedding — GEOMETRY_FAILED:** Preserved cuff and fixed loop roots overlap, in addition to connector collisions. A later experiment needs explicit cuff attachment tangents and compatible loop-root placement; no whole-model adjustment was attempted here.
- **right-handed-root-sign — ASSUMED:** The selected root-over-root sign and rigid frame are a reversible candidate assignment. PDF procedure does not bind all physical limbs to the target video.
- **rear-and-endpoint-permutation — UNRESOLVED:** Phase 4B rear cuff and endpoint binding remain unchanged. No source evidence was upgraded.
- **extra-crossings-and-locking — UNRESOLVED:** Four named local relations do not prove full crossing inventory, knot equivalence, or mechanical locking. New interface crossings have not been accepted as intended topology.
- **sampling-policy — LIMITATION:** Only immediate segment adjacency is exempt. Raw results depend on segmentation. Fine-sampling raw failures remain visible; neither thresholds nor exclusions were changed.

## Reproduce and inspect

- npm run report:recovery — frozen diagnosis, incremental gates, exported stages, sampling and integration report.
- npm test — prior tests plus recovery positive and negative controls.
- npx vite build — viewer build.
- Existing Phase 5 viewer: choose recovery local core or failed integration. All original options remain.
- No animation, tightening, physical simulation, material changes or collision-engine changes.
