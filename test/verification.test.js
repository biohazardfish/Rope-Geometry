import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyGeometry} from '../src/verification.js';
const doc=(points,diameter=.01)=>({schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:'r',diameter,points}]});

test('verifier rejects zero edges and malformed geometry, and reports polygonal corners',()=>{
  assert.equal(verifyGeometry(doc([[0,0,0],[0,0,0],[1,0,0]])).valid,false);
  assert.throws(()=>verifyGeometry(doc([[0,0,0],[NaN,0,0]])),/finite/);
  const r=verifyGeometry(doc([[0,0,0],[1,0,0],[1,1,0]]));
  assert.equal(r.continuity,true); assert.equal(r.smoothness.cornerCount,1);
  assert.equal(r.smoothness.smoothTubeVerified,false); assert.equal(r.topologyVerified,false);
});
test('minimum clearance includes all rope pairs and uses unequal radii',()=>{
  const d=doc([[0,0,0],[1,0,0]]);
  d.ropes.push({id:'other',diameter:.02,points:[[0,.03,0],[1,.03,0]]});
  const r=verifyGeometry(d,{clearance:.015});
  assert.equal(r.valid,true); assert.ok(Math.abs(r.minimumRopeGap-.015)<1e-12);
  assert.equal(verifyGeometry(d,{clearance:.016}).valid,false);
  d.ropes[1].points.forEach(p=>p[1]=.014);
  assert.equal(verifyGeometry(d).selfPenetrations,1);
});
test('column tests respect translated centers and all declared axes',()=>{
  for(const axis of ['X','Y','Z']) {
    const k='XYZ'.indexOf(axis),radial=(k+1)%3,center=[.5,.6,.7];
    const a=[...center],b=[...center];a[k]-=.1;b[k]+=.1;a[radial]+=.12;b[radial]+=.12;
    const d=doc([a,b]);const column={axis,center,radius:.1};
    assert.ok(Math.abs(verifyGeometry(d,{column}).minimumColumnGap-.015)<1e-12);
    a[radial]-=.02;b[radial]-=.02;
    assert.equal(verifyGeometry(d,{column}).columnPenetrations,1);
  }
  assert.throws(()=>verifyGeometry(doc([[0,0,0],[1,0,0]]),{column:{axis:'invalid',radius:1,center:[0,0,0]}}),/Column/);
});
test('near-parallel physical collision is not dropped by a parallel threshold',()=>{
  const d=doc([[0,0,0],[1,0,0]],1e-8);
  d.ropes.push({id:'q',diameter:1e-8,points:[[0,-1e-8,0],[1,1e-8,0]]});
  assert.equal(verifyGeometry(d).selfPenetrations,1);
});
test('historical failures and clear local core remain distinct under independent kernel',()=>{
  for(const [path,count] of [['phase5-candidate-A.json',36],['phase5-recovery/integrated-trial.json',74],['phase5-recovery/stage-4.json',0]]) {
    const d=JSON.parse(readFileSync(new URL('../data/'+path,import.meta.url)));
    const before=JSON.stringify(d),r=verifyGeometry(d,{column:{axis:'X',center:[0,0,0],radius:.055}});
    assert.equal(r.selfPenetrations,count);assert.equal(r.columnPenetrations,0);
    assert.equal(r.valid,count===0);assert.equal(r.topologyVerified,false);assert.equal(JSON.stringify(d),before);
  }
});

test('integration diagnosis distinguishes frozen-core collisions from interface collisions',async()=>{
  const {assessIntegratedRepair}=await import('../src/integration-repair.js');
  const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url)));
  const r=assessIntegratedRepair(read('phase5-recovery/stage-4.json'),read('phase5-partial-cuff.json'));
  assert.equal(r.localSignedConstraintsHold,true);
  assert.equal(r.obstacle.cuffRootPenetrations,21);assert.equal(r.obstacle.connectorPenetrations,53);
  assert.equal(r.whole.verificationAccepted,false);assert.equal(r.repairEmitted,false);
});
