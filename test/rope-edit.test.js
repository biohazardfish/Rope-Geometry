import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectChainLengths} from '../src/rope-lengths.js';
import {relaxRope} from '../src/rope-relax.js';
import {robustClosestSegments} from '../src/robust-distance.js';
import {makeTube,checkTube} from '../src/rope-tube.js';
import {
  EDITOR_PARAMETERS,SOLVER_VERSION,advanceEditorStep,applyEditorStep,aperturePassed,assessEditorTube,buildEditorFixture,
  centroid,certifyEditorMotion,extendEditorPath,finishEditorStep,gateSubstep,handleInterval,openEditorStep,snapGrabDelta,throughPath,
} from '../src/rope-edit-step.js';
import {
  commitStep,createSession,hashPoints,loadSession,playbackFrames,replaySession,serializeSession,sha256Hex,undoSession,validateSession,
} from '../src/rope-edit-session.js';

const floorOf=(diameter,gap)=>diameter+gap/2;

test('sha256 matches the platform digest',()=>{
  for(const text of ['', 'rope', '繩耳'])assert.equal(sha256Hex(text),createHash('sha256').update(text).digest('hex'));
});

test('fast crossing missed by the endpoints is rejected',()=>{
  const before=[[-.05,0,.1],[.05,0,.1],[0,-.05,.11],[0,.05,.11]];
  const after=before.map(p=>[...p]);
  after[2][2]=after[3][2]=.09;
  const floor=floorOf(.006,.0002);
  const opening=robustClosestSegments(before[0],before[1],before[2],before[3]).distance;
  const closing=robustClosestSegments(after[0],after[1],after[2],after[3]).distance;
  assert.ok(opening>floor&&closing>floor);
  assert.equal(certifyEditorMotion(before,after,{diameter:.006,gap:.0002,localArc:.02,column:null}),false);
});

test('column clearance uses the column local frame',()=>{
  const before=[[0,0,.2],[.02,0,.2],[.04,0,.2],[.06,0,.2]];
  const after=before.map(p=>[p[0],p[1]+.0001,p[2]]);
  const axes=[[1,0,0],[0,1,0],[0,0,1]];
  const spec={diameter:.006,gap:.0002,localArc:.001};
  assert.equal(certifyEditorMotion(before,after,{...spec,column:{axis:'X',radius:.01,center:[0,0,0],frame:{origin:[0,0,0],axes}}}),true);
  assert.equal(certifyEditorMotion(before,after,{...spec,column:{axis:'X',radius:.01,center:[0,0,.2],frame:{origin:[0,0,.2],axes}}}),false);
});

test('inverse masses pin an endpoint and still recover every length',()=>{
  const count=21,rest=Array(count-1).fill(.01);
  const P=Float64Array.from(Array.from({length:count},(_,i)=>[(i===0?0:i*.01+.004),0,.1]).flat());
  const pinned=[P[0],P[1],P[2]];
  const masses=Array(count).fill(1);masses[0]=0;
  projectChainLengths(P,rest,{iterations:16,inverseMasses:masses});
  assert.deepEqual([P[0],P[1],P[2]],pinned);
  let error=0;
  for(let i=0;i<count-1;i++)error=Math.max(error,Math.abs(Math.hypot(P[3*i+3]-P[3*i],P[3*i+4]-P[3*i+1],P[3*i+5]-P[3*i+2])-rest[i]));
  assert.ok(error<1e-9);
  assert.ok(P[3*(count-1)]<(count-1)*.01+.001);
});

test('omitted inverse masses and empty fixed points preserve the default solve',()=>{
  const count=21,rest=Array(count-1).fill(.01);
  const seed=Float64Array.from(Array.from({length:count},(_,i)=>[i*.01,0,.1]).flat());
  seed[0]-=.01;
  const plain=Float64Array.from(seed),weighted=Float64Array.from(seed);
  projectChainLengths(plain,rest,{iterations:12});
  projectChainLengths(weighted,rest,{iterations:12,inverseMasses:Array(count).fill(1)});
  assert.deepEqual(Array.from(plain),Array.from(weighted));
  const rope=Array.from({length:12},(_,i)=>[i*.01,.05,.1]);
  const options={columnRadius:null,iterations:2,coupledLengths:true,bendSmoothing:0,restLengths:Array(11).fill(.01)};
  const a=relaxRope(rope,options);
  const b=relaxRope(rope,{...options,fixedPoints:[]});
  assert.deepEqual(a.points,b.points);
  assert.equal(a.rejected,b.rejected);
  assert.equal(a.maxStretch,b.maxStretch);
});

test('solver pins stay put while a free target moves',()=>{
  const rope=Array.from({length:12},(_,i)=>[i*.01,.05,.1]);
  const rest=Array(11).fill(.01);
  const result=relaxRope(rope,{columnRadius:null,coupledLengths:true,iterations:8,fixedPoints:[0],restLengths:rest,bendSmoothing:0,maxStep:.004,targets:[{indices:[6],positions:[[.05,.05,.12]],weight:1}]});
  assert.deepEqual(result.points[0],rope[0]);
  assert.ok(result.points[6][2]>rope[6][2]+1e-4);
  let error=0;
  for(let i=0;i<rest.length;i++)error=Math.max(error,Math.abs(Math.hypot(...result.points[i+1].map((v,k)=>v-result.points[i][k]))-rest[i]));
  assert.ok(error<1e-8);
});

test('editor fixture is a loose pinned loop with a near-side bight',()=>{
  const fixture=buildEditorFixture();
  assert.equal(fixture.diameter,.006);
  assert.ok(fixture.points.length<=160);
  assert.equal(fixture.parameters,EDITOR_PARAMETERS);
  assert.equal(SOLVER_VERSION,1);
  const tube=assessEditorTube(fixture.points,fixture);
  assert.equal(tube.valid,true,JSON.stringify({self:tube.selfIntersections,fold:tube.foldedFaces,column:tube.columnPenetrations}));
  const measureSigned=(points)=>points[fixture.bightIndex][1]-fixture.aperture.center[1];
  assert.ok(measureSigned(fixture.points)< -0.04);
  assert.equal(aperturePassed(fixture.points,fixture),false);
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  assert.ok(handle.indices.length>=2);
  assert.ok(handle.s0End-handle.s0Start<=fixture.diameter*6+1e-12);
  assert.equal(handle.indices.some(i=>fixture.pins.includes(i)),false);
  assert.equal(handleInterval(fixture.s0,fixture.pins,fixture.s0[fixture.pins[0]],fixture.diameter),null);
});

test('screen-plane drag takes the bight through the aperture',()=>{
  const fixture=buildEditorFixture();
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  const requestedPath=throughPath(fixture);
  const first=applyEditorStep({points:fixture.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,diameter:fixture.diameter,handleIndices:handle.indices,requestedPath,parameters:fixture.parameters});
  const second=applyEditorStep({points:fixture.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,diameter:fixture.diameter,handleIndices:handle.indices,requestedPath,parameters:fixture.parameters});
  assert.equal(first.ok,true);
  assert.equal(first.tube.valid,true);
  assert.equal(aperturePassed(first.points,fixture),true);
  assert.deepEqual(first.points,second.points);
  assert.equal(hashPoints(first.points),hashPoints(second.points));
  for(const index of fixture.pins)assert.deepEqual(first.points[index],fixture.points[index]);
  let error=0;
  for(let i=0;i<fixture.restLengths.length;i++)error=Math.max(error,Math.abs(Math.hypot(...first.points[i+1].map((v,k)=>v-first.points[i][k]))-fixture.restLengths[i]));
  assert.ok(error<1e-9);
});

test('a local crossing that passes nonlocal certification still rolls the whole step back',()=>{
  const points=[];
  for(let i=0;i<=20;i++)points.push([i*.004,0,.05]);
  for(let i=1;i<=16;i++){const ang=-Math.PI/2+Math.PI*i/16;points.push([.08+.02*Math.cos(ang),.02+.02*Math.sin(ang),.05]);}
  for(let i=1;i<=20;i++)points.push([.08-i*.004,.04,.05]);
  const rest=[];
  for(let i=0;i<points.length-1;i++)rest.push(Math.hypot(...points[i+1].map((v,k)=>v-points[i][k])));
  assert.equal(checkTube(makeTube(points,.003,{radialSegments:12})).valid,true);
  const pins=[0];
  const handleIndices=points.flatMap((p,i)=>Math.abs(p[1]-.04)<1e-9?[i]:[]);
  const anchor=handleIndices.reduce((sum,i)=>sum.map((v,k)=>v+points[i][k]),[0,0,0]).map(v=>v/handleIndices.length);
  const end=anchor.map((v,k)=>v+[0,-.04,0][k]);
  const requestedPath=Array.from({length:31},(_,i)=>anchor.map((v,k)=>v+(end[k]-v)*i/30));
  const parameters={...EDITOR_PARAMETERS,localArc:5,bendSmoothing:0,minBendRadius:.001,maxStep:.003,sweeps:2,stretchSweeps:4};
  const result=applyEditorStep({points,restLengths:rest,pins,column:null,diameter:.006,handleIndices,requestedPath,parameters});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'tube');
  assert.ok(result.tube.selfIntersections>0);
  assert.deepEqual(result.points,points);
  assert.equal(result.accepted.length,0);
  assert.equal(checkTube(makeTube(result.points,.003,{radialSegments:12})).valid,true);
});

test('grab-plane shift snaps to 45 degrees',()=>{
  const basis={right:[1,0,0],up:[0,1,0],forward:[0,0,1]};
  const snapped=snapGrabDelta([1,.5,0],basis,true);
  assert.ok(Math.abs(snapped[0]-snapped[1])<1e-12);
  assert.ok(Math.abs(Math.hypot(...snapped)-Math.hypot(1,.5))<1e-12);
});

test('undo restores rope and both cameras; load rejects a bad file before replace',()=>{
  const fixture=buildEditorFixture();
  const session=createSession(fixture);
  assert.equal(validateSession(session).ok,true);
  const originalPoints=session.points.map(p=>[...p]);
  const originalCamera=structuredClone(session.cameraA);
  session.mode='B';
  session.cameraB=structuredClone(session.cameraA);
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  const requestedPath=throughPath(fixture).slice(0,3);
  const moved=applyEditorStep({points:session.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,diameter:fixture.diameter,handleIndices:handle.indices,requestedPath,parameters:fixture.parameters});
  assert.equal(moved.ok,true);
  assert.ok(moved.accepted.length>0);
  const locked={...originalCamera,fov:55};
  commitStep(session,moved,{cameraA:locked,cameraB:structuredClone(locked)},handle);
  assert.equal(session.mode,'A');
  assert.equal(session.cameraA.fov,55);
  assert.equal(undoSession(session),true);
  assert.deepEqual(session.points,originalPoints);
  assert.deepEqual(session.cameraA,originalCamera);
  assert.deepEqual(session.cameraB,originalCamera);
  assert.equal(session.mode,'B');
  assert.equal(session.steps.length,0);
  const current=serializeSession(session);
  const tampered=JSON.parse(current);
  tampered.schemaVersion=99;
  tampered.points[0][0]=Number.NaN;
  tampered.initialState.s0.reverse();
  tampered.parameters={...tampered.parameters,maxStep:1};
  tampered.audit.push({seq:5,op:'nope',ok:'yes'});
  const rejected=loadSession(tampered);
  assert.equal(rejected.ok,false);
  for(const code of ['version','finite','material','parameters','audit'])assert.ok(rejected.errors.includes(code),rejected.errors.join(','));
  assert.equal(serializeSession(session),current);
  const countBreak=JSON.parse(current);
  countBreak.points.pop();
  assert.equal(loadSession(countBreak).ok,false);
  assert.ok(loadSession(countBreak).errors.includes('count'));
});

test('replay fails fast on a recorded mismatch and playback follows the accepted path',()=>{
  const fixture=buildEditorFixture();
  const session=createSession(fixture);
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  const full=throughPath(fixture);
  const cameras={cameraA:structuredClone(session.cameraA),cameraB:structuredClone(session.cameraA)};
  const firstPath=full.slice(0,4);
  const first=applyEditorStep({points:session.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,diameter:fixture.diameter,handleIndices:handle.indices,requestedPath:firstPath,parameters:fixture.parameters});
  commitStep(session,first,cameras,handle);
  const second=applyEditorStep({points:session.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,diameter:fixture.diameter,handleIndices:handle.indices,requestedPath:full.slice(0,6),parameters:fixture.parameters});
  commitStep(session,second,cameras,handle);
  const fresh=loadSession(serializeSession(session));
  assert.equal(fresh.ok,true,fresh.errors?.join(','));
  assert.deepEqual(replaySession(fresh.session),{ok:true,reason:'match',index:null,points:fresh.session.points,errors:[]});
  const frames=playbackFrames(fresh.session);
  assert.deepEqual(frames[0],fixture.points);
  assert.deepEqual(frames.at(-1),fresh.session.points);
  assert.equal(frames.length,1+first.accepted.length+second.accepted.length);
  const broken=structuredClone(fresh.session);
  broken.steps[0].accepted.at(-1).points[fixture.bightIndex][1]+=.01;
  broken.steps[0].resultSha256=hashPoints(broken.steps[0].accepted.at(-1).points);
  broken.points=broken.steps.at(-1).accepted.at(-1).points;
  broken.steps[1].handle.indices=[];
  const replay=replaySession(broken);
  assert.equal(replay.ok,false);
  assert.equal(replay.reason,'hash');
  assert.equal(replay.index,0);
  const badHash=structuredClone(fresh.session);
  badHash.steps[0].resultSha256='0'.repeat(64);
  assert.equal(loadSession(badHash).ok,false);
  assert.ok(loadSession(badHash).errors.includes('hash'));
});

test('the entire bight must cross inside the aperture and remain on the far side', async () => {
  const {traversedAperture} = await import('../src/rope-edit-step.js');
  const fixture = buildEditorFixture();
  const handle = handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  const result = applyEditorStep({...fixture,handleIndices:handle.indices,requestedPath:throughPath(fixture)});
  assert.equal(traversedAperture([result],fixture),true);
  const around = structuredClone(result);
  const shifted = fixture.points.map(([x,y,z])=>[x+0.2,y,z]);
  around.accepted=[{points:shifted},{points:result.points.map(([x,y,z])=>[x+0.2,y,z])},{points:result.points}];
  assert.equal(traversedAperture([around],fixture),false);
  const shoulder=fixture.labels.indexOf('bight');
  const incomplete=structuredClone(result.points);
  incomplete[shoulder][1]=-0.001;
  assert.equal(aperturePassed(incomplete,fixture),false);
});

test('observation survives save and undo; a substituted intermediate frame cannot be loaded',async()=>{
  const {recordObservation}=await import('../src/rope-edit-session.js');
  const f=buildEditorFixture(),session=createSession(f);
  const camera={...session.cameraA,position:[0.16,-0.21,0.20]};
  recordObservation(session,camera);
  const handle=handleInterval(f.s0,f.pins,f.bightS0,f.diameter);
  const result=applyEditorStep({...f,handleIndices:handle.indices,requestedPath:throughPath(f).slice(0,6)});
  commitStep(session,result,{cameraA:camera,cameraB:camera},handle);
  const encoded=serializeSession(session);
  const restored=loadSession(encoded).session;
  assert.deepEqual(restored.timeline.map(x=>x.kind),['A','B']);
  assert.ok(undoSession(restored));
  assert.deepEqual(restored.points,f.points);
  assert.deepEqual(restored.cameraA,camera);
  assert.ok(undoSession(restored));
  assert.deepEqual(restored.cameraA,f.cameraA);
  const fake=JSON.parse(encoded);
  fake.steps[0].accepted[0].points[0][1]+=0.003;
  assert.equal(loadSession(fake).ok,false);
});

function editorSpec(fixture,handle){
  return {
    points:fixture.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,
    diameter:fixture.diameter,handleIndices:handle.indices,parameters:fixture.parameters,
  };
}

// Same drain the pointer handler uses: solve every sample already emitted, and stop when the tip is still ahead.
function drainLive(ctx){
  while(!ctx.done){
    const step=advanceEditorStep(ctx);
    if(step.accepted)continue;
    if(step.reason==='pending'||step.done)break;
  }
}

function solveLive(spec,path){
  const ctx=openEditorStep({...spec,requestedPath:[path[0]]});
  for(let i=1;i<path.length;i++){
    const prev=ctx.requestedPath.at(-1);
    const gap=Math.hypot(...path[i].map((v,k)=>v-prev[k]));
    if(ctx.requestedPath.length>1&&gap<=0.0004)extendEditorPath(ctx,path[i],{tip:true});
    else if(gap>0.0004)extendEditorPath(ctx,path[i]);
    drainLive(ctx);
  }
  const result=finishEditorStep(ctx);
  return {result,requestedPath:result.requestedPath};
}

function assertSameStep(actual,expected){
  assert.equal(actual.ok,expected.ok);
  assert.equal(actual.reason,expected.reason);
  assert.deepEqual(actual.points,expected.points);
  assert.deepEqual(actual.accepted,expected.accepted);
  assert.deepEqual(actual.requestedPath,expected.requestedPath);
}

test('incremental drag matches the batch step, pins are restored before the gate, and cancel does not commit',()=>{
  const fixture=buildEditorFixture();
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  const spec=editorSpec(fixture,handle);
  const path=throughPath(fixture).slice(0,8);
  const live=solveLive(spec,path);
  const batch=applyEditorStep({...spec,requestedPath:path});
  assertSameStep(live.result,batch);
  assert.equal(live.result.ok,true);
  assert.ok(live.result.accepted.length>1);
  const gateSpec={
    pins:fixture.pins,restLengths:fixture.restLengths,driftTolerance:fixture.parameters.driftTolerance,
    lengthTolerance:fixture.parameters.lengthTolerance,pinnedWorld:fixture.points,diameter:fixture.diameter,
    gap:fixture.parameters.gap,localArc:fixture.parameters.localArc,column:fixture.column,
    ccdTolerance:fixture.parameters.ccdTolerance,
  };
  let previous=fixture.points;
  for(const frame of live.result.accepted){
    for(const index of fixture.pins)assert.deepEqual(frame.points[index],fixture.points[index]);
    assert.equal(gateSubstep(previous,frame.points,gateSpec),null);
    previous=frame.points;
  }
  const drifted=fixture.points.map(p=>[...p]);
  drifted[fixture.pins[0]]=[drifted[fixture.pins[0]][0]+1e-6,drifted[fixture.pins[0]][1],drifted[fixture.pins[0]][2]];
  assert.equal(gateSubstep(fixture.points,drifted,gateSpec),'drift');
  const replay=applyEditorStep({...spec,requestedPath:live.result.requestedPath});
  assertSameStep(replay,live.result);
  const session=createSession(fixture);
  const cameras={cameraA:structuredClone(session.cameraA),cameraB:structuredClone(session.cameraA)};
  commitStep(session,live.result,cameras,handle);
  const loaded=loadSession(serializeSession(session));
  assert.equal(loaded.ok,true,loaded.errors?.join(','));
  assert.deepEqual(replaySession(loaded.session).points,live.result.points);

  const cancelled=createSession(fixture);
  const partial=openEditorStep({...spec,requestedPath:[path[0]]});
  extendEditorPath(partial,path[Math.min(3,path.length-1)]);
  drainLive(partial);
  assert.ok(partial.accepted.length>0);
  assert.notDeepEqual(partial.current,cancelled.points);
  assert.equal(cancelled.steps.length,0);
  assert.equal(cancelled.timeline.length,0);
  assert.deepEqual(cancelled.points,fixture.points);

  const anchor=centroid(fixture.points,handle.indices);
  const into=fixture.column.center;
  const blockedPath=[anchor];
  for(let i=1;i<=24;i++)blockedPath.push(anchor.map((v,k)=>v+(into[k]-v)*i/24));
  const blockedLive=solveLive(spec,blockedPath);
  const blockedBatch=applyEditorStep({...spec,requestedPath:blockedPath});
  assertSameStep(blockedLive.result,blockedBatch);
  if(blockedLive.result.accepted.length){
    const last=blockedLive.result.accepted.at(-1).points;
    for(const index of fixture.pins)assert.deepEqual(last[index],fixture.points[index]);
  }
});

test('swept column check uses its physical centre and Z axis even when the frame origin differs',()=>{
  const column={axis:'Z',radius:.01,center:[.2,.1,.3],frame:{origin:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]]}};
  const before=[[.16,.1,.29],[.16,.1,.31]],after=before.map(p=>[.24,p[1],p[2]]);
  assert.equal(certifyEditorMotion(before,after,{column,diameter:.006,gap:.0002,localArc:.024}),false);
});
