import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeAt70, makeAt70Cleared, evaluateAt70, toDocument, DISCLAIMER, QUESTION, HYPOTHESES } from '../src/at-70-model.js';
import { verifyGeometry } from '../src/verification.js';

const frontCoordinates = model => model.ordered
  .filter(point => ['front', 'diagonal', 'fold'].includes(point.role))
  .map(point => point.xyz.map(value => value.toFixed(6)).join(','))
  .sort();

test('70-second hypotheses preserve the same observable front geometry', () => {
  const baseline = frontCoordinates(makeAt70('A'));
  for (const variant of ['B', 'C']) {
    assert.deepEqual(frontCoordinates(makeAt70(variant)), baseline);
  }
});

test('each hypothesis is a finite ordered route from one end through the fold to the other', () => {
  for (const variant of ['A', 'B', 'C']) {
    const model = makeAt70(variant);
    assert.equal(model.ordered[0].limb, 0);
    assert.equal(model.ordered.at(-1).limb, 1);
    assert.equal(model.ordered.filter(point => point.role === 'fold').length, 11);
    assert.ok(model.ordered.every(point => point.xyz.length === 3 && point.xyz.every(Number.isFinite)));
    assert.equal(model.claims.collisionVerified, false);
    assert.equal(model.claims.topologyVerified, false);
  }
});

test('B exchanges after first front passage, C after second', () => {
  const x = (variant, u) => makeAt70(variant).ordered[5 + Math.round(240 * u)].xyz[0];
  assert.ok(x('B', 0.75) > x('A', 0.75));
  assert.equal(x('C', 0.75), x('A', 0.75));
  assert.ok(x('B', 1) > x('A', 1));
  assert.ok(x('C', 1) > x('A', 1));
});

const observed = model => model.ordered
  .filter(point => ['front', 'diagonal', 'fold', 'end'].includes(point.role))
  .map(point => `${point.role}:${point.xyz.map(value => value.toFixed(5)).join(',')}`)
  .sort();

test('cleared embeddings keep one ordered rope and the same front across A, B and C', () => {
  const baseline = observed(makeAt70Cleared('A'));
  for (const variant of ['A', 'B', 'C']) {
    const model = makeAt70Cleared(variant);
    assert.equal(model.ordered[0].limb, 0);
    assert.equal(model.ordered.at(-1).limb, 1);
    assert.ok(model.ordered.some(point => point.role === 'fold'));
    assert.equal(model.ordered.filter(point => /lock|underpass|slip/i.test(point.role)).length, 0);
    let longest = 0;
    for (let i = 1; i < model.ordered.length; i++) {
      longest = Math.max(longest, Math.hypot(...model.ordered[i].xyz.map((value, k) => value - model.ordered[i - 1].xyz[k])));
    }
    assert.ok(longest < 0.08);
    assert.deepEqual(observed(model), baseline);
  }
});

test('schematic routes report penetration and cleared embeddings report computed gaps', () => {
  for (const variant of ['A', 'B', 'C']) {
    const schematic = evaluateAt70(makeAt70(variant));
    const clearedModel = makeAt70Cleared(variant);
    const cleared = evaluateAt70(clearedModel);
    const direct = verifyGeometry(toDocument(clearedModel), { column: clearedModel.column });
    assert.equal(schematic.clearanceClaimed, false);
    assert.ok(schematic.selfPenetrations > 0);
    assert.ok(schematic.minimumRopeGapM < 0);
    assert.match(schematic.claim, /No clearance is claimed/);
    assert.equal(cleared.clearanceClaimed, true);
    assert.equal(cleared.selfPenetrations, 0);
    assert.equal(cleared.columnPenetrations, 0);
    assert.equal(cleared.topologyVerified, false);
    assert.equal(cleared.smoothTubeVerified, false);
    assert.equal(cleared.minimumRopeGapM, direct.minimumRopeGap);
    assert.equal(cleared.minimumColumnGapM, direct.minimumColumnGap);
    assert.match(cleared.claim, /Collision-cleared embedding/);
    assert.match(cleared.claim, new RegExp((direct.minimumRopeGap * 1000).toFixed(3)));
  }
});

test('the checkpoint states the limit and asks only about the pre-70 rear route', () => {
  assert.match(DISCLAIMER, /representative hypotheses, not exhaustive and not verified/);
  assert.equal((QUESTION.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(QUESTION, /lock|underpass|slip|gauss/i);
  assert.deepEqual(HYPOTHESES.map(item => item.id), ['A', 'B', 'C']);
  const page = readFileSync(new URL('../at-70.html', import.meta.url), 'utf8');
  assert.match(page, /REAR HYPOTHESIS A/);
  assert.match(page, /parallel limbs/);
  assert.match(page, /first rear wrap/);
  assert.match(page, /second rear wrap/);
  assert.match(page, /not exhaustive and not verified/);
  assert.match(page, /id="orbit"/);
  assert.match(page, /id="rear"/);
  assert.match(page, /id="top"/);
  assert.match(page, /duchy-video-068\.jpg/);
  assert.match(readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8'), /at-70\.html/);
});
