// Review-time distance kernel. The historical geometry.js stays frozen so its
// saved experiments remain reproducible. Cross products avoid subtracting
// nearly equal squared dot products for almost-parallel directions.
export function robustClosestSegments(p0, p1, q0, q1) {
  for (const p of [p0, p1, q0, q1]) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
      throw new Error('Expected finite xyz points');
  }
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const clamp = x => Math.max(0, Math.min(1, x));
  const raw = [sub(p1,p0), sub(q1,q0), sub(p0,q0)];
  const scale = Math.max(...raw.flat().map(Math.abs));
  if (!Number.isFinite(scale)) throw new Error('Coordinate differences exceed numeric range');
  const [u,v,w] = raw.map(a => a.map(x => scale ? x/scale : 0));
  const a=dot(u,u), b=dot(u,v), c=dot(v,v), d=dot(u,w), e=dot(v,w);
  let best;
  const add = (s,t) => {
    if (!Number.isFinite(s) || !Number.isFinite(t)) return;
    s=clamp(s); t=clamp(t);
    const pointA=p0.map((x,i)=>x+raw[0][i]*s), pointB=q0.map((x,i)=>x+raw[1][i]*t);
    const distance=Math.hypot(...sub(pointA,pointB));
    if (!best || distance<best.distance) best={s,t,pointA,pointB,distance};
  };
  const n=cross(u,v), den=dot(n,n);
  if (den>0) {
    const s=dot(cross(v,w),n)/den, t=dot(cross(u,w),n)/den;
    if(s>=0&&s<=1&&t>=0&&t<=1) add(s,t);
  }
  if(c>0) { add(0,e/c); add(1,(e+b)/c); }
  if(a>0) { add(-d/a,0); add((b-d)/a,1); }
  add(0,0); add(0,1); add(1,0); add(1,1);
  return best;
}
