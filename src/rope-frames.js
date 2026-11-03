// Shared rotation-minimising transport. Initial orientation is explicit: it is
// a geometric choice, never evidence that the physical bundle was twisted.
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);if(n<1e-14)throw Error('Degenerate frame vector');return mul(a,1/n);};
export function transportNormal(t0,t1,n,antiparallel=-.999999){
 const v=cross(t0,t1),c=dot(t0,t1);if(c<antiparallel)throw Error('Antiparallel frame tangent');
 return unit(add(add(n,cross(v,n)),mul(cross(v,cross(v,n)),1/(1+c))));
}
export function rotationMinimizingFrames(points,{initialNormal=null,initialMode='cross',antiparallel=-.999999}={}){
 if(!Array.isArray(points)||points.length<2||points.some(p=>p.length!==3||!p.every(Number.isFinite)))throw Error('Finite XYZ frame points required');
 const tangent=points.map((p,i)=>unit(sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)])));
 const t0=tangent[0],seed=initialNormal||(Math.abs(t0[0])<.9?[1,0,0]:[0,1,0]);
 let n=initialNormal||initialMode==='project'?unit(sub(seed,mul(t0,dot(seed,t0)))):unit(cross(t0,seed));
 return tangent.map((t,i)=>{if(i)n=transportNormal(tangent[i-1],t,n,antiparallel);return{t,n:[...n],b:cross(t,n)};});
}
