// Deterministic Somerville pose solve: preset seed -> PBD with 148 s shape targets -> checks -> final.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildSomerville, seedClearance, SOMERVILLE_PRESETS } from '../src/somerville-build.js';
import { relaxRope } from '../src/somerville-relax.js';
import { correspondenceSpans, poseTargets, slidingTargets, unexplainedVisible, windowSpans, worldByTargetId, POSE_CORRESPONDENCE } from '../src/somerville-pose-targets.js';
import { fitPoseCamera, scorePose } from '../src/somerville-pose-fit.js';
import { makeTube, checkTube } from '../src/rope-tube.js';
import { validateOperations } from '../src/somerville-verify.js';

const SOLVE = Object.freeze({ preset: 'poseSeed', blocks: 16, blockIterations: 100, poseWeight: 0.05, slideWeight: 0.05, coreWeight: 0.004, coreCenter: [0.0024, -0.040, -0.028], endPull: 0.03, endWeight: 0.05, polishIterations: 300, polishPoseWeight: 0.01, polishStretchSweeps: 8, stretchSweeps: 3, gap: 0.0002, shrinkRate: 0.04, shrinkFollow: 1.02, minRest: 0.0008, keepRoles: ['cuff/', 'tail/', 'bight-leg/', 'fold'] });
const SOLVE_CAMERA = Object.freeze({ projection: 'orthographic', pixelsPerMetre: 5000, originPixel: [460, 555], rollRadians: 0 });
const started = Date.now();
const annotation = JSON.parse(readFileSync('data/somerville-pose148.json', 'utf8'));
const doc = buildSomerville(SOMERVILLE_PRESETS[SOLVE.preset]);
const rope = doc.ropes[0], arc = doc.somerville.materialArc, labels = rope.segmentLabels;
const seedPoints = rope.points.map((p) => p.slice());
const restLengths = seedPoints.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - seedPoints[i][k])));
const spans = correspondenceSpans(doc, annotation);
const pose = (weight) => poseTargets(arc, spans, annotation, SOLVE_CAMERA, weight);

const fixedSpans = Object.fromEntries(['cuff-left', 'cuff-mid-left', 'cuff-mid-right', 'cuff-right'].map((id) => [id, spans[id]]));
const [leftTail, rightTail] = [spans['tail-left'].role, spans['tail-right'].role];
const SLIDE = { [leftTail]: ['tail-left'], [rightTail]: ['tail-right'], 'bight-leg/0': ['bight-upper-leg', 'bight-fold'], fold: ['bight-fold'], 'bight-leg/1': ['bight-fold', 'bight-lower-leg'] };
const WINDOW = { 'tail-left': [leftTail], 'tail-right': [rightTail], 'bight-upper-leg': ['bight-leg/0'], 'bight-fold': ['fold', 'bight-leg/0', 'bight-leg/1'], 'bight-lower-leg': ['bight-leg/1'] };
const unproject = ([u, v]) => [(u - SOLVE_CAMERA.originPixel[0]) / SOLVE_CAMERA.pixelsPerMetre, 0, -(v - SOLVE_CAMERA.originPixel[1]) / SOLVE_CAMERA.pixelsPerMetre];
// Ends hang below their traced tail and keep moving down, so released length can leave the frame.
const tailEnd = (id, end) => { const e = unproject(annotation.visiblePolylines.find((x) => x.id === id).points.at(-1)); return [e[0], 0, Math.min(e[2], end[2]) - SOLVE.endPull]; };

function blockTargets(points) {
  const cuffLanes = poseTargets(arc, fixedSpans, annotation, SOLVE_CAMERA, SOLVE.poseWeight);
  const slides = slidingTargets(points, labels, annotation, SOLVE_CAMERA, SLIDE, SOLVE.slideWeight);
  const taken = new Set([...cuffLanes, ...slides].flatMap((t) => t.indices));
  const core = points.flatMap((_, i) => { const role = labels[Math.min(i, labels.length - 1)]; return taken.has(i) || role.startsWith('cuff/') || role.startsWith('tail/') ? [] : [i]; });
  const ends = { id: 'ends', indices: [0, points.length - 1], positions: [tailEnd(leftTail === 'tail/0' ? 'tail-left' : 'tail-right', points[0]), tailEnd(leftTail === 'tail/1' ? 'tail-left' : 'tail-right', points.at(-1))], axes: [0, 2], weight: SOLVE.endWeight };
  return [...cuffLanes, ...slides, ends, { id: 'core', indices: core, positions: core.map(() => SOLVE.coreCenter), weight: SOLVE.coreWeight }];
}

// Tightening transfers material: hidden core segments shorten (only while they follow), the long ends gain the same length.
const segmentLength = (pts, i) => Math.hypot(...pts[i + 1].map((v, k) => v - pts[i][k]));
const shrinkable = labels.map((role) => !SOLVE.keepRoles.some((prefix) => role.startsWith(prefix)));
// Released length enters only below the image frame, so it leaves through the free ends instead of piling up in view.
const frameBottomZ = -(annotation.imageSize[1] - SOLVE_CAMERA.originPixel[1]) / SOLVE_CAMERA.pixelsPerMetre;
const tailSegments = labels.flatMap((role, i) => role.startsWith('tail/') && seedPoints[i][2] < frameBottomZ && seedPoints[i + 1][2] < frameBottomZ ? [i] : []);
if (tailSegments.length < 10) throw new Error('too few off-frame tail segments to receive released length');
let rest = restLengths.slice(), points = seedPoints, rejected = 0, transferred = 0;
const blocks = [];
for (let b = 0; b < SOLVE.blocks; b++) {
  let removed = 0;
  for (let i = 0; i < rest.length; i++) {
    if (!shrinkable[i] || segmentLength(points, i) > rest[i] * SOLVE.shrinkFollow) continue;
    const next = Math.max(SOLVE.minRest, rest[i] * (1 - SOLVE.shrinkRate));
    removed += rest[i] - next; rest[i] = next;
  }
  const tailTotal = tailSegments.reduce((s, i) => s + rest[i], 0);
  for (const i of tailSegments) rest[i] += removed * rest[i] / tailTotal;
  transferred += removed;
  const r = relaxRope(points, { iterations: SOLVE.blockIterations, restLengths: rest, gap: SOLVE.gap, stretchSweeps: SOLVE.stretchSweeps, targets: blockTargets(points) });
  points = r.points; rejected += r.rejected;
  blocks.push({ block: b, transferred: removed, maxStretch: r.maxStretch, rejected: r.rejected, minPairGap: r.history.at(-1)?.minPairGap ?? null });
}
const polishTargets = blockTargets(points).filter((t) => t.id !== 'core' && t.id !== 'ends').map((t) => ({ ...t, weight: SOLVE.polishPoseWeight }));
const polish = relaxRope(points, { iterations: SOLVE.polishIterations, restLengths: rest, gap: SOLVE.gap, stretchSweeps: SOLVE.polishStretchSweeps, targets: polishTargets });
points = polish.points; rejected += polish.rejected;

// Exact length bookkeeping at the off-frame free ends: move each end point along its tail tangent.
{
  const actual = points.slice(1).reduce((s, p, i) => s + Math.hypot(...p.map((v, k) => v - points[i][k])), 0);
  const excess = actual - restLengths.reduce((s, v) => s + v, 0);
  for (const [end, inner] of [[0, 1], [points.length - 1, points.length - 2]]) {
    const dir = points[end].map((v, k) => v - points[inner][k]), len = Math.hypot(...dir);
    if (len - excess / 2 <= 1e-4) { console.warn(`free-end correction would collapse the end segment: excess ${excess}, end segment ${len}`); break; }
    points[end] = points[inner].map((v, k) => v + dir[k] * (len - excess / 2) / len);
  }
}
rope.points = points;
// Material flowed through the knot: section arcs are re-measured on the final centreline.
doc.somerville.materialArc = points.map((_, i) => 0);
for (let i = 1; i < points.length; i++) doc.somerville.materialArc[i] = doc.somerville.materialArc[i - 1] + Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
for (const section of doc.somerville.sections) { section.materialStart = doc.somerville.materialArc[section.start]; section.materialEnd = doc.somerville.materialArc[section.end]; }
const loopRim = points.filter((_, i) => labels[i]?.startsWith('loop-rim/'));
doc.somerville.aperture.center = [0, 1, 2].map((k) => loopRim.reduce((s, p) => s + p[k], 0) / loopRim.length);
const scoreSpans = windowSpans(points, labels, annotation, SOLVE_CAMERA, WINDOW, fixedSpans);
const world = worldByTargetId(points, scoreSpans), { camera } = fitPoseCamera(world, annotation), score = scorePose(world, annotation, camera);
const extra = unexplainedVisible(points, labels, scoreSpans, annotation, camera, { columnRadius: doc.somerville.column.radius });
const seed = seedClearance(doc); delete seed.hits;
const tube = checkTube(makeTube(points, rope.diameter / 2), { column: doc.somerville.column });
delete tube.intersectionPairs;
const operations = validateOperations(doc);
const length = points.slice(1).reduce((s, p, i) => s + Math.hypot(...p.map((v, k) => v - points[i][k])), 0);
const seedLength = restLengths.reduce((s, v) => s + v, 0);
const maxStretch = Math.max(...points.slice(1).map((p, i) => Math.abs(Math.hypot(...p.map((v, k) => v - points[i][k])) - restLengths[i])));
const checks = {
  tubeGeometry: tube.valid,
  operations: operations.valid,
  centerlinePose: score.centerlinePose.status === 'PASS',
  noUnexplainedVisibleRope: extra.count === 0,
  materialLength: Math.abs(length - seedLength) <= 1e-3,
  positiveClearance: seed.penetratingPairs === 0 && seed.minimumNonlocalGap > 0,
};
const report = {
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  checks,
  crossingPose: score.crossingPose,
  pose: { camera, rmsPx: score.rmsPx, rmsInDiameters: score.rmsInDiameters, maxPx: score.maxPx, perRole: score.perRole, cameraScaleVsRopeDiameter: camera.pixelsPerMetre * rope.diameter / annotation.nominalVisibleRopeDiameterPx },
  unexplainedVisible: { count: extra.count, maxDistancePx: extra.maxDistancePx, byRole: extra.byRole },
  tube, operations: operations.checks, cuffTurns: operations.cuffTurns,
  clearance: { minimumNonlocalGap: seed.minimumNonlocalGap, minimumColumnGap: seed.minimumColumnGap, penetratingPairs: seed.penetratingPairs, closest: seed.closest, targetGap: SOLVE.gap },
  material: { seedLength, finalLength: length, lengthChange: length - seedLength, maxSegmentStretch: maxStretch },
  solver: { ...SOLVE, camera: SOLVE_CAMERA, transferredToLongEnds: transferred, sliding: SLIDE, scoringWindows: WINDOW, rejectedSteps: rejected, blocks },
  limitations: [
    'Pose score uses only traced visible spans; the locking core has no crossing targets, so crossing-position acceptance is UNVERIFIED.',
    'Span correspondence is a modelling assumption (POSE_CORRESPONDENCE), not identification of physical rope ends.',
    'Operation checks are numerical realisations of the declared route, not an isotopy certificate.',
  ],
};
doc.somerville.stage = 'pose-148-candidate';
doc.somerville.pose = { annotation: 'data/somerville-pose148.json', camera, correspondence: POSE_CORRESPONDENCE, spans: Object.fromEntries(Object.entries(scoreSpans).map(([id, s]) => [id, { role: s.role, window: !!s.window, materialFrom: arc[s.ids[0]], materialTo: arc[s.ids.at(-1)] }])) };
doc.somerville.acceptance = { geometry: tube.valid ? 'PASS' : 'FAIL', operations: operations.valid ? 'PASS' : 'FAIL', pose: score.centerlinePose.status, status: report.status };
mkdirSync('data/somerville-final', { recursive: true });
writeFileSync('data/somerville-final/final.json', JSON.stringify(doc) + '\n');
writeFileSync('reports/somerville-final-report.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync('reports/somerville-final-timing.json', JSON.stringify({ milliseconds: Date.now() - started }, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks, rmsPx: score.rmsPx, perRolePx: Object.fromEntries(Object.entries(score.perRole).map(([k, v]) => [k, +v.rmsPx.toFixed(1)])), unexplained: report.unexplainedVisible, gapMm: seed.minimumNonlocalGap * 1000, columnMm: seed.minimumColumnGap * 1000, lengthChangeMm: (length - seedLength) * 1000, rejected, ms: Date.now() - started }, null, 1));
