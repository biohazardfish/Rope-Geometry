import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSomerville,SOMERVILLE_PRESETS,seedClearance} from '../src/somerville-build.js';
import {dressedTube} from '../src/somerville-dressed.js';
import {checkTube} from '../src/rope-tube.js';
import {validateOperations} from '../src/somerville-verify.js';
import {toLocal,toWorld} from '../src/rope-state.js';

const TOTAL=7.138936637394829;
const frame={origin:[0.3,-0.2,0.4],axes:[[0,1,0],[0,0,1],[1,0,0]]};
const directionFrame={origin:[0,0,0],axes:frame.axes};

function moveFrame(child){
  return {origin:toWorld(child.origin,frame),axes:child.axes.map(axis=>toWorld(axis,directionFrame))};
}
function moveDocument(doc){
  const moved=structuredClone(doc);
  moved.ropes[0].points=doc.ropes[0].points.map(point=>toWorld(point,frame));
  moved.somerville.referenceFrame=frame;
  moved.somerville.column.center=toWorld(doc.somerville.column.center,frame);
  moved.somerville.aperture.center=toWorld(doc.somerville.aperture.center,frame);
  moved.somerville.aperture.normal=toWorld(doc.somerville.aperture.normal,directionFrame);
  moved.somerville.aperture.frame=moveFrame(doc.somerville.aperture.frame);
  moved.somerville.underpass.frame=moveFrame(doc.somerville.underpass.frame);
  return moved;
}

test('dressed presets are a doubled static seed with spare in both tails',()=>{
  for(const name of ['dressedTight','looseDressed']){
    const doc=buildSomerville(SOMERVILLE_PRESETS[name]);
    const ops=validateOperations(doc,{scope:'final'});
    const labels=doc.ropes[0].segmentLabels;
    assert.equal(doc.somerville.route,'dressed');
    assert.equal(doc.somerville.config.totalLength,TOTAL);
    assert.equal(doc.somerville.materialArc[0],0);
    assert.equal(doc.somerville.materialArc.at(-1),TOTAL);
    assert.equal(doc.somerville.material.origin,'E0');
    assert.equal(doc.somerville.material.spare,'both-tails');
    assert.ok(Math.abs(doc.somerville.material.lengthResidual)<1e-9);
    assert.ok(doc.somerville.config.spread>=doc.ropes[0].diameter+0.0002);
    assert.equal(doc.somerville.acceptance.constructionCorrespondence,'UNVERIFIED');
    assert.equal(doc.somerville.acceptance.pose,'UNVERIFIED');
    assert.equal(ops.valid,true);
    assert.equal(validateOperations(doc,{scope:'construction'}).checks.diagonalOverFrontCuff,false);
    assert.ok(labels.includes('tail/0')&&labels.includes('tail/1')&&labels.includes('fold'));
  }
});

test('dressed passages follow the aperture frame through tilt and rigid motion',()=>{
  const upright=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const tilted=buildSomerville({...SOMERVILLE_PRESETS.dressedTight,planeTilt:0.45});
  const uprightOps=validateOperations(upright,{scope:'final'});
  const tiltedOps=validateOperations(tilted,{scope:'final'});
  assert.equal(uprightOps.checks.firstPassage,true);
  assert.equal(uprightOps.checks.secondSameDirection,true);
  assert.equal(tiltedOps.checks.firstPassage,true);
  assert.equal(tiltedOps.checks.secondSameDirection,true);
  assert.equal(tiltedOps.checks.loopAperture,true);
  const stripped=structuredClone(tilted);
  delete stripped.somerville.aperture.frame;
  stripped.somerville.aperture.normal=[0,-1,0];
  assert.equal(validateOperations(stripped,{scope:'final'}).checks.firstPassage,false);
  assert.deepEqual(validateOperations(moveDocument(upright),{scope:'final'}).checks,uprightOps.checks);
  assert.deepEqual(validateOperations(moveDocument(tilted),{scope:'final'}).checks,tiltedOps.checks);
});

test('reversing a dressed passage or sinking the root overpass fails that check only',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  assert.equal(validateOperations(doc,{scope:'final'}).checks.firstPassage,true);
  assert.equal(validateOperations(doc,{scope:'final'}).checks.overRootBranches,true);
  const reversed=structuredClone(doc);
  const rope=reversed.ropes[0];
  const ids=rope.segmentLabels.flatMap((label,index)=>label==='first-passage/0'?[index]:[]);
  const start=ids[0],end=ids.at(-1)+1;
  rope.points.splice(start,end-start+1,...rope.points.slice(start,end+1).reverse());
  assert.equal(validateOperations(reversed,{scope:'final'}).checks.firstPassage,false);
  const sunk=structuredClone(doc);
  const normal=sunk.somerville.aperture.normal;
  const labels=sunk.ropes[0].segmentLabels;
  for(let i=0;i<labels.length;i++)if(labels[i].startsWith('over-root/')){
    sunk.ropes[0].points[i+1]=sunk.ropes[0].points[i+1].map((value,axis)=>value-normal[axis]*0.12);
  }
  assert.equal(validateOperations(sunk,{scope:'final'}).checks.overRootBranches,false);
});

function circumradius(a,b,c){
  const ab=b.map((v,k)=>v-a[k]),bc=c.map((v,k)=>v-b[k]),ac=c.map((v,k)=>v-a[k]);
  const area=Math.hypot(ab[1]*bc[2]-ab[2]*bc[1],ab[2]*bc[0]-ab[0]*bc[2],ab[0]*bc[1]-ab[1]*bc[0]);
  return area<1e-12?Infinity:Math.hypot(...ab)*Math.hypot(...bc)*Math.hypot(...ac)/(2*area);
}

function turnDegrees(a,b,c){
  const incoming=b.map((value,axis)=>value-a[axis]);
  const outgoing=c.map((value,axis)=>value-b[axis]);
  const incomingLength=Math.hypot(...incoming),outgoingLength=Math.hypot(...outgoing);
  const cosine=incoming.reduce((sum,value,axis)=>sum+value*outgoing[axis],0)/(incomingLength*outgoingLength);
  return Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI;
}

test('dressed tube section radius is half the rope diameter',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const mesh=dressedTube(doc),rope=doc.ropes[0],i=Math.floor(rope.points.length/2);
  for(let j=0;j<mesh.radialSegments;j++){
    const vertex=mesh.vertices[i*mesh.radialSegments+j];
    const distance=Math.hypot(...vertex.map((value,axis)=>value-rope.points[i][axis]));
    assert.ok(Math.abs(distance-rope.diameter/2)<1e-9,`section radius ${distance}`);
  }
});

test('over-root sweep is monotonic across both root hits',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const sweep=doc.somerville.overRootSweep,frame=doc.somerville.aperture.frame,points=doc.ropes[0].points;
  for(const range of [sweep.limb0,sweep.limb1]){
    const xs=[];
    for(let i=range[0];i<=range[1];i++)xs.push(toLocal(points[i],frame)[0]);
    const sign=Math.sign(xs.at(-1)-xs[0]);
    assert.notEqual(sign,0);
    for(let i=1;i<xs.length;i++)assert.ok((xs[i]-xs[i-1])*sign>=-1e-8);
    const lo=Math.min(...xs),hi=Math.max(...xs);
    for(const hit of sweep.hitLocalX)assert.ok(lo<=hit&&hit<=hi);
  }
  const gap=seedClearance(doc);
  assert.equal(gap.groups['over-root/0 | over-root/0'],undefined);
  assert.equal(gap.groups['over-root/1 | over-root/1'],undefined);
  assert.equal(validateOperations(doc,{scope:'final'}).checks.overRootBranches,true);
});

test('requested dressed fillets generate an arc rather than a sharp corner',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const spine=doc.somerville.spine;
  assert.ok(doc.somerville.fillets.some(fillet=>fillet.role==='over-root'));
  assert.ok(doc.somerville.fillets.some(fillet=>fillet.role==='under-approach'));
  assert.ok(doc.somerville.fillets.some(fillet=>fillet.role==='return-approach'));
  for(const fillet of doc.somerville.fillets){
    let radius=Infinity;
    for(let i=fillet.spine[0]+1;i<fillet.spine[1];i++)radius=Math.min(radius,circumradius(spine[i-1],spine[i],spine[i+1]));
    assert.ok(radius>=fillet.radius*0.85&&radius<=fillet.radius*1.15,`${fillet.role} radius ${radius} vs ${fillet.radius}`);
    for(const i of [fillet.spine[0]-1,fillet.spine[0],fillet.spine[1],fillet.spine[1]+1]){
      if(i<=0||i>=spine.length-1)continue;
      assert.ok(turnDegrees(spine[i-1],spine[i],spine[i+1])<10,`${fillet.role} has a sharp fillet join at ${i}`);
    }
  }
});

test('dressed tight seed clears the complete static geometry gates',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const clearance=seedClearance(doc);
  const tube=checkTube(dressedTube(doc),{column:doc.somerville.column});
  assert.equal(clearance.penetratingPairs,0);
  assert.ok(clearance.minimumNonlocalGap>=0.0002);
  assert.ok(clearance.minimumColumnGap>=0.0002);
  assert.equal(tube.selfIntersections,0);
  assert.equal(tube.foldedFaces,0);
  assert.equal(tube.columnPenetrations,0);
  assert.equal(tube.valid,true);
  assert.equal(validateOperations(doc,{scope:'final'}).valid,true);
  assert.ok(Math.abs(doc.somerville.material.lengthResidual)<1e-9);
});

test('dressed static clearance is reported without treating a penetrating seed as accepted',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const gap=seedClearance(doc);
  assert.ok(gap.minimumColumnGap>=0.0002);
  assert.equal(doc.somerville.acceptance.geometry,'UNVERIFIED');
  assert.equal(doc.somerville.stage,'dressed-candidate');
  if(gap.penetratingPairs===0&&gap.minimumNonlocalGap>=0.0002)assert.ok(gap.minimumNonlocalGap>=0.0002);
  else{
    assert.ok(gap.penetratingPairs>0);
    assert.ok(gap.minimumNonlocalGap<0.0002);
  }
});
