import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateCrossings, fitPoseCamera, projectPoint, scorePose } from '../src/somerville-pose-fit.js';
import { unexplainedVisible } from '../src/somerville-pose-targets.js';
import { evaluateAcceptance } from '../src/rope-acceptance.js';
import { evaluateSomervilleDressed, preferResidual } from '../scripts/evaluate-somerville-dressed.js';

const pose148 = JSON.parse(readFileSync(new URL('../data/somerville-pose148.json', import.meta.url), 'utf8'));
const CALIBRATION = Object.freeze({
  nominalPixelsPerMetre: 5000,
  minPixelsPerMetre: 4250,
  maxPixelsPerMetre: 5750,
  diameterMetres: 0.006,
});

function lineWorld(scale = 1) {
  return {
    line: [
      [0.01 * scale, 0, 0.02 * scale],
      [0.04 * scale, 0, -0.01 * scale],
    ],
  };
}

function annotationFrom(world, camera, extra = {}) {
  return {
    nominalVisibleRopeDiameterPx: 30,
    acceptance: { visibleCenterlineRmsInDiameters: 0.2 },
    visiblePolylines: Object.entries(world).map(([id, poly]) => ({
      id,
      kind: 'centerline',
      points: poly.map((point) => projectPoint(point, camera)),
    })),
    ...extra,
  };
}

function legacyInput() {
  return {
    tube: { valid: true },
    operations: { valid: true },
    pose: { centerlinePose: { status: 'PASS' }, crossingPose: { status: 'PASS' } },
    unexplainedVisible: { count: 0 },
    clearance: { minimumNonlocalGap: 0.0002, minimumColumnGap: 0.0002, penetratingPairs: 0 },
    material: { lengthChange: 0, maxSegmentStretch: 0 },
    lineage: { status: 'PASS', referenceId: 'fixture', continuousMotion: 'PASS' },
  };
}

const SOURCE_CAMERA = Object.freeze({
  projection: 'orthographic',
  pixelsPerMetre: 5000,
  originPixel: [120, 80],
  rollRadians: 0.3,
});

test('malformed scale calibration is rejected and a missing record stays uncalibrated', () => {
  const world = lineWorld();
  const annotation = annotationFrom(world, SOURCE_CAMERA);
  const missing = fitPoseCamera(world, annotation);
  assert.equal(missing.scale.status, 'UNCALIBRATED');
  assert.equal(missing.scale.clamped, false);
  assert.ok(Math.abs(missing.camera.pixelsPerMetre - 5000) < 1e-6);
  for (const scaleCalibration of [
    null,
    [],
    { ...CALIBRATION, diameterMetres: 0 },
    { ...CALIBRATION, minPixelsPerMetre: 6000 },
    { ...CALIBRATION, nominalPixelsPerMetre: 1000 },
    { nominalPixelsPerMetre: 5000, minPixelsPerMetre: 4250, maxPixelsPerMetre: 5750 },
  ]) {
    assert.throws(() => fitPoseCamera(world, { ...annotation, scaleCalibration }), /scaleCalibration/);
  }
});

test('oversized model is clamped, translation is recomputed, and the fit is not a success', () => {
  const world = lineWorld();
  const annotation = annotationFrom(world, SOURCE_CAMERA, { scaleCalibration: CALIBRATION });
  const fit = fitPoseCamera(lineWorld(4), annotation);
  assert.equal(fit.scale.status, 'PASS');
  assert.equal(fit.scale.unconstrainedScaleStatus, 'OUTSIDE_RANGE');
  assert.equal(fit.scale.clamped, true);
  assert.equal(fit.camera.pixelsPerMetre, 4250);
  assert.ok(fit.scale.unconstrainedPixelsPerMetre < 4250);
  assert.ok(Math.abs(fit.camera.rollRadians - SOURCE_CAMERA.rollRadians) < 1e-9);
  assert.ok(Math.hypot(fit.camera.originPixel[0] - fit.scale.unconstrainedOriginPixel[0], fit.camera.originPixel[1] - fit.scale.unconstrainedOriginPixel[1]) > 1);
  const midpoint = [(0.01 + 0.04) / 2 * 4, 0, (0.02 - 0.01) / 2 * 4];
  const imageMid = projectPoint([(0.01 + 0.04) / 2, 0, (0.02 - 0.01) / 2], SOURCE_CAMERA);
  const projected = projectPoint(midpoint, fit.camera);
  assert.ok(Math.hypot(projected[0] - imageMid[0], projected[1] - imageMid[1]) < 1e-4);
  assert.equal(scorePose(lineWorld(4), annotation, fit.camera).status, 'FAIL');
  const accepted = evaluateAcceptance({
    ...legacyInput(),
    scale: fit.scale,
    unexplainedVisible: { count: 0, lengthPx: 0, samplingResolutionPx: 1 },
  });
  assert.notEqual(accepted.staticReconstruction.status, 'PASS');
  assert.equal(accepted.staticReconstruction.scale.status, 'PASS');
  assert.equal(accepted.staticReconstruction.scale.clamped, true);
});

test('in-range calibration keeps the unconstrained camera and passes the independent scale check', () => {
  const world = lineWorld();
  const annotation = annotationFrom(world, SOURCE_CAMERA, { scaleCalibration: CALIBRATION });
  const fit = fitPoseCamera(world, annotation);
  assert.equal(fit.scale.status, 'PASS');
  assert.equal(fit.scale.clamped, false);
  assert.ok(Math.abs(fit.scale.unconstrainedPixelsPerMetre - 5000) < 1e-6);
  assert.ok(Math.abs(fit.camera.pixelsPerMetre - 5000) < 1e-6);
  assert.equal(scorePose(world, annotation, fit.camera).status, 'PASS');
});

test('pose148 calibration is admissible and its unverified contacts are not explicit crossings', () => {
  const camera = { projection: 'orthographic', ...pose148.cameraInitialGuess, rollRadians: 0 };
  const world = Object.fromEntries(pose148.visiblePolylines.map((pl) => [pl.id, pl.points.map((uv) => {
    const a = (uv[0] - camera.originPixel[0]) / camera.pixelsPerMetre;
    const b = (uv[1] - camera.originPixel[1]) / camera.pixelsPerMetre;
    return [a, 0, -b];
  })]));
  const fit = fitPoseCamera(world, pose148);
  assert.equal(fit.scale.status, 'PASS');
  assert.ok(Math.abs(fit.camera.pixelsPerMetre - camera.pixelsPerMetre) < 1e-3);
  const score = scorePose(world, pose148, fit.camera, { points: [], labels: [], materialArc: [] });
  assert.equal(score.crossingPose.status, 'UNVERIFIED');
  assert.match(score.crossingPose.reason, /no explicit crossing/);
});

function crossingFixture(yOver, yUnder) {
  return {
    points: [
      [-0.01, yOver, 0],
      [0.01, yOver, 0],
      [0, yUnder, -0.01],
      [0, yUnder, 0.01],
    ],
    labels: ['over-role', 'link', 'under-role'],
    materialArc: [0, 1, 2, 3],
    camera: { projection: 'orthographic', pixelsPerMetre: 1000, originPixel: [0, 0], rollRadians: 0 },
  };
}

function crossingAnnotation(positionPx, bindingStatus = 'reviewed', uncertaintyPx = 4) {
  return {
    nominalVisibleRopeDiameterPx: 30,
    visiblePolylines: [{ id: 'lane', kind: 'centerline', points: [[0, 0], [1, 0]] }],
    crossings: [{
      id: 'contact',
      positionPx,
      uncertaintyPx,
      over: { role: 'over-role', materialRange: [0, 1] },
      under: { role: 'under-role', materialRange: [2, 3] },
      bindingStatus,
    }],
  };
}

test('reviewed crossings use projected segments, depth, and one rope diameter', () => {
  const good = crossingFixture(-0.02, 0.02);
  const annotation = crossingAnnotation([0, 0]);
  const before = JSON.stringify(annotation);
  const pass = evaluateCrossings({ ...good, annotation });
  assert.equal(pass.status, 'PASS');
  assert.ok(pass.crossings[0].residualPx <= 30);
  assert.equal(JSON.stringify(annotation), before);
  assert.equal(annotation.visiblePolylines.some((pl) => pl.kind === 'crossing' || pl.id === 'contact'), false);

  const depth = evaluateCrossings({ ...crossingFixture(0.02, -0.02), annotation });
  assert.equal(depth.status, 'FAIL');
  assert.match(depth.crossings[0].reason, /closer to the camera/);

  const far = crossingAnnotation([40, 0], 'reviewed', 200);
  const position = evaluateCrossings({ ...good, annotation: far });
  assert.equal(position.status, 'FAIL');
  assert.ok(position.crossings[0].residualPx > 30);
  assert.match(position.crossings[0].reason, /one rope diameter/);

  const missing = crossingAnnotation([0, 0], 'unverified');
  const unbound = evaluateCrossings({ ...good, annotation: missing });
  assert.equal(unbound.status, 'UNVERIFIED');
  assert.notEqual(unbound.status, 'PASS');
  assert.match(unbound.reason, /no explicit crossing/);

  const nameless = structuredClone(annotation);
  nameless.crossings[0].over.role = null;
  assert.notEqual(evaluateCrossings({ ...good, annotation: nameless }).status, 'PASS');
});

function lengthOptions(extra = {}) {
  return { columnRadius: 0, ropeDiameterMetres: 0.006, samplingResolutionPx: 1, ...extra };
}

function straight(count, x0 = 10, x1 = 110) {
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    return [x0 + (x1 - x0) * t, -1, -50];
  });
}

const LENGTH_CAMERA = Object.freeze({
  projection: 'orthographic',
  pixelsPerMetre: 1,
  originPixel: [0, 0],
  rollRadians: 0,
});

function lengthAnnotation(extra = {}) {
  return {
    nominalVisibleRopeDiameterPx: 10,
    imageSize: [200, 200],
    visiblePolylines: [{ id: 'away', kind: 'centerline', points: [[0, 0], [0, 10]] }],
    ...extra,
  };
}

test('equivalent straight path subdivisions yield the same projected length', () => {
  const annotation = lengthAnnotation({ lockingCoreRegion: [0, 0, 200, 200] });
  const whole = unexplainedVisible(straight(2), ['rope'], { rope: { ids: [0, 1] } }, annotation, LENGTH_CAMERA, lengthOptions());
  const split = unexplainedVisible(straight(5), ['rope', 'rope', 'rope', 'rope'], { rope: { ids: [0, 1, 2, 3, 4] } }, annotation, LENGTH_CAMERA, lengthOptions());
  assert.ok(Math.abs(whole.lengthPx - 100) < 1e-6);
  assert.ok(Math.abs(split.lengthPx - whole.lengthPx) < 1e-6);
  assert.equal(whole.samplingResolutionPx, 1);
  assert.equal(whole.coreBoxExempt, false);
  assert.equal(whole.spanExempt, false);
  assert.ok(whole.lengthInsideKnownSpansPx > 99);
  const near = lengthAnnotation();
  near.visiblePolylines = [{ id: 'cross', kind: 'centerline', points: [[60, 0], [60, 100]] }];
  const once = unexplainedVisible(straight(2), ['rope'], {}, near, LENGTH_CAMERA, lengthOptions());
  const parts = unexplainedVisible(straight(5), ['rope', 'rope', 'rope', 'rope'], { all: { ids: [0, 1, 2, 3, 4] } }, near, LENGTH_CAMERA, lengthOptions());
  assert.ok(Math.abs(once.lengthPx - 80) < 0.05);
  assert.ok(Math.abs(parts.lengthPx - once.lengthPx) < 0.05);
  assert.ok(parts.lengthInsideKnownSpansPx > 70);
});

test('core box and correspondence spans do not hide extra rope; column, rope, and hand masks can', () => {
  const camera = { projection: 'orthographic', pixelsPerMetre: 1000, originPixel: [100, 100], rollRadians: 0 };
  const annotation = {
    nominalVisibleRopeDiameterPx: 10,
    imageSize: [200, 200],
    visiblePolylines: [{ id: 'away', points: [[0, 0], [0, 10]] }],
    lockingCoreRegion: [0, 0, 200, 200],
  };
  const front = [[-0.01, -0.05, 0], [0.01, -0.05, 0]];
  const behind = [[-0.01, 0.05, 0], [0.01, 0.05, 0]];
  const spans = { core: { ids: [0, 1] } };
  const visible = unexplainedVisible(front, ['extra'], spans, annotation, camera, { columnRadius: 0.0275, ropeDiameterMetres: 0.006 });
  assert.ok(Math.abs(visible.lengthPx - 20) < 1e-6);
  assert.ok(visible.lengthInsideKnownSpansPx > 19);
  const hidden = unexplainedVisible(behind, ['extra'], spans, annotation, camera, { columnRadius: 0.0275, ropeDiameterMetres: 0.006 });
  assert.ok(hidden.lengthPx < 1e-6);
  const masked = {
    ...annotation,
    handMasks: [{ id: 'glove', polygon: [[90, 90], [100, 90], [100, 110], [90, 110]] }],
  };
  const gloved = unexplainedVisible(front, ['extra'], {}, masked, camera, { columnRadius: 0, ropeDiameterMetres: 0.006 });
  assert.ok(Math.abs(gloved.lengthPx - 10) < 0.05);
  const pair = [
    [-0.01, -0.05, 0],
    [0.01, -0.05, 0],
    [2, -0.05, 2],
    [-0.01, 0.05, 0],
    [0.01, 0.05, 0],
  ];
  const occluded = unexplainedVisible(pair, ['front', 'bridge', 'approach', 'rear'], {}, annotation, camera, {
    columnRadius: 0,
    ropeDiameterMetres: 0.006,
    materialArc: [0, 0.02, 1, 1.02, 1.04],
  });
  assert.ok(Math.abs(occluded.lengthByRole.front - 20) < 0.05);
  assert.ok((occluded.lengthByRole.rear ?? 0) < 1e-6);
});

test('static reconstruction, motion, and construction stay separate', () => {
  const open = evaluateAcceptance(legacyInput());
  assert.equal(open.status, 'PASS');
  assert.notEqual(open.staticReconstruction.status, 'PASS');
  assert.equal(open.staticReconstruction.scale.status, 'UNCALIBRATED');
  assert.notEqual(open.motionContinuity.status, 'PASS');
  assert.equal(open.motionContinuity.endpointAgreementIsPass, false);
  assert.deepEqual(open.constructionCorrespondence.claims, []);
  assert.equal(open.constructionCorrespondence.fabricatesSourceClaims, false);

  const claim = { source: 'docs/somerville-dressed-core-ledger.md', statement: 'Caller-supplied reviewed record.' };
  const dressed = {
    ...legacyInput(),
    unexplainedVisible: { count: 9, lengthPx: 0, samplingResolutionPx: 1 },
    scale: { status: 'PASS', unconstrainedPixelsPerMetre: 5000, constrainedPixelsPerMetre: 5000, minPixelsPerMetre: 4250, maxPixelsPerMetre: 5750, diameterMetres: 0.006 },
    construction: { reviewed: true, status: 'PASS', claims: [claim] },
    motion: { status: 'PASS', verified: true, basis: 'endpoints', samples: [{ t: 0 }, { t: 1 }] },
  };
  const staticOnly = evaluateAcceptance(dressed);
  assert.equal(staticOnly.status, 'PASS');
  assert.equal(staticOnly.staticReconstruction.status, 'PASS');
  assert.notEqual(staticOnly.motionContinuity.status, 'PASS');
  assert.deepEqual(staticOnly.constructionCorrespondence.claims, [claim]);

  const forged = evaluateAcceptance({
    ...dressed,
    scale: { status: 'PASS', unconstrainedPixelsPerMetre: 1000, constrainedPixelsPerMetre: 1000, minPixelsPerMetre: 4250, maxPixelsPerMetre: 5750, diameterMetres: 0.006 },
  });
  assert.equal(forged.staticReconstruction.status, 'FAIL');

  const extra = evaluateAcceptance({ ...dressed, unexplainedVisible: { count: 0, lengthPx: 40, samplingResolutionPx: 1 } });
  assert.equal(extra.status, 'FAIL');
  assert.equal(extra.checks.noUnexplainedVisibleRope, false);
  assert.equal(extra.staticReconstruction.status, 'FAIL');

  const sweep = evaluateAcceptance({
    ...dressed,
    lineage: { ...dressed.lineage, continuousMotion: 'UNVERIFIED' },
    motion: { status: 'PASS', verified: true, basis: 'continuous-sweep', samples: [{ t: 0 }, { t: 0.5 }, { t: 1 }] },
  });
  assert.equal(sweep.motionContinuity.status, 'PASS');
  assert.equal(sweep.status, 'FAIL');
  assert.equal(sweep.staticReconstruction.status, 'PASS');
  assert.equal(sweep.scope.motionContinuity.endpointAgreementIsPass, false);
  assert.equal(sweep.scope.constructionCorrespondence.fabricatesSourceClaims, false);
});

test('dressed evaluator keeps an independent candidate report and does not treat it as a finished knot', () => {
  const directory = mkdtempSync(join(tmpdir(), 'somerville-dressed-'));
  const candidatePath = join(directory, 'dressed-candidate.json');
  const seedPath = join(directory, 'seed.json');
  const reportPath = join(directory, 'report.json');
  const metadataPath = join(directory, 'metadata.json');
  const candidate = {
    schemaVersion: 1,
    units: 'm',
    coordinateSystem: 'right-handed Z-up',
    ropes: [{
      id: 'somerville',
      diameter: 0.006,
      points: [[0, 0, 0], [0, 0, 1], [0, 0, 2]],
      segmentLabels: ['tail/0', 'tail/0', 'tail/0'],
    }],
    somerville: {
      material: { s0: [0, 1, 3], referenceId: 'static-seed-test' },
      materialArc: [0, 1, 3],
      column: { axis: 'X', radius: 0.0275, center: [0, 0, 0] },
      motion: { status: 'PASS', verified: true, basis: 'endpoints', samples: [{}, {}] },
      lineage: { continuousMotion: 'PASS' },
    },
  };
  writeFileSync(candidatePath, JSON.stringify(candidate));
  writeFileSync(seedPath, JSON.stringify({
    ropes: [{ id: 'seed', diameter: 0.006, points: [[0, 0, 0], [1, 0, 0]] }],
    somerville: { material: { s0: [0, 9], referenceId: 'different-count' }, materialArc: [0, 9] },
  }));
  const beforeCandidate = readFileSync(candidatePath);
  const finalPath = 'data/somerville-final/final.json';
  const beforeFinal = createHash('sha256').update(readFileSync(finalPath)).digest('hex');
  const report = evaluateSomervilleDressed({
    candidatePath,
    seedPaths: [seedPath],
    reportPath,
    metadataPath,
    generatorReportPath: join(directory, 'missing-build.json'),
  });
  assert.equal(report.finishedKnot, false);
  assert.match(report.designation, /candidate/);
  assert.equal(report.v2PointCountAssumed, false);
  assert.equal(report.materialPolicy.v2PointCountAssumed, false);
  assert.equal(report.materialPolicy.source, 'candidate.somerville.material.s0');
  assert.equal(report.materialPolicy.candidatePointCount, 3);
  assert.equal(report.material.referenceLength, 3);
  assert.equal(report.material.lengthChange, -1);
  assert.notEqual(report.motionContinuity.status, 'PASS');
  assert.equal(report.lineage.continuousMotion, 'UNVERIFIED');
  assert.notEqual(report.staticReconstruction.status, 'PASS');
  assert.equal(report.historicalFinalPreserved, true);
  assert.deepEqual(readFileSync(candidatePath), beforeCandidate);
  assert.equal(createHash('sha256').update(readFileSync(finalPath)).digest('hex'), beforeFinal);
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  assert.equal(metadata.finishedKnot, false);
  assert.equal(metadata.v2PointCountAssumed, false);
  assert.equal(metadata.overwroteHistoricalFinal, false);
  assert.equal(metadata.generatorClaimAccepted, false);
  assert.ok(statSync(reportPath).size > 0);

  const barePath = join(directory, 'bare.json');
  writeFileSync(barePath, JSON.stringify({
    ...candidate,
    somerville: { column: candidate.somerville.column },
  }));
  const bare = evaluateSomervilleDressed({
    candidatePath: barePath,
    seedPaths: [seedPath],
    reportPath: join(directory, 'bare-report.json'),
    metadataPath: join(directory, 'bare-metadata.json'),
  });
  assert.equal(bare.material, null);
  assert.equal(bare.materialPolicy.v2PointCountAssumed, false);
  assert.notEqual(bare.materialPolicy.seedPointCount, bare.materialPolicy.candidatePointCount);

  writeFileSync(reportPath, JSON.stringify({ pose: { rmsPx: 4, status: 'FAIL' } }));
  const retained = evaluateSomervilleDressed({
    candidatePath: join(directory, 'absent.json'),
    reportPath,
    metadataPath,
  });
  assert.equal(retained.finishedKnot, false);
  assert.equal(retained.bestResidual.source, 'none');
  assert.equal(retained.bestResidual.rmsPx, null);
  assert.equal(preferResidual({ rmsPx: 4 }, { rmsPx: 2.5 }).source, 'current-candidate');
  assert.throws(() => evaluateSomervilleDressed({ reportPath: 'reports/somerville-final-report.json' }), /refusing to overwrite/);
});
