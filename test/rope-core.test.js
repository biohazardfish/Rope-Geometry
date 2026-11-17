import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSomerville,SOMERVILLE_PRESETS} from '../src/somerville-build.js';
import {makeTube} from '../src/rope-tube.js';
import {rotationMinimizingFrames} from '../src/rope-frames.js';
import {createRopeState,withPositions,resampleMaterial,materialSample,materialResiduals,toWorld,toLocal} from '../src/rope-state.js';
import {evaluateAcceptance} from '../src/rope-acceptance.js';
import {windowSpans} from '../src/somerville-pose-targets.js';

test('shared frame extraction preserves the complete loose-v2 geometry and tube',()=>{
 const d=buildSomerville(SOMERVILLE_PRESETS.looseVideo),saved=JSON.parse(fs.readFileSync('data/somerville-final/loose-v2.json'));
 assert.deepEqual(d.ropes[0].points,saved.ropes[0].points);
 const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 assert.equal(hash(makeTube(d.ropes[0].points,.003)),hash(makeTube(saved.ropes[0].points,.003)));
});
test('reference material survives deformation and inserted samples without resetting length',()=>{
 const s=createRopeState([[0,0,0],[1,0,0],[2,0,0]],{diameter:.01});
 const moved=withPositions(s,[[0,0,0],[.5,0,0],[1,0,0]]);
 assert.deepEqual(moved.s0,[0,1,2]);assert.deepEqual(moved.geometryArc,[0,.5,1]);
 const dense=resampleMaterial(moved,[0,.5,1,1.5,2]);
 assert.deepEqual(materialSample(dense,1.5).point,materialSample(moved,1.5).point);
 assert.equal(materialResiduals(dense).lengthChange,-1);
 assert.throws(()=>resampleMaterial(s,[0,1]),/both material ends/);
});
test('rigid transforms and explicit frame normals preserve geometry',()=>{
 const f={origin:[3,4,5],axes:[[0,1,0],[0,0,1],[1,0,0]]},p=[[0,0,0],[1,0,0],[1,1,0]];
 for(const q of p)assert.deepEqual(toLocal(toWorld(q,f),f),q);
 const a=rotationMinimizingFrames(p,{initialNormal:[0,0,1]});
 const b=rotationMinimizingFrames(p.map(q=>toWorld(q,f)),{initialNormal:[1,0,0]});
 for(let i=0;i<a.length;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(b[i].n[k]-toWorld(a[i].n,{...f,origin:[0,0,0]})[k])<1e-12);
});
test('final acceptance rejects missing crossing, short material, sub-target gap and unverified motion',()=>{
 const input={tube:{valid:true},operations:{valid:true},pose:{centerlinePose:{status:'PASS'},crossingPose:{status:'PASS'}},unexplainedVisible:{count:0},clearance:{minimumNonlocalGap:.0002,minimumColumnGap:.0002,penetratingPairs:0},material:{lengthChange:0,maxSegmentStretch:0},lineage:{status:'PASS',referenceId:'fixture',continuousMotion:'PASS'}};
 assert.equal(evaluateAcceptance(input).status,'PASS');
 for(const mutate of [x=>x.pose.crossingPose.status='UNVERIFIED',x=>x.material.lengthChange=.001,x=>x.clearance.minimumNonlocalGap=.000188,x=>x.lineage.continuousMotion='UNVERIFIED']){const x=structuredClone(input);mutate(x);assert.equal(evaluateAcceptance(x).status,'FAIL');}
});
test('image windows cannot stitch disjoint material pieces into a scoring curve',()=>{
 const ann={nominalVisibleRopeDiameterPx:.01,visiblePolylines:[{id:'line',points:[[0,0],[1,0]]}]};
 const camera={originPixel:[0,0],pixelsPerMetre:1,rollRadians:0};
 assert.throws(()=>windowSpans([[0,0,0],[.2,0,0],[.5,0,1],[.8,0,0],[1,0,0]],['a','a','a','a'],ann,camera,{line:['a']},{}),/disjoint/);
 const r=windowSpans([[1,0,0],[.7,0,0],[.8,0,0],[0,0,0]],['a','a','a'],ann,camera,{line:['a']},{});
 assert.deepEqual(r.line.ids,[3,2,1,0]);
});
