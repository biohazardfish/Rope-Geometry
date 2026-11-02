// Position-based relaxation of one material polyline around an X-axis column.
// Step safety: a vertex may move at most half of the current clearance of every
// non-local segment pair it belongs to. Segment distance is 1-Lipschitz in each
// endpoint, so no pair can pass through contact during the linear step.

function closest(P, i, j) {
  const a = 3 * i, b = 3 * (i + 1), c = 3 * j, e = 3 * (j + 1);
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
  const vx = P[e] - P[c], vy = P[e + 1] - P[c + 1], vz = P[e + 2] - P[c + 2];
  const wx = P[a] - P[c], wy = P[a + 1] - P[c + 1], wz = P[a + 2] - P[c + 2];
  const A = ux * ux + uy * uy + uz * uz, B = ux * vx + uy * vy + uz * vz, C = vx * vx + vy * vy + vz * vz;
  const D = ux * wx + uy * wy + uz * wz, E = vx * wx + vy * wy + vz * wz, den = A * C - B * B;
  let s = den > 1e-30 ? (B * E - C * D) / den : 0;
  s = Math.max(0, Math.min(1, s));
  let t = C > 0 ? (B * s + E) / C : 0;
  if (t < 0) { t = 0; s = A > 0 ? Math.max(0, Math.min(1, -D / A)) : 0; }
  else if (t > 1) { t = 1; s = A > 0 ? Math.max(0, Math.min(1, (B - D) / A)) : 0; }
  const dx = wx + s * ux - t * vx, dy = wy + s * uy - t * vy, dz = wz + s * uz - t * vz;
  return { s, t, dx, dy, dz, distance: Math.hypot(dx, dy, dz) };
}

function axisDistance(P, i) {
  // Distance from segment i to the X axis, measured in the YZ plane.
  const a = 3 * i, b = a + 3, y = P[a + 1], z = P[a + 2], vy = P[b + 1] - y, vz = P[b + 2] - z, q = vy * vy + vz * vz;
  const t = q ? Math.max(0, Math.min(1, -(y * vy + z * vz) / q)) : 0;
  return Math.hypot(y + t * vy, z + t * vz);
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
    diameter: 0.006, columnRadius: 0.0275, gap: 0.0002, iterations: 400, sweeps: 4,
    maxStep: 0.0003, refresh: 4, minBendRadius: 0.0042, localArc: null, bendSmoothing: 0.02,
    targets: [], onIteration: null, restLengths: null, stretchSweeps: 1, ccdTolerance: 0.00002, ...options,
  };
  const n = points.length, d = cfg.diameter, contact = d + cfg.gap, colMin = cfg.columnRadius + d / 2 + cfg.gap;
  // Hard floor: steps may never bring a pair or the column closer than half the target gap.
  const floor = d + cfg.gap / 2, columnFloor = cfg.columnRadius + d / 2 + cfg.gap / 2;
  const localArc = cfg.localArc ?? 4 * d;
  const X = Float64Array.from(points.flat()), arc = new Float64Array(n), rest = new Float64Array(n - 1);
  if (cfg.restLengths && cfg.restLengths.length !== n - 1) throw new Error('restLengths must match segment count');
  for (let i = 1; i < n; i++) {
    rest[i - 1] = cfg.restLengths ? cfg.restLengths[i - 1] : Math.hypot(X[3 * i] - X[3 * i - 3], X[3 * i + 1] - X[3 * i - 2], X[3 * i + 2] - X[3 * i - 1]);
    arc[i] = arc[i - 1] + rest[i - 1];
  }
  const cutoff = contact + 2 * cfg.maxStep * (cfg.refresh + 1);
  const history = [];
  let pairs = null, rejected = 0, ccdShrinks = 0, minPairDistance = Infinity, minAxisDistance = Infinity;

  const project = (P) => {
    for (let sweep = 0; sweep < cfg.sweeps; sweep++) {
      for (const target of cfg.targets) {
        const w = target.weight / cfg.sweeps;
        for (let k = 0; k < target.indices.length; k++) {
          const i = target.indices[k], q = target.positions[k];
          for (const axis of target.axes ?? [0, 1, 2]) P[3 * i + axis] += w * (q[axis] - P[3 * i + axis]);
        }
      }
      for (let i = 1; i < n - 1; i++) {
        const a = 3 * (i - 1), b = 3 * i, c = 3 * (i + 1);
        for (let k = 0; k < 3; k++) P[b + k] += cfg.bendSmoothing * ((P[a + k] + P[c + k]) / 2 - P[b + k]);
        const lo = rest[i - 1], hi = rest[i], phi = Math.min(Math.PI / 2, (lo + hi) / 2 / cfg.minBendRadius);
        const chordMin = Math.sqrt(lo * lo + hi * hi + 2 * lo * hi * Math.cos(phi));
        const dx = P[c] - P[a], dy = P[c + 1] - P[a + 1], dz = P[c + 2] - P[a + 2], chord = Math.hypot(dx, dy, dz);
        if (chord < chordMin && chord > 1e-12) {
          const f = (chordMin - chord) / chord / 2;
          P[a] -= f * dx; P[a + 1] -= f * dy; P[a + 2] -= f * dz;
          P[c] += f * dx; P[c + 1] += f * dy; P[c + 2] += f * dz;
        }
      }
      for (let k = 0; k < pairs.length; k += 2) {
        const i = pairs[k], j = pairs[k + 1], h = closest(P, i, j);
        if (h.distance >= contact || h.distance < 1e-12) continue;
        const push = (contact - h.distance) / h.distance / 2;
        const wa = [1 - h.s, h.s], wb = [1 - h.t, h.t], norm = (wa[0] ** 2 + wa[1] ** 2 + wb[0] ** 2 + wb[1] ** 2) / 2;
        for (let m = 0; m < 2; m++) {
          const pa = 3 * (i + m), pb = 3 * (j + m), fa = push * wa[m] / norm, fb = push * wb[m] / norm;
          P[pa] += fa * h.dx; P[pa + 1] += fa * h.dy; P[pa + 2] += fa * h.dz;
          P[pb] -= fb * h.dx; P[pb + 1] -= fb * h.dy; P[pb + 2] -= fb * h.dz;
        }
      }
      for (let i = 0; i < n; i++) {
        const r = Math.hypot(P[3 * i + 1], P[3 * i + 2]);
        if (r < colMin && r > 1e-12) { P[3 * i + 1] *= colMin / r; P[3 * i + 2] *= colMin / r; }
      }
      for (let repeat = 0; repeat < cfg.stretchSweeps; repeat++) for (let i = 0; i < n - 1; i++) {
        const a = 3 * i, b = a + 3, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const len = Math.hypot(dx, dy, dz), f = (len - rest[i]) / len / 2;
        P[a] += f * dx; P[a + 1] += f * dy; P[a + 2] += f * dz;
        P[b] -= f * dx; P[b + 1] -= f * dy; P[b + 2] -= f * dz;
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
    let scale = 1, accepted = false;
    for (let attempt = 0; attempt < 6 && !accepted; attempt++, scale /= 2) {
      const Y = Float64Array.from(X);
      for (let i = 0; i < n; i++) {
        const f = scale * step(i);
        Y[3 * i] += f * (P[3 * i] - X[3 * i]); Y[3 * i + 1] += f * (P[3 * i + 1] - X[3 * i + 1]); Y[3 * i + 2] += f * (P[3 * i + 2] - X[3 * i + 2]);
      }
      // Rollback guard: the bound should make this unreachable; it protects against bugs.
      let safe = true;
      for (let k = 0; k < pairs.length && safe; k += 2) if (closest(Y, pairs[k], pairs[k + 1]).distance < Math.min(floor, closest(X, pairs[k], pairs[k + 1]).distance) - 1e-12) safe = false;
      for (let i = 0; i < n - 1 && safe; i++) if (axisDistance(Y, i) < Math.min(columnFloor, axisDistance(X, i)) - 1e-12) safe = false;
      if (safe) { X.set(Y); accepted = true; } else rejected++;
    }
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
  return { points: out, rejected, ccdShrinks, history, maxStretch, materialLength: arc[n - 1], polylineLength: length, config: { ...cfg, targets: cfg.targets.length, onIteration: undefined, restLengths: cfg.restLengths ? 'fixed' : 'initial' } };
}
