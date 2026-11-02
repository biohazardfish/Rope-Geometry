import {operationalTopology} from './operational-topology.js';
import {robustClosestSegments} from './robust-distance.js';
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>mul(a,1/(norm(a)||1));
const smooth=t=>t*t*(3-2*t);
function transport(t0,t1,n){const v=cross(t0,t1),c=dot(t0,t1);if(c<-.99999)throw Error('Antiparallel frame tangent');return unit(add(add(n,cross(v,n)),mul(cross(v,cross(v,n)),1/(1+c))));}
function frame(points){const tangent=points.map((p,i)=>unit(sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)])));const seed=Math.abs(tangent[0][0])<.9?[1,0,0]:[0,1,0];let side=unit(sub(seed,mul(tangent[0],dot(seed,tangent[0]))));return tangent.map((t,i)=>{if(i)side=transport(tangent[i-1],t,side);return {t,side:[...side]};});}
const rotate=(n,t,a)=>add(mul(n,Math.cos(a)),mul(cross(t,n),Math.sin(a)));

// Parameter-continuation results; each was reached by small validated steps (work/somerville/diag/march.mjs).
export const SOMERVILLE_PRESETS=Object.freeze({loose:Object.freeze({}),tightCuff:Object.freeze({"spread":0.0065,"cuffWidth":0.0265,"cuffLift":0.0035,"frontLift":0.0066,"returnDepth":3,"loopRadius":0.0277734375,"coreX":0.029150390625,"coreZ":-0.035830078125,"coreDepth":0.066376953125,"underLift":0.0034}),poseSeed:Object.freeze({"spread":0.0065,"cuffWidth":0.0265,"cuffLift":0.0035,"frontLift":0.0066,"outerReach":0.0063671875,"returnDepth":1.40078125,"bightSlope":0.53,"loopRadius":0.0277734375,"coreX":0.029150390625,"coreZ":-0.035830078125,"coreDepth":0.066376953125,"foldRadius":0.011,"bightReach":0.1,"underLift":0.0034,"rootDrop":1.50625})});
export function buildSomerville(options={}) {
 const cfg={cuffExitX:1,firstApproachMode:0,passBack:.8,roundIterations:400,columnRadius:.0275,diameter:.006,clearance:.0002,step:.002,spread:.01,cuffWidth:.06,cuffLift:.03,frontLift:0,outerReach:0,connectorDepth:2.8,returnDepth:2,bightSlope:.65,loopRadius:.04,coreX:.075,coreZ:-.045,coreDepth:.10,rootLift:.028,foldRadius:.018,bightReach:.16,edgeGuardRadius:.012,underLift:.0102,rootDrop:4,...options};
 cfg.fairing=options.fairing??'biharmonic';if(!['biharmonic','laplacian'].includes(cfg.fairing))throw Error('Invalid fairing');
 for(const [k,v] of Object.entries(cfg))if(k!=='fairing'&&(!Number.isFinite(v)||v<0&& !['coreZ'].includes(k)))throw Error(`Invalid ${k}`);
 const {columnRadius:R,diameter:d,step:h,loopRadius:L,coreX:cx,coreZ:cz,coreDepth:D,rootLift:lift}=cfg;
 const points=[],roles=[];let tangent=[0,0,1];
 const push=(p,role)=>{if(points.length&&norm(sub(p,points.at(-1)))<1e-10)return;points.push(p);roles.push(role);};
 function curve(role,fn,steps){for(let i=points.length?1:0;i<=steps;i++)push(fn(i/steps),role);tangent=unit(sub(fn(1),fn(1-1e-5)));}
 function transit(role,ports,endT){const knots=[points.at(-1),...ports];const tangents=knots.map((p,i)=> i===0?tangent:i===knots.length-1?unit(endT||sub(p,knots[i-1])):unit(add(unit(sub(p,knots[i-1])),unit(sub(knots[i+1],p)))));for(let i=0;i<knots.length-1;i++){const a=knots[i],b=knots[i+1],length=norm(sub(b,a)),u=mul(tangents[i],length*.65),v=mul(tangents[i+1],length*.65);curve(role,t=>add(add(mul(a,2*t**3-3*t*t+1),mul(b,-2*t**3+3*t*t)),add(mul(u,t**3-2*t*t+t),mul(v,t**3-t*t))),Math.max(4,Math.ceil(length/h)));}}
 const phase=-2.9;
 const rim=t=>[cx+L*Math.cos(phase-2*Math.PI*t),-D+lift*(.5-t),cz+L*Math.sin(phase-2*Math.PI*t)];
 const rimT=t=>[2*Math.PI*L*Math.sin(phase-2*Math.PI*t),-lift,-2*Math.PI*L*Math.cos(phase-2*Math.PI*t)];
 const root=rim(0),W=cfg.cuffWidth,C=R+cfg.cuffLift;
 push([root[0]-.015,-D+lift*.5,cz-.21],'tail');
 transit('tail',[add(root,[-.012,0,-.045]),root],rimT(0));
 const loopStart=points.length-1;
 curve('loop-rim',rim,Math.ceil(2*Math.PI*L/h));
 const loopEnd=points.length-1;
 const cuff=t=>{const theta=-Math.PI/2-4*Math.PI*t,angle=Math.atan2(Math.sin(theta),Math.cos(theta));const rad=C+cfg.frontLift*Math.exp(-((angle/.65)**2));return [-W/2+W*t,-rad*Math.cos(theta),rad*Math.sin(theta)];};
 const cuffT=t=>sub(cuff(t+1e-5),cuff(t-1e-5));
 transit('loop-to-cuff',[[-W*1.5,-D-lift,-C],[-W*.7,-C*.8,-C],cuff(0)],cuffT(0));
 const cuffStart=points.length-1;
 curve('cuff',cuff,Math.ceil(4*Math.PI*C/h));
 const cuffEnd=points.length-1;
 const passZ=cz+L*.25,firstX=cx-L*.32,secondX=cx+L*.32;
 const backY=-D+L*cfg.passBack,frontY=-D-L*1.1;
 transit('cuff-to-first',cfg.firstApproachMode ? [[W*.7,C*.8,-C],[Math.min(firstX-L*.9,-W*.8),C*.8,-C*1.7],[Math.min(firstX-L*.9,-W*.8),backY,-C*1.7],[Math.min(firstX-L*.9,-W*.8),backY,passZ],[firstX,backY,passZ]] : [[W*cfg.cuffExitX,C*.8,-C],[W*cfg.cuffExitX,backY,cz-L*.7],[firstX,backY,passZ]],[0,-1,0]);
 transit('first-passage',[[firstX,frontY,passZ]],[0,-1,0]);
 transit('over-root',[[root[0],frontY-.015,root[2]],[cx+L*1.7,frontY-.015,cz-L*cfg.rootDrop]],[1,0,0]);
 const underY=-(R+cfg.underLift),underZ=0,approachY=-(R+Math.max(cfg.underLift,d*1.7));
 transit('outside-cuff',[[cx+(cfg.outerReach||cfg.bightReach)+L*1.5,frontY-.015,cz-L*cfg.rootDrop],[cx+(cfg.outerReach||cfg.bightReach)+L*1.5,approachY,cz-L*cfg.rootDrop],[cx+(cfg.outerReach||cfg.bightReach)+L*1.5,approachY,underZ],[W,underY,underZ]],[-1,0,0]);
 transit('under-cuff',[[-W,underY,underZ]],[-1,0,0]);
 transit('return-approach',[[-W*2.5,-(R+d*.4),cz-L*cfg.returnDepth],[secondX,-(R+d*.4),cz-L*cfg.returnDepth],[secondX,backY,passZ]],[0,-1,0]);
 transit('return-passage',[[secondX,frontY,passZ]],[0,-1,0]);
 const foldCenter=[cx+cfg.bightReach,frontY-.01,cz-cfg.bightReach*cfg.bightSlope];
 transit('bight-leg',[[secondX+L*.7,frontY-.01,passZ-L*.5],foldCenter],[1,0,-cfg.bightSlope]);
 // Round connector curvature before ribbon expansion. Fixed cuff samples retain
 // exact two-turn winding; aperture crossings remain measured after generation.
 points[cuffStart-1]=sub(mul(points[cuffStart],2),points[cuffStart+1]);
 points[cuffEnd+1]=sub(mul(points[cuffEnd],2),points[cuffEnd-1]);
 // Laplacian rounding shortens the curve and leaves corners at held samples;
 // biharmonic fairing keeps the two held samples at each cuff end tangent-continuous.
 const held=i=>i<2||i>points.length-3||(i>=cuffStart-1&&i<=cuffEnd+1);
 for(let iteration=0;iteration<cfg.roundIterations;iteration++) {
   const lap=points.map((p,i)=>i&&i<points.length-1?sub(mul(add(points[i-1],points[i+1]),.5),p):[0,0,0]);
   const next=points.map(p=>[...p]);
   for(let i=1;i<points.length-1;i++) {
     if(cfg.fairing==='laplacian'){if(i<cuffStart-1||i>cuffEnd+1)next[i]=add(points[i],mul(lap[i],.4));continue;}
     if(held(i))continue;
     next[i]=sub(points[i],mul(sub(mul(add(lap[i-1],lap[i+1]),.5),lap[i]),.3));
   }
   for(let i=1;i<points.length-1;i++)points[i]=next[i];
 }
 const frames=frame(points);
 // Explicit ribbon roll: cuff stays axially paired; elsewhere interpolate the
 // operation frame to a front-facing extended bight without adding half turns.
 const anchors=[],wanted=[];let last=0;
 const guide=(i,vector,source)=>wanted.push({i,vector,source});
 for(let i=cuffStart;i<=cuffEnd;i++)guide(i,[1,0,0],'cuff-axial');
 const underFrom=roles.indexOf('under-cuff')-1,underTo=roles.lastIndexOf('under-cuff');
 for(let i=underFrom;i<=underTo;i++)guide(i,[0,0,1],'under-cuff');
 const endF=frames.at(-1);guide(points.length-1,unit(cross([0,-1,0],endF.t)),'bight-face');
 // A paired bundle cannot bend edgewise tighter than its half-width plus rope radius;
 // at each tight spine bend roll the pair so it stacks across the bend plane.
 const curvature=points.map((p,i)=>{if(!i||i===points.length-1)return[0,0,0];const u=sub(p,points[i-1]),v=sub(points[i+1],p),lu=norm(u),lv=norm(v);return mul(sub(mul(v,1/lv),mul(u,1/lu)),2/(lu+lv));});
 const guarded=i=>(i<cuffStart||i>cuffEnd)&&(i<underFrom-8||i>underTo+8)&&i<roles.indexOf('bight-leg');
 const edgeBends=[];for(let i=1;i<points.length-1;){if(!guarded(i)||norm(curvature[i])*cfg.edgeGuardRadius<1){i++;continue;}let best=i;while(i<points.length-1&&guarded(i)&&norm(curvature[i])*cfg.edgeGuardRadius>=1){if(norm(curvature[i])>norm(curvature[best]))best=i;i++;}edgeBends.push(best);guide(best,cross(frames[best].t,unit(curvature[best])),'edge-bend');}
 wanted.sort((a,b)=>a.i-b.i);
 for(const {i,vector,source} of wanted){const f=frames[i],n=unit(sub(vector,mul(f.t,dot(vector,f.t))));let a=Math.atan2(dot(cross(f.side,n),f.t),dot(f.side,n));
   while(a-last>Math.PI)a-=2*Math.PI;while(a-last<-Math.PI)a+=2*Math.PI;
   // Stacked direction is sign-free; choose the representative needing the smaller roll.
   if(source==='edge-bend'&&Math.abs(a-last)>Math.PI/2)a-=Math.PI*Math.sign(a-last);
   anchors.push({i,a,source});last=a;}
 let j=0;
 for(let i=0;i<points.length;i++){while(j+1<anchors.length&&anchors[j+1].i<=i)j++;const a=anchors[j],b=anchors[j+1]||a;const angle=i<a.i?a.a:a.a+(b.a-a.a)*smooth(b.i===a.i?0:(i-a.i)/(b.i-a.i));frames[i].side=rotate(frames[i].side,frames[i].t,angle);frames[i].twist=angle;}
 const bightStart=roles.indexOf('bight-leg'),offsets=points.map((_,i)=>cfg.spread/2+(cfg.foldRadius-cfg.spread/2)*smooth(Math.max(0,(i-bightStart)/(points.length-1-bightStart))));
 const a=points.map((p,i)=>add(p,mul(frames[i].side,offsets[i]))),b=points.map((p,i)=>sub(p,mul(frames[i].side,offsets[i])));
 const ordered=[...a],labels=roles.map(r=>`${r}/0`),foldStart=a.length-1,foldSteps=Math.ceil(Math.PI*cfg.foldRadius/h);
 for(let i=1;i<foldSteps;i++){const q=Math.PI*i/foldSteps;ordered.push(add(foldCenter,add(mul(endF.side,cfg.foldRadius*Math.cos(q)),mul(endF.t,cfg.foldRadius*Math.sin(q)))));labels.push('fold');}
 for(let i=b.length-1;i>=0;i--){ordered.push(b[i]);labels.push(`${roles[i]}/1`);}
 const segmentLabels=labels.slice(1);for(let i=foldStart;i<foldStart+foldSteps;i++)segmentLabels[i]='fold';
 const arc=[0];for(let i=1;i<ordered.length;i++)arc.push(arc.at(-1)+norm(sub(ordered[i],ordered[i-1])));
 const sections=[];for(let i=0;i<segmentLabels.length;){let j=i+1;while(j<segmentLabels.length&&segmentLabels[j]===segmentLabels[i])j++;sections.push({role:segmentLabels[i],start:i,end:j,materialStart:arc[i],materialEnd:arc[j]});i=j;}
 return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:'somerville',diameter:d,points:ordered,segmentLabels}],somerville:{stage:'loose-candidate',config:cfg,operations:operationalTopology,sections,materialArc:arc,foldStart,foldEnd:foldStart+foldSteps,column:{axis:'X',radius:R,center:[0,0,0]},aperture:{center:[cx,-D,cz],normal:[0,-1,0],radius:L},spine:points,ribbon:frames.map((f,i)=>({side:f.side,twist:f.twist,halfWidth:offsets[i]})),rollAnchors:anchors.map(({i,a,source})=>({spineIndex:i,materialArc:arc[i],roll:a,source})),acceptance:{geometry:'UNVERIFIED',operations:'UNVERIFIED',pose:'UNVERIFIED'}}};
}
export function seedClearance(doc){const p=doc.ropes[0].points,d=doc.ropes[0].diameter,s=doc.somerville.materialArc,R=doc.somerville.column.radius;let min=Infinity,minColumn=Infinity,count=0,closest=null;const hits=[],groups={};for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1],v=sub(b,a),q=v[1]*v[1]+v[2]*v[2],t=q?Math.max(0,Math.min(1,-(a[1]*v[1]+a[2]*v[2])/q)):0;minColumn=Math.min(minColumn,Math.hypot(a[1]+t*v[1],a[2]+t*v[2])-R-d/2);for(let j=i+2;j<p.length-1;j++){if(s[j]-s[i+1]<4*d)continue;const c=p[j],e=p[j+1];if([0,1,2].some(k=>Math.max(a[k],b[k])+d<Math.min(c[k],e[k])||Math.max(c[k],e[k])+d<Math.min(a[k],b[k])))continue;const near=robustClosestSegments(a,b,c,e),gap=near.distance-d;if(gap<min){min=gap;closest={i,j,roles:[doc.ropes[0].segmentLabels[i],doc.ropes[0].segmentLabels[j]],gap};}if(gap<-.000001){count++;const key=[doc.ropes[0].segmentLabels[i],doc.ropes[0].segmentLabels[j]].sort().join(' | ');groups[key]=(groups[key]||0)+1;if(hits.length<30)hits.push({i,j,gap,roles:[doc.ropes[0].segmentLabels[i],doc.ropes[0].segmentLabels[j]]});}}}return {minimumNonlocalGap:min===Infinity?null:min,minimumColumnGap:minColumn,penetratingPairs:count,closest,groups,hits,limitation:'Seed diagnostic only: excludes local material neighborhoods; actual tube validation still required'};}
