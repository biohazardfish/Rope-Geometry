import test from 'node:test';
import assert from 'node:assert/strict';
import { closestSegments, detectCollisions } from '../src/geometry.js';
import { parseDocument, serializeDocument, evaluateAt, sampleAnimation } from '../src/schema.js';
import { readFileSync } from 'node:fs';
import { generateCrossing, validateGeneratedCrossing, generateConstrainedRope, validateTopologyGeometry, validateCrossingConstraints, validateConstrainedGeometry } from '../src/topology.js';
const read = name => parseDocument(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const near = (a,b,tol=1e-9) => assert.ok(Math.abs(a-b)<=tol+1e-9*Math.max(Math.abs(a),Math.abs(b)), `${a} != ${b}`);
test('A: parallel separated, penetrating, and tangent capsules', () => {
  for (const [y,state,gap] of [[.012,'separated',.002],[.008,'penetrating',-.002],[.01,'contact',0]]) {
    const report=detectCollisions([{id:'a',diameter:.01,points:[[-.05,0,0],[.05,0,0]]},{id:'b',diameter:.01,points:[[-.05,y,0],[.05,y,0]]}]);
    if(state==='separated') assert.equal(report.collisions.length,0); else { assert.equal(report.collisions[0].state,state); near(report.collisions[0].gap,gap); }
  }
});
test('segment distance handles intersecting, skew, endpoints, parallel and degenerate segments',()=>{
  near(closestSegments([0,0,0],[1,0,0],[.5,-1,0],[.5,1,0]).distance,0);
  near(closestSegments([0,0,0],[1,0,0],[.5,-1,1],[.5,1,1]).distance,1);
  near(closestSegments([0,0,0],[1,0,0],[2,1,0],[2,-1,0]).distance,1);
  near(closestSegments([0,0,0],[1,0,0],[0,2,0],[1,2,0]).distance,2);
  near(closestSegments([0,0,0],[0,0,0],[1,0,0],[1,0,0]).distance,1);
  near(closestSegments([0,0,0],[0,0,0],[-1,2,0],[1,2,0]).distance,2);
  near(closestSegments([0,0,0],[1,0,0],[0,1e-10,0],[1,1e-10,0]).distance,1e-10);
  near(closestSegments([0,0,0],[2,0,0],[1,0,0],[3,0,0]).distance,0);
  near(closestSegments([0,0,0],[1,0,0],[2,1,0],[3,1,0]).distance,Math.sqrt(2));
});
test('B: distant self-crossing detected; neighboring topology excluded only',()=>{
  const d=read('B.json'),r=detectCollisions(d.ropes);
  const hit=r.collisions.find(x=>x.segmentA==='B:0'&&x.segmentB==='B:2');
  assert.ok(hit); near(hit.distance,0); near(hit.penetration,.01);
  assert.equal(r.excluded.length,2);
  const clear=detectCollisions(read('B-clear.json').ropes);
  assert.equal(clear.collisions.length,0);
  near(closestSegments([-0.05,-0.05,0],[0.05,0.05,0],[-0.05,0.05,.03],[.05,-.05,.03]).distance,.03);
  const separateRopes=detectCollisions([{id:'x',diameter:.01,points:[[0,0,0],[1,0,0]]},{id:'y',diameter:.01,points:[[1,0,0],[0,0,0]]}]);
  assert.equal(separateRopes.excluded.length,0);
});
test('C: fixed temporal samples find mid-animation collision; endpoints miss it',()=>{
  const d=read('C.json'), samples=sampleAnimation(d,16);
  assert.equal(detectCollisions(evaluateAt(d,0)).collisions.length,0);
  assert.equal(detectCollisions(evaluateAt(d,1)).collisions.length,0);
  const penetrating=samples.filter(s=>s.collisions.some(c=>c.state==='penetrating'));
  assert.ok(penetrating.length>0);
  const max=penetrating.flatMap(s=>s.collisions.map(c=>({time:s.time,depth:c.penetration}))).sort((a,b)=>b.depth-a.depth)[0];
  near(max.time,.375); near(max.depth,.0075);
  near(detectCollisions(evaluateAt(d,.4)).collisions[0].penetration,.01);
});
test('JSON round trip, strict validation, no input mutation, pair symmetry',()=>{
  const d=read('C.json'), before=JSON.stringify(d); parseDocument(serializeDocument(d)); assert.equal(JSON.stringify(d),before);
  assert.throws(()=>parseDocument('{"schemaVersion":1}'));
  const x=closestSegments([0,0,0],[1,0,0],[.5,-1,1],[.5,1,1]);
  const y=closestSegments([.5,-1,1],[.5,1,1],[0,0,0],[1,0,0]); near(x.distance,y.distance);
  for(const shift of [[3,-2,7],[-4,1,.5]]) {
    const shifted=p=>p.map((v,i)=>v+shift[i]);
    near(closestSegments(shifted([0,0,0]),shifted([1,0,0]),shifted([.5,-1,1]),shifted([.5,1,1])).distance,x.distance);
  }
});
test('unequal radii and epsilon contact band are explicit',()=>{
  const rope=(id,y,d)=>({id,diameter:d,points:[[0,y,0],[1,y,0]]});
  const touching=detectCollisions([rope('a',0,.004),rope('b',.003,.002)]).collisions[0];
  assert.equal(touching.state,'contact'); near(touching.penetration,0);
  for(const offset of [-.5e-9,.5e-9]) assert.equal(detectCollisions([rope('a',0,.01),rope('b',.01+offset,.01)]).collisions[0].state,'contact');
});
test('Phase 2 generator is deterministic; valid and negative control are distinguished',()=>{
  const topology=JSON.parse(readFileSync(new URL('../data/crossing-topology.json',import.meta.url),'utf8'));
  const valid=generateCrossing(topology),repeat=generateCrossing(topology),invalid=generateCrossing(topology,{lift:.004});
  assert.equal(JSON.stringify(valid),JSON.stringify(repeat));
  const pass=validateGeneratedCrossing(valid,topology),fail=validateGeneratedCrossing(invalid,topology);
  assert.equal(pass.projectedCrossingCount,1);assert.equal(pass.valid,true);assert.equal(pass.penetrationCount,0);assert.equal(pass.overUnderPreserved,true);
  assert.ok(pass.crossingCenterlineSeparation>=.012);assert.ok(pass.clearance>=.002);
  assert.equal(fail.projectedCrossingCount,1);assert.equal(fail.valid,false);assert.ok(fail.penetrationCount>0);assert.ok(fail.failures.length>0);
});
test('Phase 3: multiple interacting crossing constraints, alternate assignment, and collision control',()=>{
  const topology=JSON.parse(readFileSync(new URL('../data/multiple-crossings-topology.json',import.meta.url),'utf8'));
  const alternate={...topology,crossings:topology.crossings.map((c,i)=>i===1?{...c,over:'B'}:{...c})};
  const a=generateConstrainedRope(topology),b=generateConstrainedRope(alternate),bad=generateConstrainedRope(topology,{liftScale:.22});
  const ta=validateTopologyGeometry(a,topology),tb=validateTopologyGeometry(b,alternate);
  const ca=validateCrossingConstraints(a,topology),cb=validateCrossingConstraints(b,alternate);
  const va=validateConstrainedGeometry(a,topology),vb=validateConstrainedGeometry(b,alternate),negative=validateConstrainedGeometry(bad,topology);
  assert.equal(ta.valid,true);assert.equal(tb.valid,true);assert.equal(ta.projectedCrossingCount,2);assert.equal(ta.noUnintendedCrossings,true);
  assert.deepEqual(ta.crossingTraversalOrder,['X1-A','X2-A','X2-B','X1-B']);
  assert.ok(ta.interactingCrossingConstraints.length>0);
  assert.equal(ca.valid,true);assert.equal(cb.valid,true);assert.ok(ca.crossingMeasurements.every(x=>x.surfaceClearance>=.002));assert.ok(cb.crossingMeasurements.every(x=>x.surfaceClearance>=.002));
  assert.equal(va.valid,true);assert.equal(vb.valid,true);assert.ok(va.globalSurfaceClearance>=.002);assert.ok(vb.globalSurfaceClearance>=.002);
  assert.notDeepEqual(a.ropes[0].points,b.ropes[0].points);
  assert.equal(negative.valid,false);assert.ok(negative.penetrationCount>0);assert.ok(negative.failures.length>0);
});
