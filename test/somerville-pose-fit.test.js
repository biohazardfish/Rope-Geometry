import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fitPoseCamera, projectPoint, scorePose } from '../src/somerville-pose-fit.js';

const pose148 = JSON.parse(readFileSync(new URL('../data/somerville-pose148.json', import.meta.url), 'utf8'));

const KNOWN_CAMERA = Object.freeze({
  projection: 'orthographic',
  pixelsPerMetre: 4800,
  originPixel: [420, 510],
  rollRadians: 0.12,
});

function buildSyntheticAnnotation(worldByTargetId, camera) {
  return {
    nominalVisibleRopeDiameterPx: 30,
    acceptance: { visibleCenterlineRmsInDiameters: 0.2 },
    visiblePolylines: Object.entries(worldByTargetId).map(([id, poly]) => ({
      id,
      kind: 'centerline',
      points: poly.map((p) => projectPoint(p, camera)),
    })),
  };
}

const SYNTH_WORLD = Object.freeze({
  'lane-a': [
    [0, 0, 0],
    [0.012, 0, 0.004],
    [0.018, 0, 0.018],
    [0.02, 0, 0.04],
  ],
  'lane-b': [
    [0.03, 0, 0],
    [0.035, 0, 0.012],
    [0.042, 0, 0.022],
    [0.05, 0, 0.03],
  ],
});

test('projectPoint rejects invalid coordinates and camera', () => {
  assert.throws(() => projectPoint([0, 0, NaN], KNOWN_CAMERA), /finite/);
  assert.throws(() => projectPoint([0, 0, 0], { ...KNOWN_CAMERA, pixelsPerMetre: 0 }), /positive/);
  assert.throws(() => projectPoint([0, 0, 0], { ...KNOWN_CAMERA, projection: 'perspective' }), /orthographic/);
});

test('known similarity fit recovers orthographic camera', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  const { camera } = fitPoseCamera(structuredClone(SYNTH_WORLD), annotation);
  assert.ok(Math.abs(camera.pixelsPerMetre - KNOWN_CAMERA.pixelsPerMetre) < 0.5);
  assert.ok(Math.abs(camera.rollRadians - KNOWN_CAMERA.rollRadians) < 1e-4);
  assert.ok(Math.hypot(camera.originPixel[0] - KNOWN_CAMERA.originPixel[0], camera.originPixel[1] - KNOWN_CAMERA.originPixel[1]) < 0.5);
  const sample = projectPoint([0.015, 0.2, 0.03], camera);
  const expected = projectPoint([0.015, 0.2, 0.03], KNOWN_CAMERA);
  assert.ok(Math.hypot(sample[0] - expected[0], sample[1] - expected[1]) < 0.05);
});

test('pose fit uses projected arc lengths despite large changes in depth', () => {
  const world = structuredClone(SYNTH_WORLD);
  world['lane-a'][1][1] = 0.3;
  world['lane-b'][2][1] = -0.5;
  const annotation = buildSyntheticAnnotation(world, KNOWN_CAMERA);
  const {camera} = fitPoseCamera(world, annotation);
  assert.ok(Math.abs(camera.pixelsPerMetre - 4800) < 1e-8);
  assert.ok(Math.abs(camera.rollRadians - .12) < 1e-10);
});

test('scorePose fails translated geometry with fixed camera', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  const shifted = Object.fromEntries(
    Object.entries(SYNTH_WORLD).map(([id, poly]) => [
      id,
      poly.map(([x, y, z]) => [x + 0.05, y, z + 0.04]),
    ]),
  );
  const score = scorePose(shifted, annotation, KNOWN_CAMERA);
  assert.equal(score.status, 'FAIL');
  assert.ok(score.rmsPx > pose148.nominalVisibleRopeDiameterPx);
});

test('scorePose fails wrong scale with fixed camera', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  const scaled = Object.fromEntries(
    Object.entries(SYNTH_WORLD).map(([id, poly]) => [id, poly.map(([x, y, z]) => [x * 1.4, y, z * 1.4])]),
  );
  const score = scorePose(scaled, annotation, KNOWN_CAMERA);
  assert.equal(score.status, 'FAIL');
  assert.ok(score.rmsInDiameters > 0.2);
});

test('missing explicit target yields UNVERIFIED, not silent skip', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  const partial = { 'lane-a': SYNTH_WORLD['lane-a'] };
  const score = scorePose(partial, annotation, KNOWN_CAMERA);
  assert.equal(score.status, 'UNVERIFIED');
  assert.equal(score.allRequiredRolesPresent, false);
  assert.equal(score.perRole['lane-b'].status, 'UNVERIFIED');
  assert.match(score.perRole['lane-b'].reason, /missing world span/);
});

test('extra or misordered world spans are rejected', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  assert.throws(
    () => fitPoseCamera({ ...SYNTH_WORLD, orphan: SYNTH_WORLD['lane-a'] }, annotation),
    /unexpected target "orphan"/,
  );
  const permuted = {
    'lane-a': [SYNTH_WORLD['lane-a'][0], SYNTH_WORLD['lane-a'][2], SYNTH_WORLD['lane-a'][1], SYNTH_WORLD['lane-a'][3]],
    'lane-b': SYNTH_WORLD['lane-b'],
  };
  const score = scorePose(permuted, annotation, KNOWN_CAMERA);
  assert.equal(score.status, 'FAIL');
  assert.equal(score.perRole['lane-a'].status, 'FAIL');
  assert.ok(score.perRole['lane-a'].rmsPx > 5);
});

test('fit and score are deterministic and do not mutate inputs', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  const world = structuredClone(SYNTH_WORLD);
  const ann = structuredClone(annotation);
  const beforeWorld = JSON.stringify(world);
  const beforeAnn = JSON.stringify(ann);
  const fitA = fitPoseCamera(world, ann);
  const fitB = fitPoseCamera(world, ann);
  assert.deepEqual(fitA, fitB);
  const scoreA = scorePose(world, ann, fitA.camera);
  const scoreB = scorePose(world, ann, fitA.camera);
  assert.deepEqual(scoreA, scoreB);
  assert.equal(JSON.stringify(world), beforeWorld);
  assert.equal(JSON.stringify(ann), beforeAnn);
});

test('fitPoseCamera fails closed on missing explicit span', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  assert.throws(
    () => fitPoseCamera({ 'lane-a': SYNTH_WORLD['lane-a'] }, annotation),
    /missing world span for annotation target "lane-b"/,
  );
});

test('matched synthetic world and annotation score PASS', () => {
  const annotation = buildSyntheticAnnotation(SYNTH_WORLD, KNOWN_CAMERA);
  const { camera } = fitPoseCamera(SYNTH_WORLD, annotation);
  const score = scorePose(SYNTH_WORLD, annotation, camera);
  assert.equal(score.status, 'PASS');
  assert.equal(score.centerlinePose.status, 'PASS');
  assert.equal(score.crossingPose.status, 'UNVERIFIED');
});

test('pose148 annotation reports centerline scoring and UNVERIFIED crossings', () => {
  const camera = {
    projection: 'orthographic',
    ...pose148.cameraInitialGuess,
    rollRadians: 0,
  };
  const missing = scorePose({}, pose148, camera);
  assert.equal(missing.status, 'UNVERIFIED');
  assert.equal(missing.crossingPose.status, 'UNVERIFIED');
  assert.match(missing.crossingPose.reason, /no explicit crossing/);
  assert.equal(missing.centerlinePose.status, 'UNVERIFIED');
});
