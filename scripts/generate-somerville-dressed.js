import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSomerville,SOMERVILLE_PRESETS,seedClearance} from '../src/somerville-build.js';
import {validateOperations} from '../src/somerville-verify.js';
import {makeTube,checkTube} from '../src/rope-tube.js';

const preset=SOMERVILLE_PRESETS.dressedTight;
const targetGap=0.0002,targetSilhouette=[0.034,0.028];
const grid=[{}];
for(const coreOffset of [preset.coreOffset,preset.coreOffset+0.004])
  for(const rootDepth of [preset.rootDepth,preset.rootDepth+0.014])
    for(const rimPitch of [preset.rimPitch,preset.rimPitch-0.004])
      grid.push({coreOffset,rootDepth,rimPitch});

function evaluate(options){
  const doc=buildSomerville(options);
  return {doc,finalOps:validateOperations(doc,{scope:'final'}),construction:validateOperations(doc,{scope:'construction'}),clearance:seedClearance(doc)};
}
function better(a,b){
  const score=row=>{const c=row.clearance;return [row.finalOps.valid&&c.minimumColumnGap>=targetGap?1:0,row.finalOps.valid?-c.penetratingPairs:-1e9,Math.round(c.minimumNonlocalGap*1e6)];};
  const x=score(a),y=score(b);
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i];
  return false;
}
const trials=[];
let best=null;
for(const extra of grid){
  try{
    const row=evaluate({...preset,...extra});
    const trial={options:extra,finalValid:row.finalOps.valid,penetratingPairs:row.clearance.penetratingPairs,minimumNonlocalGap:row.clearance.minimumNonlocalGap,minimumColumnGap:row.clearance.minimumColumnGap};
    trials.push(trial);
    if(!best||better(row,best.row))best={row,trial};
  }catch(error){trials.push({options:extra,error:error.message});}
}
const {doc,finalOps,construction,clearance}=best.row;
const rope=doc.ropes[0];
const mesh=makeTube(rope.points,rope.diameter,{radialSegments:12});
const tube=checkTube(mesh,{column:{axis:doc.somerville.column.axis,radius:doc.somerville.column.radius,center:doc.somerville.column.center}});
const labels=rope.segmentLabels;
const roleOf=face=>{const segment=Math.floor(face/(mesh.radialSegments*2));return segment<labels.length?labels[segment]:'cap';};
const tubeRoles={};
for(const [a,b] of tube.intersectionPairs){const key=[roleOf(a),roleOf(b)].sort().join(' | ');tubeRoles[key]=(tubeRoles[key]||0)+1;}
let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
for(let i=0;i<rope.points.length;i++){
  const role=i===0?labels[0]:labels[i-1];
  if(role.startsWith('tail/'))continue;
  const p=rope.points[i];
  minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);
}
const silhouette={width:maxX-minX+rope.diameter,height:maxZ-minZ+rope.diameter,target:targetSilhouette};
silhouette.residual=[silhouette.width-targetSilhouette[0],silhouette.height-targetSilhouette[1]];
const lengthResidual=doc.somerville.material.lengthResidual;
const gates={
  finalOperations:finalOps.valid===true,
  constructionDiagonalAbsent:construction.checks.diagonalOverFrontCuff===false,
  penetratingPairs:clearance.penetratingPairs===0,
  minimumNonlocalGap:clearance.minimumNonlocalGap>=targetGap,
  minimumColumnGap:clearance.minimumColumnGap>=targetGap,
  tube:tube.valid===true,
  lengthResidual:Math.abs(lengthResidual)<1e-9,
  spread:doc.somerville.config.spread>=rope.diameter+0.0002
};
const frozen=Object.values(gates).every(Boolean);
const report={
  stage:frozen?'loose-v3':'dressed-candidate',
  frozenLooseV3:frozen,
  constructionCorrespondence:'UNVERIFIED',
  pose:'UNVERIFIED',
  numericStaticOperations:finalOps.valid?'PASS':'FAIL',
  selectedOptions:best.trial.options,
  trials,
  gates,
  finalChecks:finalOps.checks,
  constructionChecks:construction.checks,
  clearance:{minimumNonlocalGap:clearance.minimumNonlocalGap,minimumColumnGap:clearance.minimumColumnGap,penetratingPairs:clearance.penetratingPairs,closest:clearance.closest,groups:clearance.groups,limitation:clearance.limitation},
  tube:{valid:tube.valid,status:tube.status,selfIntersections:tube.selfIntersections,foldedFaces:tube.foldedFaces,columnPenetrations:tube.columnPenetrations,minimumColumnGap:tube.minimumColumnGap,triangles:tube.triangles,testedPairs:tube.testedPairs,intersectionSample:tube.intersectionPairs.length,rolePairsInSample:tubeRoles},
  material:doc.somerville.material,
  sections:doc.somerville.sections.map(section=>({role:section.role,length:section.materialEnd-section.materialStart})),
  silhouette,
  pointsSha256:createHash('sha256').update(JSON.stringify(rope.points)).digest('hex'),
  blockers:frozen?[]:[
    clearance.penetratingPairs?`nonlocal centerline penetrations remain (${clearance.penetratingPairs}), closest ${clearance.closest?.roles?.join(' | ')}`:'',
    clearance.minimumColumnGap<targetGap?'column clearance is below 0.2 mm':'',
    tube.valid?'':'tube self-intersection, fold, or column check failed',
    'construction correspondence and pose remain UNVERIFIED'
  ].filter(Boolean)
};
if(frozen){
  doc.somerville.stage='loose-v3';
  doc.somerville.acceptance.geometry='PASS';
  doc.somerville.acceptance.operations='PASS';
  doc.somerville.acceptance.numericStaticOperations='PASS';
}
mkdirSync('data/somerville-final',{recursive:true});
mkdirSync('reports',{recursive:true});
writeFileSync('data/somerville-final/dressed-candidate.json',JSON.stringify(doc));
writeFileSync('reports/somerville-dressed-report.json',JSON.stringify(report,null,2));
if(frozen)writeFileSync('data/somerville-final/loose-v3.json',JSON.stringify(doc));
console.log(JSON.stringify({frozen,gates,pairs:clearance.penetratingPairs,gap:clearance.minimumNonlocalGap,column:clearance.minimumColumnGap,tube:tube.valid,selected:best.trial.options,silhouette},null,2));
