import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditSomervilleReadiness } from '../src/gauss-evidence.js';

const fixture=(name)=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));

test('Somerville Phase 4B cannot be promoted to a verified final Gauss diagram',()=>{
  const audit=auditSomervilleReadiness(
    fixture('somerville-bowline-topology-v2.json'),
    fixture('somerville-gauss-review.json')
  );
  assert.equal(audit.ready,false);
  assert.equal(audit.gaussExportable,false);
  assert.equal(audit.finalFragmentCount,8);
  assert.equal(audit.unknownConnectionGroups,4);
  assert.deepEqual(audit.constructionCrossingsExcluded,['D8-X01','D8-X02']);
  assert.match(audit.problems.join(';'),/material path/);
  assert.match(audit.problems.join(';'),/winding/);
});

test('setting candidate complete alone cannot bypass unresolved source evidence',()=>{
  const source=fixture('somerville-bowline-topology-v2.json');
  const candidate=fixture('somerville-gauss-review.json');
  candidate.status='SOURCE_VERIFIED';
  candidate.materialPath.complete=true;
  candidate.crossingInventoryComplete=true;
  assert.equal(auditSomervilleReadiness(source,candidate).ready,false);
});
