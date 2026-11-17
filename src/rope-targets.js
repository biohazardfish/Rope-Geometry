import {createRopeState,resampleMaterial,geometryArc} from './rope-state.js';
// A geometric target may be shorter in its body, but never supplies a new
// material reference. Put released length on its two free tails and sample it
// at the original s0 stations. This creates a target, NOT an accepted move.
export function targetAtMaterialStations(reference,targetPoints,{labels=null}={}){
 const referenceLength=reference.s0.at(-1)-reference.s0[0],targetLength=geometryArc(targetPoints).at(-1),released=referenceLength-targetLength;
 if(released< -1e-9)throw Error('Target requires more material than reference');
 const extend=(p,q,length)=>{const v=p.map((x,k)=>x-q[k]),n=Math.hypot(...v);if(n<1e-14)throw Error('Degenerate target tail');return p.map((x,k)=>x+length*v[k]/n);};
 let points=targetPoints.map(p=>[...p]),roles=labels?[...labels]:null;
 if(released>1e-10){points=[extend(points[0],points[1],released/2),...points,extend(points.at(-1),points.at(-2),released/2)];if(roles)roles=[roles[0],...roles,roles.at(-1)];}
 const arc=geometryArc(points).map(s=>s+reference.s0[0]);arc[arc.length-1]=reference.s0.at(-1);
 const target=createRopeState(points,{diameter:reference.diameter,materialCoordinates:arc,labels:roles,column:reference.column,referenceId:reference.referenceId});
 return {state:resampleMaterial(target,reference.s0),releasedLength:released};
}
