// Baseline join diagnosis for the dressed static seed.
// Measures spine and offset-limb turning angles, ribbon side jumps, and role boundaries.
import {writeFileSync} from 'node:fs';
import {buildSomerville,SOMERVILLE_PRESETS,seedClearance} from '../../../src/somerville-build.js';
import {dressedTube} from '../../../src/somerville-dressed.js';
import {checkTube} from '../../../src/rope-tube.js';
import {validateOperations} from '../../../src/somerville-verify.js';

const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const norm=a=>Math.hypot(...a);
const unit=a=>{const n=norm(a);return a.map(v=>v/n);};
const deg=r=>r*180/Math.PI;
function turn(points,i){
  const a=sub(points[i],points[i-1]),b=sub(points[i+1],points[i]);
  const na=norm(a),nb=norm(b);
  if(na<1e-12||nb<1e-12)return {deg:null,na,nb};
  const c=Math.max(-1,Math.min(1,dot(a,b)/(na*nb)));
  return {deg:deg(Math.acos(c)),na,nb};
}
function worst(points,labelOf,limit=25){
  const rows=[];
  for(let i=1;i<points.length-1;i++){
    const t=turn(points,i);
    if(t.deg==null)continue;
    rows.push({i,role:labelOf(i),deg:t.deg,stepIn:t.na,stepOut:t.nb});
  }
  rows.sort((a,b)=>b.deg-a.deg);
  return {countOver20:rows.filter(r=>r.deg>20).length,countOver45:rows.filter(r=>r.deg>45).length,countOver90:rows.filter(r=>r.deg>90).length,worst:rows.slice(0,limit)};
}
function byRole(points,labelOf,threshold=20){
  const map=new Map();
  for(let i=1;i<points.length-1;i++){
    const t=turn(points,i);
    if(t.deg==null||t.deg<threshold)continue;
    const role=labelOf(i);
    const row=map.get(role)||{role,count:0,maxDeg:0,at:[]};
    row.count++;
    if(t.deg>row.maxDeg)row.maxDeg=t.deg;
    if(row.at.length<6)row.at.push({i,deg:+t.deg.toFixed(2)});
    map.set(role,row);
  }
  return [...map.values()].sort((a,b)=>b.maxDeg-a.maxDeg);
}

const doc=buildSomerville(SOMERVILLE_PRESETS.dressedTight);
const rope=doc.ropes[0];
const spine=doc.somerville.spine;
const ribbon=doc.somerville.ribbon;
const anchors=doc.somerville.rollAnchors;
const head=rope.segmentLabels.findIndex(label=>!label.startsWith('tail/'));
const spineRoles=[];
// Spine roles are not stored separately; recover them from limb/0 labels, which follow the spine after the head tail.
for(let i=0;i<spine.length;i++)spineRoles.push(rope.segmentLabels[head+i].replace(/\/0$/,''));
const limb0=spine.map((p,i)=>p.map((v,k)=>v+ribbon[i].side[k]*ribbon[i].halfWidth));
const limb1=spine.map((p,i)=>p.map((v,k)=>v-ribbon[i].side[k]*ribbon[i].halfWidth));
const roleOfSpine=i=>spineRoles[i];
const boundaries=[];
for(let i=1;i<spine.length-1;i++){
  if(spineRoles[i]===spineRoles[i-1]&&spineRoles[i]===spineRoles[i+1])continue;
  const t=turn(spine,i),a=turn(limb0,i),b=turn(limb1,i);
  boundaries.push({
    i,from:spineRoles[i-1],at:spineRoles[i],to:spineRoles[i+1],
    spineDeg:t.deg==null?null:+t.deg.toFixed(2),
    limb0Deg:a.deg==null?null:+a.deg.toFixed(2),
    limb1Deg:b.deg==null?null:+b.deg.toFixed(2)
  });
}
const sideJumps=[];
for(let i=1;i<ribbon.length;i++){
  const c=Math.max(-1,Math.min(1,dot(ribbon[i-1].side,ribbon[i].side)));
  const angle=deg(Math.acos(c));
  if(angle>15)sideJumps.push({i,role:spineRoles[i],deg:+angle.toFixed(2),anchor:anchors.filter(a=>a.spineIndex===i||a.spineIndex===i-1).map(a=>a.source)});
}
sideJumps.sort((a,b)=>b.deg-a.deg);
const tangentVsSide=[];
for(let i=1;i<spine.length-1;i++){
  const t=unit(sub(spine[Math.min(i+1,spine.length-1)],spine[Math.max(0,i-1)]));
  const align=Math.abs(dot(t,ribbon[i].side));
  if(align>0.7)tangentVsSide.push({i,role:spineRoles[i],align:+align.toFixed(3)});
}

const diagnosis={
  preset:'dressedTight',
  spinePoints:spine.length,
  ropePoints:rope.points.length,
  edgeGuardRadius:doc.somerville.config.edgeGuardRadius,
  spread:doc.somerville.config.spread,
  filletCount:doc.somerville.fillets.length,
  fillets:doc.somerville.fillets.map(f=>({role:f.role,radius:f.radius,spine:f.spine})),
  spineTurns:worst(spine,roleOfSpine),
  limb0Turns:worst(limb0,roleOfSpine),
  limb1Turns:worst(limb1,roleOfSpine),
  spineByRole:byRole(spine,roleOfSpine,15),
  limb0ByRole:byRole(limb0,roleOfSpine,15),
  limb1ByRole:byRole(limb1,roleOfSpine,15),
  roleBoundaries:boundaries.filter(b=>Math.max(b.spineDeg||0,b.limb0Deg||0,b.limb1Deg||0)>10),
  sideJumps:sideJumps.slice(0,40),
  sideNearlyParallelToTangent:tangentVsSide.slice(0,40),
  anchors:anchors.map(a=>({i:a.spineIndex,role:spineRoles[a.spineIndex],source:a.source,roll:+a.roll.toFixed(4)}))
};

console.log('turns ready', diagnosis.spineTurns.countOver20, diagnosis.limb0Turns.countOver45, diagnosis.limb1Turns.countOver45);
const clearance=seedClearance(doc);
diagnosis.clearance={
  penetratingPairs:clearance.penetratingPairs,
  minimumNonlocalGap:clearance.minimumNonlocalGap,
  minimumColumnGap:clearance.minimumColumnGap,
  closest:clearance.closest,
  groups:clearance.groups
};
console.log('clearance', clearance.penetratingPairs, clearance.groups);
const mesh=dressedTube(doc);
const tube=checkTube(mesh,{column:doc.somerville.column});
diagnosis.tube={valid:tube.valid,selfIntersections:tube.selfIntersections,foldedFaces:tube.foldedFaces,columnPenetrations:tube.columnPenetrations,minimumColumnGap:tube.minimumColumnGap};
diagnosis.operations=validateOperations(doc,{scope:'final'}).valid;
console.log('tube', diagnosis.tube, 'ops', diagnosis.operations);
const outputPath=process.argv[2]||'work/somerville/dressed/join-baseline.json';
writeFileSync(outputPath, JSON.stringify(diagnosis,null,2));
console.log(`wrote ${outputPath}`);
