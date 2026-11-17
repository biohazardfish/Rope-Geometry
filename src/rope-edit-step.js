import {certifyPairMotion,relaxRope,SOLVER_VERSION} from './rope-relax.js';
import {projectChainLengths} from './rope-lengths.js';
import {makeTube,checkTube} from './rope-tube.js';
import {createRopeState,geometryArc,validateFrame} from './rope-state.js';

export {SOLVER_VERSION};

// One screen drag is a sequence of single coupled iterations. Parameters are
// part of the serialized session; changing them changes SOLVER_VERSION consumers.
export const EDITOR_PARAMETERS=Object.freeze({
  gap:0.0002,
  maxStep:0.0025,
  refresh:1,
  minBendRadius:0.0042,
  localArc:0.024,
  bendSmoothing:0.002,
  stretchSweeps:6,
  sweeps:4,
  ccdTolerance:0.00002,
  targetWeight:1,
  radialSegments:12,
  tubeEpsilon:1e-6,
  lengthTolerance:1e-8,
  driftTolerance:1e-9,
  handleDiameters:6,
  coupledLengths:true,
  iterations:1,
});

const add=(a,b)=>a.map((v,k)=>v+b[k]);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=(a)=>Math.hypot(...a);
const dist=(a,b)=>len(sub(a,b));
const unit=a=>{const n=len(a);if(!(n>1e-14))throw Error('Zero vector');return mul(a,1/n);};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function grabBasis(camera){
  const z=unit(sub(camera.position,camera.target));
  const right=unit(cross(camera.up,z));
  const up=cross(z,right);
  return {right,up,forward:mul(z,-1)};
}

// Direction in the camera grab plane that increases aperture signed distance.
export function throughDirection(camera,normal){
  const {forward}=grabBasis(camera);
  const projected=normal.map((v,k)=>v-forward[k]*dot(normal,forward));
  return len(projected)>1e-8 ? unit(projected) : [0,0,0];
}

export function snapGrabDelta(delta,basis,shift){
  const x=dot(delta,basis.right),y=dot(delta,basis.up),mag=Math.hypot(x,y);
  if(mag<1e-12)return [0,0,0];
  let angle=Math.atan2(y,x);
  if(shift)angle=Math.round(angle/(Math.PI/4))*(Math.PI/4);
  return add(mul(basis.right,Math.cos(angle)*mag),mul(basis.up,Math.sin(angle)*mag));
}

export function centroid(points,indices){
  const c=[0,0,0];
  for(const i of indices)for(let k=0;k<3;k++)c[k]+=points[i][k];
  return c.map(v=>v/indices.length);
}

function appendPoint(points,labels,point,role){
  if(points.length&&dist(points.at(-1),point)<1e-8)return points.length-1;
  if(points.length)labels.push(role);
  points.push(point.map(v=>v));
  return points.length-1;
}

function sampleLine(from,to,step){
  const n=Math.max(1,Math.ceil(dist(from,to)/step));
  const out=[];
  for(let i=1;i<=n;i++){const t=i/n;out.push(from.map((v,k)=>v+(to[k]-v)*t));}
  return out;
}

function filletPolyline(waypoints,radius,step){
  if(waypoints.length<2)return waypoints.map(p=>[...p]);
  const pieces=[];
  let cursor=waypoints[0].map(v=>v);
  const pushLine=(to)=>{
    const line=sampleLine(cursor,to,step);
    if(!pieces.length)pieces.push([cursor.map(v=>v)]);
    pieces.push(line);
    cursor=line.at(-1);
  };
  for(let i=1;i<waypoints.length-1;i++){
    const a=waypoints[i-1],b=waypoints[i],c=waypoints[i+1];
    const d1=unit(sub(b,a)),d2=unit(sub(c,b));
    const turn=Math.acos(clamp(dot(d1,d2),-1,1));
    if(turn<1e-3||turn>3.05){pushLine(b);continue;}
    const limit=Math.min(dist(a,b),dist(b,c))*0.49;
    const t=Math.min(radius/Math.tan(turn/2),limit);
    const r=t*Math.tan(turn/2);
    const p1=sub(b,mul(d1,t)),p2=add(b,mul(d2,t));
    const bis=unit(add(mul(d1,-1),d2));
    const center=add(b,mul(bis,r/Math.sin(turn/2)));
    pushLine(p1);
    const v1=sub(p1,center),v2=sub(p2,center);
    const x=unit(v1);
    let y=sub(v2,mul(x,dot(v2,x)));
    const yn=len(y);
    if(yn<1e-8){cursor=p2;continue;}
    y=mul(y,1/yn);
    const ang=Math.atan2(dot(v2,y),dot(v2,x));
    const n=Math.max(1,Math.ceil(Math.abs(ang)*r/step));
    const arc=[];
    for(let k=1;k<=n;k++){
      const th=ang*k/n;
      arc.push(add(center,add(mul(x,Math.cos(th)*r),mul(y,Math.sin(th)*r))));
    }
    pieces.push(arc);
    cursor=arc.at(-1);
  }
  pushLine(waypoints.at(-1));
  return pieces.flat();
}

function identityFrame(origin){
  return {origin:[...origin],axes:[[1,0,0],[0,1,0],[0,0,1]]};
}

// Loose 6 mm open rope: a pinned receiving loop and a free bight on the near
// side of its aperture. The default camera's grab plane contains a straight
// line from that bight through the aperture centre.
export function buildEditorFixture(){
  const diameter=0.006,step=0.006,loopR=0.05;
  const center=[0,0,0.06],normal=[0,1,0];
  const cameraA={
    projection:'perspective',fov:42,aspect:16/9,near:0.002,far:8,zoom:1,
    position:[0.16,-0.20,0.20],target:[...center],up:[0,0,1],
  };
  const aperture={center:[...center],normal:[...normal],radius:0.032,passSigned:0.018};
  const D=throughDirection(cameraA,normal);
  const align=dot(D,normal);
  if(!(align>0.2))throw Error('Default view does not contain a through direction');
  const tip=add(center,mul(D,-0.07/align));
  let side=cross(D,[0,0,1]);
  if(len(side)<1e-6)side=cross(D,[1,0,0]);
  side=unit(side);
  const legR=0.01;
  const arcCenter=sub(tip,mul(D,legR));
  const left=add(arcCenter,mul(side,legR));
  const tipAngle=Math.atan2(tip[2]-center[2],tip[0]-center[0]);
  const startAng=tipAngle+0.42;
  const sweep=Math.PI*2-0.72;
  const loopPoint=ang=>[center[0]+loopR*Math.cos(ang),center[1],center[2]+loopR*Math.sin(ang)];
  const tangent=ang=>unit([-Math.sin(ang),0,Math.cos(ang)]);
  const start=loopPoint(startAng);
  const end=loopPoint(startAng+sweep);
  const radial=unit([Math.cos(startAng),0,Math.sin(startAng)]);
  const tailFrom=add(start,mul(radial,0.09));
  const neckEnd=add(end,mul(tangent(startAng+sweep),0.018));
  const leadAnchor=sub(left,mul(D,0.028));
  const points=[],labels=[];
  for(const p of [tailFrom,...sampleLine(tailFrom,start,step)])appendPoint(points,labels,p,'tail');
  const loopSteps=Math.max(8,Math.ceil(loopR*sweep/step));
  for(let i=1;i<=loopSteps;i++)appendPoint(points,labels,loopPoint(startAng+sweep*i/loopSteps),'loop');
  for(const p of sampleLine(end,neckEnd,step))appendPoint(points,labels,p,'neck');
  const lead=filletPolyline([
    neckEnd,
    add(neckEnd,mul(tangent(startAng+sweep),0.012)),
    add(end,[-0.01,-0.04,-0.02]),
    [-0.02,-0.09,-0.025],
    add(leadAnchor,mul(side,0.02)),
    leadAnchor,
  ],0.012,step);
  for(const p of lead)appendPoint(points,labels,p,'lead');
  for(const p of sampleLine(points.at(-1),left,step))appendPoint(points,labels,p,'lead');
  const arcSteps=Math.max(4,Math.ceil(Math.PI*legR/0.004));
  const count=arcSteps%2===0?arcSteps:arcSteps+1;
  let bightIndex=null;
  for(let k=1;k<=count;k++){
    const a=Math.PI*k/count;
    const p=add(arcCenter,add(mul(side,Math.cos(a)*legR),mul(D,Math.sin(a)*legR)));
    const index=appendPoint(points,labels,p,'bight');
    if(k===count/2)bightIndex=index;
  }
  const right=add(arcCenter,add(mul(side,-legR),mul(D,0)));
  for(const p of sampleLine(points.at(-1),sub(right,mul(D,0.04)),step))appendPoint(points,labels,p,'end');
  if(bightIndex==null)throw Error('Bight apex was not sampled');
  if(points.length>160)throw Error(`Editor rope has ${points.length} points`);
  const pinnedRole=role=>role==='tail'||role==='loop'||role==='neck';
  const pins=[];
  for(let i=0;i<points.length;i++){
    const prev=i>0?labels[i-1]:labels[0];
    const next=i<labels.length?labels[i]:labels.at(-1);
    if(pinnedRole(prev)||pinnedRole(next))pins.push(i);
  }
  if(pins.includes(bightIndex))throw Error('Bight apex is pinned');
  const column={axis:'X',radius:0.012,center:[0.30,0.16,0.22],frame:identityFrame([0.30,0.16,0.22])};
  validateFrame(column.frame);
  const state=createRopeState(points,{diameter,column,labels,referenceId:'loose-bight-v1'});
  return {
    points:state.points.map(p=>[...p]),diameter,s0:[...state.s0],restLengths:[...state.restLengths],labels:[...state.labels],
    pins,column,aperture,bightS0:state.s0[bightIndex],bightIndex,cameraA,parameters:EDITOR_PARAMETERS,referenceId:state.referenceId,
    through:D,
  };
}

export const BAMBOO_REFERENCE_ID='bamboo-u-v1';
export const LEGACY_REFERENCE_ID='loose-bight-v1';

// Z-up. The culm lies horizontal along Y. The rope is one folded U beside it:
// equal tails, ends at one longitudinal station, bight on the material
// midpoint. Every dressed radius stays inside the collision cylinder.
export const BAMBOO_POINT_LIMIT=256;
export function buildBambooFixture(){
  const diameter=0.006,bightRadius=0.018,arcSegments=16,tailSegments=112;
  if(!(bightRadius>=0.012))throw Error('Bight radius below 12 mm');
  if(arcSegments%2)throw Error('Bight sampling needs a midpoint vertex');
  const chord=2*bightRadius*Math.sin(Math.PI/(arcSegments*2));
  const xPlane=0.050,yArc=0.108;
  const points=[],labels=[];
  const push=(point,role)=>{
    if(points.length)labels.push(role);
    points.push([point[0],point[1],point[2]]);
  };
  let y=yArc+tailSegments*chord;
  push([xPlane,y,-bightRadius],'tail');
  for(let i=1;i<=tailSegments;i++){y-=chord;push([xPlane,y,-bightRadius],'tail');}
  for(let i=1;i<=arcSegments;i++){
    const phi=Math.PI*i/arcSegments;
    push([xPlane,yArc-bightRadius*Math.sin(phi),-bightRadius*Math.cos(phi)],'bight');
  }
  for(let i=1;i<=tailSegments;i++)push([xPlane,yArc+chord*i,bightRadius],'tail');
  if(points.length>BAMBOO_POINT_LIMIT)throw Error(`Bamboo rope has ${points.length} points`);
  if(labels.length!==points.length-1)throw Error('Bamboo rope labels do not match the polyline');
  const bightIndex=tailSegments+arcSegments/2;
  const columnRadius=0.024;
  const parts=[
    {kind:'internode',y0:0,y1:0.082,radius:0.0206},
    {kind:'node',y0:0.082,y1:0.094,radius:0.0234},
    {kind:'internode',y0:0.094,y1:0.176,radius:0.0210},
    {kind:'node',y0:0.176,y1:0.188,radius:0.0236},
    {kind:'internode',y0:0.188,y1:0.268,radius:0.0204},
    {kind:'node',y0:0.268,y1:0.280,radius:0.0232},
    {kind:'internode',y0:0.280,y1:0.360,radius:0.0196},
  ];
  if(parts.some(part=>!(part.radius>0)||part.radius>columnRadius||!(part.y1>part.y0)))throw Error('Bamboo dressing leaves the collision cylinder');
  const bamboo={up:[0,0,1],axis:'Y',collisionRadius:columnRadius,base:0,height:0.360,parts};
  const column={axis:'Y',radius:columnRadius,center:[0,0.180,columnRadius],frame:{origin:[0,0.180,columnRadius],axes:[[1,0,0],[0,1,0],[0,0,1]]}};
  validateFrame(column.frame);
  const state=createRopeState(points,{diameter,column,labels,referenceId:BAMBOO_REFERENCE_ID});
  const midpoint=(state.s0[0]+state.s0.at(-1))/2;
  if(Math.abs(state.s0[bightIndex]-midpoint)>1e-8)throw Error('Bight is not the material midpoint');
  if(Math.abs(points[0][1]-points.at(-1)[1])>1e-12||Math.abs(points[0][0]-points.at(-1)[0])>1e-12)throw Error('Tail ends are not on one station');
  const extent=points.concat([[-columnRadius,0,0],[columnRadius,bamboo.height,columnRadius*2]]);
  const min=[0,1,2].map(k=>Math.min(...extent.map(p=>p[k])));
  const max=[0,1,2].map(k=>Math.max(...extent.map(p=>p[k])));
  const center=min.map((v,k)=>(v+max[k])/2);
  let radius=0;
  for(const p of extent)radius=Math.max(radius,Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]));
  const fov=36,aspect=16/9,half=fov*Math.PI/360,halfH=Math.atan(Math.tan(half)*aspect);
  const distance=Math.max(radius/Math.sin(half),radius/Math.sin(halfH))*1.38;
  const dir=unit([0.82,0.42,0.38]);
  const cameraA={
    projection:'perspective',fov,aspect,near:0.01,far:40,zoom:1,
    position:center.map((v,k)=>v+dir[k]*distance),target:[...center],up:[0,0,1],
  };
  return {
    points:state.points.map(p=>[...p]),diameter,s0:[...state.s0],restLengths:[...state.restLengths],labels:[...state.labels],
    pins:[],column,aperture:null,bightS0:state.s0[bightIndex],bightIndex,cameraA,parameters:EDITOR_PARAMETERS,
    referenceId:state.referenceId,up:[0,0,1],bightRadius,arcCenter:[xPlane,yArc,0],bamboo,
  };
}

export function bambooSolids(fixture){
  const x=fixture.column.center[0],z=fixture.column.center[2];
  return fixture.bamboo.parts.map(part=>{
    if(part.radius>fixture.column.radius)throw Error('Bamboo visual exceeds the collision radius');
    return {kind:part.kind,radius:part.radius,height:part.y1-part.y0,position:[x,(part.y0+part.y1)/2,z],axis:'Y'};
  });
}

export function aperturePassed(points,fixture){
  return apertureMeasure(points,fixture).passed;
}

// The designated bight includes both shoulders of its curved material run.
function bightVertices(fixture) {
  return fixture.points.map((_,i)=>i).filter(i=>fixture.labels[i]==='bight'||fixture.labels[i-1]==='bight');
}
function aperturePosition(p,aperture) {
  const delta=sub(p,aperture.center), signed=dot(delta,aperture.normal);
  return {signed,radial:len(sub(delta,mul(aperture.normal,signed)))};
}
export function apertureMeasure(points,fixture){
  const point=points[fixture.bightIndex];
  const {signed,radial}=aperturePosition(point,fixture.aperture);
  const minDepth=Math.min(...bightVertices(fixture).map(i=>aperturePosition(points[i],fixture.aperture).signed));
  return {point,signed,radial,minDepth,passed:signed>fixture.aperture.passSigned && radial<fixture.aperture.radius && minDepth>=fixture.diameter/2};
}
export function traversedAperture(steps,fixture) {
  const ids=bightVertices(fixture),ap=fixture.aperture,crossed=new Set();
  let before=fixture.points;
  for(const step of steps) for(const {points} of step.accepted) {
    for(const i of ids) {
      const a=aperturePosition(before[i],ap).signed,b=aperturePosition(points[i],ap).signed;
      if(a<=0 && b>0) {
        const atPlane=add(before[i],mul(sub(points[i],before[i]),-a/(b-a)));
        if(aperturePosition(atPlane,ap).radial+fixture.diameter/2<=ap.radius)crossed.add(i);
        else crossed.delete(i);
      } else if(b<0)crossed.delete(i);
    }
    before=points;
  }
  return crossed.size===ids.length && aperturePassed(before,fixture);
}

// At most six diameters, clipped to the contiguous unpinned run around s.
export function handleInterval(s0,pins,s,diameter,diameters=6){
  if(!Number.isFinite(s)||s<s0[0]||s>s0.at(-1))return null;
  const pinSet=new Set(pins);
  let lo=s0[0],hi=s0.at(-1);
  for(const i of pins){
    if(s0[i]<s-1e-12)lo=Math.max(lo,s0[i]);
    else if(s0[i]>s+1e-12)hi=Math.min(hi,s0[i]);
    else return null;
  }
  const half=diameter*diameters/2;
  const a=Math.max(s-half,lo),b=Math.min(s+half,hi);
  const indices=[];
  for(let i=0;i<s0.length;i++){
    if(pinSet.has(i))continue;
    if(s0[i]>=a-1e-12&&s0[i]<=b+1e-12)indices.push(i);
  }
  if(!indices.length)return null;
  return {s0Start:s0[indices[0]],s0End:s0[indices.at(-1)],indices};
}

// Walk a polyline at fixed spacing. The live tip is not a sample until seal,
// so extending the raw path does not change samples already emitted.
function emitSegment(ctx,point){
  const spacing=ctx.parameters.maxStep;
  const a=ctx.walkFrom,b=[...point],seg=dist(a,b);
  ctx.walkFrom=b;
  if(seg<1e-12)return;
  let travelled=0;
  while(ctx.acc+(seg-travelled)>=spacing-1e-12){
    const need=Math.max(0,spacing-ctx.acc);
    const t=(travelled+need)/seg;
    ctx.samples.push(a.map((v,k)=>v+(b[k]-v)*t));
    travelled+=need;
    ctx.acc=0;
    if(ctx.samples.length>10000)throw Error('Requested path is too long');
  }
  ctx.acc+=seg-travelled;
}
export function sealEditorPath(ctx){
  if(ctx.closed)return;
  while(ctx.fed<ctx.requestedPath.length-1)emitSegment(ctx,ctx.requestedPath[++ctx.fed]);
  const end=ctx.requestedPath.at(-1);
  if(dist(ctx.samples.at(-1),end)>1e-8)ctx.samples.push([...end]);
  ctx.closed=true;
}
export function samplePath(path,spacing){
  if(!Array.isArray(path)||path.length<1)throw Error('Requested path required');
  if(!(spacing>0))throw Error('Positive spacing required');
  const ctx={
    parameters:{maxStep:spacing},requestedPath:path.map(p=>[...p]),samples:[[...path[0]]],
    acc:0,walkFrom:[...path[0]],fed:0,closed:false,
  };
  sealEditorPath(ctx);
  return ctx.samples;
}

export function throughPath(fixture,{goalSigned,spacing,points=null,camera=null}={}){
  const D=throughDirection(camera??fixture.cameraA,fixture.aperture.normal);
  const tip=(points??fixture.points)[fixture.bightIndex];
  const signed=dot(sub(tip,fixture.aperture.center),fixture.aperture.normal);
  const goal=goalSigned??fixture.aperture.passSigned+0.012;
  const travel=(goal-signed)/dot(D,fixture.aperture.normal);
  if(!(travel>0))throw Error('Bight is already past the requested aperture depth');
  return samplePath([tip,add(tip,mul(D,travel))],spacing??fixture.parameters.maxStep);
}

// The distance kernel measures against local X. A column's declared centre
// can differ from its rigid frame origin, and its axis can be X, Y or Z.
function columnFrame(column) {
  if(!column)return null;
  const axes=column.frame?.axes ?? [[1,0,0],[0,1,0],[0,0,1]];
  const index=['X','Y','Z'].indexOf(column.axis);
  if(index<0)throw Error('Unknown column axis');
  return {origin:column.center,axes:[axes[index],axes[(index+1)%3],axes[(index+2)%3]]};
}
function placeInColumn(point,column){
  const frame=columnFrame(column);
  return frame ? frame.axes.map(axis=>dot(axis,sub(point,frame.origin))) : [...point];
}

export function eligibleNonlocalPairs(points,{localArc,column=null}={}){
  const positioned=points.map(p=>placeInColumn(p,column));
  const arc=geometryArc(positioned);
  const pairs=[];
  for(let i=0;i<positioned.length-1;i++)for(let j=i+2;j<positioned.length-1;j++)if(arc[j]-arc[i+1]>=localArc)pairs.push(i,j);
  return pairs;
}

export function certifyEditorMotion(before,after,{diameter,gap,localArc,column=null,ccdTolerance=EDITOR_PARAMETERS.ccdTolerance}={}){
  if(before.length!==after.length)throw Error('Point count changed');
  const X=before.map(p=>placeInColumn(p,column)),Y=after.map(p=>placeInColumn(p,column));
  const pairs=eligibleNonlocalPairs(before,{localArc,column});
  const floor=diameter+gap/2;
  const columnFloor=column?column.radius+diameter/2+gap/2:-Infinity;
  return certifyPairMotion(Float64Array.from(X.flat()),Float64Array.from(Y.flat()),pairs,{floor,columnFloor,tolerance:ccdTolerance});
}

export function gateSubstep(before,after,spec){
  const {pins,restLengths,driftTolerance,lengthTolerance,pinnedWorld}=spec;
  const reference=pinnedWorld??before;
  for(const i of pins)if(dist(reference[i],after[i])>driftTolerance)return 'drift';
  for(let i=0;i<restLengths.length;i++)if(Math.abs(dist(after[i],after[i+1])-restLengths[i])>lengthTolerance)return 'length';
  if(!certifyEditorMotion(before,after,spec))return 'motion';
  return null;
}

// Put every pin on its real world coordinate, then satisfy lengths there, before a gate runs.
function preparePinnedConstraints(points,spec){
  const pinned=points.map((p,i)=>spec.pinSet.has(i)?spec.pinnedWorld[i].map(v=>v):[...p]);
  let error=0;
  for(let i=0;i<spec.restLengths.length;i++)error=Math.max(error,Math.abs(dist(pinned[i],pinned[i+1])-spec.restLengths[i]));
  if(error<=spec.lengthTolerance)return pinned;
  const n=pinned.length,P=Float64Array.from(pinned.flat()),inverseMasses=new Float64Array(n);
  for(let i=0;i<n;i++)inverseMasses[i]=spec.pinSet.has(i)?0:1;
  projectChainLengths(P,spec.restLengths,{iterations:12,tolerance:Math.min(spec.lengthTolerance,1e-12),inverseMasses});
  const out=[];
  for(let i=0;i<n;i++)out.push([P[3*i],P[3*i+1],P[3*i+2]]);
  for(const i of spec.pins)out[i]=spec.pinnedWorld[i].map(v=>v);
  return out;
}

function solverOptions(parameters,column,diameter,restLengths,pins,targets){
  return {
    diameter,columnRadius:column?column.radius:null,columnFrame:columnFrame(column),coupledLengths:true,
    gap:parameters.gap,iterations:1,sweeps:parameters.sweeps,maxStep:parameters.maxStep,refresh:parameters.refresh,
    minBendRadius:parameters.minBendRadius,localArc:parameters.localArc,bendSmoothing:parameters.bendSmoothing,
    stretchSweeps:parameters.stretchSweeps,ccdTolerance:parameters.ccdTolerance,restLengths,fixedPoints:[...pins],targets,
  };
}

export function assessEditorTube(points,{diameter,column,parameters}){
  const mesh=makeTube(points,diameter/2,{radialSegments:parameters.radialSegments});
  const columnSpec=column?{axis:column.axis,radius:column.radius,center:column.center,frame:column.frame}:null;
  return checkTube(mesh,{column:columnSpec,epsilon:parameters.tubeEpsilon});
}

export function startEditorStep(input){
  const {points,restLengths,pins,column=null,diameter,handleIndices,requestedPath,parameters}=input;
  if(!handleIndices?.length)throw Error('Handle required');
  const pinSet=new Set(pins);
  if(handleIndices.some(i=>pinSet.has(i)||!Number.isInteger(i)||i<0||i>=points.length))throw Error('Handle includes a pin');
  const start=points.map(p=>[...p]);
  const baseAnchor=centroid(start,handleIndices);
  const incremental=input.incremental===true;
  const raw=requestedPath.map(p=>[...p]);
  return {
    restLengths,pins,column,diameter,handleIndices:[...handleIndices],parameters,
    requestedPath:raw,
    start,baseAnchor,offsets:handleIndices.map(i=>sub(start[i],baseAnchor)),
    samples:incremental?[[...raw[0]]]:samplePath(raw,parameters.maxStep),sampleIndex:0,
    accepted:[],current:start.map(p=>[...p]),stalls:0,done:false,
    closed:!incremental,fed:incremental?0:raw.length-1,acc:0,walkFrom:[...(incremental?raw[0]:raw.at(-1))],
    spec:{pins,restLengths,diameter,ccdTolerance:parameters.ccdTolerance,gap:parameters.gap,localArc:parameters.localArc,column,driftTolerance:parameters.driftTolerance,lengthTolerance:parameters.lengthTolerance,pinnedWorld:start,pinSet},
  };
}

export function openEditorStep(input){
  const origin=input.requestedPath?.[0]??centroid(input.points,input.handleIndices);
  return startEditorStep({...input,requestedPath:[origin],incremental:true});
}

// Append one raw desired point. A live tip stays unsampled until the next point freezes it.
export function extendEditorPath(ctx,point,{tip=false}={}){
  if(ctx.closed)return;
  const p=[...point];
  const lastIndex=ctx.requestedPath.length-1;
  if(dist(ctx.requestedPath[lastIndex],p)<1e-12)return;
  if(tip&&lastIndex>ctx.fed){ctx.requestedPath[lastIndex]=p;return;}
  ctx.requestedPath.push(p);
  if(ctx.done)return;
  while(ctx.fed<ctx.requestedPath.length-2)emitSegment(ctx,ctx.requestedPath[++ctx.fed]);
}

export function advanceEditorStep(ctx){
  if(ctx.done)return {done:true,accepted:false};
  while(ctx.sampleIndex<ctx.samples.length&&ctx.accepted.length<400){
    const sample=ctx.samples[ctx.sampleIndex++];
    if(dist(centroid(ctx.current,ctx.handleIndices),sample)<1e-8)continue;
    let targetAnchor=sample.map(v=>v);
    for(let attempt=0;attempt<6;attempt++){
      const positions=ctx.handleIndices.map((_,k)=>add(targetAnchor,ctx.offsets[k]));
      let solved=null,corrected=null;
      try{solved=relaxRope(ctx.current,solverOptions(ctx.parameters,ctx.column,ctx.diameter,ctx.restLengths,ctx.pins,[{indices:ctx.handleIndices,positions,weight:ctx.parameters.targetWeight}]));}
      catch{solved=null;}
      if(solved)try{corrected=preparePinnedConstraints(solved.points,ctx.spec);}catch{corrected=null;}
      const fault=corrected?gateSubstep(ctx.current,corrected,ctx.spec):'solver';
      if(!fault){
        const travel=Math.max(...ctx.current.map((p,i)=>dist(p,corrected[i])));
        if(travel>1e-8){
          ctx.stalls=0;
          ctx.current=corrected.map(p=>[...p]);
          ctx.accepted.push({requested:[...targetAnchor],points:ctx.current.map(p=>[...p])});
          return {done:false,accepted:true,reason:null};
        }
        break;
      }
      const here=centroid(ctx.current,ctx.handleIndices);
      targetAnchor=here.map((v,k)=>v+(targetAnchor[k]-v)*0.5);
    }
    ctx.stalls++;
    if(ctx.stalls>=2){ctx.done=true;return {done:true,accepted:false,reason:'blocked'};}
    return {done:false,accepted:false,reason:'blocked'};
  }
  if(ctx.accepted.length>=400||ctx.closed!==false){ctx.done=true;return {done:true,accepted:false};}
  return {done:false,accepted:false,reason:'pending'};
}

export function finishEditorStep(ctx){
  if(ctx.closed===false)sealEditorPath(ctx);
  while(!ctx.done)advanceEditorStep(ctx);
  const tube=assessEditorTube(ctx.current,{diameter:ctx.diameter,column:ctx.column,parameters:ctx.parameters});
  const requestedPath=ctx.requestedPath.map(p=>[...p]);
  if(!tube.valid)return {ok:false,reason:'tube',points:ctx.start.map(p=>[...p]),accepted:[],tube,requestedPath,handleIndices:[...ctx.handleIndices]};
  return {ok:true,reason:ctx.accepted.length?'accepted':'unchanged',points:ctx.current.map(p=>[...p]),accepted:ctx.accepted.map(s=>({requested:[...s.requested],points:s.points.map(p=>[...p])})),tube,requestedPath,handleIndices:[...ctx.handleIndices]};
}

export function applyEditorStep(input){
  return finishEditorStep(startEditorStep(input));
}
