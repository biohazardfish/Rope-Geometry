# Technical Debt — Rope Geometry

Audit date 2026-11-17 (UTC+8). Branch `feature/somerville-egc-knoto-id` @ `397d350`.
Tags: **[V]** verified fact, **[I]** reasonable inference, **[U]** unknown.

Severity scale: **CRITICAL** (blocks all correct use or causes data loss), **HIGH** (blocks a core
goal or makes results untrustworthy), **MEDIUM** (slows work or invites mistakes), **LOW** (hygiene).

**No issue is rated CRITICAL.** The code that exists is careful about labelling failure; nothing found
here silently produces wrong "PASS" results. The most serious problems are a red CI caused by
platform-dependent bit-exact checks, and the absence of any link between topology evidence and
generated geometry.

## Summary

| ID | Title | Severity | Refactoring risk |
| --- | --- | --- | --- |
| TD-01 | CI red: platform-dependent bit-exact test | HIGH | Low |
| TD-02 | SHA-based reproducibility claims are platform-specific | HIGH | Medium |
| TD-03 | No canonical knot topology; generators ignore the evidence ledger | HIGH | High |
| TD-04 | `report:phase4b` aborts on its own baseline guard | MEDIUM | Low |
| TD-05 | Two distance kernels and two exclusion policies | MEDIUM | Medium |
| TD-06 | Shared core embeds Somerville constants | MEDIUM | Medium |
| TD-07 | Documentation drift and status scattered across logs | MEDIUM | Low |
| TD-08 | Somerville viewer defaults to historical geometry | MEDIUM | Low |
| TD-09 | Generated, historical and input data intermixed | MEDIUM | Medium |
| TD-10 | Seven Somerville centerline constructions | MEDIUM | High |
| TD-11 | Platform-locked tooling (Blender path, `sips`) | MEDIUM | Low |
| TD-12 | Per-dataset scale constants without a shared scene record | MEDIUM | Medium |
| TD-13 | Missing regression coverage for the current deliverable and tools | MEDIUM | Low |
| TD-14 | Small dead code, shims and duplicate helpers | LOW | Low |
| TD-15 | Duplicated viewer scaffolding, untested viewers | LOW | Medium |
| TD-16 | Committed scratch space, backups and large historical JSON | LOW | Low |
| TD-17 | Physics layer implied by docs but absent | LOW | Low |
| TD-18 | Git history does not reflect development | LOW | n/a |
| TD-19 | Shared-solver changes not tied to dependent outputs | LOW | Low |

---

## Issues

### TD-01: CI red because of a platform-dependent bit-exact test (HIGH)

- **Description:** `npm test` fails on Linux, so CI (`ubuntu-latest`) is red. `verify:geometry` and `build` never run in CI.
- **Evidence:**
  - Reproduced during the audit: 146 tests, 145 pass, 1 fail [V].
  - The same failure appears in CI runs on 2026-11-10 01:42 UTC+8 [V].
  - The current five-step workflow has never passed [V].
- **Files / functions:** `test/rope-core.test.js` test "shared frame extraction preserves the complete loose-v2 geometry and tube" (l.12–17); `data/somerville-final/loose-v2.json`; `src/somerville-build.js:buildSomerville`.
- **Root cause:** `assert.deepEqual` of regenerated vs committed floats. The committed file was produced on macOS [I]; Linux differs by at most 2.8e-16 m [V].
- **Impact:** Every later regression is invisible in CI. Contributors on Linux see a failing suite on a clean checkout.
- **Recommended solution:** Keep bit-exact checks only for same-platform determinism (generate twice in-process and compare). Compare against committed fixtures with an explicit tolerance (for example 1e-12 m) and a structural equality on non-float fields.
- **Refactoring risk:** Low. It is a test-only change, but it must not weaken the "extraction preserved geometry" intent.

### TD-02: SHA-based reproducibility claims are platform-specific (HIGH)

- **Description:**
  - The recorded SHA-256 of `loose-v3.json` (`ea7676ee…`), its point SHA (`3db0782f…`) and the seed-report SHA (`5d36fda9…`) cannot be reproduced on Linux.
  - Phase 5 and overhand regenerations also differ in the last digit.
- **Evidence:** `npm run generate:dressed` on Linux gave identical gate values but SHA `8eeab346…`, with a maximum coordinate difference of 6.7e-16 m (DATA_FLOW §4) [V].
- **Files:** `handoff.md` (recorded SHAs), `scripts/generate-somerville-dressed.js`, `scripts/evaluate-somerville-dressed.js`, `src/somerville-viewer.js` (SHA-gated report merge), `reports/phase4b/baseline-sha256.json`, `reports/phase5-recovery/baseline.json`.
- **Root cause:** Floating-point results of `Math.*` transcendental functions are not bit-identical across platforms, and JSON serialises full precision [I].
- **Impact:** "Byte-identical across two runs" is true but easily misread as cross-platform reproducibility. A future regeneration on another OS rewrites tracked files and changes recorded hashes.
- **Recommended solution:** Record the platform with every SHA. Add a tolerance-based geometric equality tool. Optionally quantise coordinates (for example to 1e-12 m) before serialisation for new outputs; existing hashes would change, so treat that as a Phase B decision.
- **Refactoring risk:** Medium. Hash gates in viewer, tests and baselines would need coordinated updates.

### TD-03: No canonical knot topology; generators ignore the evidence ledger (HIGH)

- **Description:**
  - There are six topology representations (ARCHITECTURE §4) and no converter between ledger and centerline.
  - Somerville geometry is built from `operationalTopology` plus hand-tuned presets.
  - The "authoritative" v2 ledger is incomplete and not consumed by any generator. Nothing computes a crossing sequence from generated geometry.
- **Evidence:**
  - `src/somerville-build.js` and `src/somerville-dressed.js` import only `operational-topology.js` for topology [V].
  - `docs/somerville-egc-integration.md` calls the v2 ledger authoritative [V].
  - `audit:somerville` reports `completeMaterialPath:false` [V].
- **Root cause:** Evidence work (Phase 4/4B) and geometry work (Phase 5 onward) progressed separately. The evidence never became complete enough to drive generation [I].
- **Impact:** It is impossible to state mechanically that `loose-v3` is the knot the ledger describes. `validateOperations` checks route realisation, not topology. This is the main source of architectural confusion.
- **Recommended solution:**
  - First, add a read-only *projection → crossing sequence* extractor for any JSON v1 centerline (a fixed view direction, over/under from depth) and compare it with the ledger's partial records.
  - Later, define one knot description (material path, crossings, operations, evidence links) that generators consume.
  - Do not invent missing evidence.
- **Refactoring risk:** High if attempted as a generator rewrite; low for the read-only extractor.

### TD-04: `npm run report:phase4b` aborts on its own baseline guard (MEDIUM)

- **Description:** The script throws "Previous foundation modified" before writing anything.
- **Evidence:** Reproduced (exit 1). The SHA-256 of `src/topology.js` differs from `reports/phase4b/baseline-sha256.json`, and the file has been unchanged since `730c3a2` [V].
- **Files:** `scripts/report-phase4b.js` l.10–12; `reports/phase4b/baseline-sha256.json`; `src/topology.js`.
- **Root cause:** The baseline was presumably recorded before a final edit to `topology.js` that preceded the initial commit [I].
- **Impact:** Phase 4B diagrams and reports cannot be regenerated; README instructions fail.
- **Recommended solution:** Diff `topology.js` against the baseline's intent. Then either refresh the baseline entry with a documented reason, or exclude non-ledger files from the guard (as `viewer.js` already is).
- **Refactoring risk:** Low.

### TD-05: Two distance kernels and two exclusion policies (MEDIUM)

- **Description:** Collision counts from different subsystems are not comparable.
  - `geometry.js` (frozen, index adjacency, near-parallel defect) is used by `schema.js`, `topology.js`, Phase 5 and `viewer.js`.
  - `robust-distance.js` with a `4·d` arc window is used by `rope-relax.js`, `seedClearance` and the editor.
  - `verification.js` mixes them: robust distance, index adjacency.
- **Evidence:** ARCHITECTURE §4; `geometry.js` l.43–48; `rope-relax.js` l.61, l.87; `docs/cli-review.md` [V].
- **Root cause:** The old kernel was frozen to keep baseline hashes; new work added a new kernel instead of migrating [V].
- **Impact:** For example, Phase 5 "74 penetrations" (index policy) and Somerville "0 penetrating pairs" (arc-window policy) measure different things. `viewer.js` still uses the defective kernel for live reports.
- **Recommended solution:** Make the exclusion policy an explicit, reported parameter of one collision API built on `robustClosestSegments`. Keep `geometry.js` read-only, used only by baseline-reproduction tests.
- **Refactoring risk:** Medium. Phase 5 baselines must still reproduce.

### TD-06: Shared core embeds Somerville constants (MEDIUM)

- **Description:** `relaxRope` defaults to `diameter: 0.006`, `columnRadius: 0.0275`, and its header comment says "around an X-axis column".
- **Evidence:** `src/rope-relax.js` l.6, l.70–73 [V]. `docs/rope-core-migration.md` states that the shared engine must not embed Somerville's cuff names, X-axis direction, column radius or fixed diameter [V].
- **Impact:** Silent wrong behaviour for any caller that omits a parameter (for example a 10 mm rope or a Y-axis column).
- **Recommended solution:** Make `diameter` required and `columnRadius` default to `null` (no column). Update callers explicitly.
- **Refactoring risk:** Medium. Callers include `continue-somerville.js`, `generate-overhand.js`, `rope-edit-step.js` and tests. Regenerated outputs must be compared with a tolerance.

### TD-07: Documentation drift and status scattered across logs (MEDIUM)

- **Description:**
  - Current status is split between README (2026-11-05 paragraph), `handoff.md` (33 KB, Chinese, reverse-chronological, with contradictory historical numbers), `reports/rope-edit/README.md` (editor, 2026-11-09) and `docs/*.md`.
  - README omits `rope-edit.html` and `at-70.html`, and its Phase 1–5 sections read like current documentation.
  - Test counts are stale: 120 / 122 / 143 recorded vs 146 now.
- **Evidence:** REPOSITORY_INVENTORY §4; PROJECT_STATUS §5 [V].
- **Impact:** New contributors and agents read stale numbers as current. This has already happened, judging by `handoff.md`'s "接手只需先看這一段" warnings [I].
- **Recommended solution:** One short `STATUS.md` (current deliverable, gates, open items, commands). README restructured into "current" and "history" sections. Freeze `handoff.md` as an archive.
- **Refactoring risk:** Low.

### TD-08: Somerville viewer defaults to historical geometry (MEDIUM)

- **Description:** `somerville.html` selects `loose-v2` by default. The current deliverable `loose-v3.json` has no option of its own; it is shown only via its byte-duplicate `dressed-candidate.json`.
- **Evidence:** `somerville.html` l.60–65 [V].
- **Impact:** People inspecting "the model" see a superseded route.
- **Recommended solution:** Add a `loose-v3` option and make it the default; label historical options as such.
- **Refactoring risk:** Low.

### TD-09: Generated, historical and input data intermixed (MEDIUM)

- **Description:**
  - Root-level report JSON (`report.json`, `crossing-report.json`, `phase3/4/4b-report.json`).
  - `data/` mixes hand-authored inputs, regenerated outputs and frozen historical results.
  - `reports/` is flat for Somerville.
  - Generated files double as test fixtures.
  - `verify:geometry` rewrites a tracked file on every CI run.
- **Evidence:** REPOSITORY_INVENTORY §2, §3.2 [V].
- **Impact:** You cannot tell which files a command will overwrite, or which are safe to delete.
- **Recommended solution:** Separate `data/inputs`, `data/fixtures` (frozen test baselines), `data/generated` (current outputs) and `archive/` (historical). Ship a manifest that records the writer of each generated file.
- **Refactoring risk:** Medium. Paths are hard-coded in viewers (`fetch('/data/…')`), tests, scripts and the `vite.config.js` asset copy.

### TD-10: Seven Somerville centerline constructions (MEDIUM)

- **Description:** These all construct (part of) the same knot independently, and none shares a recipe:
  - `somerville-build.js` v1 and video
  - `somerville-dressed.js`
  - `phase5.js` Candidate A
  - `phase5-recovery.js` stages
  - `at-70-model.js`
  - `work/somerville/reuse/compact-route-prototype.js`
- **Evidence:** ARCHITECTURE §4 [V]. `handoff.md`: "Somerville 的操作規格還沒有完全編譯成配方" [V].
- **Impact:** Fixes to joins, fillets or clearance logic must be repeated or are lost; the generator file is large (`somerville-dressed.js` 26 KB, `somerville-build.js` 14 KB).
- **Recommended solution:** After their fixtures are frozen, archive v1/video generation code paths. Keep `somerville-dressed.js` as the single live generator. Later express it via `rope-curves.js:compileRecipe`.
- **Refactoring risk:** High. `loose-v2` is a test fixture, and `somerville-build.js` hosts presets and `seedClearance` used by the dressed scripts.

### TD-11: Platform-locked tooling (MEDIUM)

- **Description:**
  - The Blender path is hard-coded to `/Applications/Blender.app/Contents/MacOS/Blender`.
  - `overlay-dressed.js` needs macOS `sips` and silently falls back to a dark background.
  - `collect-phase4b.py` needs ffmpeg plus git-ignored videos.
- **Evidence:** `scripts/verify-blender.js`, `scripts/phase5-verify-blender.js`, `scripts/overlay-dressed.js` l.111–121, `scripts/collect-phase4b.py` l.51 [V].
- **Impact:** Blender and overlay verification cannot run in CI or on Linux.
- **Recommended solution:** Use a `BLENDER` environment variable with PATH fallback. Make the overlay fail loudly (or mark its output) when the background is missing.
- **Refactoring risk:** Low.

### TD-12: Per-dataset scale constants without a shared scene record (MEDIUM)

- **Description:** Values are hard-coded per model, so cross-phase numbers are not comparable:
  - Rope diameter: 10 mm (PoC, Phase 5, both ledgers), 6 mm (Somerville, editor), about 9.8 mm (at-70).
  - Column radius: 0.055 / 0.0275 / 0.092 / 0.012 m, plus the bamboo culm.
  - Column axis: X or Y.
- **Evidence:** ARCHITECTURE §4; `src/phase5.js` l.3, `src/somerville-dressed.js` l.345, `src/at-70-model.js` l.65–66, `src/rope-edit-step.js` l.196/l.247 [V].
- **Impact:** Clearance results cannot be compared across phases. The material record `data/material-hemp-6mm.json` is not consumed anywhere.
- **Recommended solution:** Standardise an optional `scene`/`obstacles` block in JSON v1 (column axis, center, radius, length) and a `material` reference. Generators read their constants from it.
- **Refactoring risk:** Medium.

### TD-13: Missing regression coverage for the current deliverable and tools (MEDIUM)

- **Description:**
  - No test regenerates `loose-v3.json` and compares it with the committed file. The pipeline takes about 2.5 minutes and is not in CI.
  - No tests for `march-dressed.js`, `overlay-dressed.js`, the five viewers, or Blender scripts.
  - `generate-somerville.js` is only checked indirectly.
- **Evidence:** ARCHITECTURE §6 [V].
- **Impact:** A change to `rope-tube.js`, `rope-frames.js` or `rope-curves.js` can alter the deliverable without any test failing.
- **Recommended solution:** Add a tolerance-based "seed gates still pass" test with a reduced grid. Run the full pipeline in a scheduled CI job.
- **Refactoring risk:** Low.

### TD-14: Small dead code, shims and duplicate helpers (LOW)

- **Description:**
  - `src/somerville-relax.js` is a re-export shim.
  - `rope-tube.js` re-exports `rotationMinimizingFrames`.
  - Exported but never imported externally: `transportNormal`, `sampleCurve`, `subdivide`, `overhandRecipe`, `candidatePairs`.
  - `phase5-recovery.js` duplicates `toWorld`/`toLocal` from `rope-state.js`.
  - `integration-repair.js` (l.31, l.46) passes `{factors:[1]}` to `verifyGeometry`, which never reads `factors` [V].
- **Evidence:** Exploration of imports (ARCHITECTURE §2) [V].
- **Recommended solution:** Remove the shim after pointing its test at `rope-relax.js`; leave the rest documented.
- **Refactoring risk:** Low.

### TD-15: Duplicated viewer scaffolding, untested viewers (LOW)

- **Description:** Five pages each build their own scene, camera, lights, column mesh and resize loop. Three use per-segment capsules; two use `makeTube`.
- **Evidence:** ARCHITECTURE §3.9 [V].
- **Impact:** UX fixes need repeating; there is no shared rendering adapter for a future consumer.
- **Recommended solution:** Extract a small `viewer-scene.js` helper only when a viewer is next modified. Not urgent.
- **Refactoring risk:** Medium (no automated viewer tests).

### TD-16: Committed scratch space, backups and large historical JSON (LOW)

- **Description:** Committed artefacts that are not source:
  - `work/somerville/` (4.4 MB: agent logs, diagnostic scripts, copied builders, frames).
  - `reports/phase5/*.blend1` (Blender auto-backups).
  - About 5.8 MB of historical Somerville JSON.
- **Evidence:** REPOSITORY_INVENTORY §1–2 [V].
- **Recommended solution:** Move to `archive/` with a README, or out of the repository. Keep anything a report cites by path.
- **Refactoring risk:** Low (check citations first).

### TD-17: Physics layer implied by docs but absent (LOW)

- **Description:** The historical architecture and `material-hemp-6mm.json` (`model: homogenized_cosserat_rod`) suggest a physics backend. None exists: `analysisStatus: NOT_ENABLED`, every parameter `null`. `rope-relax.js` is geometric.
- **Evidence:** DATA_FLOW §3E [V].
- **Recommended solution:** State this plainly in README and STATUS. Do not add a physics adapter until topology and pose are resolved.
- **Refactoring risk:** Low.

### TD-18: Git history does not reflect development (LOW)

- **Description:** Long periods of uncommitted work are folded into mega-commits (`f327fde`: 123 files). Documents dated 2026-10-30 describe files first committed on 2026-11-04.
- **Evidence:** PROJECT_STATUS §1 [V].
- **Impact:** `git log`/`blame` cannot explain why code changed; history reconstruction depends on prose logs.
- **Recommended solution:** Commit per logical change; keep `handoff.md`-style notes in commit messages or PR descriptions.

### TD-19: Shared-solver changes not tied to dependent outputs (LOW)

- **Description:** `397d350` changed `rope-relax.js` and `rope-lengths.js` for the editor (pins, inverse masses, `SOLVER_VERSION`). `continuation.json` was produced by the earlier solver and was not regenerated or re-checked [V].
- **Impact:** It is unknown whether `node scripts/continue-somerville.js` still reproduces `continuation.json` [U].
- **Recommended solution:** Record solver version in generated metadata, and re-run historical generators only when needed.
- **Refactoring risk:** Low.
