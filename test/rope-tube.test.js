import test from 'node:test';import assert from 'node:assert/strict';
import {makeTube,checkTube,triangleIntersection} from '../src/rope-tube.js';
test('straight tube retains zero intersections after centerline subdivision',()=>{for(const n of[2,10,40]){const p=Array.from({length:n+1},(_,i)=>[i*.02/n,0,0]);assert.equal(checkTube(makeTube(p,.003)).valid,true);}});
test('tilted straight tube stays intersection free at every radial resolution',()=>{const p=Array.from({length:120},(_,i)=>[i*.011*.6,i*.011*.5,i*.011*.6]);for(const radialSegments of[8,12,16,24,32]){const r=checkTube(makeTube(p,.003,{radialSegments}));assert.equal(r.selfIntersections,0,`radialSegments ${radialSegments}`);assert.equal(r.foldedFaces,0);}});
test('an in-plane edge leaving a shared vertex is not a crossing, but a real crossing through the plane still is',()=>{
 // Thin triangle (5.7 degree corner at the shared vertex) and a non-coplanar neighbour whose edge continues the shared generator line with sub-epsilon plane distances of opposite sign.
 const a=[[0,0,0],[1,0,0],[0,.1,0]];
 assert.equal(triangleIntersection(a,[[1,0,-1e-21],[2,0,2e-16],[2,-.5,.5]],{shared:[a[1]]}),false);
 assert.equal(triangleIntersection(a,[[1,0,-1e-21],[.5,.02,.001],[.5,.02,-.001]],{shared:[a[1]]}),true);
});
test('tight curved tube fails while generous semicircle passes',()=>{const arc=r=>Array.from({length:51},(_,i)=>[r*Math.cos(i*Math.PI/50),r*Math.sin(i*Math.PI/50),0]);assert.equal(checkTube(makeTube(arc(.02),.003)).valid,true);const r=checkTube(makeTube(arc(.001),.003));assert.equal(r.valid,false);assert.ok(r.foldedFaces>0||r.selfIntersections>0);});
test('remote crossing portions are detected on rendered surface',()=>{const p=[[-.03,0,0],[.03,0,0],[.04,.04,.04],[0,.03,.03],[0,-.03,-.03]];assert.ok(checkTube(makeTube(p,.003)).selfIntersections>0);});
test('shared mesh boundary is permitted but overlap beyond it is rejected',()=>{const a=[[0,0,0],[1,0,0],[0,1,0]];assert.equal(triangleIntersection(a,[[1,0,0],[1,1,0],[0,1,0]],{shared:[a[1],a[2]]}),false);assert.equal(triangleIntersection(a,[[0,0,0],[.8,.2,0],[.2,.8,0]],{shared:[a[0]]}),true);assert.equal(triangleIntersection(a,[[0,0,0],[.5,.25,-1],[.5,.25,1]],{shared:[a[0]]}),true);});
test('column intersection checks triangle interior, not only vertices',()=>{const mesh={vertices:[[0,.02,0],[0,-.01,.02],[0,-.01,-.02]],indices:[[0,1,2]]};const r=checkTube(mesh,{column:{axis:'X',center:[0,0,0],radius:.005}});assert.equal(r.columnPenetrations,1);assert.equal(r.minimumColumnGap,-.005);});
