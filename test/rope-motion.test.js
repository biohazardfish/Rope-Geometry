import test from 'node:test';
import assert from 'node:assert/strict';
import {certifyPairMotion,relaxRope} from '../src/rope-relax.js';
import {buildSomerville,SOMERVILLE_PRESETS} from '../src/somerville-build.js';
import {validateOperations} from '../src/somerville-verify.js';
import {toWorld,createRopeState,geometryArc} from '../src/rope-state.js';
import {targetAtMaterialStations} from '../src/rope-targets.js';
import {makeTube,checkTube} from '../src/rope-tube.js';

test('continuous check rejects a mid-step crossing with separated endpoints',()=>{
 const x=[[-.05,0,.1],[.05,0,.1],[0,-.05,.11],[0,.05,.11]],y=structuredClone(x);y[2][2]=y[3][2]=.09;
 assert.equal(certifyPairMotion(Float64Array.from(x.flat()),Float64Array.from(y.flat()),[0,2],{floor:.0061}),false);
 const z=x.map(p=>[p[0]+.0001,p[1],p[2]]);
 assert.equal(certifyPairMotion(Float64Array.from(x.flat()),Float64Array.from(z.flat()),[0,2],{floor:.0061}),true);
});
test('continuous kernel retains a near-parallel interior crossing at large scale',()=>{
 const x=Float64Array.from([[0,0,0],[1e6,0,0],[0,-.01,0],[1e6,.01,0]].flat());
 assert.equal(certifyPairMotion(x,x,[0,2],{floor:.00001}),false);
});
test('final proposed positions are passed through the supplied surface guard',()=>{
 const p=Array.from({length:21},(_,i)=>[i*.002,.1,.1]);let calls=0;
 const result=relaxRope(p,{columnRadius:null,coupledLengths:true,iterations:1,targets:[{indices:[10],positions:[[.02,.1,.102]],weight:.5}],surfaceGuard:()=>{calls++;return false;}});
 assert.ok(calls>0);assert.equal(result.rejected,1);assert.deepEqual(result.points,p);
});
test('shape target returns released material to tails without resetting s0',()=>{
 const r=createRopeState([[0,0,0],[1,0,0],[2,0,0],[3,0,0]],{diameter:.006,referenceId:'source'});
 const target=targetAtMaterialStations(r,[[0,0,0],[.5,0,0],[1,0,0]],{labels:['tail/0','tail/1']});
 assert.deepEqual(target.state.s0,r.s0);assert.equal(geometryArc(target.state.points).at(-1),3);assert.equal(target.releasedLength,2);
 assert.throws(()=>targetAtMaterialStations(r,[[0,0,0],[4,0,0]]),/more material/);
});
test('operation checks follow local frame after a whole-model rigid transform',()=>{
 const doc=buildSomerville(SOMERVILLE_PRESETS.looseVideo),f={origin:[.4,-.2,.3],axes:[[0,1,0],[0,0,1],[1,0,0]]},moved=structuredClone(doc);
 moved.ropes[0].points=doc.ropes[0].points.map(p=>toWorld(p,f));moved.somerville.referenceFrame=f;
 moved.somerville.column.center=toWorld(doc.somerville.column.center,f);
 moved.somerville.aperture.center=toWorld(doc.somerville.aperture.center,f);
 moved.somerville.aperture.normal=toWorld(doc.somerville.aperture.normal,{...f,origin:[0,0,0]});
 assert.deepEqual(validateOperations(moved).checks,validateOperations(doc).checks);
});
test('paired cuff identity does not require equal samples on the two limbs',()=>{
 const doc=buildSomerville(SOMERVILLE_PRESETS.looseVideo),r=doc.ropes[0],points=[],labels=[];
 for(let i=0;i<r.points.length-1;i++){points.push(r.points[i]);labels.push(r.segmentLabels[i]);if(r.segmentLabels[i]==='cuff/0'){points.push(r.points[i].map((v,k)=>(v+r.points[i+1][k])/2));labels.push(r.segmentLabels[i]);}}
 points.push(r.points.at(-1));r.points=points;r.segmentLabels=labels;
 assert.equal(validateOperations(doc).checks.pairedCuffOrder,true);
});
test('reversing actual first-passage material direction fails its checkpoint',()=>{
 const doc=buildSomerville(SOMERVILLE_PRESETS.looseVideo),r=doc.ropes[0],ids=r.segmentLabels.flatMap((l,i)=>l==='first-passage/0'?[i]:[]),start=ids[0],end=ids.at(-1)+1;
 r.points.splice(start,end-start+1,...r.points.slice(start,end+1).reverse());
 assert.equal(validateOperations(doc).checks.firstPassage,false);
});
test('tube-column validation follows a rotated translated column frame',()=>{
 const p=Array.from({length:9},(_,i)=>[i*.01,.04,0]),f={origin:[1,2,3],axes:[[0,1,0],[0,0,1],[1,0,0]]};
 const a=checkTube(makeTube(p,.003),{column:{axis:'X',radius:.0275,center:[0,0,0]}});
 const b=checkTube(makeTube(p.map(q=>toWorld(q,f)),.003),{column:{axis:'X',radius:.0275,center:f.origin,frame:f}});
 assert.equal(a.valid,b.valid);assert.ok(Math.abs(a.minimumColumnGap-b.minimumColumnGap)<1e-10);
});
