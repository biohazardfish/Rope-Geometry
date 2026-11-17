# Somerville Bowline restart — evidence-first topology interchange

## Status

**Not a verified Somerville Bowline.** This branch adds only a tested interchange and
review gate. It does not infer the hidden rear-cuff paths, fabricate a final Gauss
word, repair the Phase 5 collision failures, or activate a mechanics solver.

The authoritative observation record is `data/somerville-bowline-topology-v2.json`.
Phase 4B records an incomplete FINAL path and crossing inventory, 14 unresolved
observation ports grouped into four unknown-connection categories, and two
**construction-only** crossings in state D8. Their IDs cannot be copied into a
FINAL-state Gauss code. The Phase 5 integrated trial remains geometrically failed.

## Interface

- `data/somerville-gauss-review.json`: a **pending review**, not a knotoid. The
  empty `crossings` and `visits` arrays mean **unknown**, not zero crossings.
- `src/extended-gauss.js`: machine-checkable E0-to-E1 material-order visits,
  explicit over/under assignments and writhe signs; the Knoto-ID spherical
  extended-Gauss text exporter is blocked until the review claims completion.
  A `SOURCE_VERIFIED` flag alone does not establish correspondence to the source.
- `src/gauss-evidence.js`: independently checks whether the Phase 4B source
  ledger supports a complete FINAL material path, crossings and signed winding.
- `scripts/export-knoto-id.js`: exports reviewed Gauss data or an existing
  metric 3D centerline to Knoto-ID's XYZ format.
- `data/material-hemp-6mm.json`: nominal 6 mm, three-strand laid rope represented
  *as one effective rod*; stiffnesses, friction and other constitutive properties
  are explicitly unknown. Existing 10 mm PoC fixtures are unchanged.

## Try the branch

```sh
npm ci
npm test
npm run audit:somerville
node scripts/export-knoto-id.js gauss data/somerville-gauss-review.json
# Expected failure: reference topology is NOT verified. No fictitious Gauss code.

node scripts/export-knoto-id.js xyz data/phase5-candidate-A.json /tmp/candidate.xyz
# XYZ is an export of a FAILED historical candidate, not an accepted geometry.
```

To use Knoto-ID separately, obtain it from the **currently maintained** project:
https://github.com/dgound/Knoto-ID (the prior sib-swiss repository is archived
for ongoing maintenance). See its README and user guide for installation.

Knoto-ID supports open-curve input via
`convert_diagram --input-format=gauss --closure-method=open` or an XYZ
centerline. It classifies/analyses open knot diagrams and does **not** prove
physical correctness relative to a cylinder. We encode the standard spherical
(open) form `-1 2 -3 1 -2 3 ---` for a three-crossing *test fixture*; this is
not Somerville. A **planar knotoid** requires exterior-arc data and
`--planar`, which is not implemented by this exporter.

## Acceptance criteria for the next stages

1. **Topology**: independently establish and record each continuous E0→E1
   material connection, the FINAL-state over/under and writhe at every crossing,
   the source evidence, and the **signed** winding around the column. The visual
   evidence currently does not support this.
2. **Geometry**: from that topology, produce one metric centerline with a
   realistic 6 mm nominal rope diameter and an independently modeled column.
   Require exact crossing matches, zero rope–rope and rope–column *unintended*
   penetrations, measured minimum clearances, sampling sensitivity, and reproducible independent numerical checks. **Contact** for a subsequently loaded rope is not a
   violation per se; penetration means an invalid material overlap.
3. **Mechanics** (later): optional homogenized Cosserat rod and external column
   contact. Strands are represented by effective parameters, not explicitly
   meshed. Force and pressure results cannot be claimed until those parameters
   and boundary conditions are supplied.

There is no physics simulation, verified Somerville geometry, or Knoto-ID
executable bundled in this branch. An independent mathematical checker would still need to
run separately when a supported diagram becomes available.

## Current CLI acceptance gate

All `gauss` CLI exports consult this repository’s authoritative Phase 4B ledger;
renaming a review cannot bypass it. The gate checks the actual material graph,
recorded source approval, FINAL crossing inventory, material-order over/under
visits, evidence IDs, and matching explicit `writhe: +1|-1` on each FINAL crossing.
The current ledger has no complete FINAL crossings and remains blocked. Synthetic
positive tests demonstrate data consistency only; their manufactured records are
never written into the source ledger. Generic serialization remains available
through `toKnotoIdExtendedGauss`, which is not a source-certification API.

Use `npm run verify:geometry` and `npm run build` without Blender. The Phase 5
viewer recomputes its metrics from the loaded geometry rather than loading a
precomputed validation report. Its capsule surfaces are tessellated visualization
of the declared straight centerline segments and radii, not the source of truth.
