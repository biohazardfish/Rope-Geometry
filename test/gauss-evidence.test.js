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

test('fabricated nonempty path and all approval flags cannot bypass the actual graph',()=>{
  const source=fixture('somerville-bowline-topology-v2.json');
  const candidate=fixture('somerville-gauss-review.json');
  const final=source.states.find(s=>s.id==='FINAL');
  final.orderedMaterialPath=['fabricated']; final.crossingInventoryComplete=true;
  source.review.completeMaterialPathSupported=true; source.review.humanApproved=true;
  source.column.status='SUPPORTED'; source.column.materialWindingSign=1; source.unknownConnections=[];
  candidate.status='SOURCE_VERIFIED'; candidate.materialPath.complete=true; candidate.crossingInventoryComplete=true;
  const audit=auditSomervilleReadiness(source,candidate);
  assert.equal(audit.ready,false); assert.match(audit.problems.join(';'),/graph/);
});

test('malformed source and review fail closed rather than throwing',()=>{
  for(const source of [null,{}, {states:{},crossings:{}}])
    for(const candidate of [null,{}, {crossings:[null],visits:[]}])
      assert.equal(auditSomervilleReadiness(source,candidate).ready,false);
});

// Purely synthetic complete ledger; never written to authoritative data.
function syntheticComplete() {
  const source=fixture('somerville-bowline-topology-v2.json');
  const final=source.states.find(s=>s.id==='FINAL');
  const ids=['E0','a','fold','b','E1'];
  final.nodes=ids.map((id,i)=>({id,kind:i===0||i===4?'physical-end':id==='fold'?'fold':'join'}));
  final.segments=final.segments.slice(0,4).map((s,i)=>({...s,fromNode:ids[i],toNode:ids[i+1],materialOrdinal:i}));
  final.orderedMaterialPath=final.segments.map(s=>s.id);final.crossingInventoryComplete=true;
  source.column.status='SUPPORTED';source.column.materialWindingSign=1;source.unknownConnections=[];
  source.claims.forEach(c=>c.status='SUPPORTED');
  Object.assign(source.review,{decision:'SUPPORTED',humanApproved:true,completeMaterialPathSupported:true,sourceEquivalenceSupported:true});
  source.crossings.push({id:'SYNTHETIC-X',stateId:'FINAL',projectionId:final.projectionId,status:'OBSERVED',participants:['C1','C3'],over:'C1',under:'C3',writhe:1,evidence:['duchy-detail-24'],point:[0,0],visits:[{segmentId:'C1',overUnder:'over',localOrder:1,materialOrdinal:0},{segmentId:'C3',overUnder:'under',localOrder:1,materialOrdinal:1}]});
  const candidate={schemaVersion:1,projection:'sphere',status:'SOURCE_VERIFIED',materialPath:{from:'E0',to:'E1',complete:true},crossingInventoryComplete:true,crossings:[{id:'SYNTHETIC-X',status:'SOURCE_VERIFIED',writhe:1,evidenceIds:['duchy-detail-24']}],visits:[{crossingId:'SYNTHETIC-X',side:'over'},{crossingId:'SYNTHETIC-X',side:'under'}]};
  return {source,candidate};
}

test('synthetic complete source can pass the structural gate without proving source truth',()=>{
  const {source,candidate}=syntheticComplete(); const r=auditSomervilleReadiness(source,candidate);
  assert.equal(r.ready,true,JSON.stringify(r.problems));
});
test('FINAL source binding rejects changed order, writhe, evidence and construction substitution',()=>{
  for(const mutate of [
    c=>c.visits.reverse(), c=>c.crossings[0].writhe=-1,
    c=>c.crossings[0].evidenceIds=['duchy-detail-8'],
    c=>{c.crossings[0].id='D8-X01';c.visits.forEach(v=>v.crossingId='D8-X01');},
    c=>{c.crossings=[];c.visits=[];},
  ]) {
    const {source,candidate}=syntheticComplete();mutate(candidate);
    assert.equal(auditSomervilleReadiness(source,candidate).ready,false);
  }
});
