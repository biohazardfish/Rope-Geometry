// Local construction experiment. Source constraints and chosen embedding are separate.
// This module never changes the saved cuff, Candidate A, or collision policy.
import { closestSegments, detectCollisions, EPSILON } from './geometry.js';

const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
const H = .008;
export const recoverySpec = {
  id: 'locking-core-recovery', diameter: .01,
  source: 'references/Documents/09 - The Somerville Bowline - A4 print friendly.pdf',
  scope: 'Isolated doubled locking-core fixture; exterior connector substitutes for the cuff ONLY to keep one physical path. It is not a reconstructed cuff.',
  assumptions: [
    { id: 'embedding', status: 'ASSUMED', description: 'Loop in local XY with +Z passage normal; its lower root passes beneath its upper root. Dimensions, root sign, limb identity and orientation relative to the target are hypotheses.' },
    { id: 'fixture-connection', status: 'ASSUMED', description: 'A remote exterior connector joins standing and working portions of each limb. It must be replaced by the unchanged cuff arcs before full acceptance.' },
    { id: 'limb-pairing', status: 'ASSUMED', description: 'E0 follows limb 0 through the core to one fold, then limb 1 in reverse to E1. No limb exchange inside the fixture.' }
  ],
  evidence: [
    { id: 'loop', page: 2, state: 'OBSERVED', relation: 'Standing bundle owns loop after transfer; direct loop formation and first working passage are explicitly described.' },
    { id: 'over-X', page: 2, state: 'OBSERVED', relation: 'Working bight passes over the X at the base of that loop.' },
    { id: 'under-cuff', page: 2, state: 'OBSERVED', relation: 'Whole working bight passes beneath the entire cuff.' },
    { id: 'return', page: 3, state: 'OBSERVED', relation: 'Bight returns through the loop in the same direction as its first passage.' }
  ]
};

// Right-handed rigid frame. Local +Z is outward from the front of the column.
export const toWorld = ([x,y,z]) => [-.11-y, -.10-z, x];
export const toLocal = ([x,y,z]) => [z, -.11-x, -.10-y];

export function generateCoreStage(stage) {
  if (![1,2,3,4].includes(stage)) throw Error('Stage must be 1–4');
  const base=[], offsets=[], roles=[];
  const push=(p, role, offset) => { base.push(p); offsets.push(offset); roles.push(role); };
  const line=(to,role,offset,rotation) => {
    const from=base.at(-1), old=offsets.at(-1), count=Math.max(1,Math.floor(distance(from,to)/.022));
    for(let i=1;i<=count;i++) {const t=i/count;push(mix(from,to,t),role,rotation?rotation(t):mix(old,offset,t));}
  };
  const Z=[0,0,H], X=[H,0,0];
  push([-.14,-.18,-.005],'standing-end',Z);
  line([.06,-.06,-.005],'root-in',Z);
  for(const p of [[.09,0,0],[.06,.08,0],[0,.11,0],[-.07,.08,0],[-.09,0,0],[-.06,-.06,.045]]) line(p,'loop-rim',Z);
  line([.14,-.18,.045],'root-out',Z);
  line([.20,-.30,.025],'fixture-connector',Z);
  line([-.03,-.40,.025],'fixture-connector',Z);
  line([-.03,-.60,.025],'fixture-frame-turn',X,t=>[H*Math.sin(t*Math.PI/2),0,H*Math.cos(t*Math.PI/2)]);
  line([-.03,-.60,-.035],'fixture-connector',X);
  line([-.03,.02,-.035],'fixture-connector',X);
  line([-.03,.02,.12],'first-passage',X);
  if(stage>=2) line([-.03,-.18,.12],'over-X',X);
  if(stage>=3) {
    line([-.03,-.28,.12],'outside-turn',Z,t=>[H*Math.cos(t*Math.PI/2),0,H*Math.sin(t*Math.PI/2)]);
    line([.04,-.28,.12],'outside-turn',Z);
    line([.04,-.24,.12],'outside-turn',X,t=>[H*Math.sin(t*Math.PI/2),0,H*Math.cos(t*Math.PI/2)]);
    line([.04,-.24,-.042],'descent-outside-cuff',X);
    line([.04,.02,-.042],'under-cuff',X);
  }
  if(stage>=4) line([.04,.02,.12],'return-passage',X);
  // Widen the actual fold rather than an acute reversal at the 16 mm limb spacing.
  const end=base.at(-1), direction=stage===2||stage===3?[0,-1,0]:[0,0,1];
  const tangent=stage===3?[0,1,0]:direction;
  const foldRadius=stage===3?.016:.03,foldSteps=stage===3?4:6;
  line(end.map((v,k)=>v+tangent[k]*.06),'fold-approach',[foldRadius,0,0]);
  const tip=base.at(-1), points=[], pointRoles=[];
  for(let i=0;i<base.length;i++){points.push(base[i].map((v,k)=>v+offsets[i][k]));pointRoles.push(roles[i]+'/0');}
  const foldStart=points.length-1;
  for(let i=1;i<foldSteps;i++){const a=Math.PI*i/foldSteps;points.push(tip.map((v,k)=>v+(k===0?foldRadius*Math.cos(a):0)+foldRadius*Math.sin(a)*tangent[k]));pointRoles.push('fold');}
  for(let i=base.length-1;i>=0;i--){points.push(base[i].map((v,k)=>v-offsets[i][k]));pointRoles.push(roles[i]+'/1');}
  const segmentRoles=pointRoles.slice(0,-1).map((r,i)=>{
    if(i>=foldStart&&i<foldStart+foldSteps)return 'fold';
    return i<foldStart?pointRoles[i+1]:r;
  });
  return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:`recovery-stage-${stage}`,diameter:.01,points:points.map(toWorld)}],recovery:{stage,spec:recoverySpec,pointRoles,segmentRoles,foldStart,localFrame:'world = [-0.11-localY, -0.10-localZ, localX]',cuffIntegrated:false,topologyVerified:false}};
}

// Proper projected crossing, with depth measured in a specified projection.
export function projectedCrossing(a,b,c,d) {
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1];
  const det=ux*vy-uy*vx;if(Math.abs(det)<1e-14)return null;
  const wx=c[0]-a[0],wy=c[1]-a[1],s=(wx*vy-wy*vx)/det,t=(wx*uy-wy*ux)/det;
  if(s<0||s>1||t<0||t>1)return null;
  const A=mix(a,b,s),B=mix(c,d,t);return {s,t,point:A.slice(0,2),depthA:A[2],depthB:B[2],depthDifference:A[2]-B[2]};
}

// Chosen spanning aperture of the local loop. This tests the candidate, not a photo.
export function aperturePassages(doc, role) {
  const p=doc.ropes[0].points.map(toLocal),r=doc.recovery.segmentRoles,out=[];
  for(let i=0;i<r.length;i++)if(r[i].startsWith(role+'/')){
    const a=p[i],b=p[i+1];if(a[2]*b[2]>0||a[2]===b[2])continue;
    const t=-a[2]/(b[2]-a[2]);if(t<0||t>=1)continue;const q=mix(a,b,t);
    // Interior rectangle strictly within both standing-limb projected rims.
    if(q[0]>-.06&&q[0]<.06&&q[1]>-.02&&q[1]<.06)out.push({segment:i,materialPosition:(i+t)/r.length,limb:r[i].endsWith('/0')?0:1,point:q,materialDirection:Math.sign(b[2]-a[2]),workingDirection:Math.sign(b[2]-a[2])*(r[i].endsWith('/0')?1:-1)});
  }return out;
}

export function validateCore(doc) {
  const rope=doc.ropes[0],p=rope.points,local=p.map(toLocal),roles=doc.recovery.segmentRoles;
  const raw=detectCollisions(doc.ropes),pairs=raw.collisions.map(c=>({...c,roles:[roles[+c.segmentA.split(':')[1]],roles[+c.segmentB.split(':')[1]]]}));
  let minimumGap=Infinity;
  for(let i=0;i<p.length-1;i++)for(let j=i+2;j<p.length-1;j++)minimumGap=Math.min(minimumGap,closestSegments(p[i],p[i+1],p[j],p[j+1]).distance-rope.diameter);
  const crossings=(roleA,roleB)=>{
    const out=[];for(let i=0;i<roles.length;i++)if(roles[i].startsWith(roleA+'/'))for(let j=0;j<roles.length;j++)if(roles[j].startsWith(roleB+'/')){
      const c=projectedCrossing(local[i],local[i+1],local[j],local[j+1]);if(c)out.push({segmentA:i,segmentB:j,...c});
    }return out;
  };
  const roots=crossings('root-out','root-in'),over=[...crossings('over-X','root-in'),...crossings('over-X','root-out')];
  const first=aperturePassages(doc,'first-passage'),second=aperturePassages(doc,'return-passage');
  const continuity=doc.ropes.length===1&&p.every(a=>a.length===3&&a.every(Number.isFinite))&&p.slice(1).every((a,i)=>distance(a,p[i])>0);
  const ordered=['first-passage',...(doc.recovery.stage>=2?['over-X']:[]),...(doc.recovery.stage>=3?['under-cuff']:[]),...(doc.recovery.stage>=4?['return-passage']:[])];
  const materialOrder=[0,1].map(limb=>{
    const intervals=ordered.map(role=>({role,indices:roles.flatMap((r,i)=>r===`${role}/${limb}`?[i]:[])}));
    return {limb,intervals,satisfied:intervals.every(x=>x.indices.length>0)&&intervals.slice(1).every((x,i)=>limb===0?intervals[i].indices.at(-1)<x.indices[0]:x.indices.at(-1)<intervals[i].indices[0])};
  });
  const constraints=[
    {id:'loop-X',satisfied:roots.length===4&&roots.every(c=>c.depthDifference>rope.diameter),measurements:roots,referenceStatus:'ASSUMED_ROOT_SIGN'},
    {id:'first-passage',satisfied:first.length===2&&first.every(c=>c.workingDirection===1),measurements:first,referenceStatus:'OBSERVED_PROCEDURE_ASSUMED_EMBEDDING'},
    {id:'over-X',satisfied:doc.recovery.stage>=2?over.length===8&&over.every(c=>c.depthDifference>rope.diameter):null,measurements:over,referenceStatus:'OBSERVED_PROCEDURE_ASSUMED_EMBEDDING'},
    {id:'under-entire-cuff',satisfied:null,reason:'Requires separate check against the immutable cuff arcs and then integrated single-rope validation.'},
    {id:'same-direction-return',satisfied:doc.recovery.stage>=4?first.length===2&&second.length===2&&second.every(c=>first.find(f=>f.limb===c.limb)?.workingDirection===c.workingDirection):null,measurements:second},
    {id:'material-operation-order',satisfied:materialOrder.every(x=>x.satisfied),measurements:materialOrder}
  ];
  const required=constraints.filter(c=>['loop-X','first-passage','material-operation-order',...(doc.recovery.stage>=2?['over-X']:[]),...(doc.recovery.stage>=4?['same-direction-return']:[])].includes(c.id));
  const penetrations=pairs.filter(c=>c.state==='penetrating');
  return {stage:doc.recovery.stage,status:!continuity||penetrations.length||required.some(c=>!c.satisfied)?'GEOMETRY_FAILED':doc.recovery.cuffIntegrated?'INTEGRATION_REQUIRES_GLOBAL_REVIEW':'LOCAL_FIXTURE_VALID_TOPOLOGY_UNVERIFIED',continuity,segments:p.length-1,selfPenetrations:penetrations.length,minimumGap,maximumPenetration:Math.max(0,...penetrations.map(c=>c.penetration)),epsilon:EPSILON,excludedAdjacentPairs:raw.excluded.length,pairs,constraints,phase5Accepted:false,cuffIntegrated:doc.recovery.cuffIntegrated};
}

// Cuff arcs are measured in their saved world coordinates. These are obstacles
// for the local experiment, not additional physical ropes in the exported model.
export function validateUnderCuff(doc, cuff) {
  const p=doc.ropes[0].points,c=cuff.ropes[0].points,roles=doc.recovery.segmentRoles;
  const arcSegments=[...Array.from({length:72},(_,i)=>i+1),...Array.from({length:72},(_,i)=>i+78)];
  const project=([x,y,z])=>[x,z,-y];
  const crossings=[],clearances=[];
  for(let i=0;i<roles.length;i++)if(roles[i].startsWith('under-cuff/'))for(const j of arcSegments){
    const near=closestSegments(p[i],p[i+1],c[j],c[j+1]);
    clearances.push({segmentA:i,originalCuffSegment:j,gap:near.distance-.01,...near});
    const cross=projectedCrossing(project(p[i]),project(p[i+1]),project(c[j]),project(c[j+1]));
    if(cross&&cross.depthB>0)crossings.push({workingSegment:i,limb:roles[i].endsWith('/0')?0:1,originalCuffSegment:j,cuffLane:j<37?'arm0-wrap0':j<73?'arm0-wrap1':j<114?'arm1-wrap1':'arm1-wrap0',...cross});
  }
  const laneCoverage=[0,1].map(limb=>new Set(crossings.filter(x=>x.limb===limb).map(x=>x.cuffLane)).size);
  const penetrations=clearances.filter(x=>x.gap < -EPSILON);
  return {satisfied:crossings.length===8&&laneCoverage.every(n=>n===4)&&crossings.every(x=>x.depthDifference<-.01)&&penetrations.length===0,projection:'world XZ, outward normal -Y; front cuff intersections only',crossings,laneCoverage,minimumGap:clearances.length?Math.min(...clearances.map(x=>x.gap)):null,penetrations,source:'data/phase5-partial-cuff.json',arcSegments,scope:'Underpass versus unchanged cuff arcs only; not integrated-rope acceptance.'};
}

export function validateColumn(doc) {
  const p=doc.ropes[0].points,r=doc.ropes[0].diameter/2;
  const measurements=p.slice(0,-1).map((a,i)=>{
    const b=p[i+1],dy=b[1]-a[1],dz=b[2]-a[2],den=dy*dy+dz*dz;
    const t=den?Math.max(0,Math.min(1,-(a[1]*dy+a[2]*dz)/den)):0;
    const gap=Math.hypot(a[1]+t*dy,a[2]+t*dz)-.055-r;
    return {segment:i,t,gap,penetration:Math.max(0,-gap)};
  });
  return {model:'Conservative infinite X-axis cylinder; saved radius 0.055 m',minimumGap:Math.min(...measurements.map(c=>c.gap)),penetrations:measurements.filter(c=>c.gap < -EPSILON)};
}

// A single integration trial: replace the external fixture by the exact saved
// cuff arcs and four explicit interface connectors. Neither core nor cuff is fitted.
export function integrateCore(core,cuff) {
  const localCheck=validateCore(core),under=validateUnderCuff(core,cuff),column=validateColumn(core);
  if(core.recovery.stage!==4||localCheck.status==='GEOMETRY_FAILED'||!under.satisfied||column.penetrations.length)throw Error('Local core gates must pass before integration');
  const src=core.ropes[0].points,sr=core.recovery.segmentRoles,c=cuff.ropes[0].points;
  const points=[src[0]],roles=[];
  const append=(p,role)=>{if(distance(points.at(-1),p)<1e-12)return;points.push([...p]);roles.push(role);};
  const line=(to,role)=>{const from=points.at(-1),n=Math.max(1,Math.floor(distance(from,to)/.022));for(let i=1;i<=n;i++)append(i===n?to:mix(from,to,i/n),role);};
  const arcProvenance=[];
  for(let i=0;i<sr.length;){
    if(!sr[i].startsWith('fixture-')){append(src[i+1],sr[i]);i++;continue;}
    const limb=sr[i].endsWith('/0')?0:1;let end=i;while(end<sr.length&&sr[end].startsWith('fixture-'))end++;
    const indices=limb===0?Array.from({length:73},(_,k)=>k+1):Array.from({length:73},(_,k)=>k+78);
    const start=c[indices[0]],finish=c[indices.at(-1)];
    const inward=[start[0],-.18,limb===0?-.06:.06],outward=[finish[0],-.14,limb===0?.06:-.06];
    line(inward,`interface-in/${limb}`);line(start,`interface-in/${limb}`);
    for(const j of indices.slice(1)){const newSegment=points.length-1;append(c[j],`cuff/${limb}`);arcProvenance.push({segment:newSegment,originalSegment:j-1});}
    line(outward,`interface-out/${limb}`);line(src[end],`interface-out/${limb}`);
    i=end;
  }
  return {...structuredClone(core),ropes:[{id:'recovery-integrated-trial',diameter:.01,points}],recovery:{...structuredClone(core.recovery),segmentRoles:roles,pointRoles:[...roles,roles.at(-1)],cuffIntegrated:true,arcProvenance,interfaceStatus:'ASSUMED; one fixed connector trial, no global fitting',foldStart:roles.indexOf('fold')}};
}
