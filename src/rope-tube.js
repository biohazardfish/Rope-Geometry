import {toLocal,validateFrame} from './rope-state.js';
import {rotationMinimizingFrames} from './rope-frames.js';
export {rotationMinimizingFrames} from './rope-frames.js';
// The indexed surface below is shared by rendering and independent intersection checks.
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);if(n<1e-14)throw Error('Degenerate tangent');return mul(a,1/n);};
export function makeTube(points,radius,{radialSegments=12}={}){
 if(!Array.isArray(points)||points.length<2||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw Error('Finite XYZ points required');
 if(!Number.isFinite(radius)||radius<=0||!Number.isInteger(radialSegments)||radialSegments<6)throw Error('Invalid tube dimensions');
 const frames=rotationMinimizingFrames(points),vertices=[],indices=[],expectedNormals=[];
 for(let i=0;i<points.length;i++)for(let j=0;j<radialSegments;j++){let a=2*Math.PI*j/radialSegments;vertices.push(add(points[i],add(mul(frames[i].n,radius*Math.cos(a)),mul(frames[i].b,radius*Math.sin(a)))));}
 const face=(ids,normal)=>{indices.push(ids);expectedNormals.push(normal);};
 for(let i=0;i<points.length-1;i++)for(let j=0;j<radialSegments;j++){
   const k=(j+1)%radialSegments,a=i*radialSegments+j,b=(i+1)*radialSegments+j,c=(i+1)*radialSegments+k,d=i*radialSegments+k;
   const middle=mul(add(points[i],points[i+1]),.5),radial=sub(mul(add(add(vertices[a],vertices[b]),add(vertices[c],vertices[d])),.25),middle);
   face([a,d,b],radial);face([d,c,b],radial);
 }
 const start=vertices.length;vertices.push([...points[0]],[...points.at(-1)]);
 for(let j=0;j<radialSegments;j++){const k=(j+1)%radialSegments,last=(points.length-1)*radialSegments;face([start,k,j],mul(frames[0].t,-1));face([start+1,last+j,last+k],frames.at(-1).t);}
 return {vertices,indices,expectedNormals,frames,radius,radialSegments,centerline:points.map(p=>[...p])};
}
function pointSegmentDistance(p,a,b){const v=sub(b,a),den=dot(v,v),t=den?Math.max(0,Math.min(1,dot(sub(p,a),v)/den)):0;return norm(sub(p,add(a,mul(v,t))));}
function inside(p,tri,n,eps){for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],v=sub(b,a);if(dot(cross(v,sub(p,a)),n)<-eps*norm(v))return false;}return true;}
const orient2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function coplanarArea(a,b,n){const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(k=>k!==drop);const proj=p=>axes.map(k=>p[k]);let poly=a.map(proj);const tri=b.map(proj),sign=Math.sign(orient2(...tri))||1;
 for(let i=0;i<3&&poly.length;i++){const x=tri[i],y=tri[(i+1)%3],next=[];for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length],dp=sign*orient2(x,y,p),dq=sign*orient2(x,y,q);if(dp>=0)next.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push(p.map((v,k)=>v+t*(q[k]-v)));}}poly=next;}
 let area=0;for(let i=0;i<poly.length;i++){let a=poly[i],b=poly[(i+1)%poly.length];area+=a[0]*b[1]-a[1]*b[0];}return Math.abs(area)/2;
}
export function triangleIntersection(a,b,{epsilon=1e-6,shared=[]}={}){
 const ca=cross(sub(a[1],a[0]),sub(a[2],a[0])),cb=cross(sub(b[1],b[0]),sub(b[2],b[0]));if(norm(ca)<1e-16||norm(cb)<1e-16)return false;
 const na=mul(ca,1/norm(ca)),nb=mul(cb,1/norm(cb)),da=b.map(p=>dot(sub(p,a[0]),na)),db=a.map(p=>dot(sub(p,b[0]),nb));
 const separate=d=>d.every(v=>v>epsilon)||d.every(v=>v< -epsilon);if(separate(da)||separate(db))return false;
 if(norm(cross(na,nb))<1e-8&&Math.max(...da.map(Math.abs))<=epsilon)return coplanarArea(a,b,na)>epsilon*epsilon;
 const legitimate=p=>shared.some(q=>norm(sub(p,q))<=epsilon*2)||(shared.length===2&&pointSegmentDistance(p,shared[0],shared[1])<=epsilon*2);
 // An edge only "crosses" the plane when both endpoints are clearly on opposite sides.
 // Endpoints within epsilon of the plane are tested as on-plane points; otherwise two
 // near-zero distances of opposite sign (shared vertex plus a generator edge lying in
 // the plane) would synthesize a crossing a few microns from the shared vertex.
 const intersects=(tri,other,n,ds)=>{for(let i=0;i<3;i++){const j=(i+1)%3,p=tri[i],q=tri[j];if(Math.abs(ds[i])<=epsilon&&inside(p,other,n,epsilon)&&!legitimate(p))return true;if(ds[i]*ds[j]<0&&Math.abs(ds[i])>epsilon&&Math.abs(ds[j])>epsilon){let t=ds[i]/(ds[i]-ds[j]),hit=add(p,mul(sub(q,p),t));if(inside(hit,other,n,epsilon)&&!legitimate(hit))return true;}}return false;};
 return intersects(a,b,nb,db)||intersects(b,a,na,da);
}
function triangleColumnGap(tri,column){if(column.frame){tri=tri.map(p=>toLocal(p,column.frame));column={...column,center:toLocal(column.center,column.frame),frame:null};}const axis='XYZ'.indexOf(column.axis),ks=[0,1,2].filter(k=>k!==axis),p=tri.map(v=>ks.map(k=>v[k]-column.center[k]));const o=[0,0],signs=p.map((v,i)=>orient2(v,p[(i+1)%3],o));if(Math.abs(orient2(...p))>1e-16&&(signs.every(x=>x>=0)||signs.every(x=>x<=0)))return -column.radius;
 let min=Infinity;for(let i=0;i<3;i++)min=Math.min(min,pointSegmentDistance(o,p[i],p[(i+1)%3]));return min-column.radius;
}
export function checkTubeLocal(mesh){
 for(let i=0;i<mesh.indices.length;i++){
  const tri=mesh.indices[i].map(k=>mesh.vertices[k]),n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));
  if(norm(n)<1e-14||mesh.expectedNormals?.[i]&&dot(n,mesh.expectedNormals[i])<=0)return {valid:false,firstFoldedFace:i};
 }
 return {valid:true,firstFoldedFace:null};
}
export function checkTube(mesh,{column=null,epsilon=1e-6}={}){
 if(!(epsilon>0)||!Number.isFinite(epsilon))throw Error('Positive finite epsilon required');
 if(column&&(!['X','Y','Z'].includes(column.axis)||!(column.radius>0)||column.center?.length!==3))throw Error('Invalid column');
 if(column?.frame)validateFrame(column.frame);
 let foldedFaces=0,columnPenetrations=0,minimumColumnGap=Infinity;const faces=mesh.indices.map((ids,i)=>{const tri=ids.map(k=>mesh.vertices[k]);if(tri.some(p=>!p||!p.every(Number.isFinite)))throw Error('Invalid mesh');const n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));if(norm(n)<1e-14||mesh.expectedNormals?.[i]&&dot(n,mesh.expectedNormals[i])<=0)foldedFaces++;
 if(column){const gap=triangleColumnGap(tri,column);minimumColumnGap=Math.min(minimumColumnGap,gap);if(gap< -epsilon)columnPenetrations++;}
 return {i,ids,tri,min:[0,1,2].map(k=>Math.min(...tri.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...tri.map(p=>p[k])))};});
 const extents=[0,1,2].map(k=>{let lo=Infinity,hi=-Infinity;for(const p of mesh.vertices){lo=Math.min(lo,p[k]);hi=Math.max(hi,p[k]);}return hi-lo;}),axis=extents.indexOf(Math.max(...extents));faces.sort((a,b)=>a.min[axis]-b.min[axis]);let selfIntersections=0,testedPairs=0;const intersectionPairs=[];
 for(let i=0;i<faces.length;i++){const a=faces[i];for(let j=i+1;j<faces.length&&faces[j].min[axis]<=a.max[axis]+epsilon;j++){const b=faces[j];if([0,1,2].some(k=>a.max[k]+epsilon<b.min[k]||b.max[k]+epsilon<a.min[k]))continue;const shared=a.ids.filter(k=>b.ids.includes(k)).map(k=>mesh.vertices[k]);if(shared.length===3)continue;testedPairs++;if(triangleIntersection(a.tri,b.tri,{epsilon,shared})){selfIntersections++;if(intersectionPairs.length<50)intersectionPairs.push([a.i,b.i]);}}}
 const valid=!foldedFaces&&!selfIntersections&&!columnPenetrations;
 return {valid,status:valid?'TUBE_GEOMETRY_PASS':'TUBE_GEOMETRY_FAIL',selfIntersections,intersectionPairs,foldedFaces,columnPenetrations,minimumColumnGap:column?minimumColumnGap:null,testedPairs,triangles:faces.length,epsilon,topologyVerified:false};
}
