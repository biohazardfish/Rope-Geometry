import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  applyEditorStep,assessEditorTube,bambooSolids,buildBambooFixture,buildEditorFixture,handleInterval,throughPath,
} from '../src/rope-edit-step.js';
import {
  commitStep,createSession,fixtureByReference,loadSession,playbackFrames,replaySession,serializeSession,undoSession,validateSession,
} from '../src/rope-edit-session.js';
import {
  classifyNavigationGesture,dollyStep,frameCamera,orbitStep,panStep,pointerAction,triadPlacement,viewOffset,
} from '../src/rope-edit-camera.js';

const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(a[0],a[1],a[2]);

function lengthError(points,rest){
  let error=0;
  for(let i=0;i<rest.length;i++)error=Math.max(error,Math.abs(dist(points[i],points[i+1])-rest[i]));
  return error;
}

test('bamboo fixture is Z-up, culm lies along Y, and dressing stays inside the collision cylinder',()=>{
  const fixture=buildBambooFixture();
  assert.equal(fixture.referenceId,'bamboo-u-v1');
  assert.deepEqual(fixture.up,[0,0,1]);
  assert.deepEqual(fixture.cameraA.up,[0,0,1]);
  assert.equal(fixture.column.axis,'Y');
  assert.deepEqual(fixture.column.frame.axes,[[1,0,0],[0,1,0],[0,0,1]]);
  assert.equal(fixture.bamboo.axis,'Y');
  assert.equal(fixture.bamboo.collisionRadius,fixture.column.radius);
  assert.equal(fixture.aperture,null);
  assert.deepEqual(fixture.pins,[]);
  const solids=bambooSolids(fixture);
  assert.ok(solids.length>=5);
  for(const solid of solids){
    assert.ok(solid.radius<=fixture.column.radius);
    assert.ok(solid.radius>0);
    assert.equal(solid.axis,'Y');
    assert.equal(solid.position[0],fixture.column.center[0]);
    assert.equal(solid.position[2],fixture.column.center[2]);
  }
  assert.ok(Math.max(...solids.map(solid=>solid.radius))<=fixture.column.radius);
  const legacy=buildEditorFixture();
  assert.equal(legacy.referenceId,'loose-bight-v1');
  assert.deepEqual(legacy.cameraA.up,[0,0,1]);
  assert.equal(legacy.column.axis,'X');
  assert.ok(legacy.pins.length>0);
  assert.equal(fixtureByReference('bamboo-u-v1').referenceId,'bamboo-u-v1');
  assert.equal(fixtureByReference('loose-bight-v1').referenceId,'loose-bight-v1');
  assert.equal(fixtureByReference('other'),null);
});

test('the folded rope is one symmetric U with aligned equal tails and a midpoint bight',()=>{
  const fixture=buildBambooFixture();
  const {points,s0,bightIndex}=fixture;
  assert.equal(fixture.diameter,0.006);
  assert.ok(points.length>=8);
  assert.ok(points.length<=256);
  assert.equal(fixture.labels.length,points.length-1);
  for(let i=1;i<points.length;i++)assert.ok(dist(points[i-1],points[i])>1e-6);
  const total=s0.at(-1)-s0[0];
  assert.ok(total>0.8);
  assert.ok(Math.abs(s0[bightIndex]-(s0[0]+total/2))<1e-9);
  assert.equal(fixture.bightS0,s0[bightIndex]);
  assert.equal(fixture.labels[bightIndex-1],'bight');
  assert.equal(fixture.labels[bightIndex],'bight');
  assert.ok(Math.abs(points[0][0]-points.at(-1)[0])<1e-12);
  assert.ok(Math.abs(points[0][1]-points.at(-1)[1])<1e-12);
  assert.ok(Math.abs(points[0][2]+points.at(-1)[2])<1e-12);
  assert.ok(dist(points[0],points.at(-1))>fixture.diameter);
  assert.ok(fixture.bightRadius>=0.012);
  for(let i=0;i<points.length;i++){
    const mirror=points[points.length-1-i];
    assert.ok(Math.abs(points[i][0]-mirror[0])<1e-9);
    assert.ok(Math.abs(points[i][1]-mirror[1])<1e-9);
    assert.ok(Math.abs(points[i][2]+mirror[2])<1e-9);
    if(i<fixture.labels.length){
      const opposite=fixture.labels[fixture.labels.length-1-i];
      assert.equal(fixture.labels[i]==='bight',opposite==='bight');
    }
  }
  const left=s0[bightIndex]-s0[0];
  const right=s0.at(-1)-s0[bightIndex];
  assert.ok(Math.abs(left-right)<1e-9);
  let shoulder=0;
  while(shoulder<points.length-1&&Math.abs(points[shoulder][2]-points[0][2])<1e-12)shoulder++;
  shoulder-=1;
  for(let i=0;i<shoulder;i++){
    assert.ok(Math.abs(points[i][0]-points[i+1][0])<1e-12);
    assert.ok(Math.abs(points[i][2]-points[i+1][2])<1e-12);
    assert.ok(points[i][1]>points[i+1][1]);
  }
  for(const index of fixture.labels.map((role,i)=>role==='bight'?i:-1).filter(i=>i>=0)){
    const radial=dist(points[index],fixture.arcCenter);
    assert.ok(radial>=fixture.bightRadius-1e-9);
  }
  const apex=points[bightIndex];
  assert.ok(dist(apex,fixture.arcCenter)>=fixture.bightRadius-1e-9);
  assert.ok(Math.abs(apex[2])<1e-9);
});

test('the initial bamboo rope has no tube or column collision',()=>{
  const fixture=buildBambooFixture();
  const tube=assessEditorTube(fixture.points,fixture);
  assert.equal(tube.valid,true,JSON.stringify({self:tube.selfIntersections,fold:tube.foldedFaces,column:tube.columnPenetrations}));
  assert.equal(tube.selfIntersections,0);
  assert.equal(tube.columnPenetrations,0);
  assert.equal(tube.foldedFaces,0);
  let nearest=Infinity;
  for(const point of fixture.points){
    nearest=Math.min(nearest,Math.hypot(point[0]-fixture.column.center[0],point[2]-fixture.column.center[2]));
  }
  assert.ok(nearest>fixture.column.radius+fixture.diameter/2);
});

test('a legal drag moves the free bamboo rope without changing material length',()=>{
  const fixture=buildBambooFixture();
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  assert.ok(handle);
  assert.ok(handle.indices.includes(fixture.bightIndex));
  assert.equal(handle.indices.some(index=>fixture.pins.includes(index)),false);
  const origin=handle.indices.reduce((sum,index)=>sum.map((v,k)=>v+fixture.points[index][k]),[0,0,0]).map(v=>v/handle.indices.length);
  const travel=0.012;
  const requestedPath=Array.from({length:7},(_,i)=>[origin[0]+travel*i/6,origin[1],origin[2]]);
  const result=applyEditorStep({
    points:fixture.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,
    diameter:fixture.diameter,handleIndices:handle.indices,requestedPath,parameters:fixture.parameters,
  });
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.tube.valid,true);
  assert.ok(result.accepted.length>0);
  const moved=dist(result.points[fixture.bightIndex],fixture.points[fixture.bightIndex]);
  assert.ok(moved>1e-4,`bight moved ${moved}`);
  assert.ok(lengthError(result.points,fixture.restLengths)<=fixture.parameters.lengthTolerance);
  assert.equal(result.points.length,fixture.points.length);
  const session=createSession(fixture);
  assert.equal(validateSession(session).ok,true,validateSession(session).errors?.join(','));
  const cameras={cameraA:structuredClone(session.cameraA),cameraB:structuredClone(session.cameraA)};
  commitStep(session,result,cameras,handle);
  const encoded=serializeSession(session);
  const loaded=loadSession(encoded);
  assert.equal(loaded.ok,true,loaded.errors?.join(','));
  assert.equal(loaded.session.initialState.referenceId,'bamboo-u-v1');
  assert.equal(loaded.session.initialState.aperture,null);
  const replay=replaySession(loaded.session);
  assert.equal(replay.ok,true,replay.reason);
  assert.deepEqual(replay.points,result.points);
  const frames=playbackFrames(loaded.session);
  assert.deepEqual(frames[0],fixture.points);
  assert.deepEqual(frames.at(-1),result.points);
  assert.equal(undoSession(loaded.session),true);
  assert.deepEqual(loaded.session.points,fixture.points);
  assert.equal(loaded.session.initialState.referenceId,'bamboo-u-v1');
  assert.ok(lengthError(loaded.session.points,fixture.restLengths)<=fixture.parameters.lengthTolerance);
});

test('legacy sessions still round-trip and a foreign or corrupt fixture is rejected',()=>{
  const fixture=buildEditorFixture();
  const session=createSession(fixture);
  const handle=handleInterval(fixture.s0,fixture.pins,fixture.bightS0,fixture.diameter);
  const requestedPath=throughPath(fixture).slice(0,4);
  const result=applyEditorStep({
    points:fixture.points,restLengths:fixture.restLengths,pins:fixture.pins,column:fixture.column,
    diameter:fixture.diameter,handleIndices:handle.indices,requestedPath,parameters:fixture.parameters,
  });
  assert.equal(result.ok,true,result.reason);
  const cameras={cameraA:structuredClone(session.cameraA),cameraB:structuredClone(session.cameraA)};
  commitStep(session,result,cameras,handle);
  const loaded=loadSession(serializeSession(session));
  assert.equal(loaded.ok,true,loaded.errors?.join(','));
  assert.equal(loaded.session.initialState.referenceId,'loose-bight-v1');
  assert.ok(loaded.session.initialState.aperture);
  assert.deepEqual(replaySession(loaded.session).points,result.points);
  assert.equal(undoSession(loaded.session),true);
  assert.deepEqual(loaded.session.points,fixture.points);
  assert.equal(loaded.session.cameraA.up[2],1);

  const bamboo=JSON.parse(serializeSession(createSession(buildBambooFixture())));
  bamboo.initialState.referenceId='loose-bight-v1';
  const swapped=loadSession(bamboo);
  assert.equal(swapped.ok,false);
  assert.ok(swapped.errors.includes('fixture')||swapped.errors.includes('finite'));

  const unknown=JSON.parse(serializeSession(createSession(buildEditorFixture())));
  unknown.initialState.referenceId='not-a-fixture';
  const unsupported=loadSession(unknown);
  assert.equal(unsupported.ok,false);
  assert.ok(unsupported.errors.includes('fixture')||unsupported.errors.includes('finite'));

  const corrupt=JSON.parse(serializeSession(createSession(buildBambooFixture())));
  corrupt.points[0][0]+=0.02;
  corrupt.initialState.points[0][0]+=0.02;
  const broken=loadSession(corrupt);
  assert.equal(broken.ok,false);
  assert.ok(broken.errors.includes('fixture'));

  const historical=JSON.parse(readFileSync(new URL('../reports/rope-edit/session1.json',import.meta.url)));
  assert.equal(historical.initialState.referenceId,'loose-bight-v1');
  const archived=loadSession(historical);
  assert.equal(archived.ok,true,archived.errors?.join(','));
  assert.equal(archived.session.initialState.referenceId,'loose-bight-v1');
  assert.equal(replaySession(archived.session).ok,true);
});

test('camera gestures keep Z up, and only the middle button orbits',()=>{
  const camera=buildBambooFixture().cameraA;
  assert.deepEqual(camera.up,[0,0,1]);
  const before=len(viewOffset(camera));
  const turned=orbitStep(camera,24,-16);
  assert.deepEqual(turned.up,[0,0,1]);
  assert.ok(Math.abs(len(viewOffset(turned))-before)<1e-9);
  assert.ok(dist(turned.position,camera.position)>1e-4);
  const raised=orbitStep(camera,0,-30);
  const up=[0,0,1];
  const beforeLift=dot(viewOffset(camera),up)/len(viewOffset(camera));
  const afterLift=dot(viewOffset(raised),up)/len(viewOffset(raised));
  assert.ok(afterLift>beforeLift);
  const panned=panStep(camera,40,-20,{pixels:800});
  const moved=viewOffset(camera).map((v,k)=>v-viewOffset(panned)[k]);
  assert.ok(Math.max(...moved.map(Math.abs))<1e-9);
  assert.ok(dist(panned.target,camera.target)>1e-4);
  const closer=dollyStep(camera,-80);
  assert.ok(len(viewOffset(closer))<before-1e-4);
  assert.deepEqual(closer.up,[0,0,1]);
  const framed=frameCamera(camera,{center:[0.02,0,0.16],radius:0.2},{aspect:16/9});
  assert.deepEqual(framed.up,[0,0,1]);
  assert.deepEqual(framed.target,[0.02,0,0.16]);
  const triad=triadPlacement(camera);
  const offset=viewOffset(camera);
  const cross=[
    offset[1]*triad.position[2]-offset[2]*triad.position[1],
    offset[2]*triad.position[0]-offset[0]*triad.position[2],
    offset[0]*triad.position[1]-offset[1]*triad.position[0],
  ];
  assert.ok(len(cross)<1e-9);
  assert.deepEqual(triad.up,camera.up);

  assert.equal(pointerAction({button:1}),'orbit');
  assert.equal(pointerAction({button:1,altKey:true}),'pan');
  assert.equal(pointerAction({button:2,altKey:true}),'dolly');
  assert.equal(pointerAction({button:2}),'none');
  assert.equal(pointerAction({button:0}),'rope');
  assert.equal(pointerAction({button:0,altKey:true}),'rope');
  assert.equal(classifyNavigationGesture({button:0,altKey:true}),null);
  assert.equal(pointerAction({button:1,ropeDrag:true}),'none');
  assert.equal(pointerAction({button:0,ropeDrag:true}),'rope');
  assert.equal(pointerAction({button:1,cameraEnabled:false}),'none');
  assert.equal(pointerAction({button:0,navigating:true}),'none');
});
