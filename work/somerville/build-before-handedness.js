import {operationalTopology} from './operational-topology.js';
import {robustClosestSegments} from './robust-distance.js';
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/(norm(a)||1));
const smooth=t=>t*t*(3-2*t);
function transport(t0,t1,n){const v=cross(t0,t1),c=dot(t0,t1);if(c<-.99999)throw Error('Antiparallel frame tangent');return unit(add(add(n,cross(v,n)),mul(cross(v,cross(v,n)),1/(1+c))));}
function frame(points){const tangent=points.map((p,i)=>unit(sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)])));const seed=Math.abs(tangent[0][0])<.9?[1,0,0]:[0,1,0];let side=unit(sub(seed,mul(tangent[0],dot(seed,tangent[0]))));return tangent.map((t,i)=>{if(i)side=transport(tangent[i-1],t,side);return {t,side:[...side]};});}
const rotate=(n,t,a)=>add(mul(n,Math.cos(a)),mul(cross(t,n),Math.sin(a)));

export function buildSomerville(options={}) {
 const cfg={columnRadius:.0275,diameter:.006,clearance:.0002,step:.002,spread:.01,cuffWidth:.06,cuffLift:.03,loopRadius:.04,coreX:.075,coreZ:-.045,coreDepth:.10,rootLift:.028,foldRadius:.018,bightReach:.16,...options};
 for(const [k,v] of Object.entries(cfg))if(!Number.isFinite(v)||v<=0&& !['coreZ'].includes(k))throw Error(`Invalid ${k}`);
 const {columnRadius:R,diameter:d,step:h,loopRadius:L,coreX:cx,coreZ:cz,coreDepth:D,rootLift:lift}=cfg;
 const points=[],roles=[];let tangent=[0,0,1];
 const push=(p,role)=>{if(points.length&&norm(sub(p,points.at(-1)))<1e-10)return;points.push(p);roles.push(role);};
 function curve(role,fn,steps){for(let i=points.length?1:0;i<=steps;i++)push(fn(i/steps),role);tangent=unit(sub(fn(1),fn(1-1e-5)));}
 function transit(role,ports,endT){const knots=[points.at(-1),...ports];const tangents=knots.map((p,i)=> i===0?tangent:i===knots.length-1?unit(endT||sub(p,knots[i-1])):unit(add(unit(sub(p,knots[i-1])),unit(sub(knots[i+1],p)))));for(let i=0;i<knots.length-1;i++){const a=knots[i],b=knots[i+1],length=norm(sub(b,a)),u=mul(tangents[i],length*.65),v=mul(tangents[i+1],length*.65);curve(role,t=>add(add(mul(a,2*t**3-3*t*t+1),mul(b,-2*t**3+3*t*t)),add(mul(u,t**3-2*t*t+t),mul(v,t**3-t*t))),Math.max(4,Math.ceil(length/h)));}}
 const phase=-2.2;
 const rim=t=>[cx+L*Math.cos(phase+2*Math.PI*t),-D+lift*(.5-t),cz+L*Math.sin(phase+2*Math.PI*t)];
 const rimT=t=>[-2*Math.PI*L*Math.sin(phase+2*Math.PI*t),-lift,2*Math.PI*L*Math.cos(phase+2*Math.PI*t)];
 const root=rim(0),W=cfg.cuffWidth,C=R+cfg.cuffLift;
 push([root[0]-.015,-D+lift*.5,cz-.21],'tail');
 transit('tail',[add(root,[-.012,0,-.045]),root],rimT(0));
 curve('loop-rim',rim,Math.ceil(2*Math.PI*L/h));
 const cuff=t=>[-W/2+W*t,-C*Math.cos(-Math.PI/2+4*Math.PI*t),C*Math.sin(-Math.PI/2+4*Math.PI*t)];
 const cuffT=t=>[W,4*Math.PI*C*Math.sin(-Math.PI/2+4*Math.PI*t),4*Math.PI*C*Math.cos(-Math.PI/2+4*Math.PI*t)];
 transit('loop-to-cuff',[[cx+L*.2,-D-lift,cz-L*1.8],[-W*1.5,-D-lift,cz-L*2.8],[-W,0,-C*1.7],[-W*.7,C*.8,-C],cuff(0)],cuffT(0));
 const cuffStart=points.length-1;
 curve('cuff',cuff,Math.ceil(4*Math.PI*C/h));
 const cuffEnd=points.length-1;
 const passZ=cz+L*.25,firstX=cx-L*.32,secondX=cx+L*.32;
 const backY=-D+L*1.1,frontY=-D-L*1.1;
 transit('cuff-to-first',[[W*.7,backY,cz-L*.7],[firstX,backY,passZ]],[0,-1,0]);
 transit('first-passage',[[firstX,frontY,passZ]],[0,-1,0]);
 transit('over-root',[[root[0],frontY-.015,root[2]],[cx+L*1.7,frontY-.015,cz-L*4]],[1,0,0]);
 const underY=-(R+d*1.7),underZ=0;
 transit('outside-cuff',[[cx+cfg.bightReach+L*1.5,frontY-.015,cz-L*4],[cx+cfg.bightReach+L*1.5,underY,cz-L*4],[cx+cfg.bightReach+L*1.5,underY,underZ],[W,underY,underZ]],[-1,0,0]);
 transit('under-cuff',[[-W,underY,underZ]],[-1,0,0]);
 transit('return-approach',[[-W*2.5,underY-.003,cz-L*2],[secondX,underY-.003,cz-L*2],[secondX,backY,passZ]],[0,-1,0]);
 transit('return-passage',[[secondX,frontY,passZ]],[0,-1,0]);
 const foldCenter=[cx+cfg.bightReach,frontY-.01,cz-cfg.bightReach*.65];
 transit('bight-leg',[[secondX+L*.7,frontY-.01,passZ-L*.5],foldCenter],[1,0,-.65]);
 // Round connector curvature before ribbon expansion. Fixed cuff samples retain
 // exact two-turn winding; aperture crossings remain measured after generation.
 points[cuffStart-1]=sub(mul(points[cuffStart],2),points[cuffStart+1]);
 points[cuffEnd+1]=sub(mul(points[cuffEnd],2),points[cuffEnd-1]);
 for(let iteration=0;iteration<400;iteration++) {
   const next=points.map(p=>[...p]);
   for(let i=1;i<points.length-1;i++) {
     if(i>=cuffStart-1&&i<=cuffEnd+1)continue;
     const delta=sub(mul(add(points[i-1],points[i+1]),.5),points[i]);
     next[i]=add(points[i],mul(delta,.4));
   }
   for(let i=1;i<points.length-1;i++)points[i]=next[i];
 }
 const frames=frame(points);
 // Explicit ribbon roll: cuff stays axially paired; elsewhere interpolate the
 // operation frame to a front-facing extended bight without adding half turns.
 const angles=[];let last=0;
 for(let i=cuffStart;i<=cuffEnd;i++){const f=frames[i],n=unit(sub([1,0,0],mul(f.t,f.t[0])));let a=Math.atan2(dot(cross(f.side,n),f.t),dot(f.side,n));while(a-last>Math.PI)a-=2*Math.PI;while(a-last<-Math.PI)a+=2*Math.PI;angles[i]=a;last=a;}
 const endF=frames.at(-1),target=unit(cross([0,-1,0],endF.t));let endAngle=Math.atan2(dot(cross(endF.side,target),endF.t),dot(endF.side,target));while(endAngle-last>Math.PI)endAngle-=2*Math.PI;while(endAngle-last<-Math.PI)endAngle+=2*Math.PI;
 for(let i=0;i<points.length;i++){let a=i<cuffStart?angles[cuffStart]:i>cuffEnd?angles[cuffEnd]+(endAngle-angles[cuffEnd])*smooth((i-cuffEnd)/(points.length-1-cuffEnd)):angles[i];frames[i].side=rotate(frames[i].side,frames[i].t,a);frames[i].twist=a;}
 const bightStart=roles.indexOf('bight-leg'),offsets=points.map((_,i)=>cfg.spread/2+(cfg.foldRadius-cfg.spread/2)*smooth(Math.max(0,(i-bightStart)/(points.length-1-bightStart))));
 const a=points.map((p,i)=>add(p,mul(frames[i].side,offsets[i]))),b=points.map((p,i)=>sub(p,mul(frames[i].side,offsets[i])));
 const ordered=[...a],labels=roles.map(r=>`${r}/0`),foldStart=a.length-1,foldSteps=Math.ceil(Math.PI*cfg.foldRadius/h);
 for(let i=1;i<foldSteps;i++){const q=Math.PI*i/foldSteps;ordered.push(add(foldCenter,add(mul(endF.side,cfg.foldRadius*Math.cos(q)),mul(endF.t,cfg.foldRadius*Math.sin(q)))));labels.push('fold');}
 for(let i=b.length-1;i>=0;i--){ordered.push(b[i]);labels.push(`${roles[i]}/1`);}
 const segmentLabels=labels.slice(1);for(let i=foldStart;i<foldStart+foldSteps;i++)segmentLabels[i]='fold';
 const arc=[0];for(let i=1;i<ordered.length;i++)arc.push(arc.at(-1)+norm(sub(ordered[i],ordered[i-1])));
 const sections=[];for(let i=0;i<segmentLabels.length;){let j=i+1;while(j<segmentLabels.length&&segmentLabels[j]===segmentLabels[i])j++;sections.push({role:segmentLabels[i],start:i,end:j,materialStart:arc[i],materialEnd:arc[j]});i=j;}
 return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:'somerville',diameter:d,points:ordered,segmentLabels}],somerville:{stage:'loose-candidate',config:cfg,operations:operationalTopology,sections,materialArc:arc,foldStart,foldEnd:foldStart+foldSteps,column:{axis:'X',radius:R,center:[0,0,0]},aperture:{center:[cx,-D,cz],normal:[0,-1,0],radius:L},spine:points,ribbon:frames.map((f,i)=>({side:f.side,twist:f.twist,halfWidth:offsets[i]})),acceptance:{geometry:'UNVERIFIED',operations:'UNVERIFIED',pose:'UNVERIFIED'}}};
}
export function seedClearance(doc){const p=doc.ropes[0].points,d=doc.ropes[0].diameter,s=doc.somerville.materialArc,R=doc.somerville.column.radius;let min=Infinity,minColumn=Infinity,count=0,closest=null;const hits=[],groups={};for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1],v=sub(b,a),q=v[1]*v[1]+v[2]*v[2],t=q?Math.max(0,Math.min(1,-(a[1]*v[1]+a[2]*v[2])/q)):0;minColumn=Math.min(minColumn,Math.hypot(a[1]+t*v[1],a[2]+t*v[2])-R-d/2);for(let j=i+2;j<p.length-1;j++){if(s[j]-s[i+1]<4*d)continue;const c=p[j],e=p[j+1];if([0,1,2].some(k=>Math.max(a[k],b[k])+d<Math.min(c[k],e[k])||Math.max(c[k],e[k])+d<Math.min(a[k],b[k])))continue;const near=robustClosestSegments(a,b,c,e),gap=near.distance-d;if(gap<min){min=gap;closest={i,j,roles:[doc.ropes[0].segmentLabels[i],doc.ropes[0].segmentLabels[j]],gap};}if(gap<-.000001){count++;const key=[doc.ropes[0].segmentLabels[i],doc.ropes[0].segmentLabels[j]].sort().join(' | ');groups[key]=(groups[key]||0)+1;if(hits.length<30)hits.push({i,j,gap,roles:[doc.ropes[0].segmentLabels[i],doc.ropes[0].segmentLabels[j]]});}}}return {minimumNonlocalGap:min===Infinity?null:min,minimumColumnGap:minColumn,penetratingPairs:count,closest,groups,hits,limitation:'Seed diagnostic only: excludes local material neighborhoods; actual tube validation still required'};}
