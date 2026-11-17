// Maya-style viewport navigation for the rope editor.
// Middle orbits, Alt/Option+middle pans, Alt/Option+right and the wheel dolly.
// The left button is never a camera button, including Alt+left.
// A gesture's kind is fixed at pointer-down; later modifier changes do not retarget it.

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const n=len(a);if(!(n>1e-14))throw Error('Zero vector');return mul(a,1/n);};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const MIN_POLAR=0.08;

function cloneCamera(camera){
  return {...camera,position:[...camera.position],target:[...camera.target],up:[...camera.up]};
}

function rotateAround(v,axis,angle){
  const k=norm(axis),c=Math.cos(angle),s=Math.sin(angle),kxv=cross(k,v),kdv=dot(k,v);
  return v.map((vi,i)=>vi*c+kxv[i]*s+k[i]*kdv*(1-c));
}

export function classifyNavigationGesture({button,altKey=false}={}){
  if(button===0)return null;
  if(button===1)return altKey?'pan':'orbit';
  if(button===2)return altKey?'dolly':null;
  return null;
}

// Camera gestures win over the rope. An active rope drag keeps the left button
// on the rope and ignores every camera button. Alt+left stays a rope press.
export function pointerAction({button,altKey=false,cameraEnabled=true,ropeDrag=false,navigating=false}={}){
  if(ropeDrag)return button===0?'rope':'none';
  if(navigating||!cameraEnabled)return 'none';
  return classifyNavigationGesture({button,altKey})??(button===0?'rope':'none');
}

export function viewOffset(camera){return sub(camera.position,camera.target);}

export function triadPlacement(camera,distance=3.2){
  const offset=viewOffset(camera);
  const n=len(offset);
  const dir=n>1e-8?mul(offset,1/n):[0,0,1];
  return {position:mul(dir,distance),up:[...camera.up],target:[0,0,0]};
}

export function orbitStep(camera,dx,dy,speed=0.005){
  const next=cloneCamera(camera);
  const up=norm(camera.up);
  let offset=viewOffset(camera);
  const radius=len(offset);
  if(!(radius>1e-8))return next;
  offset=rotateAround(offset,up,-dx*speed);
  let right=cross(up,offset);
  if(len(right)<1e-8)right=cross(up,Math.abs(up[1])<0.9?[0,1,0]:[1,0,0]);
  right=norm(right);
  const current=Math.acos(clamp(dot(norm(offset),up),-1,1));
  const desired=clamp(current+dy*speed,MIN_POLAR,Math.PI-MIN_POLAR);
  offset=rotateAround(offset,right,desired-current);
  offset=mul(norm(offset),radius);
  next.position=add(camera.target,offset);
  return next;
}

export function panStep(camera,dx,dy,{pixels=1}={}){
  const next=cloneCamera(camera);
  const offset=viewOffset(camera);
  const radius=Math.max(len(offset),1e-4);
  const up=norm(camera.up);
  const look=norm(mul(offset,-1));
  let right=cross(look,up);
  if(len(right)<1e-8)return next;
  right=norm(right);
  const screenUp=norm(cross(right,look));
  const fov=(camera.fov??40)*Math.PI/180;
  const scale=radius*Math.tan(fov/2)*2/Math.max(pixels,1);
  const shift=add(mul(right,-dx*scale),mul(screenUp,dy*scale));
  next.position=add(camera.position,shift);
  next.target=add(camera.target,shift);
  return next;
}

export function dollyStep(camera,pixels,{min=0.08,max=12}={}){
  const next=cloneCamera(camera);
  const offset=viewOffset(camera);
  const radius=len(offset);
  if(!(radius>1e-8))return next;
  const nextRadius=clamp(radius*Math.exp(pixels*0.0022),min,max);
  next.position=add(camera.target,mul(offset,nextRadius/radius));
  return next;
}

export function frameCamera(camera,bounds,{aspect=null,padding=1.35}={}){
  const next=cloneCamera(camera);
  const offset=viewOffset(camera);
  const dir=len(offset)>1e-8?norm(offset):[0,0,1];
  const radius=Math.max(bounds.radius??0,1e-4);
  const fov=(camera.fov??40)*Math.PI/180;
  const useAspect=aspect??camera.aspect??1;
  const half=fov/2;
  const halfH=Math.atan(Math.tan(half)*Math.max(useAspect,0.2));
  const distance=Math.max(radius/Math.sin(half),radius/Math.sin(halfH))*padding;
  next.target=[...bounds.center];
  next.position=add(bounds.center,mul(dir,distance));
  next.up=[...camera.up];
  return next;
}

export function boundsOf(points,extra=[]){
  const all=[...points,...extra];
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of all)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
  const center=min.map((v,k)=>(v+max[k])/2);
  let radius=0;
  for(const p of all)radius=Math.max(radius,Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2]));
  return {center,radius:Math.max(radius,1e-4),min,max};
}
