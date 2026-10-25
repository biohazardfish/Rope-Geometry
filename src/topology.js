import { closestSegments, detectCollisions } from './geometry.js';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const interpolate=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const smoothLift=(along,center,radius,height)=>{
  const d=Math.abs(along-center);
  if(d>=radius)return 0;
  // Cosine easing has zero slope at both ends of the elevation transition.
  return height*.5*(1+Math.cos(Math.PI*d/radius));
};

export function generateCrossing(topology,{lift=topology.generation.lift}={}) {
  if(!Array.isArray(topology.path)||topology.path.length<4||topology.crossings?.length!==1) throw new Error('PoC generator expects one crossing on an open ordered path');
  const cross=topology.crossings[0], overIndex=cross.overSegment;
  if(!Number.isInteger(overIndex)||overIndex<0||overIndex+1>=topology.path.length) throw new Error('crossing overSegment is outside the path');
  const lengths=topology.path.slice(1).map((p,i)=>distance(topology.path[i],p));
  const starts=[0];for(const len of lengths)starts.push(starts.at(-1)+len);
  const center=starts[overIndex]+lengths[overIndex]/2;
  const points=[], pathRanges=[];
  topology.path.slice(1).forEach((end,i)=>{
    const start=topology.path[i], len=lengths[i], count=Math.max(1,Math.ceil(len/topology.generation.sampleSpacing));
    const rangeStart=points.length;
    for(let j=0;j<count;j++){
      const t=j/count, p=interpolate(start,end,t), s=starts[i]+len*t;
      p[2]=smoothLift(s,center,topology.generation.transitionRadius,lift);
      points.push(p);
    }
    pathRanges.push({start:rangeStart,end:points.length});
  });
  points.push([...topology.path.at(-1)]);
  const rope={id:topology.ropeId,diameter:topology.diameter,points};
  const under=topology.crossings[0].underSegments;
  return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[rope],topology:{id:topology.id,crossings:topology.crossings.map(c=>({...c})),requiredCenterlineSeparation:topology.diameter+topology.generation.clearance,generatedLift:lift,transitionRadius:topology.generation.transitionRadius,pathRanges,overRange:pathRanges[overIndex],underRanges:under.map(i=>pathRanges[i])}};
}
export function validateGeneratedCrossing(doc,topology) {
  const rope=doc.ropes[0], crossing=topology.crossings[0];
  let crossingClosest=null;
  for(let i=doc.topology.overRange.start;i<doc.topology.overRange.end;i++) for(const range of doc.topology.underRanges) for(let j=range.start;j<range.end;j++) {
    const c=closestSegments(rope.points[i],rope.points[i+1],rope.points[j],rope.points[j+1]);
    if(!crossingClosest||c.distance<crossingClosest.distance) crossingClosest=c;
  }
  const centerlineSeparation=crossingClosest?.distance??0;
  const report=detectCollisions(doc.ropes);
  let minNonlocal=Infinity;
  for(let i=0;i<rope.points.length-1;i++) for(let j=i+2;j<rope.points.length-1;j++) {
    const a=rope.points[i],b=rope.points[i+1],c=rope.points[j],d=rope.points[j+1];
    minNonlocal=Math.min(minNonlocal,closestSegments(a,b,c,d).distance);
  }
  const required=doc.topology.requiredCenterlineSeparation;
  const overUnderPreserved=crossingClosest?.pointA[2]>crossingClosest?.pointB[2];
  const projected=new Map();
  for(let i=0;i<rope.points.length-1;i++) for(let j=i+2;j<rope.points.length-1;j++) {
    const a=rope.points[i],b=rope.points[i+1],c=rope.points[j],d=rope.points[j+1];
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-14) continue;
    const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9){const x=a[0]+t*rx,y=a[1]+t*ry,round=v=>Math.abs(v)<5e-8?0:Number(v.toFixed(7));projected.set(`${round(x)},${round(y)}`,[round(x),round(y)]);}
  }
  const projectedCrossings=[...projected.values()];
  return {projectedCrossingCount:projectedCrossings.length,projectedCrossings,minimumNonlocalSegmentSeparation:minNonlocal,requiredMinimumSeparation:required,penetrationCount:report.collisions.filter(c=>c.state==='penetrating').length,failures:report.collisions.map(c=>({segmentA:c.segmentA,segmentB:c.segmentB,penetration:c.penetration})),crossingCenterlineSeparation:centerlineSeparation,clearance:centerlineSeparation-rope.diameter,overUnderPreserved,valid:report.collisions.length===0&&projectedCrossings.length===1&&centerlineSeparation+1e-9>=required&&overUnderPreserved};
}

function eventPosition(path, starts, lengths, portion) {
  if(!Number.isInteger(portion.segment)||portion.segment<0||portion.segment>=lengths.length||!Number.isFinite(portion.t)||portion.t<0||portion.t>1) throw new Error('Crossing portion must reference a path segment and t in [0,1]');
  return starts[portion.segment]+lengths[portion.segment]*portion.t;
}

export function generateConstrainedRope(topology,{liftScale=1}={}) {
  const path=topology.path, crossings=topology.crossings, gen=topology.generation;
  if(!Array.isArray(path)||path.length<2||!Array.isArray(crossings)||crossings.length<2) throw new Error('Multiple-crossing generator needs an ordered open path and at least two crossings');
  if(!Number.isFinite(topology.diameter)||topology.diameter<=0||!Number.isFinite(gen?.sampleSpacing)||gen.sampleSpacing<=0||!Number.isFinite(gen?.transitionRadius)||gen.transitionRadius<=0||!Number.isFinite(gen?.lift)||gen.lift<=0) throw new Error('Invalid rope diameter or generation settings');
  const lengths=path.slice(1).map((p,i)=>distance(path[i],p)), starts=[0];
  if(lengths.some(x=>x===0)) throw new Error('Zero-length path segments are not supported');
  lengths.forEach(x=>starts.push(starts.at(-1)+x));
  const constraints=crossings.map(c=>{
    if(typeof c.id!=='string'||!c.id||!Array.isArray(c.portions)||c.portions.length!==2||!['A','B'].includes(c.over)||!Number.isFinite(c.clearance)||c.clearance<0) throw new Error(`Invalid crossing constraint ${c.id??''}`);
    const a=eventPosition(path,starts,lengths,c.portions[0]),b=eventPosition(path,starts,lengths,c.portions[1]);
    if(Math.abs(a-b)<topology.diameter) throw new Error(`${c.id}: crossing portions are not topologically separated`);
    const over=c.over==='A'?0:1, under=1-over;
    return {...c,positions:[a,b],overPosition:[a,b][over],underPosition:[a,b][under],requiredSeparation:topology.diameter+c.clearance};
  });
  if(new Set(crossings.map(c=>c.id)).size!==crossings.length) throw new Error('Crossing IDs must be unique');
  const zAt=s=>constraints.reduce((z,c)=>z+smoothLift(s,c.overPosition,gen.transitionRadius,gen.lift*liftScale),0);
  const points=[],pathRanges=[];
  lengths.forEach((len,i)=>{
    const count=Math.max(1,Math.ceil(len/gen.sampleSpacing)),begin=points.length;
    for(let j=0;j<count;j++) { const t=j/count,p=interpolate(path[i],path[i+1],t),s=starts[i]+len*t;p[2]+=zAt(s);points.push(p); }
    pathRanges.push({start:begin,end:points.length});
  });
  const last=[...path.at(-1)];last[2]+=zAt(starts.at(-1));points.push(last);
  return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:topology.ropeId,diameter:topology.diameter,points}],topology:{id:topology.id,crossings:crossings.map(c=>({...c})),pathRanges,requiredClearance:Math.max(...crossings.map(c=>c.clearance)),generatedLift:gen.lift*liftScale,transitionRadius:gen.transitionRadius,sampleSpacing:gen.sampleSpacing},constraintEvents:constraints.map(c=>({...c,elevations:c.positions.map(zAt)}))};
}

export function validateTopologyGeometry(doc,topology) {
  const rope=doc.ropes[0],ranges=doc.topology.pathRanges,expected=[];
  for(const c of topology.crossings) for(const p of c.portions) expected.push({id:c.id,portion:p,position:p.segment+p.t});
  expected.sort((a,b)=>a.position-b.position);
  const sourcePosition=event=>{
    for(let segment=0;segment<ranges.length;segment++){
      const range=ranges[segment];
      if(event>=range.start-1e-9&&event<=range.end+1e-9){
        const subdivisions=range.end-range.start;
        return segment+Math.max(0,Math.min(1,(event-range.start)/subdivisions));
      }
    }
    return null;
  };
  const projected=new Map();
  for(let i=0;i<rope.points.length-1;i++) for(let j=i+2;j<rope.points.length-1;j++) {
    const a=rope.points[i],b=rope.points[i+1],c=rope.points[j],d=rope.points[j+1],rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-14)continue;
    const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9){const x=a[0]+t*rx,y=a[1]+t*ry,key=`${Math.round(x*1e7)},${Math.round(y*1e7)}`;if(!projected.has(key))projected.set(key,{x,y,events:[i+t,j+u]});else projected.get(key).events.push(i+t,j+u);}
  }
  const actual=[...projected.values()];
  const matches=topology.crossings.map(c=>{
    const pa=c.portions.map(p=>interpolate(topology.path[p.segment],topology.path[p.segment+1],p.t));
    const point=pa[0],hit=actual.find(x=>Math.hypot(x.x-point[0],x.y-point[1])<1e-6);
    const traversals=[...new Set((hit?.events??[]).map(sourcePosition).filter(Number.isFinite).map(position=>Number(position.toFixed(8))))];
    const portionMatches=traversals.length===2&&traversals.every(position=>c.portions.some(p=>Math.abs(position-(p.segment+p.t))<1e-6));
    return {id:c.id,found:!!hit,projectedPoint:hit?[hit.x,hit.y]:null,expectedPoint:point.slice(0,2),portionMatches,traversals};
  });
  const events=matches.flatMap(match=>match.traversals.map(position=>{const c=topology.crossings.find(x=>x.id===match.id),index=c.portions.findIndex(p=>Math.abs(position-(p.segment+p.t))<1e-6);return {id:match.id,portion:index===0?'A':'B',pathPosition:position};})).sort((a,b)=>a.pathPosition-b.pathPosition);
  const requestedOrder=topology.crossings.flatMap(c=>c.portions.map((p,index)=>({id:c.id,portion:index===0?'A':'B',pathPosition:p.segment+p.t}))).sort((a,b)=>a.pathPosition-b.pathPosition);
  const traversalOrder=events.map(x=>`${x.id}-${x.portion}`),requestedTraversalOrder=requestedOrder.map(x=>`${x.id}-${x.portion}`);
  const arcStarts=[0];for(let i=0;i<topology.path.length-1;i++)arcStarts.push(arcStarts.at(-1)+distance(topology.path[i],topology.path[i+1]));
  const influence=topology.crossings.map(c=>{const p=c.portions[c.over==='A'?0:1];return {id:c.id,position:arcStarts[p.segment]+p.t*(arcStarts[p.segment+1]-arcStarts[p.segment])};});
  const interacting=[];for(let i=0;i<influence.length;i++)for(let j=i+1;j<influence.length;j++){const separation=Math.abs(influence[i].position-influence[j].position);if(separation<2*topology.generation.transitionRadius)interacting.push({crossingA:influence[i].id,crossingB:influence[j].id,alongPathSeparation:separation,supportOverlap:2*topology.generation.transitionRadius-separation});}
  const continuous=rope.points.length>=2&&rope.points.every((p,i)=>p.length===3&&p.every(Number.isFinite))&&doc.ropes.length===1;
  const traversalMatches=traversalOrder.length===requestedTraversalOrder.length&&traversalOrder.every((id,index)=>id===requestedTraversalOrder[index]);
  return {continuous,projectedCrossingCount:actual.length,expectedCrossingCount:topology.crossings.length,intendedCrossings:matches,noUnintendedCrossings:actual.length===topology.crossings.length&&matches.every(x=>x.found),crossingTraversalOrder:traversalOrder,requestedTraversalOrder,traversalMatches,constraintInfluenceRadius:topology.generation.transitionRadius,interactingCrossingConstraints:interacting,valid:continuous&&actual.length===topology.crossings.length&&matches.every(x=>x.found&&x.portionMatches)&&traversalMatches};
}

export function validateCrossingConstraints(doc,topology) {
  const rope=doc.ropes[0],ranges=doc.topology.pathRanges;
  const at=(portion)=>{
    const range=ranges[portion.segment],count=range.end-range.start,coordinate=portion.t*count,offset=Math.min(count,Math.floor(coordinate)),fraction=coordinate-offset;
    const a=rope.points[range.start+offset],b=rope.points[Math.min(rope.points.length-1,range.start+offset+1)];
    return interpolate(a,b,fraction);
  };
  const measurements=topology.crossings.map(c=>{
    const [a,b]=c.portions.map(at),over=c.over==='A'?a:b,under=c.over==='A'?b:a,separation=distance(over,under),required=topology.diameter+c.clearance;
    return {id:c.id,overPortion:c.over,overHeight:over[2],underHeight:under[2],centerlineSeparation:separation,requiredCenterlineSeparation:required,surfaceClearance:separation-topology.diameter,valid:over[2]>under[2]&&separation+1e-9>=required};
  });
  return {crossingMeasurements:measurements,overUnderPreserved:measurements.every(x=>x.overHeight>x.underHeight),clearanceSatisfied:measurements.every(x=>x.valid),valid:measurements.every(x=>x.valid)};
}

export function validateConstrainedGeometry(doc,topology) {
  const rope=doc.ropes[0],collision=detectCollisions(doc.ropes),minimumRequired=topology.diameter+Math.max(...topology.crossings.map(c=>c.clearance));
  let minDistance=Infinity,minPair=null;
  for(let i=0;i<rope.points.length-1;i++)for(let j=i+2;j<rope.points.length-1;j++){const d=closestSegments(rope.points[i],rope.points[i+1],rope.points[j],rope.points[j+1]).distance;if(d<minDistance){minDistance=d;minPair=[i,j];}}
  return {minimumNonlocalSeparation:minDistance,minimumPair:minPair,requiredMinimumSeparation:minimumRequired,globalSurfaceClearance:minDistance-topology.diameter,penetrationCount:collision.collisions.filter(c=>c.state==='penetrating').length,failures:collision.collisions.map(c=>({segmentA:c.segmentA,segmentB:c.segmentB,penetration:c.penetration})),valid:collision.collisions.length===0&&minDistance+1e-9>=minimumRequired};
}
