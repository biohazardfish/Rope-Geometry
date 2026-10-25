import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateCoreStage,validateCore,validateUnderCuff,validateColumn,integrateCore,toLocal,toWorld} from '../src/phase5-recovery.js';
import {samplePolyline} from '../src/recovery-sampling.js';
import {detectCollisions} from '../src/geometry.js';
import {parseDocument} from '../src/schema.js';
const read=p=>JSON.parse(readFileSync(p));
const cuff=read('data/phase5-partial-cuff.json');
const moveRole=(doc,role,fn)=>{
  const indices=new Set(doc.recovery.segmentRoles.flatMap((r,i)=>r.startsWith(role+'/')?[i,i+1]:[]));
  for(const i of indices)doc.ropes[0].points[i]=toWorld(fn(toLocal(doc.ropes[0].points[i])));
};
test('Recovery: all four local stages pass original collision policy and column checks in sequence',()=>{
  for(let stage=1;stage<=4;stage++){
    const d=generateCoreStage(stage),r=validateCore(d);
    assert.deepEqual(d,generateCoreStage(stage));
    assert.equal(r.continuity,true);assert.equal(r.selfPenetrations,0);assert.equal(r.excludedAdjacentPairs,r.segments-1);
    assert.equal(r.status,'LOCAL_FIXTURE_VALID_TOPOLOGY_UNVERIFIED');
    assert.equal(validateColumn(d).penetrations.length,0);
    if(stage>=3)assert.equal(validateUnderCuff(d,cuff).satisfied,true);
    assert.equal(parseDocument(JSON.stringify(d)).ropes[0].points.length,d.ropes[0].points.length);
    assert.equal(r.phase5Accepted,false);
  }
});
test('Recovery: geometrically reversed return and lowered over-X are rejected',()=>{
  const d=generateCoreStage(4);moveRole(d,'return-passage',([x,y,z])=>[x,y,-z]);
  assert.equal(validateCore(d).constraints.find(c=>c.id==='same-direction-return').satisfied,false);
  const e=generateCoreStage(4);moveRole(e,'over-X',([x,y,z])=>[x,y,-.12]);
  assert.equal(validateCore(e).constraints.find(c=>c.id==='over-X').satisfied,false);
});
test('Recovery: shallow underpass fails actual capsule distance despite positive projected surface gap',()=>{
  const d=generateCoreStage(3);moveRole(d,'under-cuff',([x,y,z])=>[x,y,z+.007]);
  const r=validateUnderCuff(d,cuff);
  assert.equal(r.crossings.length,8);assert.ok(r.crossings.every(c=>c.depthDifference<-.01));
  assert.equal(r.satisfied,false);assert.ok(r.minimumGap<-.001);
});
test('Recovery: material order and invalid predecessor gate cannot be bypassed',()=>{
  const d=generateCoreStage(4);
  d.recovery.segmentRoles=d.recovery.segmentRoles.map(r=>r.startsWith('first-passage/')?r.replace('first-passage','return-passage'):r.startsWith('return-passage/')?r.replace('return-passage','first-passage'):r);
  assert.equal(validateCore(d).constraints.find(c=>c.id==='material-operation-order').satisfied,false);
  assert.throws(()=>integrateCore(d,cuff),/gates/);
  assert.throws(()=>integrateCore(generateCoreStage(2),cuff),/gates/);
});
test('Recovery: integration keeps all cuff arcs exact and explicitly fails global clearance',()=>{
  const d=integrateCore(generateCoreStage(4),cuff),p=d.ropes[0].points;
  assert.equal(d.recovery.arcProvenance.length,144);
  for(const {segment,originalSegment} of d.recovery.arcProvenance){assert.deepEqual(p[segment],cuff.ropes[0].points[originalSegment]);assert.deepEqual(p[segment+1],cuff.ropes[0].points[originalSegment+1]);}
  const r=validateCore(d);assert.equal(r.continuity,true);assert.equal(r.status,'GEOMETRY_FAILED');assert.equal(r.selfPenetrations,74);assert.equal(r.phase5Accepted,false);
  assert.equal(validateColumn(d).penetrations.length,0);
  assert.equal(validateUnderCuff(d,cuff).satisfied,true);
});
test('Recovery: subdivision cannot erase the original 36 collisions or hide newly exposed local overlaps',()=>{
  const d=read('data/phase5-candidate-A.json'),before=JSON.stringify(d),s=samplePolyline(d.ropes[0],[1,2,4]);
  assert.equal(detectCollisions(d.ropes).collisions.filter(c=>c.state==='penetrating').length,36);
  for(const r of s){assert.equal(r.penetratingOriginalNonadjacentPairs,36);assert.ok(r.maximumOriginalPairDistanceErrorM<1e-12);}
  assert.ok(s[2].rawPenetratingPairs>s[0].rawPenetratingPairs);
  assert.equal(JSON.stringify(d),before);
  const straight={diameter:.01,points:[[0,0,0],[.02,0,0],[.04,0,0],[.06,0,0]]};
  const [a,b]=samplePolyline(straight,[1,4]);assert.equal(a.rawPenetratingPairs,0);assert.ok(b.rawPenetratingPairs>0);assert.equal(b.penetratingOriginalNonadjacentPairs,0);
});
test('Recovery: original candidate, partial cuff, evidence and engine remain byte-identical',()=>{
  const baseline=read('reports/phase5-recovery/baseline.json');
  for(const [path,hash] of Object.entries(baseline.hashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,path);
});
