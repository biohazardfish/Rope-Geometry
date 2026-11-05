import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSomerville,SOMERVILLE_PRESETS,seedClearance} from '../src/somerville-build.js';
import {dressedTube} from '../src/somerville-dressed.js';
import {validateOperations} from '../src/somerville-verify.js';
import {checkTube} from '../src/rope-tube.js';

const preset=SOMERVILLE_PRESETS.dressedTight;
const targetGap=0.0002;
const imageCore=[0.034,0.028];
// Modelling choice: roles that sit in the locking core, not the cuff or the free bight legs' full reach.
const lockingCoreRoles=new Set(['loop-rim','first-passage','over-root','return-passage','bight-leg','fold']);
const grid=[{}];
for(const coreOffset of [preset.coreOffset,preset.coreOffset+0.004])
  for(const rootDepth of [preset.rootDepth,preset.rootDepth+0.014])
    for(const rimPitch of [preset.rimPitch,preset.rimPitch-0.004])
      grid.push({coreOffset,rootDepth,rimPitch});

function box(points,labels,diameter,accept){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,count=0;
  for(let i=0;i<points.length;i++){
    const role=i===0?labels[0]:labels[i-1];
    if(!accept(role))continue;
    count++;
    const p=points[i];
    minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);
  }
  if(!count)return null;
  return {points:count,width:maxX-minX+diameter,height:maxZ-minZ+diameter};
}
function foldedByRole(mesh,labels){
  const radial=mesh.radialSegments,counts={};
  const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),norm=a=>Math.hypot(...a);
  mesh.indices.forEach((ids,i)=>{
    const tri=ids.map(k=>mesh.vertices[k]),n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));
    if(norm(n)<1e-14||mesh.expectedNormals?.[i]&&dot(n,mesh.expectedNormals[i])<=0){
      const segment=Math.floor(i/(radial*2)),role=segment<labels.length?labels[segment]:'cap';
      counts[role]=(counts[role]||0)+1;
    }
  });
  return counts;
}
function measure(options){
  const doc=buildSomerville(options);
  const rope=doc.ropes[0],labels=rope.segmentLabels;
  const finalOps=validateOperations(doc,{scope:'final'}),construction=validateOperations(doc,{scope:'construction'}),clearance=seedClearance(doc);
  const mesh=dressedTube(doc);
  const tube=checkTube(mesh,{column:doc.somerville.column});
  // The frozen gate uses 12 radial segments. The sweep records whether the same centreline also passes at other resolutions.
  const radialSweep=[8,16,24].map(radialSegments=>{const other=checkTube(dressedTube(doc,{radialSegments}),{column:doc.somerville.column});return {radialSegments,valid:other.valid,selfIntersections:other.selfIntersections,foldedFaces:other.foldedFaces,columnPenetrations:other.columnPenetrations};});
  const roleOf=face=>{const segment=Math.floor(face/(mesh.radialSegments*2));return segment<labels.length?labels[segment]:'cap';};
  const tubeRoles={};
  for(const [a,b] of tube.intersectionPairs){const key=[roleOf(a),roleOf(b)].sort().join(' | ');tubeRoles[key]=(tubeRoles[key]||0)+1;}
  const base=role=>role.replace(/\/\d+$/,'');
  const silhouette={
    allNonTail:{...box(rope.points,labels,rope.diameter,role=>!role.startsWith('tail/')),includes:'every non-tail point, including the cuff and the bight'},
    lockingCore:{...box(rope.points,labels,rope.diameter,role=>lockingCoreRoles.has(base(role))),includes:'loop-rim, first-passage, over-root, return-passage, bight-leg, fold',modellingChoice:true,imageTarget:imageCore,imageTargetMeans:'visible locking core on the 148 s frame, not a pass/fail gate'}
  };
  const gates={
    finalOperations:finalOps.valid===true,
    constructionDiagonalAbsent:construction.checks.diagonalOverFrontCuff===false,
    penetratingPairs:clearance.penetratingPairs===0,
    minimumNonlocalGap:clearance.minimumNonlocalGap>=targetGap,
    minimumColumnGap:clearance.minimumColumnGap>=targetGap,
    tube:tube.valid===true,
    lengthResidual:Math.abs(doc.somerville.material.lengthResidual)<1e-9,
    spread:doc.somerville.config.spread>=rope.diameter+targetGap
  };
  return {doc,finalOps,construction,clearance,tube,radialSweep,tubeRoles,silhouette,gates,folded:foldedByRole(mesh,labels),pointsSha256:createHash('sha256').update(JSON.stringify(rope.points)).digest('hex')};
}
function rank(row){
  const passed=Object.values(row.gates).every(Boolean);
  return [passed?1:0,row.tube.valid?1:0,row.finalOps.valid?-row.clearance.penetratingPairs:-1e9,Math.round(row.clearance.minimumNonlocalGap*1e6)];
}
function better(a,b){
  const x=rank(a),y=rank(b);
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i];
  return false;
}
function publish(row){
  return {
    finalValid:row.finalOps.valid,
    gates:row.gates,
    penetratingPairs:row.clearance.penetratingPairs,
    minimumNonlocalGap:row.clearance.minimumNonlocalGap,
    minimumColumnGap:row.clearance.minimumColumnGap,
    closest:row.clearance.closest,
    groups:row.clearance.groups,
    tube:{valid:row.tube.valid,selfIntersections:row.tube.selfIntersections,foldedFaces:row.tube.foldedFaces,columnPenetrations:row.tube.columnPenetrations,minimumColumnGap:row.tube.minimumColumnGap,triangles:row.tube.triangles,radius:row.doc.ropes[0].diameter/2,radialSegments:12,intersectionSample:row.tubeRoles,foldedByRole:row.folded,radialSweep:row.radialSweep,radialSweepMeaning:'same centreline re-meshed at other resolutions; informational, the gate is the 12-segment mesh'},
    silhouette:row.silhouette,
    material:row.doc.somerville.material,
    sections:row.doc.somerville.sections.map(section=>({role:section.role,length:section.materialEnd-section.materialStart})),
    pointsSha256:row.pointsSha256
  };
}

const fixed=measure(preset);
const trials=[];
let best=null;
for(const extra of grid){
  try{
    const row=measure({...preset,...extra});
    trials.push({options:extra,...publish(row)});
    if(!best||better(row,best.row))best={row,options:extra};
  }catch(error){trials.push({options:extra,error:error.message});}
}
// Selection policy: the fixed preset is the deliverable whenever it passes every gate. The grid is a rescue
// search only; it must not move a frozen seed because a neighbour happens to have a wider gap.
const fixedPassed=Object.values(fixed.gates).every(Boolean);
const gridBest=best;
if(fixedPassed)best={row:fixed,options:{}};
const selectionPolicy=fixedPassed?'fixed preset passed every gate; grid recorded for reference only':'fixed preset failed a gate; best grid candidate selected';
const frozen=Object.values(best.row.gates).every(Boolean);
const doc=best.row.doc;
if(frozen){
  doc.somerville.stage='loose-v3';
  doc.somerville.acceptance.geometry='PASS';
  doc.somerville.acceptance.operations='PASS';
  doc.somerville.acceptance.numericStaticOperations='PASS';
}
const report={
  stage:frozen?'loose-v3':'dressed-candidate',
  frozenLooseV3:frozen,
  tubeRadius:preset.diameter/2,
  fixedPreset:{options:preset,...publish(fixed)},
  selectionPolicy,
  selectedOptions:best.options,
  selected:publish(best.row),
  gridBest:{options:gridBest.options,gates:gridBest.row.gates,minimumNonlocalGap:gridBest.row.clearance.minimumNonlocalGap,pointsSha256:gridBest.row.pointsSha256},
  trials,
  blockers:frozen?[]:[
    best.row.clearance.penetratingPairs?`nonlocal centerline penetrations remain (${best.row.clearance.penetratingPairs}), closest ${best.row.clearance.closest?.roles?.join(' | ')}`:'',
    best.row.clearance.minimumColumnGap<targetGap?'column clearance is below 0.2 mm':'',
    best.row.tube.valid?'':'tube self-intersection, fold, or column check failed',
    'construction correspondence and pose are outside this seed report'
  ].filter(Boolean)
};
mkdirSync('data/somerville-final',{recursive:true});
mkdirSync('reports',{recursive:true});
writeFileSync('data/somerville-final/dressed-candidate.json',JSON.stringify(doc));
writeFileSync('reports/somerville-dressed-seed.json',JSON.stringify(report,null,2));
if(frozen)writeFileSync('data/somerville-final/loose-v3.json',JSON.stringify(doc));
console.log(JSON.stringify({frozen,fixedPairs:fixed.clearance.penetratingPairs,fixedGap:fixed.clearance.minimumNonlocalGap,fixedTube:fixed.tube.valid,selected:best.options,selectedPairs:best.row.clearance.penetratingPairs,selectedTube:best.row.tube.valid},null,2));
