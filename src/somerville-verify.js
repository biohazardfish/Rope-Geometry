import {toLocal,geometryArc,validateFrame} from './rope-state.js';
import {validateDocument} from './schema.js';
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
function rebase(frame,f){const zero={origin:[0,0,0],axes:f.axes};return {origin:toLocal(frame.origin,f),axes:frame.axes.map(a=>toLocal(a,zero))};}
function frameCrossing(a,b,c,d,frame){if(!frame)return crossing(a,b,c,d);const h=crossing(toLocal(a,frame),toLocal(b,frame),toLocal(c,frame),toLocal(d,frame));if(!h)return null;return {s:h.s,t:h.t,a:mix(a,b,h.s),b:mix(c,d,h.t),localA:h.a,localB:h.b};}
function insidePolygon(q,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function winding(points,center,axes){let angle=0;for(let i=1;i<points.length;i++){const a=axes.map(k=>points[i-1][k]-center[k]),b=axes.map(k=>points[i][k]-center[k]);angle+=Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);}return angle/(2*Math.PI);}
function crossing(a,b,c,d){const u=[b[0]-a[0],b[2]-a[2]],v=[d[0]-c[0],d[2]-c[2]],w=[c[0]-a[0],c[2]-a[2]],det=u[0]*v[1]-u[1]*v[0];if(Math.abs(det)<1e-14)return null;const s=(w[0]*v[1]-w[1]*v[0])/det,t=(w[0]*u[1]-w[1]*u[0])/det;if(s<0||s>=1||t<0||t>=1)return null;return {s,t,a:mix(a,b,s),b:mix(c,d,t)};}
export function validateOperations(doc,{scope='construction'}={}){
 if(!['construction','final'].includes(scope))throw Error('Invalid operation validation scope');
 if(doc.somerville?.referenceFrame){
  const f=doc.somerville.referenceFrame,local=structuredClone(doc);
  local.ropes.forEach(r=>r.points=r.points.map(p=>toLocal(p,f)));
  local.somerville.column.center=toLocal(doc.somerville.column.center,f);
  local.somerville.aperture.center=toLocal(doc.somerville.aperture.center,f);
  local.somerville.aperture.normal=f.axes.map(a=>dot(a,doc.somerville.aperture.normal));
  if(doc.somerville.aperture.frame)local.somerville.aperture.frame=rebase(doc.somerville.aperture.frame,f);
  if(doc.somerville.underpass?.frame)local.somerville.underpass.frame=rebase(doc.somerville.underpass.frame,f);
  delete local.somerville.referenceFrame;return validateOperations(local,{scope});
 }
 validateDocument(doc);if(doc.ropes.length!==1)throw Error('Exactly one material rope required');
 const rope=doc.ropes[0],p=rope.points,labels=rope.segmentLabels,m=doc.somerville;if(!m||labels?.length!==p.length-1)throw Error('Material segment labels required');
 const indices=role=>labels.flatMap((r,i)=>r===role?[i]:[]),path=role=>{const ids=indices(role);return ids.length?[p[ids[0]],...ids.map(i=>p[i+1])]:[];};
 const approach=labels.some(r=>r.startsWith('under-approach/'))?'under-approach':'outside-cuff';
 const required=['tail','loop-rim','loop-to-cuff','cuff','cuff-to-first','first-passage','over-root',approach,'under-cuff','return-approach','return-passage','bight-leg'];
 const materialOrder=[0,1].map(limb=>{const starts=required.map(role=>indices(`${role}/${limb}`)[0]);return starts.every(Number.isInteger)&&starts.slice(1).every((s,i)=>limb===0?s>starts[i]:s<starts[i]);});
 const cuffTurns=[0,1].map(limb=>({limb,turns:winding(path(`cuff/${limb}`),m.column.center,[1,2])*(limb? -1:1)}));
 const aperture=m.aperture,apertureFrame=aperture.frame||null,underFrame=m.underpass?.frame||null;
 if(apertureFrame)validateFrame(apertureFrame);if(underFrame)validateFrame(underFrame);
 const planeOf=(point,frame)=>{const q=frame?toLocal(point,frame):point;return [q[0],q[2]];};
 const polygons=[0,1].map(limb=>path(`loop-rim/${limb}`).map(point=>planeOf(point,apertureFrame)));
 const loopTurns=[0,1].map(limb=>Math.abs(winding(apertureFrame?path(`loop-rim/${limb}`).map(point=>toLocal(point,apertureFrame)):path(`loop-rim/${limb}`),apertureFrame?[0,0,0]:aperture.center,[0,2])));
 const passage=role=>[0,1].flatMap(limb=>indices(`${role}/${limb}`).flatMap(i=>{let a=dot(sub(p[i],aperture.center),aperture.normal),b=dot(sub(p[i+1],aperture.center),aperture.normal);if(a*b>0||a===b)return[];const t=-a/(b-a);if(t<0||t>=1)return[];const point=mix(p[i],p[i+1],t);return [{limb,segment:i,point,insideBothRims:polygons.every(poly=>insidePolygon(planeOf(point,apertureFrame),poly)),direction:Math.sign(b-a)*(limb?-1:1)}];}));
 const first=passage('first-passage'),second=passage('return-passage');
 const under=[];for(const limb of [0,1])for(const i of indices(`under-cuff/${limb}`))for(const cuffLimb of[0,1])for(const j of indices(`cuff/${cuffLimb}`)){const hit=frameCrossing(p[i],p[i+1],p[j],p[j+1],underFrame);const cuffY=hit?.localB?hit.localB[1]:hit?.b[1],underY=hit?.localA?hit.localA[1]:hit?.a[1];if(hit&&cuffY<0)under.push({limb,cuffLimb,segment:i,cuffSegment:j,point:hit.a,depthGap:underY-cuffY});}
 const a=path('cuff/0'),b=path('cuff/1').reverse();
 const sample=(points,t)=>{if(points.length<2)return null;const arc=geometryArc(points),s=t*arc.at(-1);let i=0;while(i<points.length-2&&arc[i+1]<s)i++;return mix(points[i],points[i+1],(s-arc[i])/(arc[i+1]-arc[i]));};
 const orderPreserved=a.length>1&&b.length>1&&Array.from({length:65},(_,i)=>i/64).every(t=>sample(a,t)[0]-sample(b,t)[0]>0);
 const foldIds=indices('fold');
 const frontHits=(worker,cuffLimb)=>indices(worker).flatMap(i=>indices(`cuff/${cuffLimb}`).flatMap(j=>{const hit=crossing(p[i],p[i+1],p[j],p[j+1]);return hit&&hit.b[1]<0&&hit.a[1]<hit.b[1]-rope.diameter*.5?[hit]:[];}));
 const diagonal=[0,1].map(limb=>({limb,perCuff:[0,1].map(cuffLimb=>frontHits(`cuff-to-first/${limb}`,cuffLimb).length)}));
 const underDelta=limb=>{const q=path(`under-cuff/${limb}`);if(!q.length)return 0;if(!underFrame)return q.at(-1)[0]-q[0][0];const A=toLocal(q[0],underFrame),B=toLocal(q.at(-1),underFrame);return B[0]-A[0];};
 // The root relation is additional to passing through the opening. Measure
 // actual crossings against BOTH root branches, not the name "over-root".
 const rootHits=[];
 for(const limb of [0,1])for(const i of indices(`over-root/${limb}`))for(const rootRole of ['tail','loop-to-cuff'])for(const rootLimb of [0,1]){
  const branch=indices(`${rootRole}/${rootLimb}`),rootIndex=rootRole==='tail'?(rootLimb?branch[0]:branch.at(-1)):(rootLimb?branch.at(-1):branch[0]);
  for(const j of branch){if(Math.hypot(...sub(p[j],p[rootIndex]))>2*rope.diameter)continue;const h=frameCrossing(p[i],p[i+1],p[j],p[j+1],apertureFrame);if(h)rootHits.push({limb,rootRole,rootLimb,depthGap:(h.localB?h.localB[1]:h.b[1])-(h.localA?h.localA[1]:h.a[1]),point:h.a});}
 }
 const rootOver=[0,1].every(l=>['tail','loop-to-cuff'].every(role=>[0,1].every(r=>rootHits.some(h=>h.limb===l&&h.rootRole===role&&h.rootLimb===r&&h.depthGap>=rope.diameter-1e-6))));
 const checks={
  singleMaterialPath:materialOrder.every(Boolean)&&foldIds.length>0&&p.every((q,i)=>i===0||Math.hypot(...sub(q,p[i-1]))>1e-9),
  twoTurns:cuffTurns.every(c=>Math.abs(c.turns-2)<=.05),
  pairedCuffOrder:orderPreserved,
  loopAperture:loopTurns.every(t=>Math.abs(t-1)<=.08),
  firstPassage:first.length===2&&first.every(h=>h.insideBothRims&&h.direction===1),
  secondSameDirection:second.length===2&&second.every(h=>h.insideBothRims&&h.direction===1),
  underAllFour:under.length===8&&under.every(h=>h.depthGap>=rope.diameter-1e-6)&&[0,1].every(l=>under.filter(h=>h.limb===l).length===4),
  diagonalOverFrontCuff:diagonal.every(d=>d.perCuff.every(n=>n>=2)),
  underCuffDirection:underDelta(0)>0.01&&underDelta(1)<-0.01
 };
 if(scope==='final'){delete checks.diagonalOverFrontCuff;checks.overRootBranches=rootOver;}
 return {valid:Object.values(checks).every(Boolean),scope,rootRelation:{status:rootOver?'PASS':'UNVERIFIED',hits:rootHits},checks,cuffTurns,loopTurns,first,second,under,diagonal,meaning:'Numerical realization of the declared operational route; not an isotopy certificate or source-pose measurement'};
}
