import {closestSegments, EPSILON} from './geometry.js';

export function subdivide(points,factor) {
  if(!Number.isInteger(factor)||factor<1)throw Error('Positive integer subdivision required');
  const result=[];
  for(let i=0;i<points.length-1;i++)for(let k=0;k<factor;k++)result.push(points[i].map((v,a)=>v+(points[i+1][a]-v)*k/factor));
  return [...result,[...points.at(-1)]];
}

// Original-parent grouping is attribution only. No raw hit is suppressed.
export function samplePolyline(rope,factors=[1,2,4,8]) {
  const n=rope.points.length-1,baseline=new Float64Array(n*n).fill(Infinity),result=[];
  for(let i=0;i<n;i++)for(let j=i+2;j<n;j++)baseline[i*n+j]=closestSegments(rope.points[i],rope.points[i+1],rope.points[j],rope.points[j+1]).distance;
  for(const factor of factors){
    const q=subdivide(rope.points,factor),measure=new Float64Array(n*n).fill(Infinity);
    let raw=0,local=0,maxPen=0;
    for(let i=0;i<q.length-1;i++)for(let j=i+2;j<q.length-1;j++){
      const c=closestSegments(q[i],q[i+1],q[j],q[j+1]),a=Math.floor(i/factor),b=Math.floor(j/factor);
      if(b>a+1)measure[a*n+b]=Math.min(measure[a*n+b],c.distance);
      if(rope.diameter-c.distance>EPSILON){raw++;if(b<=a+1)local++;maxPen=Math.max(maxPen,rope.diameter-c.distance);}
    }
    let error=0,parents=0;for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){
      error=Math.max(error,Math.abs(measure[i*n+j]-baseline[i*n+j]));
      if(rope.diameter-measure[i*n+j]>EPSILON)parents++;
    }
    result.push({factor,segments:q.length-1,rawPenetratingPairs:raw,withinSameOrAdjacentOriginalSegments:local,penetratingOriginalNonadjacentPairs:parents,maximumRawPenetrationM:maxPen,maximumOriginalPairDistanceErrorM:error});
  }return result;
}
