# Recovery verification record

Executed in the project directory on 2026-10-24:

| Check | Actual result |
|---|---|
| `npm run report:recovery` | Completed; four incremental local gates passed, integration explicitly failed |
| `npm test` | 32 tests passed, 0 failed; includes all 25 pre-existing tests and 7 recovery tests |
| `npx vite build` | Passed; existing large-chunk advisory remains |
| Frozen-file hashes | Candidate A, partial cuff, Phase 4B topology, collision engine, old generator and old validation report unchanged |
| Cuff integration provenance | All 144 cuff arc segments copied with exactly identical endpoint coordinates and ordering |
| Browser | Local core, failed integration and original partial cuff selected; displayed values matched reports; front/rear/right/oblique views and collision-marker toggle exercised |

Logs: [tests.log](tests.log), [build.log](build.log), [run.log](run.log).
The browser screenshot is [viewer-local-core.png](viewer-local-core.png).

The tests passing means the validators correctly distinguish passing local fixtures and deliberately failing controls. It does **not** mean the integrated knot passed.

Failures found and retained during the local experiment:

- First loop-root placement: 8 self-penetrations near the initial entry. Only the local root elevations were changed; the failed geometry is retained.
- First outside descent: 6 collisions with the fixture connector. The local descent position was changed.
- First underpass depth: 6 cuff collisions, maximum 1.119029 mm. The final local underpass was moved 7 mm inward, and column clearance was checked separately.
- Temporary stage-3 fold: column penetration 1.144244 mm. The temporary fold radius was changed from 30 mm to 16 mm; it uses four explicit polyline sides. The stage-4 fold remains 30 mm. No cuff or collision-rule change was made.
- Integrated trial: 74 self-penetrations, no column penetration; retained as a failed experiment. No global adjustment followed.

Limitations not tested or claimed: continuous-curve/smooth-rope thickness, sharp-corner physical behavior, full final crossing inventory, target-video strand equivalence, load-bearing locking behavior. The gate checks use the specified polyline representation and explicit local aperture. Raw finer-sampling failures remain in sampling.json.

Blender round trips were not rerun for this recovery experiment; no new Blender verification is claimed. Existing Blender scenes and reports were preserved. No animation, tightening, physical simulation or appearance optimization was performed.
