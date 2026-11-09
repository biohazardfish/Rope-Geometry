import {evaluateAcceptance} from '../../../src/rope-acceptance.js';
// Deterministic Somerville pose solve: preset seed -> PBD with 148 s shape targets -> checks -> final.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildSomerville, seedClearance, SOMERVILLE_PRESETS } from '../../../src/somerville-build.js';
import { relaxRope } from '../../../src/somerville-relax.js';
import { correspondenceSpans, poseTargets, slidingTargets, unexplainedVisible, windowSpans, worldByTargetId, POSE_CORRESPONDENCE } from '../../../src/somerville-pose-targets.js';
import { fitPoseCamera, scorePose } from '../../../src/somerville-pose-fit.js';
import { makeTube, checkTube } from '../../../src/rope-tube.js';
import { validateOperations } from '../../../src/somerville-verify.js';

const SOLVE = Object.freeze({ preset: 'videoTight', blocks: 4, blockIterations: 50, poseWeight: 0.012, slideWeight: 0.012, coreWeight: 0, coreCenter: [0.004, -0.055, -0.036], endPull: 0.01, endWeight: 0.02, polishIterations: 120, polishPoseWeight: 0.008, polishStretchSweeps: 10, stretchSweeps: 8, gap: 0.0002 });
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
// The fold stays on its generated semicircle. Pulling it onto the tight image hook
// drives that semicircle back into the bight leg and folds the tube.
const SLIDE = { [leftTail]: ['tail-left'], [rightTail]: ['tail-right'], 'bight-leg/0': ['bight-upper-leg'], 'bight-leg/1': ['bight-lower-leg'] };
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

// Rest lengths stay at the seed. The video route is already compact enough that tightening
// does not shorten hidden segments; released length is not manufactured by shrinking.
let points = seedPoints, rejected = 0, ccdShrinks = 0;
const blocks = [];
for (let b = 0; b < SOLVE.blocks; b++) {
  const r = relaxRope(points, { iterations: SOLVE.blockIterations, restLengths, gap: SOLVE.gap, maxStep: 0.00012, stretchSweeps: SOLVE.stretchSweeps, targets: blockTargets(points) });
  points = r.points; rejected += r.rejected; ccdShrinks += r.ccdShrinks;
  blocks.push({ block: b, maxStretch: r.maxStretch, rejected: r.rejected, ccdShrinks: r.ccdShrinks, minPairGap: r.history.at(-1)?.minPairGap ?? null });
}
const polishTargets = blockTargets(points).filter((t) => t.id !== 'core' && t.id !== 'ends').map((t) => ({ ...t, weight: SOLVE.polishPoseWeight }));
const polish = relaxRope(points, { iterations: SOLVE.polishIterations, restLengths, gap: SOLVE.gap, maxStep: 0.00012, stretchSweeps: SOLVE.polishStretchSweeps, targets: polishTargets });
points = polish.points; rejected += polish.rejected; ccdShrinks += polish.ccdShrinks;
const lengthen = relaxRope(points, { iterations: 250, restLengths, gap: SOLVE.gap, maxStep: 0.0002, stretchSweeps: 20, targets: [] });
points = lengthen.points; rejected += lengthen.rejected; ccdShrinks += lengthen.ccdShrinks;
rope.points = points;
// Material flowed through the knot: section arcs are re-measured on the final centreline.
doc.somerville.materialArc = points.map((_, i) => 0);
for (let i = 1; i < points.length; i++) doc.somerville.materialArc[i] = doc.somerville.materialArc[i - 1] + Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
for (const section of doc.somerville.sections) { section.materialStart = doc.somerville.materialArc[section.start]; section.materialEnd = doc.somerville.materialArc[section.end]; }
const loopRim = points.filter((_, i) => labels[i]?.startsWith('loop-rim/'));
doc.somerville.aperture.center = [0, 1, 2].map((k) => loopRim.reduce((s, p) => s + p[k], 0) / loopRim.length);
let scoreSpans = {}, camera = SOLVE_CAMERA, correspondenceError = null;
try {
  scoreSpans = windowSpans(points, labels, annotation, SOLVE_CAMERA, WINDOW, fixedSpans);
  camera = fitPoseCamera(worldByTargetId(points, scoreSpans), annotation).camera;
} catch (error) { correspondenceError = error.message; scoreSpans = {}; }
const score = scorePose(worldByTargetId(points, scoreSpans), annotation, camera);
const extra = unexplainedVisible(points, labels, scoreSpans, annotation, camera, { columnRadius: doc.somerville.column.radius });
const seed = seedClearance(doc); delete seed.hits;
const tube = checkTube(makeTube(points, rope.diameter / 2), { column: doc.somerville.column });
delete tube.intersectionPairs;
const operations = validateOperations(doc,{scope:'final'});
const length = points.slice(1).reduce((s, p, i) => s + Math.hypot(...p.map((v, k) => v - points[i][k])), 0);
const seedLength = restLengths.reduce((s, v) => s + v, 0);
const maxStretch = Math.max(...points.slice(1).map((p, i) => Math.abs(Math.hypot(...p.map((v, k) => v - points[i][k])) - restLengths[i])));
const referenceDoc = JSON.parse(readFileSync('data/somerville-final/loose-v2.json','utf8'));
const referenceLength = referenceDoc.somerville.materialArc.at(-1);
const lineage = {status:'UNVERIFIED',referenceId:'loose-v2',continuousMotion:'UNVERIFIED',referenceLength,seedLength,seedLengthChange:seedLength-referenceLength,reason:'Historical solver starts from generated videoTight rather than moving original loose-v2 material'};
const acceptance = evaluateAcceptance({tube, operations, pose:score, unexplainedVisible:extra, clearance:seed, material:{lengthChange:length-referenceLength,maxSegmentStretch:maxStretch},lineage,targetGap:SOLVE.gap});
const checks = acceptance.checks;
const report = {
  status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
  checks,
  lineage, correspondenceError,
  crossingPose: score.crossingPose,
  pose: { camera, rmsPx: score.rmsPx, rmsInDiameters: score.rmsInDiameters, maxPx: score.maxPx, perRole: score.perRole, cameraScaleVsRopeDiameter: camera.pixelsPerMetre * rope.diameter / annotation.nominalVisibleRopeDiameterPx },
  unexplainedVisible: { count: extra.count, maxDistancePx: extra.maxDistancePx, byRole: extra.byRole },
  tube, operations: operations.checks, cuffTurns: operations.cuffTurns,
  clearance: { minimumNonlocalGap: seed.minimumNonlocalGap, minimumColumnGap: seed.minimumColumnGap, penetratingPairs: seed.penetratingPairs, closest: seed.closest, targetGap: SOLVE.gap },
  material: { referenceLength, seedLength, finalLength: length, lengthChange: length - referenceLength, solveLengthChange: length - seedLength, maxSegmentStretch: maxStretch },
  solver: { ...SOLVE, camera: SOLVE_CAMERA, restLengths: 'fixed-seed', sliding: SLIDE, scoringWindows: WINDOW, rejectedSteps: rejected, ccdShrinks, blocks },
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
console.log(JSON.stringify({ status: report.status, checks, rmsPx: score.rmsPx, perRolePx: Object.fromEntries(Object.entries(score.perRole).map(([k, v]) => [k, (v.rmsPx == null ? null : +v.rmsPx.toFixed(1))])), unexplained: report.unexplainedVisible, gapMm: seed.minimumNonlocalGap * 1000, columnMm: seed.minimumColumnGap * 1000, lengthChangeMm: (length - seedLength) * 1000, rejected, ms: Date.now() - started }, null, 1));
