import {SOLVER_VERSION,EDITOR_PARAMETERS,applyEditorStep,buildBambooFixture,buildEditorFixture} from './rope-edit-step.js';

export const SESSION_SCHEMA_VERSION=2;
export const EDITOR_VERSION=1;
const AUDIT_OPS=new Set(['init','commit','undo','cancel','load','replay','reject']);
const CAMERA_NUMBERS=['fov','aspect','near','far','zoom'];

const K=Uint32Array.of(
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
);
const rotr=(x,n)=>(x>>>n)|(x<<(32-n));

export function sha256Hex(text){
  const bytes=new TextEncoder().encode(text);
  const bitLen=bytes.length*8;
  const padded=new Uint8Array(((bytes.length+9+63)>>6)<<6);
  padded.set(bytes);padded[bytes.length]=0x80;
  const view=new DataView(padded.buffer);
  view.setUint32(padded.length-8,Math.floor(bitLen/4294967296));
  view.setUint32(padded.length-4,bitLen>>>0);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w=new Uint32Array(64);
  for(let offset=0;offset<padded.length;offset+=64){
    for(let i=0;i<16;i++)w[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i++){
      const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);
      const s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let i=0;i<64;i++){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch=(e&f)^((~e)>>>0&g);
      const t1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj=(a&b)^(a&c)^(b&c);
      const t2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v=>v.toString(16).padStart(8,'0')).join('');
}

export function hashPoints(points){return sha256Hex(JSON.stringify(points));}

function finitePoint(p){return Array.isArray(p)&&p.length===3&&p.every(v=>typeof v==='number'&&Number.isFinite(v));}
function finiteCamera(camera,errors){
  if(!camera||camera.projection!=='perspective'){errors.push('camera');return;}
  for(const key of CAMERA_NUMBERS)if(!(typeof camera[key]==='number'&&Number.isFinite(camera[key])&&camera[key]>0))errors.push('camera');
  if(!(camera.far>camera.near && camera.fov<180))errors.push('camera');
  for(const key of ['position','target','up'])if(!finitePoint(camera[key]))errors.push('camera');
  if([camera.up,camera.position,camera.target].every(finitePoint)) {
    const d=camera.position.map((v,k)=>v-camera.target[k]),u=camera.up;
    const cross=[u[1]*d[2]-u[2]*d[1],u[2]*d[0]-u[0]*d[2],u[0]*d[1]-u[1]*d[0]];
    if(Math.hypot(...cross)<1e-12)errors.push('camera');
  }
  if(finitePoint(camera.position)&&finitePoint(camera.target)&&Math.hypot(...camera.position.map((v,k)=>v-camera.target[k]))<1e-8)errors.push('camera');
}
function sameParameters(value){
  if(!value||typeof value!=='object')return false;
  const keys=Object.keys(EDITOR_PARAMETERS);
  if(Object.keys(value).length!==keys.length)return false;
  return keys.every(key=>value[key]===EDITOR_PARAMETERS[key]);
}
function pointsEqual(a,b){
  return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((p,i)=>p.length===3&&p.every((v,k)=>v===b[i][k]));
}

export function createSession(fixture){
  const points=fixture.points.map(p=>[...p]);
  return {
    schemaVersion:SESSION_SCHEMA_VERSION,
    editorVersion:EDITOR_VERSION,
    solverVersion:SOLVER_VERSION,
    initialState:{
      points:points.map(p=>[...p]),diameter:fixture.diameter,s0:[...fixture.s0],restLengths:[...fixture.restLengths],
      column:structuredClone(fixture.column),pins:[...fixture.pins],labels:fixture.labels?[...fixture.labels]:null,
      referenceId:fixture.referenceId,aperture:structuredClone(fixture.aperture),bightS0:fixture.bightS0,bightIndex:fixture.bightIndex,
    },
    materials:{s0:[...fixture.s0],restLengths:[...fixture.restLengths],bightS0:fixture.bightS0},
    parameters:{...EDITOR_PARAMETERS},
    cameraA:structuredClone(fixture.cameraA),
    cameraB:null,
    mode:'A',
    points,
    pins:[...fixture.pins],
    steps:[],
    timeline:[],
    audit:[{seq:0,op:'init',ok:true}],
  };
}

function view(session) {
  return {mode:session.mode,cameraA:structuredClone(session.cameraA),cameraB:structuredClone(session.cameraB)};
}

export function recordObservation(session,camera) {
  const last=session.timeline.at(-1);
  const previous=last?.kind==='B' ? session.steps[last.step].cameraB : last?.camera;
  const before={...view(session),mode:'A',cameraA:structuredClone(previous ?? {...buildEditorFixture().cameraA,aspect:camera.aspect})};
  session.timeline.push({kind:'A',camera:structuredClone(camera),before});
  session.cameraA=structuredClone(camera);
}

export function commitStep(session,stepResult,cameras,handle){
  if(!stepResult.ok||!stepResult.tube?.valid||!stepResult.accepted.length)throw Error('Only a tube-checked motion can be committed');
  session.timeline.push({kind:'B',step:session.steps.length,before:view(session)});
  session.points=stepResult.points.map(p=>[...p]);
  session.cameraA=structuredClone(cameras.cameraA);
  session.cameraB=structuredClone(cameras.cameraB);
  session.mode='A';
  const record={
    cameraA:structuredClone(cameras.cameraA),
    cameraB:structuredClone(cameras.cameraB),
    handle:{s0Start:handle.s0Start,s0End:handle.s0End,indices:[...handle.indices]},
    requestedPath:stepResult.requestedPath.map(p=>[...p]),
    accepted:stepResult.accepted.map(item=>({requested:[...item.requested],points:item.points.map(p=>[...p])})),
    resultSha256:hashPoints(stepResult.points),
  };
  session.steps.push(record);
  session.audit.push({seq:session.audit.length,op:'commit',ok:true});
  return record;
}

export function undoSession(session){
  const event=session.timeline.pop();
  if(!event)return false;
  if(event.kind==='B')session.steps.pop();
  const last=session.steps.at(-1);
  session.points=structuredClone(last?.accepted.at(-1).points ?? session.initialState.points);
  Object.assign(session,structuredClone(event.before));
  session.audit.push({seq:session.audit.length,op:'undo',ok:true});
  return true;
}

export function playbackFrames(session){
  const frames=[session.initialState.points.map(p=>[...p])];
  for(const step of session.steps)for(const item of step.accepted)frames.push(item.points.map(p=>[...p]));
  return frames;
}

function push(errors,code){if(!errors.includes(code))errors.push(code);}

export function validateSession(input){
  const errors=[];
  if(!input||typeof input!=='object')return {ok:false,errors:['version']};
  if(input.schemaVersion!==SESSION_SCHEMA_VERSION||input.editorVersion!==EDITOR_VERSION||input.solverVersion!==SOLVER_VERSION)push(errors,'version');
  if(!sameParameters(input.parameters))push(errors,'parameters');
  const init=input.initialState;
  const points=input.points;
  if(!init||!Array.isArray(points)||!Array.isArray(init.points))push(errors,'count');
  else{
    const n=init.points.length;
    if(n<2||n>256||points.length!==n)push(errors,'count');
    if(init.points.some(p=>!finitePoint(p))||points.some(p=>!finitePoint(p)))push(errors,'finite');
    if(!Array.isArray(init.s0)||init.s0.length!==n||!Array.isArray(init.restLengths)||init.restLengths.length!==n-1)push(errors,'material');
    else{
      for(let i=0;i<n;i++)if(typeof init.s0[i]!=='number'||!Number.isFinite(init.s0[i])||(i&&!(init.s0[i]>init.s0[i-1])))push(errors,'material');
      for(let i=0;i<n-1;i++)if(!Number.isFinite(init.restLengths[i])||Math.abs(init.restLengths[i]-(init.s0[i+1]-init.s0[i]))>1e-12)push(errors,'material');
    }
    if(!(init.diameter>0)||!Number.isFinite(init.diameter))push(errors,'material');
    if(!Array.isArray(init.pins)||init.pins.length!==input.pins?.length||init.pins.some((pin,i)=>pin!==input.pins[i]||!Number.isInteger(pin)||pin<0||pin>=n))push(errors,'material');
    else if(new Set(init.pins).size!==init.pins.length)push(errors,'material');
    if(!input.materials||!Array.isArray(input.materials.s0)||input.materials.s0.length!==n||input.materials.s0.some((s,i)=>s!==init.s0[i]))push(errors,'material');
    if(!input.materials||!Array.isArray(input.materials.restLengths)||input.materials.restLengths.length!==n-1||input.materials.restLengths.some((s,i)=>s!==init.restLengths[i]))push(errors,'material');
    if(typeof init.bightS0!=='number'||!Number.isInteger(init.bightIndex)||init.bightIndex<0||init.bightIndex>=n||init.s0?.[init.bightIndex]!==init.bightS0)push(errors,'material');
    if(init.pins?.includes(init.bightIndex))push(errors,'material');
    if(init.labels&&(!Array.isArray(init.labels)||init.labels.length!==n-1))push(errors,'count');
    const aperture=init.aperture;
    if(aperture==null){if(init.referenceId!=='bamboo-u-v1')push(errors,'finite');}
    else if(!finitePoint(aperture.center)||!finitePoint(aperture.normal)||!(aperture.radius>0)||!Number.isFinite(aperture.passSigned))push(errors,'finite');
    if(init.column){
      const column=init.column;
      if(!['X','Y','Z'].includes(column.axis)||!(column.radius>0)||!finitePoint(column.center)||!column.frame||!finitePoint(column.frame.origin)||!Array.isArray(column.frame.axes)||column.frame.axes.length!==3||column.frame.axes.some(axis=>!finitePoint(axis)))push(errors,'finite');
    }
  }
  if(input.mode!=='A'&&input.mode!=='B')push(errors,'camera');
  finiteCamera(input.cameraA,errors);
  if(input.cameraB!=null)finiteCamera(input.cameraB,errors);
  if(input.mode==='B'&&input.cameraB==null)push(errors,'camera');
  if(!Array.isArray(input.steps))push(errors,'count');
  else for(const step of input.steps){
    if(!step||!step.handle||!Array.isArray(step.handle.indices)||!Array.isArray(step.requestedPath)||!Array.isArray(step.accepted)){push(errors,'material');continue;}
    if(typeof step.handle.s0Start!=='number'||typeof step.handle.s0End!=='number'||!(step.handle.s0End+1e-12>=step.handle.s0Start))push(errors,'material');
    if(init?.s0&&init?.diameter&&step.handle.s0End-step.handle.s0Start>init.diameter*EDITOR_PARAMETERS.handleDiameters+1e-9)push(errors,'material');
    const pinSet=new Set(init?.pins??[]);
    if(step.handle.indices.some(i=>pinSet.has(i)||!Number.isInteger(i)||i<0||i>=(init?.points.length??0)))push(errors,'material');
    if(init?.s0&&step.handle.indices.length){
      const inside=[];
      for(let i=0;i<init.s0.length;i++)if(!pinSet.has(i)&&init.s0[i]>=step.handle.s0Start-1e-12&&init.s0[i]<=step.handle.s0End+1e-12)inside.push(i);
      if(inside.length!==step.handle.indices.length||inside.some((i,k)=>i!==step.handle.indices[k]))push(errors,'material');
    }
    if(step.requestedPath.some(p=>!finitePoint(p)))push(errors,'finite');
    if(!step.accepted.length||step.accepted.some(item=>!finitePoint(item?.requested)||!Array.isArray(item?.points)||item.points.length!==points?.length||item.points.some(p=>!finitePoint(p))))push(errors,'finite');
    else if(step.resultSha256!==hashPoints(step.accepted.at(-1).points))push(errors,'hash');
    finiteCamera(step.cameraA,errors);
    finiteCamera(step.cameraB,errors);
  }
  if(Array.isArray(input.steps)&&input.steps.length){
    const last=input.steps.at(-1);
    if(last?.accepted?.length&&!pointsEqual(points,last.accepted.at(-1).points))push(errors,'hash');
    if(last?.resultSha256&&points&&hashPoints(points)!==last.resultSha256)push(errors,'hash');
  }else if(init?.points&&points&&!pointsEqual(points,init.points))push(errors,'hash');
  if(!Array.isArray(input.audit)||!input.audit.length)push(errors,'audit');
  else input.audit.forEach((entry,index)=>{
    if(!entry||entry.seq!==index||!AUDIT_OPS.has(entry.op)||typeof entry.ok!=='boolean')push(errors,'audit');
  });
  if(!Array.isArray(input.timeline))push(errors,'timeline');
  else {
    let count=0;
    for(const event of input.timeline) {
      if(event?.kind==='A')finiteCamera(event.camera,errors);
      else if(event?.kind==='B' && event.step===count && count<input.steps?.length)count++;
      else push(errors,'timeline');
      finiteCamera(event?.before?.cameraA,errors);
      if(event?.before?.cameraB!=null)finiteCamera(event.before.cameraB,errors);
      if(!['A','B'].includes(event?.before?.mode)||event.before.mode==='B'&&!event.before.cameraB)push(errors,'camera');
    }
    if(count!==input.steps?.length)push(errors,'timeline');
  }
  return {ok:errors.length===0,errors};
}

export function serializeSession(session){return JSON.stringify(session);}

export function fixtureByReference(referenceId){
  if(referenceId==='loose-bight-v1')return buildEditorFixture();
  if(referenceId==='bamboo-u-v1')return buildBambooFixture();
  return null;
}

// Archived sessions can differ from the current builder by a rounding ulp.
// A larger change is a different fixture and is not migrated into another reference.
function sameFixtureValue(known,actual){
  if(typeof known==='number'&&typeof actual==='number')return known===actual||Number.isFinite(known)&&Number.isFinite(actual)&&Math.abs(known-actual)<=1e-12;
  if(Array.isArray(known)||Array.isArray(actual))return Array.isArray(known)&&Array.isArray(actual)&&known.length===actual.length&&known.every((item,i)=>sameFixtureValue(item,actual[i]));
  if(known&&actual&&typeof known==='object'){
    const keys=new Set([...Object.keys(known),...Object.keys(actual)]);
    for(const key of keys)if(!sameFixtureValue(known[key],actual[key]))return false;
    return true;
  }
  return Object.is(known,actual);
}

export function loadSession(encoded){
  let data=encoded;
  if(typeof encoded==='string'){
    try{data=JSON.parse(encoded);}catch{return {ok:false,errors:['version']};}
  }
  let report;
  try {
    report=validateSession(data);
    if(!report.ok)return report;
    const fixture=fixtureByReference(data.initialState?.referenceId);
    if(!fixture)return {ok:false,errors:['fixture']};
    const known=createSession(fixture);
    if(!sameFixtureValue(known.initialState,data.initialState))return {ok:false,errors:['fixture']};
    if(data.materials.bightS0!==data.initialState.bightS0)return {ok:false,errors:['material']};
    report=replaySession(data);
    if(!report.ok)return {ok:false,errors:[report.reason],index:report.index};
  } catch {return {ok:false,errors:['invalid']};}
  return {ok:true,errors:[],session:structuredClone(data)};
}

export function replaySession(session){
  const report=validateSession(session);
  if(!report.ok){
    const index=session.steps?.findIndex(step=>step?.accepted?.length && step.resultSha256!==hashPoints(step.accepted.at(-1).points));
    return {ok:false,reason:'invalid',errors:report.errors,index:index>=0?index:null};
  }
  let points=session.initialState.points.map(p=>[...p]);
  for(let index=0;index<session.steps.length;index++){
    const step=session.steps[index];
    const result=applyEditorStep({
      points,restLengths:session.initialState.restLengths,pins:session.pins,column:session.initialState.column,
      diameter:session.initialState.diameter,handleIndices:step.handle.indices,requestedPath:step.requestedPath,parameters:session.parameters,
    });
    const hash=hashPoints(result.points);
    if(!result.ok||hash!==step.resultSha256)return {ok:false,reason:'hash',index,errors:[]};
    if(result.accepted.length!==step.accepted.length)return {ok:false,reason:'points',index,errors:[]};
    for(let sub=0;sub<result.accepted.length;sub++){
      if(!pointsEqual(result.accepted[sub].points,step.accepted[sub].points)||!pointsEqual([result.accepted[sub].requested],[step.accepted[sub].requested]))return {ok:false,reason:'points',index,substep:sub,errors:[]};
    }
    points=result.points;
  }
  return {ok:true,reason:'match',index:null,points,errors:[]};
}
