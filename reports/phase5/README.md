# Phase 5 — Candidate A construction attempt

**Phase 5 acceptance has NOT passed.** A complete, continuous, inspectable 3D construction exists, but it has unintended self-penetration and does not yet establish the required signed X crossing and two same-direction loop traversals. It is labeled `GEOMETRY_FAILED`, not `TOPOLOGY_INVALID`. No topological contradiction has been demonstrated.

Open [the interactive viewer](http://127.0.0.1:4173/phase5.html). Select the full construction or the collision-free partial cuff. Drag to orbit, scroll to zoom, right-drag to pan. Front, rear, left, right, top and oblique presets are available. White centerline and red collision indicators can be toggled. Every 3D coordinate is a modeling assumption; source-observed facts refer to relationships, not measured geometry.

## Source review

The supplied PDF was read as text and pages 1–4 were rendered and visually inspected before generation. Page 1 describes the 360-degree turn, page 2 explicitly permits directly forming the loop in the standing line, then describes over-X and the whole-cuff underpass. Page 3 specifies returning through the loop in the same direction and dressing. Page 4 shows optional extra hitches and a short-bight finish; extra hitches are omitted. Pages 5–8 are double-column material and were not used to construct this candidate. Rendered pages are in `tmp/pdfs/single-1.png` through `single-4.png`.

TheDuchy detailed steps 3 and 24 provide the two-wrap/four-run target, while the Phase 4B ledger continues to record unresolved physical strand identities. The original publication's complete strand-to-strand correspondence to the target is not assumed proven.

## Construction and assumptions

The model is one 10 mm diameter rope: E0 → standing limb 0 → standing locking-loop limb 0 → two cuff revolutions → working return → a single fold → return along limb 1 → E1. Both physical ends are the first and last points. Normalized material coordinates use point-index order, not measured arc length. Four cuff intervals are separately listed; each limb contains two wraps. The column axis is X in the existing right-handed Z-up world.

The rear route is two parallel helices without exchanging limbs. Alternatives include a rear exchange accompanied by a compensating local twist. Endpoint binding, loop-root placement, loop handedness and all metric dimensions are reversible hypotheses. This is a coarse static, deliberately undressed construction; angular bends remain visible. It does not claim to reproduce tightening or physical locking.

Each ledger interval names its assumption dependencies. The assumption register provides evidence limits, affected portions, alternatives and missing observations. The original Phase 4B evidence JSON is unchanged. No ordinary bowline substitution or double-column third pass has been introduced; however, the required complete Somerville locking traversal has **not** been achieved.

## Measured outcome

| Output | Complete construction | Valid partial cuff |
| --- | ---: | ---: |
| Continuous physical rope | yes | yes |
| Self-penetrating segment pairs | 36 | 0 |
| Column penetrations | 0 | 0 |
| Minimum surface gap between nonadjacent segments | −9.060448 mm | 3.707083 mm |
| Minimum conservative column clearance | 10.000000 mm | 29.657523 mm |
| Complete locking structure verified | no | omitted |

The first construction had 108 penetrating pairs. Removing a coincident loop-entry sample and using coarser loop sampling reduced this to 36 without modifying collision detection or adjacency exclusions. The remaining failures include standing/loop-root connections, the over-X-to-under-entry return, and the changing offset direction between doubled underpass limbs. Merely shifting points to clear these contacts would not establish the missing two same-direction loop passages. The complete locking topology therefore remains an explicit unresolved constraint rather than a purportedly verified crossing ledger.

The partial result is a separate two-wrap doubled cuff with a wide connecting fold and two free ends. It deliberately omits the locking loop and underpass. It is the validated geometric subset, **not a functioning Somerville Bowline**. Its rear helix remains assumed.

The unchanged capsule engine checks every pair except immediate topological neighbors. The Phase 5 report retains IDs, normalized material positions, closest points, distances, signed gaps and penetration. Column validation computes the exact radial minimum of each straight segment against an infinite X-axis cylinder; this is conservative for the displayed finite cylinder. No contact is granted an exemption. Near-neighbor bend behavior remains subject to the existing capsule model limitations.

## Deliverables and reproduction

- [Candidate specification](../../data/phase5-topology-A.json)
- [Complete attempted geometry](../../data/phase5-candidate-A.json)
- [Validated partial geometry](../../data/phase5-partial-cuff.json)
- [Ordered material ledger](material-ledger.json)
- [Assumption register](assumptions.json)
- [Full numerical report](validation.json) and [partial report](partial-validation.json)
- Blender: [complete attempt](candidate-A.blend), [partial cuff](partial-cuff.blend), with numerical checks in `blender-candidate-A.json` and `blender-partial-cuff.json`

Run `npm run report:phase5`, `npm test`, `npm run verify:blender`, `npm run verify:blender:phase5`, and `npx vite build`. Start the development viewer with `npm run dev -- --port 4173` and visit `/phase5.html`. The build checks compilation; a standalone deployment with copied data/reference assets was not tested.

The 25 automated tests include all previous 22, determinism, JSON interoperability, ordered cuff intervals, assumption references, detection of the known failed construction, a valid partial cuff, and intentional rope/column errors. Test success means the failure is correctly reported, not that the complete knot passes. Blender runs the existing importer in a separate background process, adds the column, saves, reopens, checks ordered points/radius/rope transforms/column dimensions/axis, and reports results separately from geometric validity.

This delivery stops at the first inspectable attempt and its valid partial reconstruction. A complete collision-free Candidate A satisfying the locking traversal remains unfinished. No animation, physical simulation or collision-engine changes were made.

## Actual verification run

All 25 tests passed, and both viewer entry points compiled. All four previous Blender round trips passed. Both new saved scenes were reopened successfully: maximum centerline/radius/world-column-extent error was **1.4305114759416426e-8 m**, below 1e-7 m; column unit-axis vector error was **4.3711388277709795e-8**. Column extents are measured from transformed mesh vertices, not object-local dimensions. Blender subprocesses use an explicit Python error exit code so script assertions cannot be mistaken for success.

All 30 files in the initial Phase 5 baseline hash inventory remained unchanged. The interactive viewer was exercised through all six viewpoint buttons, both models, centerline and marker toggles; the rear partial-cuff screenshot was visually inspected. The only observed browser console error was a missing favicon, not a model/data error. This evidence does not change the failed full-candidate acceptance result.
