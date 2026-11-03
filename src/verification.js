import {validateDocument} from './schema.js';
import {EPSILON} from './geometry.js';
import {robustClosestSegments} from './robust-distance.js';

// Verification of the declared polygonal capsule model, never a knot classifier.
export function verifyGeometry(doc, {column=null, clearance=0}={}) {
  validateDocument(doc);
  if(!Number.isFinite(clearance)||clearance<0) throw Error('Nonnegative finite clearance required');
  if(column && (!['X','Y','Z'].includes(column.axis) || !Number.isFinite(column.radius) || column.radius<=0 ||
    !Array.isArray(column.center)||column.center.length!==3||!column.center.every(Number.isFinite)))
    throw Error('Column requires axis X/Y/Z, positive radius and finite center');
  const segments=[],zeroEdges=[],corners=[];
  let length=0;
  for(const rope of doc.ropes) {
    for(let i=0;i<rope.points.length-1;i++) {
      const a=rope.points[i],b=rope.points[i+1],size=Math.hypot(...a.map((x,k)=>b[k]-x));
      length+=size;
      if(size===0) zeroEdges.push(`${rope.id}:${i}`);
      segments.push({id:`${rope.id}:${i}`,ropeId:rope.id,index:i,a,b,radius:rope.diameter/2});
    }
    for(let i=1;i<rope.points.length-1;i++) {
      const a=rope.points[i].map((x,k)=>x-rope.points[i-1][k]);
      const b=rope.points[i+1].map((x,k)=>x-rope.points[i][k]);
      const na=Math.hypot(...a),nb=Math.hypot(...b);
      if(na&&nb) {
        const cosine=a.reduce((s,x,k)=>s+(x/na)*(b[k]/nb),0);
        const angle=Math.acos(Math.max(-1,Math.min(1,cosine)));
        if(angle>1e-7) corners.push({ropeId:rope.id,point:i,turnRadians:angle});
      }
    }
  }
  let minimumRopeGap=null,minimumPair=null,excludedAdjacentPairs=0,testedPairs=0;
  const pairs=[];
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++) {
    const a=segments[i],b=segments[j];
    if(a.ropeId===b.ropeId&&Math.abs(a.index-b.index)===1){excludedAdjacentPairs++;continue;}
    const closest=robustClosestSegments(a.a,a.b,b.a,b.b),gap=closest.distance-a.radius-b.radius;
    testedPairs++;
    if(minimumRopeGap===null||gap<minimumRopeGap){minimumRopeGap=gap;minimumPair=[a.id,b.id];}
    if(gap<=EPSILON) pairs.push({segmentA:a.id,segmentB:b.id,...closest,gap,penetration:Math.max(0,-gap),state:gap< -EPSILON?'penetrating':'contact'});
  }
  let minimumColumnGap=null;
  const columnPairs=[];
  if(column) {
    const axis='XYZ'.indexOf(column.axis),radial=[0,1,2].filter(k=>k!==axis);
    for(const segment of segments) {
      const a=radial.map(k=>segment.a[k]-column.center[k]),d=radial.map(k=>segment.b[k]-segment.a[k]);
      const den=d[0]*d[0]+d[1]*d[1];
      const t=den?Math.max(0,Math.min(1,-(a[0]*d[0]+a[1]*d[1])/den)):0;
      const gap=Math.hypot(a[0]+t*d[0],a[1]+t*d[1])-column.radius-segment.radius;
      minimumColumnGap=minimumColumnGap===null?gap:Math.min(minimumColumnGap,gap);
      if(gap<=EPSILON) columnPairs.push({segment:segment.id,t,gap,penetration:Math.max(0,-gap)});
    }
  }
  const selfPenetrations=pairs.filter(p=>p.gap< -EPSILON).length;
  const columnPenetrations=columnPairs.filter(p=>p.gap< -EPSILON).length;
  const continuity=zeroEdges.length===0;
  const clearanceSatisfied=(minimumRopeGap===null||minimumRopeGap+EPSILON>=clearance)&&
    (minimumColumnGap===null||minimumColumnGap+EPSILON>=clearance);
  const valid=continuity&&clearanceSatisfied;
  return {status:valid?'CAPSULE_CHECK_PASSED_TOPOLOGY_UNVERIFIED':'GEOMETRY_FAILED',valid,topologyVerified:false,
    continuity,ropeCount:doc.ropes.length,segments:segments.length,totalLengthM:length,zeroEdges,
    smoothness:{representation:'piecewise-linear; C0 at joints, generally not C1',cornerCount:corners.length,maxTurnRadians:Math.max(0,...corners.map(c=>c.turnRadians)),smoothTubeVerified:false},
    epsilonM:EPSILON,requiredClearanceM:clearance,clearanceSatisfied,testedPairs,excludedAdjacentPairs,
    minimumRopeGap,minimumPair,selfPenetrations,pairs,minimumColumnGap,columnPenetrations,columnPairs,
    columnModel:column?'infinite cylinder (conservative relative to a finite cylinder); axis and center as declared':null,
    limitation:'Numerical capsule check at source segmentation; adjacent segments excluded only. Refinement changes local exclusions. No isotopy, smooth-tube embedding, source identity or locking proof.'};
}
