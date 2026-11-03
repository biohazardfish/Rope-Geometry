// s0 is a reference material coordinate. geometryArc describes the current
// shape and must never replace s0, including after resampling or relaxation.
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
export function geometryArc(points){const arc=[0];for(let i=1;i<points.length;i++)arc.push(arc.at(-1)+distance(points[i],points[i-1]));return arc;}
export function createRopeState(points,{diameter,column=null,materialCoordinates=null,labels=null,referenceId=null}={}){
 if(!Array.isArray(points)||points.length<2||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw Error('Finite XYZ points required');
 if(!(diameter>0)||!Number.isFinite(diameter))throw Error('Positive diameter required');
 const arc=geometryArc(points),s0=Array.from(materialCoordinates||arc);
 if(s0.length!==points.length||s0.some((s,i)=>!Number.isFinite(s)||(i&&s<=s0[i-1])))throw Error('Strictly increasing material coordinates required');
 if(labels&&labels.length!==points.length-1)throw Error('One label per segment required');
 return {points:points.map(p=>[...p]),diameter,column:column?structuredClone(column):null,s0:Object.freeze(s0),restLengths:Object.freeze(s0.slice(1).map((s,i)=>s-s0[i])),geometryArc:arc,labels:labels?[...labels]:null,referenceId};
}
export function withPositions(state,points){return createRopeState(points,{...state,materialCoordinates:state.s0});}
export function materialSample(state,s){
 if(!Number.isFinite(s)||s<state.s0[0]||s>state.s0.at(-1))throw Error('Material sample outside reference interval');
 let lo=0,hi=state.s0.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(state.s0[mid]<=s)lo=mid;else hi=mid;}
 const t=(s-state.s0[lo])/(state.s0[hi]-state.s0[lo]);return {point:state.points[lo].map((v,k)=>v+t*(state.points[hi][k]-v)),segment:lo,t,s0:s};
}
export function resampleMaterial(state,coordinates){
 if(coordinates[0]!==state.s0[0]||coordinates.at(-1)!==state.s0.at(-1))throw Error('Resampling must retain both material ends');
 const points=coordinates.map(s=>materialSample(state,s).point);
 const labels=state.labels?coordinates.slice(1).map((s,i)=>state.labels[materialSample(state,(coordinates[i]+s)/2).segment]):null;
 return createRopeState(points,{...state,materialCoordinates:coordinates,labels});
}
export function materialResiduals(state){
 const lengths=geometryArc(state.points),total=lengths.at(-1),reference=state.s0.at(-1)-state.s0[0];
 return {referenceLength:reference,geometryLength:total,lengthChange:total-reference,maxSegmentStretch:Math.max(...state.restLengths.map((l,i)=>Math.abs(lengths[i+1]-lengths[i]-l)))};
}
export function validateFrame(frame){
 if(!frame||frame.origin?.length!==3||!frame.origin.every(Number.isFinite)||frame.axes?.length!==3||frame.axes.some(a=>a.length!==3||!a.every(Number.isFinite)))throw Error('Rigid frame required');
 const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),a=frame.axes;
 if(a.some((v,i)=>a.some((w,j)=>Math.abs(dot(v,w)-(i===j?1:0))>1e-9)))throw Error('Orthonormal frame required');
 const cross=[a[0][1]*a[1][2]-a[0][2]*a[1][1],a[0][2]*a[1][0]-a[0][0]*a[1][2],a[0][0]*a[1][1]-a[0][1]*a[1][0]];
 if(dot(cross,a[2])<1-1e-9)throw Error('Right-handed frame required');return frame;
}
export function toWorld(point,frame){validateFrame(frame);return frame.origin.map((v,k)=>v+frame.axes.reduce((s,a,i)=>s+a[k]*point[i],0));}
export function toLocal(point,frame){validateFrame(frame);return frame.axes.map(a=>a.reduce((s,v,k)=>s+v*(point[k]-frame.origin[k]),0));}
