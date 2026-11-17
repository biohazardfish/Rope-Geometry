import {robustClosestSegments} from './robust-distance.js';
import {projectChainLengths} from './rope-lengths.js';
import {toLocal,toWorld} from './rope-state.js';
// Bump when an accepted coupled step can change for the same arguments.
export const SOLVER_VERSION=1;
// Position-based relaxation of one material polyline around an X-axis column.
// Step safety: a vertex may move at most half of the current clearance of every
// non-local segment pair it belongs to. Segment distance is 1-Lipschitz in each
// endpoint, so no pair can pass through contact during the linear step.

function closest(P,i,j) {
  const point=k=>[P[3*k],P[3*k+1],P[3*k+2]];
  const r=robustClosestSegments(point(i),point(i+1),point(j),point(j+1));
  return {...r,dx:r.pointA[0]-r.pointB[0],dy:r.pointA[1]-r.pointB[1],dz:r.pointA[2]-r.pointB[2]};
}

function axisDistance(P, i) {
  // Distance from segment i to the X axis, measured in the YZ plane.
  const a = 3 * i, b = a + 3, y = P[a + 1], z = P[a + 2], vy = P[b + 1] - y, vz = P[b + 2] - z, q = vy * vy + vz * vz;
  const t = q ? Math.max(0, Math.min(1, -(y * vy + z * vz) / q)) : 0;
  return Math.hypot(y + t * vy, z + t * vz);
}

function bendRadius(P,i){
 const a=[0,1,2].map(k=>P[3*i+k]-P[3*i-3+k]),b=[0,1,2].map(k=>P[3*i+3+k]-P[3*i+k]);
 const la=Math.hypot(...a),lb=Math.hypot(...b);if(la<1e-14||lb<1e-14)return 0;
 const angle=Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,k)=>s+v*b[k],0)/(la*lb))));return angle<1e-8?Infinity:(la+lb)/2/angle;
}
// Certifies the supplied linear step for the supplied nonlocal pair set. The
// broad phase must cover the whole motion; this does not certify local tube faces.
export function certifyPairMotion(X,Y,pairs,{floor,columnFloor=-Infinity,tolerance=.00002}={}){
 const n=X.length/3,disp=Array.from({length:n},(_,i)=>Math.hypot(...[0,1,2].map(k=>Y[3*i+k]-X[3*i+k]))),Z=new Float64Array(12);
 const write=(ids,t)=>{for(let slot=0;slot<ids.length;slot++){const v=ids[slot];for(let a=0;a<3;a++)Z[3*slot+a]=X[3*v+a]+t*(Y[3*v+a]-X[3*v+a]);}};
 for(let k=0;k<pairs.length;k+=2){const i=pairs[k],j=pairs[k+1],speed=Math.max(disp[i],disp[i+1])+Math.max(disp[j],disp[j+1]);
  if(closest(X,i,j).distance-speed>=floor)continue;
  const m=Math.min(64,Math.max(1,Math.ceil(speed/(2*tolerance))));
  for(let s=0;s<=m;s++){write([i,i+1,j,j+1],s/m);if(closest(Z,0,2).distance-speed/(2*m)<floor)return false;}
 }
 if(Number.isFinite(columnFloor))for(let i=0;i<n-1;i++){const speed=Math.max(disp[i],disp[i+1]);if(axisDistance(X,i)-speed>=columnFloor)continue;const m=Math.min(64,Math.max(1,Math.ceil(speed/(2*tolerance))));for(let s=0;s<=m;s++){write([i,i+1],s/m);if(axisDistance(Z,0)-speed/(2*m)<columnFloor)return false;}}
 return true;
}

export function candidatePairs(P, arc, { cutoff, localArc }) {
  const n = P.length / 3, cell = cutoff, grid = new Map(), pairs = [];
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < n - 1; i++) {
    const x = Math.floor((P[3 * i] + P[3 * i + 3]) / 2 / cell), y = Math.floor((P[3 * i + 1] + P[3 * i + 4]) / 2 / cell), z = Math.floor((P[3 * i + 2] + P[3 * i + 5]) / 2 / cell);
    const k = key(x, y, z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  let maxSegment = 0;
  for (let i = 0; i < n - 1; i++) maxSegment = Math.max(maxSegment, arc[i + 1] - arc[i]);
  const reach = Math.ceil((cutoff + maxSegment) / cell);
  for (const [k, list] of grid) {
    const [x, y, z] = k.split(',').map(Number);
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
      const other = grid.get(key(x + dx, y + dy, z + dz));
      if (!other) continue;
      for (const i of list) for (const j of other) {
        if (j <= i + 1 || arc[j] - arc[i + 1] < localArc) continue;
        if (closest(P, i, j).distance < cutoff) pairs.push(i, j);
      }
    }
  }
  return Int32Array.from(pairs);
}

export function relaxRope(points, options = {}) {
  const cfg = {
    diameter: 0.006, columnRadius: 0.0275, columnFrame: null, coupledLengths: false, gap: 0.0002, iterations: 400, sweeps: 4,
    maxStep: 0.0003, refresh: 4, minBendRadius: 0.0042, localArc: null, bendSmoothing: 0.02,
    targets: [], surfaceGuard: null, onIteration: null, restLengths: null, stretchSweeps: 1, ccdTolerance: 0.00002, fixedPoints: null, ...options,
  };
  if(cfg.columnFrame){
    const result=relaxRope(points.map(p=>toLocal(p,cfg.columnFrame)),{...cfg,columnFrame:null,targets:cfg.targets.map(t=>{if(t.axes&&t.axes.length!==3)throw Error('Framed solver targets require all axes');return {...t,positions:t.positions.map(p=>toLocal(p,cfg.columnFrame))};})});
    const world=result.points.map(p=>toWorld(p,cfg.columnFrame));
    for(const i of cfg.fixedPoints??[])world[i]=[...points[i]];
    return {...result,points:world};
  }
  if(points.length<2||points.some(p=>p.length!==3||!p.every(Number.isFinite)))throw Error('Finite XYZ solver points required');
  if(!(cfg.diameter>0)||!(cfg.gap>=0)||!(cfg.maxStep>0)||!Number.isInteger(cfg.refresh)||cfg.refresh<1)throw Error('Invalid solver dimensions');
  const hasColumn=cfg.columnRadius!=null;
  const n = points.length, d = cfg.diameter, contact = d + cfg.gap, colMin = cfg.columnRadius + d / 2 + cfg.gap;
  // Hard floor: steps may never bring a pair or the column closer than half the target gap.
  const floor = d + cfg.gap / 2, columnFloor = hasColumn ? cfg.columnRadius + d / 2 + cfg.gap / 2 : -Infinity;
  const localArc = cfg.localArc ?? 4 * d;
  const X = Float64Array.from(points.flat()), arc = new Float64Array(n), rest = new Float64Array(n - 1);
  if (cfg.restLengths && cfg.restLengths.length !== n - 1) throw new Error('restLengths must match segment count');
  for (let i = 1; i < n; i++) {
    rest[i - 1] = cfg.restLengths ? cfg.restLengths[i - 1] : Math.hypot(X[3 * i] - X[3 * i - 3], X[3 * i + 1] - X[3 * i - 2], X[3 * i + 2] - X[3 * i - 1]);
    if(!(rest[i-1]>0)||!Number.isFinite(rest[i-1]))throw Error('Positive finite reference lengths required');
    arc[i] = arc[i - 1] + rest[i - 1];
  }
  const cutoff = contact + 2 * cfg.maxStep * (cfg.refresh + 1);
  const history = [];
  let pairs = null, rejected = 0, ccdShrinks = 0, surfaceRejects = 0, minPairDistance = Infinity, minAxisDistance = Infinity;
  const fixed=new Set();
  if(cfg.fixedPoints!=null){
    if(!Array.isArray(cfg.fixedPoints))throw Error('fixedPoints must be indices');
    for(const index of cfg.fixedPoints){
      if(!Number.isInteger(index)||index<0||index>=n||fixed.has(index))throw Error('fixedPoints indices required');
      fixed.add(index);
    }
  }
  const inverseMasses=fixed.size?Float64Array.from({length:n},(_,i)=>fixed.has(i)?0:1):null;
  const projectLengths=(P,iterations,tolerance)=>{
    const opt={iterations};
    if(tolerance!=null)opt.tolerance=tolerance;
    if(inverseMasses)opt.inverseMasses=inverseMasses;
    projectChainLengths(P,rest,opt);
  };

  const project = (P) => {
    for (let sweep = 0; sweep < cfg.sweeps; sweep++) {
      for (const target of cfg.targets) {
        const w = target.weight / cfg.sweeps;
        for (let k = 0; k < target.indices.length; k++) {
          const i = target.indices[k], q = target.positions[k];
          if(inverseMasses&&inverseMasses[i]===0)continue;
          for (const axis of target.axes ?? [0, 1, 2]) P[3 * i + axis] += w * (q[axis] - P[3 * i + axis]);
        }
      }
      for (let i = 1; i < n - 1; i++) {
        const a = 3 * (i - 1), b = 3 * i, c = 3 * (i + 1);
        if(!(inverseMasses&&inverseMasses[i]===0))for (let k = 0; k < 3; k++) P[b + k] += cfg.bendSmoothing * ((P[a + k] + P[c + k]) / 2 - P[b + k]);
        const lo = rest[i - 1], hi = rest[i], phi = Math.min(Math.PI / 2, (lo + hi) / 2 / cfg.minBendRadius);
        const chordMin = Math.sqrt(lo * lo + hi * hi + 2 * lo * hi * Math.cos(phi));
        const dx = P[c] - P[a], dy = P[c + 1] - P[a + 1], dz = P[c + 2] - P[a + 2], chord = Math.hypot(dx, dy, dz);
        if (chord < chordMin && chord > 1e-12) {
          if(!inverseMasses){
            const f = (chordMin - chord) / chord / 2;
            P[a] -= f * dx; P[a + 1] -= f * dy; P[a + 2] -= f * dz;
            P[c] += f * dx; P[c + 1] += f * dy; P[c + 2] += f * dz;
          }else{
            const wa=inverseMasses[i-1],wc=inverseMasses[i+1],sum=wa+wc;
            if(sum>0){
              const corr=(chordMin-chord)/chord,fa=corr*wa/sum,fc=corr*wc/sum;
              P[a]-=fa*dx;P[a+1]-=fa*dy;P[a+2]-=fa*dz;
              P[c]+=fc*dx;P[c+1]+=fc*dy;P[c+2]+=fc*dz;
            }
          }
        }
      }
      for (let k = 0; k < pairs.length; k += 2) {
        const i = pairs[k], j = pairs[k + 1], h = closest(P, i, j);
        if (h.distance >= contact || h.distance < 1e-12) continue;
        if(!inverseMasses){
          const push = (contact - h.distance) / h.distance / 2;
          const wa = [1 - h.s, h.s], wb = [1 - h.t, h.t], norm = (wa[0] ** 2 + wa[1] ** 2 + wb[0] ** 2 + wb[1] ** 2) / 2;
          for (let m = 0; m < 2; m++) {
            const pa = 3 * (i + m), pb = 3 * (j + m), fa = push * wa[m] / norm, fb = push * wb[m] / norm;
            P[pa] += fa * h.dx; P[pa + 1] += fa * h.dy; P[pa + 2] += fa * h.dz;
            P[pb] -= fb * h.dx; P[pb + 1] -= fb * h.dy; P[pb + 2] -= fb * h.dz;
          }
        }else{
          const nx=h.dx/h.distance,ny=h.dy/h.distance,nz=h.dz/h.distance,s=h.s,t=h.t;
          const wp=(1-s)*(1-s)*inverseMasses[i]+s*s*inverseMasses[i+1],wq=(1-t)*(1-t)*inverseMasses[j]+t*t*inverseMasses[j+1],sum=wp+wq;
          if(sum<1e-16)continue;
          const lambda=(contact-h.distance)/sum;
          const add=(idx,bary,sign)=>{const f=sign*bary*inverseMasses[idx]*lambda;P[3*idx]+=f*nx;P[3*idx+1]+=f*ny;P[3*idx+2]+=f*nz;};
          add(i,1-s,1);add(i+1,s,1);add(j,1-t,-1);add(j+1,t,-1);
        }
      }
      for (let i = 0; i < n; i++) {
        const r = Math.hypot(P[3 * i + 1], P[3 * i + 2]);
        if (hasColumn && r < colMin && r > 1e-12 && !(inverseMasses&&inverseMasses[i]===0)) { P[3 * i + 1] *= colMin / r; P[3 * i + 2] *= colMin / r; }
      }
      if(cfg.coupledLengths) {projectLengths(P,cfg.stretchSweeps);continue;}
      for (let repeat = 0; repeat < cfg.stretchSweeps; repeat++) for (let i = 0; i < n - 1; i++) {
        const a = 3 * i, b = a + 3, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const len = Math.hypot(dx, dy, dz); if(len<1e-14)throw Error('Collapsed solver segment');
        if(!inverseMasses){
          const f = (len - rest[i]) / len / 2;
          P[a] += f * dx; P[a + 1] += f * dy; P[a + 2] += f * dz;
          P[b] -= f * dx; P[b + 1] -= f * dy; P[b + 2] -= f * dz;
        }else{
          const wa=inverseMasses[i],wb=inverseMasses[i+1],sum=wa+wb;if(!(sum>0))continue;
          const corr=(len-rest[i])/len,fa=corr*wa/sum,fb=corr*wb/sum;
          P[a]+=fa*dx;P[a+1]+=fa*dy;P[a+2]+=fa*dz;
          P[b]-=fb*dx;P[b+1]-=fb*dy;P[b+2]-=fb*dz;
        }
      }
    }
  };

  for (let iteration = 0; iteration < cfg.iterations; iteration++) {
    if (iteration % cfg.refresh === 0) {
      // Local exclusion must use the current centreline arc: stretched segments are not neighbours.
      const current = new Float64Array(n);
      for (let i = 1; i < n; i++) current[i] = current[i - 1] + Math.hypot(X[3 * i] - X[3 * i - 3], X[3 * i + 1] - X[3 * i - 2], X[3 * i + 2] - X[3 * i - 1]);
      pairs = candidatePairs(X, current, { cutoff, localArc });
    }
    const P = Float64Array.from(X);
    project(P);
    if(cfg.coupledLengths){
      const maxDisp=Math.max(...Array.from({length:n},(_,i)=>Math.hypot(...[0,1,2].map(k=>P[3*i+k]-X[3*i+k]))));
      let alpha=Math.min(1,cfg.maxStep/(maxDisp||1)),accepted=false;
      for(let attempt=0;attempt<24&&!accepted;attempt++){
        const Y=Float64Array.from(X,(v,k)=>v+alpha*(P[k]-v));
        projectLengths(Y,24,1e-11);
        let safe=true;
        for(let i=0;i<n&&safe;i++)if(Math.hypot(...[0,1,2].map(k=>Y[3*i+k]-X[3*i+k]))>cfg.maxStep*(1+1e-8))safe=false;
        for(let i=1;i<n-1&&safe;i++)if(bendRadius(Y,i)<Math.min(d/2,bendRadius(X,i))-1e-9)safe=false;
        if(safe)safe=certifyPairMotion(X,Y,pairs,{floor,columnFloor,tolerance:cfg.ccdTolerance});
        let maxError=0;for(let i=0;i<n-1;i++)maxError=Math.max(maxError,Math.abs(Math.hypot(...[0,1,2].map(k=>Y[3*i+3+k]-Y[3*i+k]))-rest[i]));
        if(maxError>1e-10)safe=false;
        if(safe&&cfg.surfaceGuard&&!cfg.surfaceGuard(Array.from({length:n},(_,i)=>[Y[3*i],Y[3*i+1],Y[3*i+2]]))){safe=false;surfaceRejects++;}
        if(safe){X.set(Y);accepted=true;}else {alpha*=.5;ccdShrinks++;}
      }
      if(!accepted)rejected++;
      if(cfg.onIteration&&(iteration%25===0||iteration===cfg.iterations-1)){const record={iteration,rejected,ccdShrinks};history.push(record);cfg.onIteration(record,X);}
      continue;
    }
    // Conservative step bound per vertex from current non-local clearances.
    const bound = new Float64Array(n).fill(cfg.maxStep);
    const limit = (v, value) => { if (v >= 0 && v < n) bound[v] = Math.min(bound[v], value); };
    minPairDistance = Infinity; minAxisDistance = Infinity;
    for (let k = 0; k < pairs.length; k += 2) {
      const i = pairs[k], j = pairs[k + 1], D = closest(X, i, j).distance, allow = Math.max(0, (D - floor) / 2);
      minPairDistance = Math.min(minPairDistance, D);
      limit(i, allow); limit(i + 1, allow); limit(j, allow); limit(j + 1, allow);
    }
    for (let i = 0; i < n - 1; i++) {
      const allow = Math.max(0, axisDistance(X, i) - columnFloor);
      minAxisDistance = Math.min(minAxisDistance, axisDistance(X, i));
      limit(i, allow); limit(i + 1, allow);
    }
    // Continuous check of the proposed linear motion. Pair distance is Lipschitz in time with constant
    // (da + db), so samples spaced 1/m apart that keep distance >= floor + (da + db) / (2m) certify the step.
    const factor = new Float64Array(n), conservative = new Uint8Array(n), disp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      disp[i] = Math.hypot(P[3 * i] - X[3 * i], P[3 * i + 1] - X[3 * i + 1], P[3 * i + 2] - X[3 * i + 2]);
      factor[i] = disp[i] > 0 ? Math.min(1, cfg.maxStep / disp[i]) : 0;
    }
    const step = (i) => conservative[i] ? Math.min(factor[i], disp[i] > 0 ? 0.999 * bound[i] / disp[i] : 0) : factor[i];
    const Z = new Float64Array(12);
    const failingPair = (i, j) => {
      const da = Math.max(step(i) * disp[i], step(i + 1) * disp[i + 1]), db = Math.max(step(j) * disp[j], step(j + 1) * disp[j + 1]);
      const D0 = closest(X, i, j).distance;
      if (D0 - da - db >= floor) return false;
      const m = Math.min(64, Math.max(1, Math.ceil((da + db) / (2 * cfg.ccdTolerance))));
      for (let k = 0; k <= m; k++) {
        const t = k / m;
        for (const [slot, v] of [[0, i], [1, i + 1], [2, j], [3, j + 1]]) for (let a = 0; a < 3; a++) Z[3 * slot + a] = X[3 * v + a] + t * step(v) * (P[3 * v + a] - X[3 * v + a]);
        if (closest(Z, 0, 2).distance - (da + db) / (2 * m) < floor) return true;
      }
      return false;
    };
    const failingColumn = (i) => {
      if(!hasColumn)return false;
      const da = Math.max(step(i) * disp[i], step(i + 1) * disp[i + 1]), r0 = axisDistance(X, i);
      if (r0 - da >= columnFloor) return false;
      const m = Math.min(64, Math.max(1, Math.ceil(da / (2 * cfg.ccdTolerance))));
      for (let k = 0; k <= m; k++) {
        const t = k / m;
        for (const [slot, v] of [[0, i], [1, i + 1]]) for (let a = 0; a < 3; a++) Z[3 * slot + a] = X[3 * v + a] + t * step(v) * (P[3 * v + a] - X[3 * v + a]);
        if (axisDistance(Z, 0) - da / (2 * m) < columnFloor) return true;
      }
      return false;
    };
    let certified = false;
    for (let round = 0; round < 64 && !certified; round++) {
      const failing = new Set();
      for (let k = 0; k < pairs.length; k += 2) if (failingPair(pairs[k], pairs[k + 1])) for (const v of [pairs[k], pairs[k] + 1, pairs[k + 1], pairs[k + 1] + 1]) failing.add(v);
      for (let i = 0; i < n - 1; i++) if (failingColumn(i)) { failing.add(i); failing.add(i + 1); }
      if (!failing.size) { certified = true; break; }
      // Halve first; after three rounds fall back to the conservative per-vertex bound, which is always safe.
      for (const v of failing) { if (round < 3) factor[v] /= 2; else conservative[v] = 1; }
      ccdShrinks += failing.size;
    }
    if (!certified) conservative.fill(1);
    // A step that would fold the tube (bend radius under one rope radius) is not accepted.
    // Radius is not linear, so this is an endpoint check; the factor of a folding vertex is halved and the pairs are re-certified.
    const ropeRadius = cfg.diameter / 2;
    const bendRadiusAt = (P, i) => {
      const ax = P[3 * i] - P[3 * i - 3], ay = P[3 * i + 1] - P[3 * i - 2], az = P[3 * i + 2] - P[3 * i - 1];
      const bx = P[3 * i + 3] - P[3 * i], by = P[3 * i + 4] - P[3 * i + 1], bz = P[3 * i + 5] - P[3 * i + 2];
      const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), c = la && lb ? (ax * bx + ay * by + az * bz) / (la * lb) : 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, c)));
      return ang < 1e-8 ? Infinity : (la + lb) / 2 / ang;
    };
    const proposed = () => {
      const Y = new Float64Array(X.length);
      for (let i = 0; i < n; i++) { const f = step(i); Y[3 * i] = X[3 * i] + f * (P[3 * i] - X[3 * i]); Y[3 * i + 1] = X[3 * i + 1] + f * (P[3 * i + 1] - X[3 * i + 1]); Y[3 * i + 2] = X[3 * i + 2] + f * (P[3 * i + 2] - X[3 * i + 2]); }
      return Y;
    };
    for (let round = 0; round < 8; round++) {
      const Y = proposed();
      const tight = [];
      for (let i = 1; i < n - 1; i++) if (bendRadiusAt(Y, i) < ropeRadius && bendRadiusAt(Y, i) < bendRadiusAt(X, i) - 1e-9) tight.push(i);
      if (!tight.length) break;
      for (const i of tight) factor[i] *= 0.5;
      ccdShrinks += tight.length;
    }
    let accepted = false;
    for(let attempt=0;attempt<24&&!accepted;attempt++) {
      const Y=proposed();
      let safe=true;
      for(let i=1;i<n-1&&safe;i++)if(bendRadiusAt(Y,i)<Math.min(ropeRadius,bendRadiusAt(X,i))-1e-9)safe=false;
      for(let k=0;k<pairs.length&&safe;k+=2)if(failingPair(pairs[k],pairs[k+1]))safe=false;
      for(let i=0;i<n-1&&safe;i++)if(failingColumn(i))safe=false;
      if(safe&&cfg.surfaceGuard&&!cfg.surfaceGuard(Array.from({length:n},(_,i)=>[Y[3*i],Y[3*i+1],Y[3*i+2]]))){safe=false;surfaceRejects++;}
      if(safe){X.set(Y);accepted=true;}
      else {for(let i=0;i<n;i++)factor[i]*=.5;ccdShrinks++;}
    }
    if(!accepted)rejected++;
    if (cfg.onIteration && (iteration % 25 === 0 || iteration === cfg.iterations - 1)) {
      const record = { iteration, minPairGap: minPairDistance - d, minColumnGap: minAxisDistance - cfg.columnRadius - d / 2, rejected, ccdShrinks };
      history.push(record);
      cfg.onIteration(record, X);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push([X[3 * i], X[3 * i + 1], X[3 * i + 2]]);
  let maxStretch = 0;
  for (let i = 0; i < n - 1; i++) maxStretch = Math.max(maxStretch, Math.abs(Math.hypot(...out[i + 1].map((v, k) => v - out[i][k])) - rest[i]));
  let length = 0;
  for (let i = 0; i < n - 1; i++) length += Math.hypot(...out[i + 1].map((v, k) => v - out[i][k]));
  return { points: out, rejected, ccdShrinks, surfaceRejects, history, maxStretch, materialLength: arc[n - 1], polylineLength: length, motionScope:'Nonlocal centreline and column CCD; local bend checked at endpoint. Full swept surface not certified.', config: { ...cfg, targets: cfg.targets.length, onIteration: undefined, surfaceGuard:cfg.surfaceGuard?'provided':null, restLengths: cfg.restLengths ? 'fixed' : 'initial' } };
}
