import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';import{closestSegments,EPSILON}from'../src/geometry.js';
const dir='reports/phase5-recovery';mkdirSync(dir,{recursive:true});
const paths=['data/phase5-candidate-A.json','data/phase5-partial-cuff.json','data/somerville-bowline-topology-v2.json','src/geometry.js','src/phase5.js','reports/phase5/validation.json'];
const hashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const frozen=JSON.parse(readFileSync(dir+'/baseline.json')).hashes;
for(const path of paths)if(hashes[path]!==frozen[path])throw Error('Frozen baseline changed: '+path);
const d=JSON.parse(readFileSync(paths[0])),old=JSON.parse(readFileSync(paths[5])),p=d.ropes[0].points,diameter=d.ropes[0].diameter,n=p.length-1,roles=d.candidate.pointRoles;
const norm=v=>Math.hypot(...v),sub=(a,b)=>a.map((v,k)=>v-b[k]);
function angle(k){const a=sub(p[k],p[k-1]),b=sub(p[k+1],p[k]);return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0)/(norm(a)*norm(b)))))*180/Math.PI;}
const classification=old.pairs.map(c=>{const i=+c.segmentA.split(':')[1],j=+c.segmentB.split(':')[1],ra=roles[i]+' → '+roles[i+1],rb=roles[j]+' → '+roles[j+1];let primary,reason;
 if(j-i<=3){primary='SHARP_LOCAL_RETURN';reason='Same material arm returns towards its previous segments; intervening bend angle is measured below. Exact polyline distance, not a floating-point contact.';}
 else if((ra+rb).includes('under-cuff')){primary='OFFSET_ROUTING_DEFECT';reason='The doubled-arm offset interpolates from X to Z while the underpass tangent follows X. Its normal component collapses; 16 mm nominal offset does not mean 16 mm normal separation.';}
 else{primary='INSUFFICIENT_CLEARANCE';reason='Separate material intervals are closer than the 10 mm diameter in the exact saved polyline. Loop-root and opposing return placements are unverified hypotheses, so geometry alone cannot attribute this to incorrect knot topology.';}
 return {...c,structuralLocation:[ra,rb],primary,reason,topologyCause:'UNPROVEN; signed X and loop traversal are missing globally',discretizationOnly:false,interveningBendDegrees:j-i<=3?Array.from({length:j-i},(_,k)=>angle(i+k+1)):[],parentSegments:[i,j]};});
const sampling=[];
for(const factor of [1,2,4,8]){const q=[];for(let i=0;i<n;i++)for(let k=0;k<factor;k++)q.push(p[i].map((v,a)=>v+(p[i+1][a]-v)*k/factor));q.push(p.at(-1));let raw=0,local=0,rawMax=0,remoteMax=0;const parentHits=new Set(),measured=new Map();
 for(let i=0;i<q.length-1;i++)for(let j=i+2;j<q.length-1;j++){const c=closestSegments(q[i],q[i+1],q[j],q[j+1]),pen=diameter-c.distance,pa=Math.floor(i/factor),pb=Math.floor(j/factor),key=pa+':'+pb;if(pb-pa>1)measured.set(key,Math.min(measured.get(key)??Infinity,c.distance));if(pen>EPSILON){raw++;rawMax=Math.max(rawMax,pen);if(pb-pa<=1)local++;else{parentHits.add(key);remoteMax=Math.max(remoteMax,pen);}}}
 let error=0;for(const c of classification){const[i,j]=c.parentSegments;error=Math.max(error,Math.abs(measured.get(i+':'+j)-c.distance));}
 sampling.push({factor,segments:q.length-1,rawPenetratingPairs:raw,newPairsWithinSameOrAdjacentOriginalSegments:local,originalNonadjacentPairCount:parentHits.size,rawMaximumPenetrationM:rawMax,originalPairMaximumPenetrationM:remoteMax,maxDistanceDifferenceOnOriginal36M:error});
}
const out={epsilonM:EPSILON,diameterM:diameter,method:'Exact linear subdivision of unchanged saved polyline, no smoothing or curve regeneration. Engine closestSegments and original EPSILON; only immediate refined-segment adjacency is omitted. Parent aggregation is diagnostic attribution only, never acceptance filtering.',hashes,classification,counts:Object.fromEntries([...new Set(classification.map(c=>c.primary))].map(x=>[x,classification.filter(c=>c.primary===x).length])),sampling,conclusion:'All 36 original nonadjacent pair distances converge (in fact remain invariant) under subdivision. Raw capsule reports are not sampling-invariant because additional nearby material pairs become nonadjacent. Coarsening alone cannot establish physical improvement.'};
writeFileSync(dir+'/diagnosis.json',JSON.stringify(out,null,2));writeFileSync(dir+'/collisions.csv','segmentA,segmentB,regionA,regionB,category,distance_m,penetration_m\n'+classification.map(c=>[c.segmentA,c.segmentB,...c.structuralLocation,c.primary,c.distance,c.penetration].map(x=>JSON.stringify(x)).join(',')).join('\n'));
console.log(JSON.stringify({counts:out.counts,sampling},null,2));
