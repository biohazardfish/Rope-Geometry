export const EPSILON = 1e-9;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addScaled = (a, d, t) => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm2 = a => dot(a, a);

// Convex quadratic minimization over [0,1]^2. Enumerating the unconstrained
// stationary point plus each boundary avoids the unstable parallel denominator.
export function closestSegments(p0, p1, q0, q1) {
  const u = sub(p1, p0), v = sub(q1, q0), w = sub(p0, q0);
  const a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w);
  const candidates = [];
  const add = (s, t) => {
    s = clamp(s, 0, 1); t = clamp(t, 0, 1);
    const x = addScaled(p0, u, s), y = addScaled(q0, v, t);
    const delta = sub(x, y);
    candidates.push({ s, t, pointA: x, pointB: y, distance: Math.sqrt(norm2(delta)) });
  };
  if (a > 0 && c > 0) {
    const den = a * c - b * b;
    if (den > Number.EPSILON * a * c * 8) add((b * e - c * d) / den, (a * e - b * d) / den);
  }
  if (c > 0) { add(0, e / c); add(1, (e + b) / c); }
  if (a > 0) { add(-d / a, 0); add((b - d) / a, 1); }
  if (!candidates.length) add(0, 0);
  return candidates.reduce((best, item) => item.distance < best.distance ? item : best);
}

function segments(ropes) {
  const result = [];
  for (const rope of ropes) for (let i = 0; i + 1 < rope.points.length; i++) result.push({
    id: `${rope.id}:${i}`, ropeId: rope.id, index: i, a: rope.points[i], b: rope.points[i + 1], radius: rope.diameter / 2
  });
  return result;
}

export function detectCollisions(ropes) {
  const list = segments(ropes), collisions = [], excluded = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.ropeId === b.ropeId && Math.abs(a.index - b.index) === 1) {
      excluded.push({ segmentA: a.id, segmentB: b.id, reason: 'share-topological-vertex' });
      continue;
    }
    const closest = closestSegments(a.a, a.b, b.a, b.b);
    const gap = closest.distance - a.radius - b.radius;
    const state = gap > EPSILON ? 'separated' : gap < -EPSILON ? 'penetrating' : 'contact';
    if (state !== 'separated') collisions.push({ segmentA: a.id, segmentB: b.id, ...closest, gap, penetration: Math.max(0, -gap), state });
  }
  return { collisions, excluded, epsilon: EPSILON };
}
