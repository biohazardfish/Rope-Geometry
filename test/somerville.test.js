import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSomervilleSvg, validateSomervilleReferences, validateSomervilleStructure } from '../src/somerville-topology.js';

const load = () => JSON.parse(readFileSync(new URL('../data/somerville-bowline-topology.json', import.meta.url), 'utf8'));

test('Phase 4 structure is one open rope path with one bight fold, two endpoints, two wraps, and five milestones', () => {
  const topology = load(), result = validateSomervilleStructure(topology);
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.physicalEndpointCount, 2);
  assert.equal(result.pathSegmentCount, 6);
  assert.equal(result.columnWrapCount, 2);
  assert.equal(result.cuffStrandCount, 4);
  assert.equal(result.crossingRecordCount, 2);
  assert.equal(result.crossingTraversalRecordCount, 2);
  assert.equal(result.confirmedCrossingRecordCount, 1);
  assert.equal(result.pendingCrossingRecordCount, 1);
  assert.equal(result.passageCount, 2);
  assert.equal(result.milestoneCount, 5);
  assert.equal(topology.objects.find(item => item.id === 'column').partOfRopeConnectivity, false);
});

test('Phase 4 distinguishes structural consistency from incomplete reference verification', () => {
  const topology = load(), result = validateSomervilleReferences(topology);
  assert.equal(result.evidenceCoverageValid, true);
  assert.deepEqual(result.unsupported, []);
  assert.ok(result.pendingReview.includes('X2'));
  assert.ok(result.pendingReview.includes('traversal:X1'));
  assert.ok(result.pendingReview.includes('traversal:X2'));
  assert.ok(result.pendingReview.includes('column-winding-direction'));
  assert.equal(result.topologyVerified, false);
  assert.equal(result.status, 'PARTIAL_REFERENCE_RECONSTRUCTION');
});

test('Phase 4 structural validator rejects branches, missing evidence, duplicate crossings, and wrap inconsistency', () => {
  const base = load();
  const brokenPath = structuredClone(base); brokenPath.ropePath.segments[3].from = 'tail-loop-entry';
  assert.equal(validateSomervilleStructure(brokenPath).valid, false);
  const missingEvidence = structuredClone(base); missingEvidence.relationships[0].evidence = ['missing'];
  assert.equal(validateSomervilleStructure(missingEvidence).valid, false);
  const duplicateCrossing = structuredClone(base); duplicateCrossing.crossings[1].id = 'X1';
  assert.equal(validateSomervilleStructure(duplicateCrossing).valid, false);
  const unknownCrossingSegment = structuredClone(base); unknownCrossingSegment.crossings[0].ropePortions[0].segmentIds = ['missing-segment'];
  assert.equal(validateSomervilleStructure(unknownCrossingSegment).valid, false);
  const wrongWrapCount = structuredClone(base); wrongWrapCount.columnWrapping.strandCountAtCuff = 3;
  assert.equal(validateSomervilleStructure(wrongWrapCount).valid, false);
});

test('Phase 4 diagrams are generated from shared topology IDs and expose pending relationships', () => {
  const topology = load();
  const structure = renderSomervilleSvg(topology, 'structure');
  const wraps = renderSomervilleSvg(topology, 'column-wrap');
  const path = renderSomervilleSvg(topology, 'continuous-path');
  for (const id of ['X1', 'X2', 'P1']) assert.ok(structure.includes(`>${id}<`));
  assert.match(structure, /O\/U PENDING/);
  assert.equal((wraps.match(/data-strand=/g) ?? []).length, 4);
  assert.equal((path.match(/class="diagram-route/g) ?? []).length, 6);
});
