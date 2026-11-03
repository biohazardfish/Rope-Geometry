import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSomerville, seedClearance, SOMERVILLE_PRESETS } from '../src/somerville-build.js';
import { validateOperations } from '../src/somerville-verify.js';

test('v1 keeps the original seven checks and fails the two video-route checks', () => {
  const doc = buildSomerville();
  const ops = validateOperations(doc);
  assert.equal(ops.checks.twoTurns, true);
  assert.equal(ops.checks.firstPassage, true);
  assert.equal(ops.checks.secondSameDirection, true);
  assert.equal(ops.checks.underAllFour, true);
  assert.equal(ops.checks.diagonalOverFrontCuff, false);
  assert.equal(ops.checks.underCuffDirection, false);
  const gap = seedClearance(doc);
  assert.equal(gap.penetratingPairs, 0);
  assert.ok(Math.abs(gap.minimumNonlocalGap - 0.00397905026639391) < 1e-9);
  assert.deepEqual(gap.closest.roles, ['over-root/0', 'over-root/1']);
});

test('video route passes all nine operation checks with a positive gap', () => {
  const doc = buildSomerville(SOMERVILLE_PRESETS.looseVideo);
  const ops = validateOperations(doc);
  assert.equal(ops.valid, true);
  assert.equal(ops.checks.diagonalOverFrontCuff, true);
  assert.equal(ops.checks.underCuffDirection, true);
  const gap = seedClearance(doc);
  assert.equal(gap.penetratingPairs, 0);
  assert.ok(gap.minimumNonlocalGap > 0.0002);
  assert.ok(gap.minimumColumnGap > 0.0002);
});
