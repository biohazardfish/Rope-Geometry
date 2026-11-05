// Adaptive parameter continuation for the dressed Somerville seed.
// Every accepted step must pass the same static gates as the frozen seed: zero nonlocal centreline penetrations,
// nonlocal surface gap and column gap at or above 0.2 mm, nine final operation checks, and a valid 3 mm tube.
// The script never writes loose-v3. It records where each route stalls and which segment pair blocked it.
//
//   node scripts/march-dressed.js                 all routes, independent then chained
//   node scripts/march-dressed.js loopRadius      one route
//   node scripts/march-dressed.js --emit-docs     also write reached geometry under work/somerville/dressed/march/
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSomerville,SOMERVILLE_PRESETS,seedClearance} from '../src/somerville-build.js';
import {dressedTube} from '../src/somerville-dressed.js';
import {validateOperations} from '../src/somerville-verify.js';
import {checkTube} from '../src/rope-tube.js';

const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),norm=a=>Math.hypot(...a);
const base=SOMERVILLE_PRESETS.dressedTight;
const targetGap=0.0002;
const minStep=1/64;
const lockingCoreRoles=new Set(['loop-rim','first-passage','over-root','return-passage','bight-leg','fold']);
const imageCore=[0.034,0.028];
// Targets in the order the plan asks for. Values in metres.
const ROUTES=[
  {name:'loopRadius',from:base.loopRadius,to:0.014},
  {name:'coreOffset',from:base.coreOffset,to:0.020},
  {name:'rootDepth',from:base.rootDepth,to:0.050},
  {name:'cuffWidth',from:base.cuffWidth,to:0.028}
];
const args=process.argv.slice(2);
const emitDocs=args.includes('--emit-docs');
const only=args.filter(a=>!a.startsWith('--'));
const routes=only.length?ROUTES.filter(r=>only.includes(r.name)):ROUTES;
if(!routes.length)throw Error(`Unknown route ${only}; choose from ${ROUTES.map(r=>r.name)}`);

function box(points,labels,diameter){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,count=0;
  const baseRole=role=>role.replace(/\/\d+$/,'');
  for(let i=0;i<points.length;i++){
    const role=i===0?labels[0]:labels[i-1];
    if(!lockingCoreRoles.has(baseRole(role)))continue;
    count++;const p=points[i];
    minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);
  }
  return count?{width:maxX-minX+diameter,height:maxZ-minZ+diameter}:null;
}
function evaluate(options){
  try{
    const doc=buildSomerville(options),rope=doc.ropes[0];
    const clearance=seedClearance(doc);
    if(clearance.penetratingPairs>0)return {ok:false,gate:'penetratingPairs',why:`${clearance.penetratingPairs} pairs, closest ${clearance.closest?.roles?.join(' | ')} gap ${(clearance.minimumNonlocalGap*1e3).toFixed(3)} mm`,closest:clearance.closest,groups:Object.keys(clearance.groups)};
    if(clearance.minimumNonlocalGap<targetGap)return {ok:false,gate:'minimumNonlocalGap',why:`gap ${(clearance.minimumNonlocalGap*1e3).toFixed(3)} mm at ${clearance.closest?.roles?.join(' | ')}`,closest:clearance.closest};
    if(clearance.minimumColumnGap<targetGap)return {ok:false,gate:'minimumColumnGap',why:`column gap ${(clearance.minimumColumnGap*1e3).toFixed(3)} mm`};
    const ops=validateOperations(doc,{scope:'final'});
    if(ops.valid!==true){const bad=Object.keys(ops.checks).filter(k=>ops.checks[k]!==true);return {ok:false,gate:'finalOperations',why:`failed ${bad.join(', ')}`,failedChecks:bad};}
    const mesh=dressedTube(doc),tube=checkTube(mesh,{column:doc.somerville.column});
    if(!tube.valid){
      const labels=rope.segmentLabels,roleOf=face=>{const segment=Math.floor(face/(mesh.radialSegments*2));return segment<labels.length?labels[segment]:'cap';};
      const selfRoles={};for(const [a,b] of tube.intersectionPairs){const key=[roleOf(a),roleOf(b)].sort().join(' | ');selfRoles[key]=(selfRoles[key]||0)+1;}
      const foldRoles={};mesh.indices.forEach((ids,i)=>{const tri=ids.map(k=>mesh.vertices[k]),n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));if(norm(n)<1e-14||mesh.expectedNormals?.[i]&&dot(n,mesh.expectedNormals[i])<=0){const key=roleOf(i);foldRoles[key]=(foldRoles[key]||0)+1;}});
      return {ok:false,gate:'tube',why:`self ${tube.selfIntersections} fold ${tube.foldedFaces} column ${tube.columnPenetrations} at ${Object.keys(selfRoles).concat(Object.keys(foldRoles).map(r=>`fold:${r}`)).join(', ')}`,tube:{selfIntersections:tube.selfIntersections,foldedFaces:tube.foldedFaces,columnPenetrations:tube.columnPenetrations,selfRoles,foldRoles}};
    }
    if(Math.abs(doc.somerville.material.lengthResidual)>=1e-9)return {ok:false,gate:'lengthResidual',why:`residual ${doc.somerville.material.lengthResidual}`};
    return {ok:true,doc,gap:clearance.minimumNonlocalGap,columnGap:clearance.minimumColumnGap,closest:clearance.closest?.roles,tubeColumnGap:tube.minimumColumnGap,lockingCore:box(rope.points,rope.segmentLabels,rope.diameter),pointsSha256:createHash('sha256').update(JSON.stringify(rope.points)).digest('hex')};
  }catch(error){return {ok:false,gate:'build',why:error.message};}
}
function march(route,start){
  const from=start[route.name]??route.from,to=route.to;
  const at=s=>({...start,[route.name]:from+(to-from)*s});
  const steps=[];
  let s=0,h=1,best=null,lastFail=null;
  const origin=evaluate(at(0));
  if(!origin.ok)return {route:route.name,from,to,reached:from,s:0,originFailed:origin,steps};
  best=origin;
  while(s<1&&h>=minStep){
    const t=Math.min(1,s+h),r=evaluate(at(t));
    const value=from+(to-from)*t;
    if(r.ok){
      s=t;best=r;lastFail=null;h=Math.min(h*1.5,1-s||1);
      steps.push({s:+t.toFixed(5),value:+value.toFixed(6),ok:true,gap:r.gap,columnGap:r.columnGap,closest:r.closest,lockingCore:r.lockingCore});
      console.log(`${route.name} ok   s=${t.toFixed(4)} ${route.name}=${(value*1e3).toFixed(2)}mm gap=${(r.gap*1e3).toFixed(3)}mm col=${(r.columnGap*1e3).toFixed(3)}mm core=${r.lockingCore?`${(r.lockingCore.width*1e3).toFixed(0)}x${(r.lockingCore.height*1e3).toFixed(0)}mm`:'-'}`);
    }else{
      lastFail={s:+t.toFixed(5),value:+value.toFixed(6),...r};
      steps.push({s:+t.toFixed(5),value:+value.toFixed(6),ok:false,gate:r.gate,why:r.why});
      console.log(`${route.name} fail s=${t.toFixed(4)} ${route.name}=${(value*1e3).toFixed(2)}mm ${r.gate}: ${r.why}`);
      h/=2;
    }
  }
  const reached=from+(to-from)*s;
  return {
    route:route.name,from,to,target:to,reached:+reached.toFixed(6),s:+s.toFixed(5),completed:s>=1,
    reachedOptions:at(s),
    reachedState:{gap:best.gap,columnGap:best.columnGap,closest:best.closest,tubeColumnGap:best.tubeColumnGap,lockingCore:best.lockingCore,pointsSha256:best.pointsSha256},
    stall:s>=1?null:{nextTried:lastFail?.value,gate:lastFail?.gate,why:lastFail?.why,closest:lastFail?.closest?{roles:lastFail.closest.roles,gap:lastFail.closest.gap,segments:lastFail.closest.segments}:null,failedChecks:lastFail?.failedChecks,tube:lastFail?.tube,minStep},
    steps,doc:best.doc
  };
}

const started=new Date().toISOString();
const independent=[],chained=[];
for(const route of routes){
  console.log(`\n== independent ${route.name}: ${(route.from*1e3).toFixed(1)} -> ${(route.to*1e3).toFixed(1)} mm`);
  independent.push(march(route,{...base}));
}
let carry={...base};
if(routes.length>1){
  for(const route of routes){
    console.log(`\n== chained ${route.name} from ${JSON.stringify(Object.fromEntries(Object.entries(carry).filter(([k,v])=>v!==base[k])))}`);
    const r=march(route,carry);
    chained.push(r);
    carry=r.reachedOptions??carry;
  }
}
const strip=r=>{const {doc,...rest}=r;return rest;};
const report={
  generatedAt:started,
  base:'SOMERVILLE_PRESETS.dressedTight',
  gates:{penetratingPairs:0,minimumNonlocalGap:targetGap,minimumColumnGap:targetGap,finalOperations:'all nine PASS',tube:'dressedTube 12 radial segments valid',lengthResidual:'<1e-9'},
  imageTarget:{lockingCore:imageCore,meaning:'visible locking core on the 148 s frame; informational, not a gate'},
  independent:independent.map(strip),
  chained:chained.map(strip),
  chainedReachedOptions:routes.length>1?Object.fromEntries(Object.entries(carry).filter(([k,v])=>v!==base[k])):null,
  note:'loose-v3 is not modified by this script. Reached geometry is only written under work/ with --emit-docs.'
};
mkdirSync('reports',{recursive:true});
writeFileSync('reports/somerville-dressed-march.json',JSON.stringify(report,null,2));
if(emitDocs){
  mkdirSync('work/somerville/dressed/march',{recursive:true});
  for(const r of independent)if(r.doc)writeFileSync(`work/somerville/dressed/march/${r.route}.json`,JSON.stringify(r.doc));
  const last=chained.at(-1);
  if(last?.doc)writeFileSync('work/somerville/dressed/march/chained.json',JSON.stringify(last.doc));
}
console.log('\n'+JSON.stringify({
  independent:independent.map(r=>({route:r.route,reached:r.reached,target:r.target,completed:r.completed,stall:r.stall?.gate,core:r.reachedState?.lockingCore})),
  chained:chained.map(r=>({route:r.route,reached:r.reached,completed:r.completed,stall:r.stall?.gate,core:r.reachedState?.lockingCore}))
},null,2));
