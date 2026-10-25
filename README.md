# Rope Geometry PoC

A small finite-thickness segment collision demonstrator. Geometry is an engine-independent JSON polyline in metres, right-handed Z-up. This is a capsule approximation over straight centerline segments; collision detection reports results and never changes geometry.

## Run

```sh
npm install
npm test
npm run report
npm run generate:crossing
npm run verify:blender
npm run dev
```

The local source videos under `references/video/` are intentionally excluded
from Git because each exceeds GitHub's regular-file limit. The evidence ledger
records their source identity and the repository retains the sampled stills,
PDF, manifests, and source URLs needed to reproduce the review.

Open the local Vite URL. Select A, B, or C; drag to orbit and scroll to zoom. C includes a playback slider. `npm run report` writes the Phase 1/2 `report.json`, regenerates the Phase 2 valid geometry and Phase 3 fixtures, and writes `phase3-report.json`.

## JSON v1

The document has `schemaVersion: 1`, `units: "m"`, `coordinateSystem: "right-handed Z-up"`, and a `ropes` array. Each rope has a unique `id`, positive `diameter`, and two or more ordered `[x,y,z]` points. Optional `animation.frames` contain increasing `time` values in seconds and each rope's full point list; points interpolate linearly. Topology and point counts must stay fixed.

## Collision and limitations

For segment radii `rA`, `rB` and closest centerline distance `d`, signed gap is `d-rA-rB`; penetration is `max(0,-gap)`. The contact tolerance is 1e-9 m. Only immediately adjacent segments in the same rope are excluded, based on shared topology. Sharp local folds may still be reported; arbitrary self-collision of a continuous swept rope is outside this PoC. Animation uses 16 uniform time intervals and can miss events between samples; it is not general continuous collision detection. Blender bevel curves reconstruct the centerline and radius, but their corner surface need not equal a union of capsules.

The Blender check launches a separate background process, writes to a temporary directory, reopens the saved blend file, and compares points and radius. The viewer's optional tube appearance is illustrative; detection always uses the source centerline segments.

## Phase 2: topology to a single crossing

`data/crossing-topology.json` defines the ordered open path, crossing `X1`, over/under traversal, 10 mm diameter, 2 mm requested surface clearance, and deterministic lift/transition/sample rules. `npm run generate:crossing` regenerates `data/crossing-valid.json` and preserves the Phase 2 negative-control fixture and report. The valid result uses a smooth cosine height profile, sampled as an explicit centerline polyline; it must show exactly one projected crossing, preserve over/under order, keep at least 12 mm centerline separation at the crossing, and have no detected nonlocal penetration. The negative control lowers the crossing and must produce a collision report.

Choose “Phase 2 · one crossing” in the viewer to inspect the topology schematic and generated 3D path. The geometry selector compares valid clearance with the negative control. `npm run verify:blender` round-trip checks both the original Phase 1 fixture and the generated valid Phase 2 centerline.

## Phase 3: interacting crossing constraints

`data/multiple-crossings-topology.json` defines an ordered continuous route and two crossings, each by ID, two `(segment,t)` positions, over portion, and required surface clearance. X1 and X2 are 40 mm apart along the shared passage; their 55 mm elevation influence radii overlap. With 10 mm rope diameter and 2 mm required surface clearance, the valid outputs have crossing clearances of 11.106 mm (A over at both) and 8.000/4.894 mm (X1 over A, X2 over B). Their global minimum nonlocal surface clearances are both 2.649 mm, with zero penetrations. The low-lift negative control has a global clearance of -5.376 mm and eight penetrating segment pairs. Topology validation (continuity, exactly two projected crossings, intended locations and traversal order) is reported separately from crossing height constraints and global collision/clearance validation in `phase3-report.json`.

`npm run report` recreates both numerical reports and deterministic fixtures. The valid geometries round-trip through Blender with a maximum measured coordinate/radius error of `3.34e-9 m`, below the `1e-7 m` tolerance. The generator uses a fixed cosine elevation influence construction and reports unsatisfied clearances as failures; it is a bounded construction for these compact crossing constraints, not a general knot solver.

Choose “Phase 3 · interacting crossings” to compare “A · X1 and X2 over”, “B · X1 over, X2 under”, and the negative control. Blender round-trip verification also checks both valid Phase 3 geometries.

## Phase 4: reference-grounded Somerville Bowline topology

The selected variant is the right-handed, two-wrap, non-slipped, single-column Somerville Bowline from [TheDuchy's detailed tutorial](https://www.theduchy.com/courses/foundations-1/topics/somerville-bowline). The complete detailed-step text and all 25 accompanying photographs were inspected. The topology and per-claim evidence are recorded in `data/somerville-bowline-topology.json`.

`npm run report:phase4` validates the internal route and view references, writes `phase4-report.json`, and regenerates three standalone SVG diagrams in `diagrams/`. The route is encoded as one connected open material path with two physical ends and one folded bight; the column is a separate cylinder object. The two wraps and four parallel cuff strands are represented explicitly. The five milestone records are semantic states only.

The structural validator passes. Reference validation remains `PARTIAL_REFERENCE_RECONSTRUCTION`: the stills establish the bight-over-cuff placement and the later bight underpass through the tail loop, but they do not resolve the tail-loop/bight crossing order, strand-by-strand passage order, or a winding direction relative to a fixed column view. These remain `PENDING_REVIEW`; the crossing inventory is not claimed complete, and Phase 4 does not assert that the real knot topology is fully verified. The continuous-path diagram uses dashed segments for the route assignments still needing confirmation. Crossing records name their associated path-segment IDs while marking unresolved segment assignments as pending. No 3D knot geometry or motion is generated.

The Phase 3 generator can represent structured segment-position crossing constraints and report unsatisfied clearances. It cannot yet be applied reliably to this knot: the reference review has not established the complete strand-level crossing inventory or material-path positions required by that generator. `phase4-report.json` records this limitation explicitly.

## Phase 4B: material evidence revision

`data/somerville-bowline-topology-v2.json` preserves the old v1 separately. `npm run report:phase4b` generates the evidence ledger, two-visit construction crossing table, all 12 historical dispositions, cached-source hashes, and four standalone SVG views. The inspector exposes the same data under “Phase 4B · material evidence”. Click evidence IDs to inspect the exact cached image.

Result: **incomplete material path**, not a verified knot. Four front cuff lanes, two visible long-side portions and two joined bight limbs are identified, but rear-cuff and loop-root connections cannot be bound individually. Neutral E0/E1 labels name the two physical ends without pretending either has been followed on screen. Two locally observed crossings belong to construction step 8 only. See `reports/phase4b/review.md` for the bounded two-pass investigation and exact missing views.

The record validator checks consistency and recorded review gates; it cannot certify image content. The final fragment graph has unresolved ports, so full-path validation deliberately fails while inventory validation passes. The original Phase 4 report, diagrams and source validator remain unchanged. No 3D geometry, animation, or collision-engine changes are included.

## Phase 5 recovery: local locking core

`npm run report:recovery` records a bounded reconstruction experiment for the
single-column locking core. It preserves the original candidate, partial cuff,
evidence ledger and collision engine, classifies the original 36 collision
pairs, and checks exact linear subdivision without changing thresholds or
adjacency exclusions.

The local four-stage fixture separately validates a standing loop and first
passage, the over-X relation, the under-cuff passage, and same-direction return
through the loop. It is explicitly `LOCAL_FIXTURE_VALID_TOPOLOGY_UNVERIFIED`:
the exterior fixture connector is not a cuff reconstruction, the embedding is
assumed, and zero collisions applies only to the declared source sampling.

The fixed-coordinate integration trial copies all 144 saved cuff arc segments
without alteration and fails with 74 self-penetrations. It is retained as a
failed geometric construction, not treated as proof of a topology contradiction.
See `reports/phase5-recovery/README.md` for numerical results, failed local
attempts, and remaining constraints. The Phase 5 viewer includes the four local
recovery stages and the failed integration for inspection.
