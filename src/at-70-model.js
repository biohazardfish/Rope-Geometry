// 1:10 checkpoint. The schematic route and the collision-cleared embedding are separate.
// Clearance is whatever verifyGeometry reports for that polyline. Nothing here is a source measurement.
import { verifyGeometry } from './verification.js';
const R = 0.092;
const H = 0.0075;
const N = 240;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => { const q = Math.max(0, Math.min(1, t)); return q * q * (3 - 2 * q); };
const point = (xyz, role, limb) => ({ xyz, role, limb });

function arm(limb, variant) {
  const side = limb === 0 ? -1 : 1;
  const start = point([side * H - 0.03, -0.125, -0.19], 'end', limb);
  const x0 = side * H - 0.03;
  const pts = [
    start,
    point([x0, -R - 0.026, -0.085], 'front', limb),
    point([x0, 0, -R - 0.052], 'lower', limb),
    point([x0, R + 0.017, -0.085], 'rear', limb),
    point([x0, R + 0.017, 0], 'rear', limb),
  ];
  const center = variant === 'B' ? 0.5 : variant === 'C' ? 0.965 : null;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const theta = -Math.PI + 4 * Math.PI * u;
    const progress = center == null ? 0 : ease((u - center + 0.035) / 0.07);
    const lateral = side * H * (1 - 2 * progress);
    const lift = center == null || limb !== 0 ? 0 : 0.018 * Math.sin(Math.PI * progress);
    const radius = R + 0.013 + lift;
    const xyz = [-0.03 + 0.06 * u + lateral, -radius * Math.cos(theta), radius * Math.sin(theta)];
    pts.push(point(xyz, Math.cos(theta) > 0 ? 'front' : 'rear', limb));
  }
  const finalSide = center == null ? side : -side;
  const diagonalOffset = (finalSide + 1) * 0.0065;
  pts.push(point([0.04 + finalSide * H, 0.075, 0.075], 'rear', limb));
  pts.push(point([0.04 + finalSide * H, 0, R + 0.018], 'upper', limb));
  pts.push(point([0.04 + finalSide * H, -0.085, 0.075], 'upper', limb));
  pts.push(point([-0.048 + finalSide * H, -R - 0.024, -0.052 + diagonalOffset], 'front', limb));
  pts.push(point([0.072 + finalSide * H, -R - 0.027, -0.127 + diagonalOffset], 'diagonal', limb));
  return pts;
}

export function makeAt70(variant = 'A') {
  if (!['A', 'B', 'C'].includes(variant)) throw new Error('Unknown hypothesis');
  const a = arm(0, variant), b = arm(1, variant);
  const tipA = a.at(-1).xyz, tipB = b.at(-1).xyz;
  const fold = [];
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    fold.push(point([0.082 + 0.012 * Math.sin(Math.PI * t), mix(tipA[1], tipB[1], t), mix(tipA[2], tipB[2], t)], 'fold', 0));
  }
  const ordered = [...a, ...fold, ...b.reverse()];
  return {
    variant,
    ordered,
    cuff: { axis: 'x', radius: R, length: 0.42 },
    claims: { continuousOrderedCenterline: true, collisionVerified: false, topologyVerified: false },
    rearExchange: variant === 'A' ? 'none shown' : variant === 'B' ? 'first rear passage' : 'second rear passage',
    geometryClass: 'schematic-route',
    diameter: DIAMETER,
    column: COLUMN,
  };
}

export const DIAMETER = 0.0098;
export const COLUMN = { axis: 'X', center: [0, 0, 0], radius: R, length: 0.42 };
export const DISCLAIMER = 'These are representative hypotheses, not exhaustive and not verified.';
export const QUESTION = 'Before 1:10, behind the wrist only: do the two limbs stay side by side on both rear passes, cross on the first rear pass, or cross on the second rear pass?';
export const HYPOTHESES = [
  { id: 'A', title: 'REAR HYPOTHESIS A', subtitle: 'parallel limbs', routing: 'E0 stays on one side of its partner across both rear passes, leaves through the near strand of the doubled bight, passes the fold, and returns as E1. The limbs do not swap.' },
  { id: 'B', title: 'REAR HYPOTHESIS B', subtitle: 'an exchange during the first rear wrap', routing: 'On the first pass behind the wrist the limbs swap sides, then keep that order through the second wrap and the bight. Which limb passes outside the other is not in the pre-70 evidence.' },
  { id: 'C', title: 'REAR HYPOTHESIS C', subtitle: 'an exchange during the second rear wrap', routing: 'The first wrap stays side by side, so those front lanes match A. The limbs swap on the second pass behind the wrist, and the bight receives them in the swapped order.' },
];

const dist = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
function densify(waypoints, step = 0.02) {
  const pts = [waypoints[0].slice()];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1], d = dist(a, b);
    if (!d) continue;
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      const p = a.map((v, j) => v + (b[j] - v) * k / n);
      if (dist(pts.at(-1), p) > 1e-8) pts.push(p);
    }
  }
  return pts;
}
function arcTo(exit, target) {
  let s = Math.atan2(exit[2], -exit[1]);
  let e = Math.atan2(target[2], -target[1]);
  if (e > s) e -= 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((s - e) / 0.22));
  const r0 = Math.hypot(exit[1], exit[2]);
  const wps = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = s + (e - s) * u;
    const radius = i === 0 ? r0 : i === steps ? Math.hypot(target[1], target[2]) : 0.15;
    wps.push(i === steps ? target.slice() : [exit[0] + (target[0] - exit[0]) * u, -radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return densify(wps, 0.02);
}
function denseHelix(points) {
  const runs = [];
  let run = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist(points[i - 1].xyz, points[i].xyz) < 0.008) run.push(points[i]);
    else {
      if (run.length > 20) runs.push(run);
      run = [points[i]];
    }
  }
  if (run.length > 20) runs.push(run);
  if (runs.length !== 1) throw new Error('Expected one dense cuff helix');
  const out = [];
  for (let i = 0; i < runs[0].length; i += 4) out.push(runs[0][i]);
  const last = runs[0].at(-1);
  if (dist(out.at(-1).xyz, last.xyz) > 1e-8) {
    if (dist(out.at(-1).xyz, last.xyz) < 0.012) out[out.length - 1] = last;
    else out.push(last);
  }
  return out;
}
function uTurn(tip0, tip1) {
  const sep = tip1.map((v, i) => v - tip0[i]);
  const sepLen = Math.hypot(...sep);
  const side = sep.map(v => v / sepLen);
  const forward = [0.01, -0.02, -0.045];
  const flare = 0.018;
  const a = tip0.map((v, i) => v + forward[i] - side[i] * flare);
  const b = tip1.map((v, i) => v + forward[i] + side[i] * flare);
  const mid = a.map((v, i) => (v + b[i]) / 2);
  const axis = b.map((v, i) => v - a[i]);
  let bulge = [0, -0.35, -1];
  const dot = bulge.reduce((s, v, i) => s + v * axis[i], 0);
  const al = axis.reduce((s, v) => s + v * v, 0);
  bulge = bulge.map((v, i) => v - axis[i] * dot / al);
  const bn = Math.hypot(...bulge);
  bulge = bulge.map(v => v / bn);
  const radius = Math.hypot(...a.map((v, i) => v - mid[i]));
  const arc = [];
  const n = Math.max(3, Math.round(Math.PI * radius / 0.022));
  for (let i = 1; i < n; i++) {
    const t = Math.PI * i / n;
    arc.push(mid.map((v, k) => v + Math.cos(t) * (a[k] - mid[k]) + Math.sin(t) * bulge[k] * radius));
  }
  return { a, b, arc };
}

// Same cuff samples and the same diagonal rails as the schematic, with the long
// chords replaced by an outside arc and a larger fold. The extra forward shift
// is an embedding choice so the bight capsules clear the cuff.
export function makeAt70Cleared(variant = 'A') {
  const schematic = makeAt70(variant);
  const shift = 0.02;
  const limb0 = schematic.ordered.filter(p => p.limb === 0);
  const limb1 = schematic.ordered.filter(p => p.limb === 1);
  const h0 = denseHelix(limb0);
  const h1Forward = denseHelix([...limb1].reverse());
  const move = p => [p[0], p[1] - shift, p[2]];
  const front1 = move(limb1.find(p => p.role === 'front').xyz);
  const tip1 = move(limb1.find(p => p.role === 'diagonal').xyz);
  const front0 = move(limb0.filter(p => p.role === 'front').at(-1).xyz);
  const tip0 = move(limb0.find(p => p.role === 'diagonal').xyz);
  const pair0 = { front: front0, tip: tip0 };
  const pair1 = { front: front1, tip: tip1 };
  const [low, high] = [pair0, pair1].sort((a, b) => a.tip[0] - b.tip[0] || a.tip[2] - b.tip[2]);
  const turn = uTurn(low.tip, high.tip);
  const lowRail = densify([low.front, low.tip, turn.a]);
  const highRail = densify([turn.b, high.tip, high.front]);
  const railGoingOut = pair => pair === low ? lowRail : [...highRail].reverse();
  const railComingBack = pair => pair === low ? [...lowRail].reverse() : highRail;
  const rearTail = helixPoint => {
    const p = helixPoint;
    return densify([[p[0], 0.16, -0.22], [p[0], 0.16, -0.08], [p[0], p[1] + 0.04, p[2]], p]);
  };
  const ordered = [];
  const push = (xyz, role, limb) => {
    if (ordered.length && dist(ordered.at(-1).xyz, xyz) < 1e-8) return;
    ordered.push(point(xyz.slice(), role, limb));
  };
  const pushAll = (pts, role, limb) => { for (const p of pts) push(p, role, limb); };
  pushAll(rearTail(h0[0].xyz).slice(0, -1), 'end', 0);
  for (const sample of h0) push(sample.xyz, sample.role, 0);
  pushAll(arcTo(h0.at(-1).xyz, front0).slice(0, -1), 'rear', 0);
  pushAll(railGoingOut(pair0), 'diagonal', 0);
  const foldPts = pair0 === low ? turn.arc : [...turn.arc].reverse();
  for (const p of foldPts) push(p, 'fold', 0);
  pushAll(railComingBack(pair1), 'diagonal', 1);
  pushAll(arcTo(h1Forward.at(-1).xyz, front1).slice(0, -1).reverse(), 'rear', 1);
  for (const sample of [...h1Forward].reverse()) push(sample.xyz, sample.role, 1);
  pushAll(rearTail(h1Forward[0].xyz).slice(0, -1).reverse(), 'end', 1);
  return {
    variant,
    ordered,
    cuff: schematic.cuff,
    claims: { continuousOrderedCenterline: true, collisionVerified: false, topologyVerified: false },
    rearExchange: schematic.rearExchange,
    geometryClass: 'collision-cleared-embedding',
    diameter: DIAMETER,
    column: COLUMN,
    embeddingNotes: 'Coarsened samples of the schematic helix, an outside arc in place of the penetrating chords, the diagonal moved 20 mm further toward the camera, and a wider fold. The radial exchange lift, where present, is copied from the schematic and is not an observed over/under.',
  };
}

export function toDocument(model) {
  return {
    schemaVersion: 1,
    units: 'm',
    coordinateSystem: 'right-handed Z-up',
    ropes: [{ id: `at-70-${model.variant}-${model.geometryClass}`, diameter: model.diameter, points: model.ordered.map(p => p.xyz) }],
  };
}

export function evaluateAt70(model) {
  const report = verifyGeometry(toDocument(model), { column: model.column, clearance: 0 });
  const ropeMm = report.minimumRopeGap * 1000;
  const columnMm = report.minimumColumnGap * 1000;
  const cleared = model.geometryClass === 'collision-cleared-embedding' && report.valid;
  const claim = cleared
    ? `Collision-cleared embedding. Computed rope surface gap ${ropeMm.toFixed(3)} mm. Computed gap to the infinite X cylinder ${columnMm.toFixed(3)} mm. Piecewise-linear capsules at this segmentation, not a smooth tube and not a measurement from the video.`
    : `Schematic route. Computed rope gap ${ropeMm.toFixed(3)} mm with ${report.selfPenetrations} penetrating pair(s) and ${report.columnPenetrations} column penetration(s). No clearance is claimed.`;
  return {
    geometryClass: model.geometryClass,
    clearanceClaimed: cleared,
    topologyVerified: false,
    valid: report.valid,
    minimumRopeGapM: report.minimumRopeGap,
    minimumColumnGapM: report.minimumColumnGap,
    selfPenetrations: report.selfPenetrations,
    columnPenetrations: report.columnPenetrations,
    segments: report.segments,
    cornerCount: report.smoothness.cornerCount,
    smoothTubeVerified: report.smoothness.smoothTubeVerified,
    claim,
  };
}
