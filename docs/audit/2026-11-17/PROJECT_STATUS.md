# Project Status and History — Rope Geometry

Audit date 2026-11-17 (UTC+8). Branch `feature/somerville-egc-knoto-id` @ `397d350`.
Tags: **[V]** verified fact, **[I]** reasonable inference, **[U]** unknown.

**Rope Geometry is not the Blender "Gravity Rope" addon or a separate knot-animation project.**
Nothing in the repository references or depends on either [V]. Blender appears here only as an
import/round-trip target for early fixtures.

---

## 1. Git timeline vs. work timeline

Commit dates carry their own offset (+0800). Git dates **lag** the work they record: several files
described in documents dated 2026-10-30 were first committed in `f327fde` (2026-11-04), among them
`src/robust-distance.js`, `src/verification.js`, `src/integration-repair.js`,
`scripts/verify-geometry.js` and `docs/cli-review.md` [V]. Commit messages also state that work
happened uncommitted for long periods ("未 commit、未 push" throughout `handoff.md`) [V].

| Commit | Date (UTC+8) | Content [V] |
| --- | --- | --- |
| `730c3a2` | 2026-10-26 | Initial PoC, 260 files. Already contains Phases 1, 2, 3, 4, 4B, 5 and Phase 5 recovery, and the frozen `geometry.js` kernel |
| `f3c38e9` … `3ba7b72` | 2026-10-30 | Extended Gauss / Knoto-ID exporter, Gauss review, hemp material record, evidence gate, integration doc (one file per commit) |
| `655f530` | 2026-10-30 | CI added (`npm ci`, `npm test`, `audit:somerville`) |
| `179b23c` | 2026-11-02 | Somerville v1 loose-knot fixes, PBD tightening solver (`somerville-relax.js` at the time), pose pipeline. **Pose FAIL** |
| `9957391`, `74dd064` | 2026-11-03 | Somerville viewer: SHA-gated dressed report, framing UX, label wording |
| `f327fde` | 2026-11-04 | 123 files: shared rope core (`rope-state/frames/curves/relax/lengths/targets/acceptance`), robust kernel, verification, video route (`loose-v2`), continuation, `final.json` FAIL, overhand example, at-70, operational topology, dressed generator in progress, `work/` scratch. CI gains `verify:geometry` + `build` |
| `b09dac9` | 2026-11-05 | Dressed static seed frozen as `loose-v3`; tube-checker false-positive fix. **Pose still FAIL** |
| `f55c428` | 2026-11-05 | Dressed parameter march + 148 s overlay review aid |
| `397d350` | 2026-11-10 | Semantic rope editor (bamboo workspace), with changes to the shared solver (`rope-relax.js` pins/inverse masses, `SOLVER_VERSION`) and `rope-lengths.js` |

---

## 2. Milestones

| Milestone | Recorded claim | Verified now (this audit) | Status |
| --- | --- | --- | --- |
| **Phase 1**: finite-thickness capsule collision, A/B/C fixtures, linear animation | Collision report, Blender round trip (README) | `npm run report` exit 0, output identical; `geometry.test.js` passes [V]. Blender not run | **Completed**, still valid as a capsule demonstrator |
| **Phase 2**: topology → single crossing | Valid + negative control (README) | Regenerated identically via `npm run report` [V]. `crossing-invalid.json` and `crossing-report.json` are no longer written by the generator [V] | **Completed**; negative control frozen |
| **Phase 3**: two interacting crossings | 2.649 mm clearance, negative control −5.376 mm (README) | `phase3-report.json` regenerated identically [V] | **Completed**, bounded construction, "not a general knot solver" |
| **Phase 4**: Somerville Bowline topology (v1 ledger) | Structural validator passes; reference `PARTIAL_REFERENCE_RECONSTRUCTION` | `npm run report:phase4` exit 0, identical; `somerville.test.js` passes [V] | **Completed as a partial ledger.** Superseded as evidence by Phase 4B |
| **Phase 4B**: material evidence revision (v2 ledger) | Inventory valid; full material path incomplete | `audit:somerville`: `inventoryValid:true`, `completeMaterialPath:false`, 4 unknown connection groups, 0 verified FINAL crossings [V]. **`npm run report:phase4b` now aborts** on its baseline-hash guard [V] | **Partial by design.** Still the authoritative observation record. Report generator broken |
| **Phase 5**: Candidate A full 3D attempt | `GEOMETRY_FAILED`, 36 penetrations | `verify:geometry` reproduces 36 [V] | **Failed.** Superseded by the Somerville generators |
| **Phase 5 recovery**: local locking core + integration | Local stages 1–4 pass (local scope); integration 74 penetrations (21 cuff/core, 53 interface) | `verify:geometry` reproduces 74 = 21 + 53 [V]; `report:recovery` identical [V] | **Local fixture completed; integration failed.** Its conclusion stands: connector-only edits cannot fix the fixed-coordinate trial |
| **EGC / Knoto-ID interchange** (2026-10-30) | Export gated by the v2 ledger | `audit:somerville` `ready:false`, `gaussExportable:false` [V]; gate tests pass [V] | **Completed as a gate.** Somerville export blocked (correct behaviour) |
| **Somerville v1 loose knot** (`loose.json`, 2026-11-02) | Milestone 1 "完整鬆結完成並驗證" (handoff) | Regenerates with ≤ 6.5e-16 m differences [V] | **Superseded.** v1 contradicts the ledger's diagonal/under direction (`operational-topology.js`) |
| **PBD tightening + pose** (`final.json`, 2026-11-02 / 11-03) | FAIL | `final.json` `acceptance.status: "FAIL"` (handoff) | **Abandoned.** Shortened rest lengths broke the tube; superseded by continuation and then dressed |
| **Video route** (`loose-v2.json`) | Nine operation checks pass, tube valid | Regenerates with ≤ 2.8e-16 m differences [V], but fails the bit-exact test on Linux [V] | **Superseded** as deliverable; still viewer default and test fixture |
| **Length-preserving continuation** (`continuation.json`) | Moved at most 3.119 mm; core still loose | Not re-run | **Experimental, incomplete** |
| **Shared rope core** (2026-11-02 … 11-04) | Extracted; hashes preserved; overhand migration example | Core tests pass; overhand regenerates [V] | **Completed for the extracted pieces.** Somerville is not expressed as a recipe (handoff) [V] |
| **Dressed static seed `loose-v3`** (2026-11-05) | 0 penetrations, +0.317 mm, tube 0/0/0 at 8/12/16/24, 9 ops PASS, length 7.138936637394829 m | `npm run generate:dressed` reproduces every gate value on Linux [V]. **SHA `ea7676ee…` not reproduced** (≤ 6.7e-16 m differences) [V] | **Completed as a static seed.** Current deliverable |
| **Dressed video pose** | `staticReconstruction` FAIL (RMS 109 px vs 30 px gate); `crossingPose`, `motionContinuity` UNVERIFIED | Reproduced: RMS 109.44 px, FAIL / UNVERIFIED [V] | **Not achieved** |
| **Dressed parameter march** (2026-11-05) | Stalls: loopRadius and rootDepth do not move; target 34 × 28 mm unreachable by parameters alone | Not re-run (`reports/somerville-dressed-march.json`) | **Experimental, negative result.** Recommends generator routing changes |
| **148 s overlay aid** | Model core offset by about 150–250 px; contact bindings must be human-reviewed | Not re-run (needs macOS `sips`) | **Review aid only.** `pose148` bindings still `unverified` [V] |
| **at-70 hypotheses** (2026-11-04) | Three schematic variants | `at-70-model.test.js` passes [V] | **Experimental, standalone** |
| **Semantic rope editor** (2026-11-10) | `prototype_verified_human_trials_pending` | Archived sessions re-verify (`audit-rope-edit.mjs`) [V]; editor tests pass [V]; UI not run | **Prototype.** Bamboo default has no archived acceptance session; human trials pending |

---

## 3. Known failures: resolved vs. open

| Failure | Status | Evidence |
| --- | --- | --- |
| Near-parallel segment distance defect in `geometry.js` | **Worked around**: robust kernel added; old kernel kept frozen | `docs/cli-review.md`, `test/robust-distance.test.js` [V] |
| Gauss export bypass via renamed review | **Resolved** | `test/export-gate.test.js` [V] |
| Build missing runtime JSON | **Resolved** (vite plugin) | `vite.config.js`, `docs/cli-review.md` [V] |
| Tube checks treated diameter as radius | **Resolved** 2026-11-04 | `handoff.md`; `somerville-dressed.js:dressedTube` [V] |
| Tube triangle false positives on straight tails | **Resolved** 2026-11-05 | `test/rope-tube.test.js` [V] |
| Editor NaN with fixed straight rope | **Resolved** | `reports/rope-edit/README.md`, `test/rope-lengths.test.js` [V] |
| Phase 5 / recovery penetrations (36 / 74) | **Open, by design** (kept as baselines) | `verify:geometry` [V] |
| Somerville pose (RMS 109 px) | **Open** | `reports/somerville-dressed-report.json` [V] |
| Crossing bindings at 148 s | **Open, needs a human** | `data/somerville-pose148.json` `bindingStatus: unverified` [V] |
| Phase 4B FINAL material path / crossings | **Open, evidence-limited** | `audit:somerville` [V] |
| Swept-tube continuous collision | **Open** | DATA_FLOW §3C |
| CI red since 2026-11-10 | **Open** | DEPENDENCIES §3.1 [V] |
| `report:phase4b` baseline guard | **Open, unreported** | DEPENDENCIES §3.2 [V] |

---

## 4. Which generated datasets are still relevant?

| Dataset | Relevance |
| --- | --- |
| `data/somerville-final/loose-v3.json` (+ duplicate `dressed-candidate.json`), `reports/somerville-dressed-{seed,report,metadata}.json` | **Current** |
| `reports/somerville-dressed-march.json`, `reports/somerville-dressed-overlay.*` | Current analysis of `loose-v3` |
| `data/somerville-bowline-topology-v2.json`, `data/somerville-gauss-review.json`, `data/somerville-pose148.json` | Current inputs and evidence |
| `data/phase5-*`, `data/phase5-recovery/*`, `reports/phase5*` | Historical regression baselines (tests and `verify:geometry` depend on them) |
| PoC data (`data/B*.json`, `C.json`, `experiments.json`, crossing/multiple JSON) | Still-valid demonstrator fixtures |
| `loose.json`, `loose-v2.json`, `continuation.json`, `final.json`, `pose-videoTight-history.json` and their reports | Historical. `loose-v2` is still a test fixture and viewer default |
| `reports/rope-edit/session*.json` | Current editor acceptance corpus (legacy `loose-bight-v1` fixture) |
| `reports/rope-reuse-*.json`, `reports/somerville-dressed-baseline.json` | Historical, orphaned |

---

## 5. Previous conclusions that no longer hold [V]

| Earlier statement | Where | Why it no longer holds |
| --- | --- | --- |
| "Phase 4 … No 3D knot geometry or motion is generated" | README Phase 4 section | Accurate for Phase 4 at the time. Somerville 3D geometry now exists (v1/video/dressed) |
| "里程碑 1（完整鬆結）完成並驗證" for `loose.json` | `handoff.md` §一句話現況 | v1 route later found to contradict the ledger's diagonal/under direction (`operational-topology.js`) |
| v1/videoTight numbers (gap 0.188 mm, 1213 unexplained points, …) | `handoff.md` lower sections | Explicitly marked historical by the 2026-11-05 index |
| "8/16/24 radial segments give 1/62/177 self-intersections" | `handoff.md` 2026-11-05 dressed section | Shown to be checker false positives; corrected the same day |
| "`npm test` 120/120 / 122/122 / 143/143" | `handoff.md`, `reports/rope-edit/README.md` | Now 146 tests; 1 fails on Linux and CI |
| Recorded SHA-256 values as reproducibility proof | `handoff.md` | Hold on the authoring platform only (DATA_FLOW §4) |
| `npm run report:phase4b` regenerates Phase 4B outputs | README Phase 4B section | Aborts today |
| `somerville.html` "final" option to be enabled when pose passes | `handoff.md` §5 | Unchanged; still disabled, consistent with FAIL |

---

## 6. Experiments that remain incomplete

1. Compact Somerville locking core: a generator routing change is needed (`loop-to-cuff` bend, `over-root` depth vs `fold`), per the march conclusions [V].
2. Human review of the two 148 s crossing bindings [V].
3. 148 s silhouette / crossing pose fit (static FAIL) [V].
4. Loose-to-tight motion (continuation stalled; `motionContinuity` UNVERIFIED) [V].
5. Somerville as a `KnotRecipe` through `rope-curves.js:compileRecipe` [V].
6. Full Phase 4B FINAL material path, which is evidence-limited and needs new views [V].
7. Editor: human trials, Somerville doubled strands, iPad (`reports/rope-edit/README.md`) [V].
8. Physics (homogenized Cosserat rod). Planned only; every parameter `null` [V].
