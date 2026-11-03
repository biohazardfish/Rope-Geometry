import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSomerville,SOMERVILLE_PRESETS,seedClearance} from '../src/somerville-build.js';
import {validateOperations} from '../src/somerville-verify.js';
import {toWorld} from '../src/rope-state.js';

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

test('dressed static clearance is reported without treating a penetrating seed as accepted',()=>{
  const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
  const gap=seedClearance(doc);
  assert.ok(gap.minimumColumnGap>=0.0002);
  assert.equal(doc.somerville.acceptance.geometry,'UNVERIFIED');
  if(gap.penetratingPairs===0&&gap.minimumNonlocalGap>=0.0002){
    assert.ok(gap.minimumNonlocalGap>=0.0002);
  }else{
    assert.ok(gap.penetratingPairs>0);
    assert.ok(gap.minimumNonlocalGap<0.0002);
    assert.ok(gap.groups['over-root/1 | over-root/1']>0);
    assert.ok(gap.groups['loop-to-cuff/0 | loop-to-cuff/1']>0);
  }
});
