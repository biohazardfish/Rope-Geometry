import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGaussReview, toKnotoIdExtendedGauss, toKnotoIdXyz } from '../src/extended-gauss.js';

const referenceExample = () => ({
  schemaVersion: 1,
  projection: 'sphere',
  status: 'SOURCE_VERIFIED',
  materialPath: { from: 'E0', to: 'E1', complete: true },
  crossingInventoryComplete: true,
  // Mathematical test fixture from Knoto-ID's documentation; NOT Somerville.
  crossings: ['X1','X2','X3'].map(id => ({
    id, writhe: -1, status: 'SOURCE_VERIFIED', evidenceIds: ['mathematical-fixture']
  })),
  visits: [['X1','under'],['X2','over'],['X3','under'],
           ['X1','over'],['X2','under'],['X3','over']]
    .map(([crossingId, side]) => ({ crossingId, side }))
});

test('Knoto-ID reference Gauss example is serialized exactly', () => {
  const review = referenceExample();
  assert.equal(inspectGaussReview(review).exportable, true);
  assert.equal(toKnotoIdExtendedGauss(review), '-1 2 -3 1 -2 3 ---\n');
});

test('crossings are numbered in material-path first encounter order', () => {
  const review = referenceExample();
  review.crossings.reverse();
  assert.equal(toKnotoIdExtendedGauss(review), '-1 2 -3 1 -2 3 ---\n');
});

test('incomplete topology may be well-formed but must never export', () => {
  const review = referenceExample();
  review.status = 'PENDING_REVIEW';
  review.materialPath.complete = false;
  review.crossingInventoryComplete = false;
  assert.equal(inspectGaussReview(review).valid, true);
  assert.equal(inspectGaussReview(review).exportable, false);
  assert.throws(() => toKnotoIdExtendedGauss(review), /blocked/);
});

test('unverified crossing cannot export even with complete material path', () => {
  const review = referenceExample();
  review.crossings[0].writhe = null;
  review.crossings[0].status = 'PENDING_REVIEW';
  assert.equal(inspectGaussReview(review).exportable, false);
});

test('incorrect visits are rejected', () => {
  const review = referenceExample();
  review.visits[5].side = 'under';
  assert.equal(inspectGaussReview(review).valid, false);
  assert.throws(() => toKnotoIdExtendedGauss(review));
});

test('unknown crossing references are rejected', () => {
  const review = referenceExample();
  review.visits[0].crossingId = 'missing';
  assert.equal(inspectGaussReview(review).valid, false);
});

test('empty_diagram is only exportable after explicit full review', () => {
  const review = referenceExample();
  review.visits = [];
  review.crossings = [];
  assert.equal(toKnotoIdExtendedGauss(review), 'empty_diagram\n');
  review.crossingInventoryComplete = false;
  assert.throws(() => toKnotoIdExtendedGauss(review));
});

test('xyz conversion preserves ordered centerline without claiming knot validity', () => {
  const metric = {units: 'm', ropes: [{points: [[0,0,0], [0.001,0.002,0.003]]}]};
  assert.equal(toKnotoIdXyz(metric), '0 0 0\n0.001 0.002 0.003\n');
  assert.throws(() => toKnotoIdXyz({...metric, units: 'mm'}));
});
