import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_PARAMETERS, applyEditorStep, advanceEditorStep, buildEditorFixture, certifyEditorMotion,
  extendEditorPath, finishEditorStep, gateSubstep, handleInterval, openEditorStep, samplePath,
} from '../src/rope-edit-step.js';

const inputFor = (fixture, handle) => ({
  points: fixture.points, restLengths: fixture.restLengths, pins: fixture.pins, column: fixture.column,
  diameter: fixture.diameter, handleIndices: handle.indices, parameters: fixture.parameters,
});

test('closed samples keep the spacing walk, including a short first segment', () => {
  const spacing = 0.0025;
  const path = [[0, 0, 0], [0.001, 0, 0], [0.004, 0, 0]];
  const samples = samplePath(path, spacing);
  assert.equal(samples.length, 3);
  assert.deepEqual(samples[0], [0, 0, 0]);
  assert.ok(Math.abs(samples[1][0] - spacing) < 1e-12);
  assert.deepEqual(samples[2], [0.004, 0, 0]);
});

test('gate measures pins against world coordinates before the motion check', () => {
  const fixture = buildEditorFixture();
  const pin = fixture.pins[0];
  const before = fixture.points.map((p) => [...p]);
  before[pin] = [before[pin][0] + 5e-9, before[pin][1], before[pin][2]];
  const after = before.map((p) => [...p]);
  const spec = {
    pins: fixture.pins, restLengths: fixture.restLengths, driftTolerance: EDITOR_PARAMETERS.driftTolerance,
    lengthTolerance: EDITOR_PARAMETERS.lengthTolerance, diameter: fixture.diameter, gap: EDITOR_PARAMETERS.gap,
    localArc: EDITOR_PARAMETERS.localArc, column: fixture.column, pinnedWorld: fixture.points,
  };
  assert.equal(gateSubstep(before, after, spec), 'drift');
});

test('incremental raw path matches one closed solve and every accepted frame is certified', () => {
  const fixture = buildEditorFixture();
  const handle = handleInterval(fixture.s0, fixture.pins, fixture.bightS0, fixture.diameter);
  const input = inputFor(fixture, handle);
  const origin = handle.indices.reduce((sum, i) => sum.map((v, k) => v + fixture.points[i][k]), [0, 0, 0]).map((v) => v / handle.indices.length);
  const D = fixture.through;
  const at = (distance) => origin.map((v, k) => v + D[k] * distance);
  const ctx = openEditorStep({ ...input, requestedPath: [origin] });
  extendEditorPath(ctx, at(0.001));
  extendEditorPath(ctx, at(0.0015), { tip: true });
  extendEditorPath(ctx, at(0.004));
  while (!ctx.done) {
    const step = advanceEditorStep(ctx);
    if (step.reason === 'pending' || step.done) break;
  }
  const live = finishEditorStep(ctx);
  const batch = applyEditorStep({ ...input, requestedPath: ctx.requestedPath });
  assert.equal(live.ok, true);
  assert.ok(live.accepted.length > 0);
  assert.deepEqual(live.requestedPath, batch.requestedPath);
  assert.equal(live.accepted.length, batch.accepted.length);
  for (let i = 0; i < live.accepted.length; i++) {
    assert.deepEqual(live.accepted[i].requested, batch.accepted[i].requested);
    assert.deepEqual(live.accepted[i].points, batch.accepted[i].points);
  }
  assert.deepEqual(live.points, batch.points);
  let prev = fixture.points;
  for (const step of live.accepted) {
    for (const index of fixture.pins) assert.deepEqual(step.points[index], fixture.points[index]);
    assert.equal(gateSubstep(prev, step.points, ctx.spec), null);
    assert.equal(certifyEditorMotion(prev, step.points, ctx.spec), true);
    let error = 0;
    for (let i = 0; i < fixture.restLengths.length; i++) {
      const length = Math.hypot(...step.points[i + 1].map((v, k) => v - step.points[i][k]));
      error = Math.max(error, Math.abs(length - fixture.restLengths[i]));
    }
    assert.ok(error <= EDITOR_PARAMETERS.lengthTolerance);
    prev = step.points;
  }
});
