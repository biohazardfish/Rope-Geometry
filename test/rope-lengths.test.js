import test from 'node:test';
import assert from 'node:assert/strict';
import {projectChainLengths} from '../src/rope-lengths.js';
import {createRopeState,materialResiduals} from '../src/rope-state.js';
import {relaxRope} from '../src/rope-relax.js';
import {buildOverhand} from '../src/overhand-recipe.js';
import {makeTube,checkTube} from '../src/rope-tube.js';
test('coupled projection transmits length correction through the entire chain',()=>{
 const p=Array.from({length:101},(_,i)=>[i*.001,0,.1]),P=Float64Array.from(p.flat()),rest=Array(100).fill(.001);
 P[0]-=.01;projectChainLengths(P,rest,{iterations:12});
 const points=p.map((_,i)=>Array.from(P.slice(i*3,i*3+3)));
 const r=materialResiduals(createRopeState(points,{diameter:.001,materialCoordinates:p.map((_,i)=>i*.001)}));
 assert.ok(r.maxSegmentStretch<1e-10);assert.ok(Math.abs(r.lengthChange)<1e-10);
 assert.ok(points.at(-1)[0]<p.at(-1)[0],'correction must reach the far end');
});
test('overhand uses the same tube and relaxation engine without a column',()=>{
 const {state}=buildOverhand();
 const before=checkTube(makeTube(state.points,state.diameter/2));assert.equal(before.valid,true,JSON.stringify(before));
 const result=relaxRope(state.points,{columnRadius:null,diameter:state.diameter,iterations:3,coupledLengths:true,stretchSweeps:4,restLengths:state.restLengths,bendSmoothing:0});
 assert.ok(result.maxStretch<1e-8);assert.equal(checkTube(makeTube(result.points,state.diameter/2)).valid,true);
});

test('straight span with two pins remains finite for compatible and incompatible lengths', () => {
  for (const end of [.020, .022]) {
    const points = [0,0,0, .009,0,0, end,0,0];
    const {maxResidual} = projectChainLengths(points,[.010,.010],{inverseMasses:[0,1,0]});
    assert.ok(points.every(Number.isFinite));
    assert.equal(points[0],0);
    assert.equal(points[6],end);
    assert.ok(end===.020 ? maxResidual<1e-10 : maxResidual>.001);
  }
});
