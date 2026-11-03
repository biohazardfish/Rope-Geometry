import {hermitePoint} from './rope-curves.js';
import {rotationMinimizingFrames} from './rope-frames.js';
import {operationalTopology} from './operational-topology.js';
import {toWorld,toLocal} from './rope-state.js';
// Dressed static seed. Observations used: collapsed core under four cuff lanes,
// working bundle over both standing-loop roots, same-direction return through one
// aperture, hand-to-arm underpass, two cuff turns, doubled E0→fold→E1.
// Modelling choices, not source measurements: ring radius, core angle, plane tilt,
// W1 behind/lower ribbon bias, root-neighbourhood size, and the 11 mm ring guess.
export const DRESSED_TOTAL_LENGTH=7.138936637394829;
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);if(!(n>1e-12))throw Error('Degenerate dressed vector');return mul(a,1/n);};
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t),smooth=t=>t*t*(3-2*t);
const rotate=(n,t,a)=>add(mul(n,Math.cos(a)),mul(cross(t,n),Math.sin(a)));
const vecOf=(frame,v)=>[0,1,2].map(k=>frame.axes[0][k]*v[0]+frame.axes[1][k]*v[1]+frame.axes[2][k]*v[2]);
const TIGHT=Object.freeze({
  route:'dressed',columnRadius:.0275,diameter:.006,clearance:.0002,step:.002,tailStep:.01,
  spread:.0072,totalLength:DRESSED_TOTAL_LENGTH,loopRadius:.02,loopTurns:1.06,neckAngle:-2.35,rimPitch:-.016,
  coreAngle:1.02,coreOffset:.036,coreX:0,planeTilt:0,underAngle:.16,cuffWidth:.034,cuffLift:.0055,
  frontBulge:.011,bulgeWidth:.48,underInset:.0088,passSeparation:.016,passBehind:.006,passFront:.012,
  rootDepth:.09,rootLen:.026,bendSpan:.02,tailStub:.05,foldRadius:.012,bightReach:.07,bightDrop:.055,
  limbLower:.08,edgeGuardRadius:.012,tangentScale:.42
});
export const DRESSED_PRESETS=Object.freeze({
  dressedTight:TIGHT,
  looseDressed:Object.freeze({...TIGHT,spread:.009,loopRadius:.024,loopTurns:1.05,coreOffset:.03,coreAngle:.7,underAngle:.18,cuffWidth:.04,frontBulge:.018,underInset:.012,passSeparation:.02,foldRadius:.016,bightReach:.09,bightDrop:.07,limbLower:.1,tailStub:.06})
});
const SIGNED=new Set(['planeTilt','coreAngle','underAngle','coreX','limbLower','neckAngle','bightDrop','rimPitch']);
function resolve(options){
  const cfg={...TIGHT,...options,route:'dressed'};
  for(const [k,v] of Object.entries(cfg)){
    if(k==='route')continue;
    if(typeof v!=='number'||!Number.isFinite(v))throw Error(`Invalid dressed ${k}`);
    if(!SIGNED.has(k)&&v<0)throw Error(`Invalid dressed ${k}`);
  }
  if(cfg.spread<cfg.diameter+cfg.clearance-1e-12)throw Error('Bundle spacing is below diameter plus clearance');
  if(cfg.loopTurns<=.92||cfg.loopTurns>=1.08)throw Error('Invalid dressed loopTurns');
  if(!(cfg.totalLength>1))throw Error('Invalid dressed totalLength');
  return cfg;
}
function framesFor(cfg){
  const R=cfg.columnRadius,h=cfg.coreOffset,th=cfg.coreAngle,c=Math.cos(th),s=Math.sin(th);
  const center=[cfg.coreX,-(R+h)*c,-(R+h)*s];
  const tilt=cfg.planeTilt,outward=[0,-c*Math.cos(tilt)+s*Math.sin(tilt),-s*Math.cos(tilt)-c*Math.sin(tilt)];
  const normal=unit(outward),axisY=mul(normal,-1);
  const axisX=unit(sub([1,0,0],mul(axisY,dot([1,0,0],axisY)))),axisZ=cross(axisX,axisY);
  const ua=cfg.underAngle,uY=[0,Math.cos(ua),Math.sin(ua)],uX=[1,0,0],uZ=cross(uX,uY);
  return {center,normal,apertureFrame:{origin:center,axes:[axisX,axisY,axisZ]},underFrame:{origin:[0,0,0],axes:[uX,uY,uZ]}};
}
function cuffRadius(cfg,psi){
  const d=Math.atan2(Math.sin(psi+cfg.underAngle),Math.cos(psi+cfg.underAngle));
  return cfg.columnRadius+cfg.cuffLift+cfg.frontBulge*Math.exp(-((d/cfg.bulgeWidth)**2));
}
function underTimes(underAngle){
  const ts=[];
  for(let k=0;k<=5;k++){const t=(-.5+underAngle/Math.PI+2*k)/4;if(t>.01&&t<.99)ts.push(t);}
  if(ts.length!==2)throw Error('Underpass does not meet the cuff on two front turns');
  return ts;
}
function retarget(points,target){
  let acc=0;for(let i=1;i<points.length-1;i++)acc+=norm(sub(points[i],points[i-1]));
  const need=target-acc;if(!(need>1e-6))throw Error('Dressed body leaves no spare tail');
  const prev=points.at(-2),dir=unit(sub(points.at(-1),prev));
  points[points.length-1]=add(prev,mul(dir,need));
  const got=norm(sub(points.at(-1),prev));
  if(got>0)points[points.length-1]=add(prev,mul(sub(points.at(-1),prev),need/got));
}
export function buildDressedSomerville(options={}){
  const cfg=resolve(options);
  const placed=framesFor(cfg),{center,normal,apertureFrame,underFrame}=placed;
  const L=cfg.loopRadius,a0=cfg.neckAngle,a1=a0+2*Math.PI*cfg.loopTurns,rimPitch=cfg.rimPitch??-.01;
  const rimLocal=t=>{const a=a0+(a1-a0)*t;return [L*Math.cos(a),rimPitch*t,L*Math.sin(a)];};
  const rimDeriv=t=>{const a=a0+(a1-a0)*t,da=a1-a0;return [-L*Math.sin(a)*da,rimPitch,L*Math.cos(a)*da];};
  const rimStart=toWorld(rimLocal(0),apertureFrame),rimEnd=toWorld(rimLocal(1),apertureFrame);
  const t0=unit(vecOf(apertureFrame,rimDeriv(0))),t1=unit(vecOf(apertureFrame,rimDeriv(1)));
  const rootOuter=sub(rimStart,mul(t0,Math.min(cfg.rootLen,.012))),leavePoint=add(rimEnd,mul(t1,cfg.rootLen));
  const chord=norm(sub(rimStart,rimEnd));
  if(chord<cfg.diameter+cfg.clearance)throw Error(`Loop neck chord ${chord} m is inside the rope`);
  const safe=unit(vecOf(apertureFrame,[-2,-1,-2])),knee=add(rootOuter,mul(safe,.025)),far=add(knee,mul(safe,cfg.tailStub+cfg.bendSpan));
  const ts=underTimes(cfg.underAngle),midT=(ts[0]+ts[1])/2,cuffX0=cfg.coreX-cfg.cuffWidth*midT;
  const cuffAt=t=>{const psi=-Math.PI/2-4*Math.PI*t,rad=cuffRadius(cfg,psi);return [cuffX0+cfg.cuffWidth*t,-rad*Math.cos(psi),rad*Math.sin(psi)];};
  const cuffSteps=Math.max(48,Math.ceil(2*2*Math.PI*(cfg.columnRadius+cfg.cuffLift+cfg.frontBulge)/cfg.step));
  const cuffSamples=Array.from({length:cuffSteps+1},(_,i)=>cuffAt(i/cuffSteps));
  const cuffT0=unit(sub(cuffSamples[1],cuffSamples[0])),cuffT1=unit(sub(cuffSamples.at(-1),cuffSamples.at(-2)));
  const frontRad=cuffRadius(cfg,-cfg.underAngle);
  if(frontRad-cfg.underInset<cfg.columnRadius+cfg.diameter/2+cfg.clearance)throw Error('Underpass radius meets the column');
  const underY=-(frontRad-cfg.underInset),xs=ts.map(t=>cuffX0+cfg.cuffWidth*t),margin=cfg.spread*2+.01;
  const xLeft=Math.min(...xs)-margin,xRight=Math.max(...xs)+margin;
  const underAt=x=>toWorld([x,underY,0],underFrame);
  const underSteps=Math.max(4,Math.ceil((xRight-xLeft)/cfg.step));
  const underSamples=Array.from({length:underSteps+1},(_,i)=>underAt(xLeft+(xRight-xLeft)*i/underSteps));
  const passHalf=cfg.passSeparation/2;
  const pass=(x,y)=>toWorld([x,y,0],apertureFrame);
  const firstBack=pass(-passHalf,cfg.passBehind),firstFront=pass(-passHalf,-cfg.passFront);
  const secondBack=pass(passHalf,cfg.passBehind),secondFront=pass(passHalf,-cfg.passFront);
  const hitAt=(inner,outer)=>mix(inner,outer,Math.min(.008,cfg.rootLen*.4)/cfg.rootLen);
  const tailHit=toLocal(hitAt(rimStart,rootOuter),apertureFrame),leaveHit=toLocal(hitAt(rimEnd,leavePoint),apertureFrame);
  const overA=toWorld([tailHit[0],-cfg.rootDepth,tailHit[2]],apertureFrame),overB=toWorld([leaveHit[0],-cfg.rootDepth,leaveHit[2]],apertureFrame);
  const overDir=unit(sub(overB,overA)),extension=cfg.spread+cfg.diameter,overStart=sub(overA,mul(overDir,extension)),overEnd=add(overB,mul(overDir,extension));
  const loopOuter=Math.hypot(cfg.columnRadius+cfg.coreOffset-Math.min(0,rimPitch),L)+cfg.spread/2;
  const shell0=loopOuter+cfg.diameter+cfg.clearance+.008,shell1=shell0+.016,shell2=shell0+.032,behind=cfg.passBehind+.006,aside=L+cfg.spread+.012;
  const points=[],roles=[];let tangent=[...t0];
  const push=(p,role)=>{if(p.some(v=>!Number.isFinite(v)))throw Error(`Non-finite ${role}`);if(points.length&&norm(sub(p,points.at(-1)))<1e-10)return;points.push([...p]);roles.push(role);};
  function lineTo(role,target){const a=points.at(-1),length=norm(sub(target,a));if(length<1e-10)return;const steps=Math.max(1,Math.ceil(length/cfg.step));for(let i=1;i<=steps;i++)push(mix(a,target,i/steps),role);tangent=unit(sub(target,a));}
  function curve(role,fn,steps){for(let i=1;i<=steps;i++)push(fn(i/steps),role);tangent=unit(sub(fn(1),fn(Math.max(0,1-1/steps))));}
  function transit(role,ports,endT){
    const knots=[points.at(-1)];for(const port of ports)if(norm(sub(port,knots.at(-1)))>1e-8)knots.push(port);
    if(knots.length<2){tangent=unit(endT);return;}
    const tangents=knots.map((p,i)=>i===0?tangent:i===knots.length-1?unit(endT):unit(add(unit(sub(p,knots[i-1])),unit(sub(knots[i+1],p)))));
    for(let i=0;i<knots.length-1;i++){const a=knots[i],b=knots[i+1],length=norm(sub(b,a)),scale=length*cfg.tangentScale,u=mul(tangents[i],scale),v=mul(tangents[i+1],scale);curve(role,t=>hermitePoint(a,b,u,v,t),Math.max(4,Math.ceil(length/cfg.step)));}
  }
  const angleOf=p=>Math.atan2(p[2],p[1]);
  function arcAt(role,radius,targetAngle){
    const from=points.at(-1),start=angleOf(from);let d=targetAngle-start;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    const x=from[0],steps=Math.max(2,Math.ceil(Math.abs(d)*radius/cfg.step));
    for(let i=1;i<=steps;i++){const a=start+d*i/steps;push([x,radius*Math.cos(a),radius*Math.sin(a)],role);}
    tangent=unit(sub(points.at(-1),points.at(-2)));
  }
  function setRadius(role,radius){const p=points.at(-1),rad=Math.hypot(p[1],p[2])||1;lineTo(role,[p[0],p[1]/rad*radius,p[2]/rad*radius]);}
  function setX(role,x){const p=points.at(-1);lineTo(role,[x,p[1],p[2]]);}
  function lineLocal(role,local){lineTo(role,toWorld(local,apertureFrame));}
  function filletCorner(role,corner,next,radius){
    const prev=points.at(-1),vin=unit(sub(corner,prev)),vout=unit(sub(next,corner));
    const angle=Math.acos(Math.max(-1,Math.min(1,dot(vin,vout))));
    const trim=radius*Math.tan(angle/2);
    if(!(angle>0.15)||trim+1e-4>norm(sub(corner,prev))||trim+1e-4>norm(sub(next,corner))){lineTo(role,corner);return;}
    const start=sub(corner,mul(vin,trim)),end=add(corner,mul(vout,trim));
    lineTo(role,start);
    let axis=unit(cross(vin,vout));
    let inward=unit(cross(axis,vin));
    if(dot(inward,vout)<0){axis=mul(axis,-1);inward=mul(inward,-1);}
    const center=add(start,mul(inward,radius));
    const steps=Math.max(4,Math.ceil(radius*angle/cfg.step));
    const arm=sub(start,center);
    for(let i=1;i<=steps;i++){const th=angle*i/steps,dir=add(mul(unit(arm),Math.cos(th)),mul(unit(cross(axis,unit(arm))),Math.sin(th)));push(add(center,mul(dir,radius)),role);}
    tangent=[...vout];
  }
  function enterAperture(role,passX){
    const here=toLocal(points.at(-1),apertureFrame);
    lineLocal(role,[here[0],behind,0]);
    lineLocal(role,[passX,behind,0]);
    lineLocal(role,[passX,cfg.passBehind,0]);
  }
  push(far,'tail');
  lineTo('tail',knee);
  lineTo('tail',rootOuter);
  lineTo('tail',rimStart);
  const rimSteps=Math.max(24,Math.ceil(Math.abs(a1-a0)*L/cfg.step));
  curve('loop-rim',t=>toWorld(rimLocal(t),apertureFrame),rimSteps);tangent=t1;
  lineTo('loop-to-cuff',leavePoint);
  setRadius('loop-to-cuff',shell0);
  setX('loop-to-cuff',cuffSamples[0][0]);
  arcAt('loop-to-cuff',shell0,angleOf(cuffSamples[0]));
  setRadius('loop-to-cuff',Math.hypot(cuffSamples[0][1],cuffSamples[0][2])+.012);
  transit('loop-to-cuff',[cuffSamples[0]],cuffT0);
  for(let i=1;i<cuffSamples.length;i++)push(cuffSamples[i],'cuff');
  tangent=cuffT1;
  const lane=cfg.loopRadius+cfg.spread+cfg.diameter+.008;
  setRadius('cuff-to-first',shell1);
  setX('cuff-to-first',-lane);
  arcAt('cuff-to-first',shell1,angleOf(toWorld([-lane,-.02,0],apertureFrame)));
  enterAperture('cuff-to-first',-passHalf);
  lineTo('first-passage',firstFront);
  const farY=-cfg.rootDepth,plus=overStart[0]>=overEnd[0]?overStart:overEnd,minus=plus===overStart?overEnd:overStart,arrival=pass(-passHalf,farY);
  const second=plus[0]<=minus[0]?plus:minus,first=second===plus?minus:plus;
  filletCorner('over-root',arrival,first,.012);
  lineTo('over-root',first);
  lineTo('over-root',second);
  const underNear=underAt(xLeft-.03),nearL=toLocal(underNear,apertureFrame);
  lineLocal('under-approach',[nearL[0],farY,nearL[2]]);
  lineTo('under-approach',underNear);
  lineTo('under-approach',underSamples[0]);
  for(let i=1;i<underSamples.length;i++)push(underSamples[i],'under-cuff');
  tangent=[1,0,0];
  const underFar=underAt(xRight+.03),farL=toLocal(underFar,apertureFrame);
  lineTo('return-approach',underFar);
  lineLocal('return-approach',[farL[0],farY,farL[2]]);
  lineLocal('return-approach',[lane,farY,0]);
  setRadius('return-approach',shell2);
  arcAt('return-approach',shell2,angleOf(toWorld([lane,-.02,0],apertureFrame)));
  enterAperture('return-approach',passHalf);
  lineTo('return-passage',secondFront);
  const bightTangent=normal,foldCenter=add(secondFront,mul(bightTangent,.016));
  lineTo('bight-leg',foldCenter);
  {const tang=points.map((p,i)=>{const d=sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]);if(norm(d)<1e-9)throw Error(`Zero spine tangent at ${i} ${roles[i]} ${JSON.stringify(points.slice(Math.max(0,i-2),i+3))}`);return unit(d);});for(let i=1;i<tang.length;i++)if(dot(tang[i-1],tang[i])<-.999)throw Error(`Antiparallel spine at ${i} ${roles.slice(i-2,i+3).join(' | ')} ${JSON.stringify(points.slice(i-2,i+3))}`);}
  const coreSide=unit(add(apertureFrame.axes[1],mul([0,0,-1],cfg.limbLower)));
  const frames=rotationMinimizingFrames(points,{initialMode:'project',initialNormal:coreSide,antiparallel:-.99999}).map(f=>({t:f.t,side:[...f.n]}));
  const wanted=[],guide=(i,vector,source)=>wanted.push({i,vector,source});
  const pin=(role,vector,source)=>{for(let i=0;i<roles.length;i++)if(roles[i]===role)guide(i,vector,source);};
  const neckSide=apertureFrame.axes[1];
  pin('tail',neckSide,'core-stack');pin('loop-rim',neckSide,'core-stack');
  {let walked=0,lateral=0;const i0=roles.indexOf('over-root');for(let i=i0;i<roles.length&&roles[i]==='over-root';i++){const t=sub(points[Math.min(i+1,points.length-1)],points[Math.max(0,i-1)]);const along=norm(t)>1e-9&&Math.abs(dot(unit(t),neckSide))>.7;if(along&&walked>.015)guide(i,apertureFrame.axes[2],'over-side');if(!along){lateral+=i>i0?norm(sub(points[i],points[i-1])):0;if(lateral>.03)guide(i,neckSide,'core-stack');}if(i>i0)walked+=norm(sub(points[i],points[i-1]));}}
  {let walked=0;const i0=roles.indexOf('loop-to-cuff');for(let i=i0;i>=0&&i<roles.length&&roles[i]==='loop-to-cuff';i++){if(walked<=cfg.rootLen)guide(i,neckSide,'core-stack');else if(walked>cfg.rootLen+.025)guide(i,[1,0,0],'cuff-axial');if(i>i0)walked+=norm(sub(points[i],points[i-1]));}}
  pin('first-passage',apertureFrame.axes[0],'passage-lateral');pin('return-passage',apertureFrame.axes[0],'passage-lateral');
  pin('cuff',[1,0,0],'cuff-axial');pin('under-cuff',underFrame.axes[2],'under-lateral');
  {const cuff0=roles.indexOf('cuff');if(cuff0>0)guide(cuff0-1,[1,0,0],'cuff-axial');}
  const endF=frames.at(-1);guide(points.length-1,apertureFrame.axes[2],'bight-face');
  const curvature=points.map((p,i)=>{if(!i||i===points.length-1)return [0,0,0];const u=sub(p,points[i-1]),v=sub(points[i+1],p),lu=norm(u),lv=norm(v);return mul(sub(mul(v,1/lv),mul(u,1/lu)),2/(lu+lv));});
  const transition=new Set(['loop-to-cuff','cuff-to-first','under-approach','return-approach']);
  const pinned=new Set(wanted.map(w=>w.i));
  for(let i=1;i<points.length-1;){
    if(!transition.has(roles[i])||pinned.has(i)||norm(curvature[i])*cfg.edgeGuardRadius<1){i++;continue;}
    let best=i;while(i<points.length-1&&transition.has(roles[i])&&!pinned.has(i)&&norm(curvature[i])*cfg.edgeGuardRadius>=1){if(norm(curvature[i])>norm(curvature[best]))best=i;i++;}
    const bend=cross(frames[best].t,unit(curvature[best]));if(norm(bend)>1e-6)guide(best,bend,'edge-bend');
  }
  wanted.sort((a,b)=>a.i-b.i||a.source.localeCompare(b.source));
  const anchors=[];let last=0;
  for(const {i,vector,source} of wanted){const f=frames[i];let raw=sub(vector,mul(f.t,dot(vector,f.t)));if(norm(raw)<1e-6)raw=cross(f.t,Math.abs(f.t[0])<.9?[1,0,0]:[0,0,1]);const n=unit(raw);let a=Math.atan2(dot(cross(f.side,n),f.t),dot(f.side,n));
    while(a-last>Math.PI)a-=2*Math.PI;while(a-last<-Math.PI)a+=2*Math.PI;
    if(source==='edge-bend'&&Math.abs(a-last)>Math.PI/2)a-=Math.PI*Math.sign(a-last);
    anchors.push({i,a,source});last=a;}
  let j=0;
  for(let i=0;i<points.length;i++){while(j+1<anchors.length&&anchors[j+1].i<=i)j++;const a=anchors[j],b=anchors[j+1]||a;const angle=i<a.i?a.a:a.a+(b.a-a.a)*smooth(b.i===a.i?0:(i-a.i)/(b.i-a.i));frames[i].side=rotate(frames[i].side,frames[i].t,angle);frames[i].twist=angle;}
  const bightStart=roles.indexOf('bight-leg');
  const offsets=points.map((_,i)=>cfg.spread/2+(cfg.foldRadius-cfg.spread/2)*smooth(Math.max(0,(i-bightStart)/(points.length-1-bightStart))));
  const limbA=points.map((p,i)=>add(p,mul(frames[i].side,offsets[i]))),limbB=points.map((p,i)=>sub(p,mul(frames[i].side,offsets[i])));
  const ordered=[...limbA],labels=roles.map(r=>`${r}/0`);
  const foldSteps=Math.max(8,Math.ceil(Math.PI*cfg.foldRadius/cfg.step));
  for(let i=1;i<foldSteps;i++){const q=Math.PI*i/foldSteps;ordered.push(add(foldCenter,add(mul(endF.side,cfg.foldRadius*Math.cos(q)),mul(endF.t,cfg.foldRadius*Math.sin(q)))));labels.push('fold');}
  for(let i=limbB.length-1;i>=0;i--){ordered.push(limbB[i]);labels.push(`${roles[i]}/1`);}
  let segmentLabels=labels.slice(1);
  const foldPoint=limbA.length-1;
  for(let i=foldPoint;i<foldPoint+foldSteps;i++)segmentLabels[i]='fold';
  return finish(ordered,segmentLabels,cfg,placed,points,frames,offsets,anchors,chord,frontRad,underY,cuffX0);
}
function geometryLength(points){let n=0;for(let i=1;i<points.length;i++)n+=norm(sub(points[i],points[i-1]));return n;}
function extend(origin,direction,length,step){
  const dir=unit(direction),out=[];let left=length,cursor=origin;
  while(left>1e-9){const ds=Math.min(step,left);cursor=add(cursor,mul(dir,ds));out.push(cursor);left-=ds;}
  return out;
}
function finish(ordered,segmentLabels,cfg,placed,spine,frames,offsets,anchors,chord,frontRad,underY,cuffX0){
  const body=ordered.slice(),bodyLabels=segmentLabels.slice();
  const spare=cfg.totalLength-geometryLength(body);
  if(!(spare>.05))throw Error(`Dressed body ${geometryLength(body)} m leaves no spare for both tails`);
  const headDir=unit(sub(body[0],body[1])),tailDir=unit(sub(body.at(-1),body.at(-2)));
  const head=extend(body[0],headDir,spare/2,cfg.tailStep).reverse();
  const tail=extend(body.at(-1),tailDir,spare/2,cfg.tailStep);
  const points=[...head,...body,...tail];
  segmentLabels=[...Array(head.length).fill('tail/0'),...bodyLabels,...Array(tail.length).fill('tail/1')];
  retarget(points,cfg.totalLength);
  const arc=[0];for(let i=1;i<points.length;i++)arc.push(arc.at(-1)+norm(sub(points[i],points[i-1])));
  const lengthResidual=arc.at(-1)-cfg.totalLength;
  if(Math.abs(lengthResidual)<1e-9)arc[arc.length-1]=cfg.totalLength;
  const sections=[];for(let i=0;i<segmentLabels.length;){let j=i+1;while(j<segmentLabels.length&&segmentLabels[j]===segmentLabels[i])j++;sections.push({role:segmentLabels[i],start:i,end:j,materialStart:arc[i],materialEnd:arc[j]});i=j;}
  const foldSeg=segmentLabels.indexOf('fold'),foldLast=segmentLabels.lastIndexOf('fold');
  let coreMaterial=0,tailMaterial=0;for(const s of sections){const len=s.materialEnd-s.materialStart;if(s.role.startsWith('tail/'))tailMaterial+=len;else coreMaterial+=len;}
  const spineArc=[0];for(let i=1;i<spine.length;i++)spineArc.push(spineArc.at(-1)+norm(sub(spine[i],spine[i-1])));
  const saved={};for(const [k,v] of Object.entries(cfg))if(typeof v==='number'||typeof v==='string')saved[k]=v;
  saved.cuffX0=cuffX0;saved.frontCuffRadius=frontRad;saved.underRadius=frontRad-cfg.underInset;saved.neckChord=chord;
  return {schemaVersion:1,units:'m',coordinateSystem:'right-handed Z-up',ropes:[{id:'somerville',diameter:cfg.diameter,points,segmentLabels}],somerville:{
    stage:'dressed-candidate',route:'dressed',config:saved,operations:operationalTopology,sections,materialArc:arc,
    foldStart:foldSeg,foldEnd:foldLast+1,column:{axis:'X',radius:cfg.columnRadius,center:[0,0,0]},
    aperture:{center:placed.center,normal:placed.normal,radius:cfg.loopRadius,frame:placed.apertureFrame},
    underpass:{frame:placed.underFrame,angle:cfg.underAngle,localY:underY,inset:cfg.underInset},
    spine,ribbon:frames.map((f,i)=>({side:f.side,twist:f.twist,halfWidth:offsets[i]})),
    rollAnchors:anchors.map(({i,a,source})=>({spineIndex:i,spineArc:spineArc[i],roll:a,source})),
    material:{origin:'E0',totalLength:cfg.totalLength,spare:'both-tails',staticSeed:true,lineage:null,coreMaterial,tailMaterial,lengthResidual},
    modellingChoices:{
      ringRadius:'initial guess only; neck chord and clearance decide the value used',
      corePlane:'cylindrical centre plus adjustable planeTilt; neither camera-facing nor surface-tangent is a measured fact',
      w1w2:{status:'MODELLING_CHOICE',w1:'limb/0',relation:'farther inward and lower than limb/1 by limbLower',observedCrossing:false},
      rootNeighbourhood:'geometric ball of two diameters around each loop root, not a source measurement',
      constructionDiagonal:'UNVERIFIED; cuff-to-first keeps the material continuation without the loose diagonal detour'
    },
    acceptance:{geometry:'UNVERIFIED',operations:'UNVERIFIED',pose:'UNVERIFIED',constructionCorrespondence:'UNVERIFIED',numericStaticOperations:'UNVERIFIED'}
  }};
}
