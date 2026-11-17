# Dependencies and Execution — Rope Geometry

Audit date 2026-11-17 (UTC+8). Branch `feature/somerville-egc-knoto-id` @ `397d350`.
Tags: **[V]** verified fact, **[I]** reasonable inference, **[U]** unknown.

Audit environment: Linux, Node v22.23.4, npm 10.9.9. `node_modules/` absent, no Blender, no
macOS `sips` [V]. Per the audit constraints nothing was installed. Every command below was run in a
disposable `git archive HEAD` copy under `/tmp`, never in the repository [V].

---

## 1. External dependencies

### 1.1 npm (`package.json`, `package-lock.json` lockfileVersion 3, 65 packages) [V]

| Package | Declared | Locked | Used by |
| --- | --- | --- | --- |
| `three` | `^0.180.0` (dependency) | 0.180.0 | The five browser modules only: `viewer.js`, `phase5-viewer.js`, `somerville-viewer.js`, `at-70-viewer.js` (`three` + `three/addons/controls/OrbitControls.js`), `rope-editor.js` (`three` only) |
| `vite` | `^7.1.7` (devDependency) | 7.3.7 (esbuild 0.28.2, rollup 4.65.0) | `npm run dev`, `npm run build`; requires Node `^20.19.0 \|\| >=22.12.0` |

No test framework dependency. Tests use built-in `node:test` and `node:assert/strict` [V].
**No test, script or core module imports `three`**, so all Node-side work runs without
`npm ci` [V]. Confirmed by running `npm test` with no `node_modules`.

No geometry, physics or math libraries are used. Every kernel (distance, frames, tube,
intersection, solver, camera fit, PNG encoding in `overlay-dressed.js`) is hand-written [V].

### 1.2 Node built-ins [V]

`node:fs`, `node:path`, `node:crypto` (SHA-256 hashing in reports, editor sessions and baselines),
`node:child_process` (`export-gate.test.js` spawns the CLI; `overlay-dressed.js` spawns `sips`),
`node:os` (temp dirs in tests), `node:url`, `node:zlib` (PNG encoding in `overlay-dressed.js`), `node:test`, `node:assert/strict`.

### 1.3 Non-npm tools

| Tool | Used by | Required for | Located how | Status |
| --- | --- | --- | --- | --- |
| Blender (Python `bpy`, `mathutils`) | `scripts/blender_import.py`, `scripts/phase5-blender.py`, launched by `scripts/verify-blender.js`, `scripts/phase5-verify-blender.js` | `npm run verify:blender`, `verify:blender:phase5` | **Hard-coded** `/Applications/Blender.app/Contents/MacOS/Blender`; no env var or PATH lookup [V] | Not run (unavailable). Historically passing per README (max error 3.34e-9 m) [V] |
| macOS `sips` | `scripts/overlay-dressed.js` (l.113) | Decoding the JPEG background for the overlay PNG | `spawnSync('sips', …)`; falls back to a dark background if absent [V] | On Linux the overlay degrades silently to "fallback: sips unavailable" [V] |
| Python 3 + Pillow | `scripts/collect-phase4b.py`, `work/somerville/diag/overlay.py` | Re-collecting reference images, legacy overlay | System Python [I] | Not wired to npm; one-shot [V] |
| Python 3 (stdlib) | `scripts/author-phase4b.py` | Re-authoring topology v2 | System Python [I] | One-shot [V] |
| ffmpeg | `scripts/collect-phase4b.py` l.51 | Extracting video frames from `references/video/*.mp4` | PATH | Videos are git-ignored and absent, so this path cannot be reproduced from the repository alone [V] |
| Knoto-ID | Downstream consumer of `export-knoto-id.js` output | Knot classification | Not bundled (`docs/somerville-egc-integration.md`) [V] | External, PLANNED |
| Cursor CLI / Codex / Playwright | Agent tooling referenced in `handoff.md`, `work/somerville/dressed/*.log`, `docs/cli-review.md` | Development process only | — | Not a project dependency [V] |

### 1.4 Python environments

There is no `requirements.txt`, `pyproject.toml` or virtualenv [V]. The Blender scripts depend on
Blender's bundled Python [I].

---

## 2. Internal dependency summary

See the import graph in [ARCHITECTURE.md](ARCHITECTURE.md) §2. Cross-cutting facts [V]:

- No circular imports.
- Leaf kernels have no internal imports and can be reused independently.
- `src/somerville-build.js` statically imports `src/somerville-dressed.js`. Importing any Somerville route therefore loads the dressed generator.
- Scripts import `src/` directly by relative path (`../src/x.js`). There is no `exports` map or package entry point.

---

## 3. Execution paths: documented vs. actual

| # | Purpose | Documented command | Actual result in this audit |
| --- | --- | --- | --- |
| 1 | Install | `npm ci` (README) | **Not run** (no installs allowed). Lockfile present and consistent with `package.json` ranges [V] |
| 2a | Run the app (dev) | `npm run dev` → Vite at `127.0.0.1` (README, `reports/rope-edit/README.md`) | **UNVERIFIED** (Vite not installed) |
| 2b | Build | `npm run build` | **UNVERIFIED** here. The CI build step was added in `f327fde` and has never executed, because CI stops at the failing `npm test` (§3.1) [V]. `docs/cli-review.md` and `reports/rope-edit/README.md` record local passing builds [V] |
| 2c | Preview build | `npx vite preview` (README) | UNVERIFIED |
| 3a | Generate PoC geometry | `npm run report` / `npm run generate:crossing` | **Exit 0**, output byte-identical [V] |
| 3b | Generate current Somerville seed | `npm run generate:dressed` | **Exit 0** in 2 min 35 s. Seed frozen, pose FAIL; bytes differ from committed at ≤ 6.7e-16 m [V] |
| 3c | Generate historical Somerville seeds | (not in npm) `node scripts/generate-somerville.js` | Exit 0; ≤ 6.5e-16 m differences [V] |
| 3d | Historical continuation / final | (not in npm) `node scripts/solve-somerville-pose.js` | Not run (historical; overwrites `final.json`) |
| 3e | Overhand example | (not in npm) `node scripts/generate-overhand.js` | Exit 0; ≤ 6.9e-18 m differences [V] |
| 3f | Parameter march | `npm run march:dressed` | Not run (long; study tool) |
| 3g | Overlay | `npm run overlay:dressed` | Not run. Would degrade on Linux (`sips`) [V by code] |
| 4a | Validation (historical regression) | `npm run verify:geometry` | **Exit 0**, report byte-identical. Exit 0 means controls match, not acceptance (README) [V] |
| 4b | Topology readiness | `npm run audit:somerville` | **Exit 0** with `ready:false` (exit 0 by design) [V] |
| 4c | Phase 4/4B reports | `npm run report:phase4`, `npm run report:phase4b` | phase4: exit 0, identical. **phase4b: exit 1, "Previous foundation modified"** (baseline hash of `src/topology.js`) [V] |
| 4d | Phase 5 reports | `npm run report:phase5`, `npm run report:recovery` | Exit 0; phase5 output differs in last digit; recovery identical [V] |
| 4e | Editor audit | (not in npm) `node scripts/audit-rope-edit.mjs reports/rope-edit/session{1,2,3}.json` | Exit 0, all verified [V] |
| 5 | Tests | `npm test` (`node --test`) | **Exit 1: 146 tests, 145 pass, 1 fail** in 17.7 s [V]. Failing: `test/rope-core.test.js` "shared frame extraction preserves the complete loose-v2 geometry and tube": bit-exact `deepEqual` of regenerated vs committed `loose-v2.json` points (differences in the 17th significant digit) |
| 6a | Export to Blender | `npm run verify:blender` (round-trip only; writes temp `.blend`) | UNVERIFIED (no Blender; hard-coded macOS path) |
| 6b | Export to Knoto-ID | `npm run export:knoto -- gauss|xyz INPUT [OUTPUT]` | `--help` prints usage (exit 2). Gauss export for Somerville is expected to fail by design (`docs/somerville-egc-integration.md`) [V] |
| 7 | Inspect results | Open `/`, `/phase5.html`, `/somerville.html`, `/rope-edit.html`, `/at-70.html` on the Vite server | UNVERIFIED in this audit (no browser run). The rope-edit README records automated Chrome trials on 2026-11-09 [V] |

### 3.1 CI (`.github/workflows/node-tests.yml`) [V]

The workflow runs on `ubuntu-latest` with Node 22, triggered by pushes to `feature/somerville-egc-knoto-id` and by PRs touching `src`, `test`, `scripts`, `data`, `package*` or the workflow file. Steps:

1. `npm ci`
2. `npm test`
3. `npm run audit:somerville`
4. `npm run verify:geometry`
5. `npm run build`

History from `gh run list` and `git show <commit>:.github/workflows/node-tests.yml`:

- Up to `74dd064` the workflow had only three steps: `npm ci`, `npm test`, `npm run audit:somerville`. The `verify:geometry` and `build` steps, and `scripts/verify-geometry.js` itself, first appear in `f327fde` (2026-11-04) [V].
- Runs from 2026-10-30 to 2026-11-03 02:19 (UTC+8) passed under the three-step workflow [V].
- The **two most recent runs (2026-11-10 01:42 UTC+8, push + PR) failed** at `npm test`, on the same `rope-core.test.js` assertion reproduced here [V]. Commits `f327fde`, `b09dac9` and `f55c428` were pushed together with `397d350`, so their CI result is first visible in that run [V].
- **The current five-step workflow has therefore never passed in CI** [V]. `verify:geometry` and `build` have never executed in CI [V].
- `f327fde` is the commit that last rewrote `data/somerville-final/loose-v2.json` [V].

Root cause [I]: `loose-v2.json` was regenerated on macOS. Platform differences in last-bit
floating-point results make the Linux regeneration differ, so a bit-exact test passes locally on
macOS and fails on CI. The local test counts in the docs (122/122 in `handoff.md`, 143/143 in
`reports/rope-edit/README.md`) are consistent with macOS-only runs [I].

### 3.2 Undocumented or broken execution paths

| Path | Problem | Evidence |
| --- | --- | --- |
| `npm test` on Linux/CI | 1 platform-dependent failure | §3 row 5 [V] |
| `npm run report:phase4b` | Always aborts on its own baseline guard | §3 row 4c; `src/topology.js` unchanged since `730c3a2` but its hash differs from `reports/phase4b/baseline-sha256.json` [V] |
| `npm run verify:blender*` | macOS-only hard-coded path | `scripts/verify-blender.js`, `scripts/phase5-verify-blender.js` [V] |
| `npm run overlay:dressed` | macOS-only for real output | `scripts/overlay-dressed.js` l.111–121 [V] |
| `generate-somerville.js`, `continue-somerville.js`, `evaluate-somerville-candidate.js`, `solve-somerville-pose.js`, `generate-overhand.js`, `audit-rope-edit.mjs`, `author-phase4b.py`, `collect-phase4b.py` | Not exposed as npm scripts | `package.json` [V] |
| Recorded SHAs (`ea7676ee…`, `3db0782f…`, `5d36fda9…` in `handoff.md`) | Reproducible only on the original platform | §3 row 3b [V] |
| `reports/verification/current.json` | Rewritten by every CI run (tracked file) | `scripts/verify-geometry.js` l.21 [V]; byte-stable, so harmless today |
| Somerville viewer default | Opens historical `loose-v2`, not the current `loose-v3` | `somerville.html` l.61 [V] |
