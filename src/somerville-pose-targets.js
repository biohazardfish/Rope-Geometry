// Material-arc correspondence between model sections and the 148 s annotation.
// Spans are fixed in material arc so they survive resampling and relaxation.

export const POSE_CORRESPONDENCE = Object.freeze({
  version: 1,
  basis: 'modelling assumption: annotation lanes are matched by visible left-to-right order and material order; physical rope ends are not identified',
  cuffLanes: { roles: ['cuff/0', 'cuff/1'], aboveFront: 0.031, belowFront: 0.0135, order: 'ascending x at front crossing' },
  tails: { roles: ['tail/0', 'tail/1'], hiddenFromLoop: 0.010, order: 'ascending x of visible span' },
  bight: { legs: ['bight-leg/0', 'bight-leg/1'], hiddenFromCore: 0.010 },
});

function sectionPoints(doc, role) {
  const s = doc.somerville.sections.filter((x) => x.role === role);
  if (s.length !== 1) throw new Error(`expected one section ${role}, found ${s.length}`);
  const { start, end } = s[0];
  return Array.from({ length: end - start + 1 }, (_, k) => start + k);
}

function arcSpan(doc, from, to) {
  // Point indices whose material arc lies in [min(from,to), max(from,to)], ordered from `from` to `to`.
  const arc = doc.somerville.materialArc, lo = Math.min(from, to), hi = Math.max(from, to), ids = [];
  for (let i = 0; i < arc.length; i++) if (arc[i] >= lo - 1e-12 && arc[i] <= hi + 1e-12) ids.push(i);
  return from <= to ? ids : ids.reverse();
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
  return total;
}

function pointAt(points, fraction) {
  const total = polylineLength(points), target = Math.max(0, Math.min(1, fraction)) * total;
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
    if (run + len >= target) { const t = len ? (target - run) / len : 0; return points[i - 1].map((v, k) => v + t * (points[i][k] - v)); }
    run += len;
  }
  return points.at(-1).slice();
}

/** Material spans (point indices) for every annotated target id; spans start at the annotation's first point. */
export function correspondenceSpans(doc, annotation, spec = POSE_CORRESPONDENCE, pixelsPerMetre = 5000) {
  const p = doc.ropes[0].points, arc = doc.somerville.materialArc, byId = Object.fromEntries(annotation.visiblePolylines.map((x) => [x.id, x.points]));
  const lengthOf = (id) => polylineLength(byId[id]) / pixelsPerMetre;
  const spans = {};
  // Cuff: every front crossing (angle 0 measured from -Y toward +Z) starts a lane, oriented downward in Z.
  const lanes = [];
  for (const role of spec.cuffLanes.roles) {
    const ids = sectionPoints(doc, role);
    for (let k = 1; k < ids.length; k++) {
      const a = p[ids[k - 1]], b = p[ids[k]];
      if (a[1] < 0 && b[1] < 0 && Math.sign(a[2]) !== Math.sign(b[2])) {
        const t = a[2] / (a[2] - b[2]), s = arc[ids[k - 1]] + t * (arc[ids[k]] - arc[ids[k - 1]]), down = b[2] < a[2] ? 1 : -1;
        lanes.push({ role, x: a[0] + t * (b[0] - a[0]), from: s - down * spec.cuffLanes.aboveFront, to: s + down * spec.cuffLanes.belowFront });
      }
    }
  }
  if (lanes.length !== 4) throw new Error(`expected four front cuff runs, found ${lanes.length}`);
  lanes.sort((a, b) => a.x - b.x);
  ['cuff-left', 'cuff-mid-left', 'cuff-mid-right', 'cuff-right'].forEach((id, k) => { spans[id] = { ...lanes[k], ids: arcSpan(doc, lanes[k].from, lanes[k].to) }; });
  // Tails: start a hidden distance below the loop entry, run toward the free end.
  const tails = spec.tails.roles.map((role) => {
    const ids = sectionPoints(doc, role), [first, last] = [arc[ids[0]], arc[ids.at(-1)]];
    const loopSide = role.endsWith('/0') ? last : first, dir = role.endsWith('/0') ? -1 : 1;
    return { role, loopSide, dir };
  });
  const tailX = tails.map((t) => { const ids = arcSpan(doc, t.loopSide + t.dir * spec.tails.hiddenFromLoop, t.loopSide + t.dir * (spec.tails.hiddenFromLoop + 0.09)); return ids.reduce((s, i) => s + p[i][0], 0) / ids.length; });
  const tailOrder = tailX[0] <= tailX[1] ? [0, 1] : [1, 0];
  ['tail-left', 'tail-right'].forEach((id, k) => {
    const t = tails[tailOrder[k]], from = t.loopSide + t.dir * spec.tails.hiddenFromLoop, to = from + t.dir * lengthOf(id);
    spans[id] = { role: t.role, from, to, ids: arcSpan(doc, from, to) };
  });
  // Bight: annotation runs upper leg -> fold -> lower leg, i.e. along material order E0 -> E1.
  const [leg0, leg1] = spec.bight.legs.map((role) => sectionPoints(doc, role)), fold = sectionPoints(doc, 'fold');
  const foldFrom = arc[fold[0]], foldTo = arc[fold.at(-1)];
  const upperFrom = Math.max(arc[leg0[0]] + spec.bight.hiddenFromCore, foldFrom - lengthOf('bight-upper-leg'));
  const lowerTo = Math.min(arc[leg1.at(-1)] - spec.bight.hiddenFromCore, foldTo + lengthOf('bight-lower-leg'));
  spans['bight-upper-leg'] = { role: 'bight-leg/0', from: upperFrom, to: foldFrom, ids: arcSpan(doc, upperFrom, foldFrom) };
  spans['bight-fold'] = { role: 'fold', from: foldFrom, to: foldTo, ids: arcSpan(doc, foldFrom, foldTo) };
  spans['bight-lower-leg'] = { role: 'bight-leg/1', from: foldTo, to: lowerTo, ids: arcSpan(doc, foldTo, lowerTo) };
  for (const [id, span] of Object.entries(spans)) if (span.ids.length < 2) throw new Error(`span ${id} has fewer than two points`);
  return spans;
}

export function worldByTargetId(points, spans) {
  return Object.fromEntries(Object.entries(spans).map(([id, span]) => [id, span.ids.map((i) => points[i].slice())]));
}

/** Shape targets in X/Z: each span point is pulled to the back-projected annotation point at the same span fraction. */
export function poseTargets(materialArc, spans, annotation, camera, weight = 0.05) {
  const byId = Object.fromEntries(annotation.visiblePolylines.map((x) => [x.id, x.points]));
  const c = Math.cos(camera.rollRadians), s = Math.sin(camera.rollRadians), ppm = camera.pixelsPerMetre, [u0, v0] = camera.originPixel;
  const unproject = ([u, v]) => { const a = (u - u0) / ppm, b = (v - v0) / ppm; return [c * a + s * b, 0, s * a - c * b]; };
  return Object.entries(spans).map(([id, span]) => {
    const world = byId[id].map(unproject), total = Math.abs(span.to - span.from);
    const positions = span.ids.map((i) => pointAt(world, total ? Math.abs(materialArc[i] - span.from) / total : 0));
    return { id, indices: span.ids, positions, axes: [0, 2], weight };
  });
}

/**
 * Model points that would be visible in the source frame but are not explained by a traced span.
 * Explained: inside a traced span, within one rope diameter of a traced polyline, inside the
 * annotated locking-core box, on the cuff band, hidden behind the column, or outside the frame.
 */
export function unexplainedVisible(points, labels, spans, annotation, camera, { columnRadius = 0.0275 } = {}) {
  const inSpan = new Set(Object.values(spans).flatMap((s) => s.ids));
  const c = Math.cos(camera.rollRadians), s = Math.sin(camera.rollRadians), ppm = camera.pixelsPerMetre, [u0, v0] = camera.originPixel;
  const project = (q) => [u0 + ppm * (c * q[0] + s * q[2]), v0 + ppm * (s * q[0] - c * q[2])];
  const D = annotation.nominalVisibleRopeDiameterPx, [w, h] = annotation.imageSize, box = annotation.lockingCoreRegion;
  const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], q = vx * vx + vy * vy, t = q ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / q)) : 0; return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy); };
  const nearest = (uv) => Math.min(...annotation.visiblePolylines.flatMap((pl) => pl.points.slice(1).map((b, k) => segDist(uv, pl.points[k], b))));
  const offenders = [];
  points.forEach((q, i) => {
    if (inSpan.has(i)) return;
    const role = labels[Math.min(i, labels.length - 1)] ?? '';
    if (role.startsWith('cuff/')) return;
    if (q[1] > 0 && Math.abs(q[2]) < columnRadius && q[1] > Math.sqrt(columnRadius ** 2 - q[2] ** 2)) return;
    const uv = project(q);
    if (uv[0] < 0 || uv[1] < 0 || uv[0] > w || uv[1] > h) return;
    if (box && uv[0] >= box[0] - D / 2 && uv[0] <= box[2] + D / 2 && uv[1] >= box[1] - D / 2 && uv[1] <= box[3] + D / 2) return;
    const distance = nearest(uv);
    if (distance > D) offenders.push({ index: i, role, uv, distance });
  });
  const byRole = {};
  for (const o of offenders) byRole[o.role] = (byRole[o.role] ?? 0) + 1;
  return { count: offenders.length, maxDistancePx: offenders.reduce((m, o) => Math.max(m, o.distance), 0), byRole, offenders };
}

function unprojector(camera) {
  const c = Math.cos(camera.rollRadians), s = Math.sin(camera.rollRadians), ppm = camera.pixelsPerMetre, [u0, v0] = camera.originPixel;
  return ([u, v]) => { const a = (u - u0) / ppm, b = (v - v0) / ppm; return [c * a + s * b, s * a - c * b]; };
}

function nearestOnPolyline(q, poly) {
  let best = null, bestDistance = Infinity;
  for (let k = 1; k < poly.length; k++) {
    const a = poly[k - 1], b = poly[k], vx = b[0] - a[0], vz = b[1] - a[1], len2 = vx * vx + vz * vz;
    const t = len2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[2] - a[1]) * vz) / len2)) : 0;
    const x = a[0] + t * vx, z = a[1] + t * vz, distance = Math.hypot(q[0] - x, q[2] - z);
    if (distance < bestDistance) { bestDistance = distance; best = [x, 0, z]; }
  }
  return best;
}

/**
 * Sliding targets: listed material roles are pulled in X/Z to the nearest point of their annotated polyline,
 * so material can flow along the visible rope during tightening.
 */
export function slidingTargets(points, labels, annotation, camera, assignment, weight) {
  const unproject = unprojector(camera), byId = Object.fromEntries(annotation.visiblePolylines.map((x) => [x.id, x.points.map(unproject)]));
  return Object.entries(assignment).map(([role, ids]) => {
    const poly = ids.flatMap((id) => byId[id]), indices = [], positions = [];
    const [first, last] = [poly[0], poly.at(-1)], dir = [last[0] - first[0], last[1] - first[1]], len = Math.hypot(...dir), D = annotation.nominalVisibleRopeDiameterPx / camera.pixelsPerMetre;
    points.forEach((q, i) => {
      if ((labels[Math.min(i, labels.length - 1)] ?? '') !== role) return;
      const along = ((q[0] - first[0]) * dir[0] + (q[2] - first[1]) * dir[1]) / len;
      if (along >= -D && along <= len + D) { indices.push(i); positions.push(nearestOnPolyline(q, poly)); }
    });
    return { id: `slide:${role}`, indices, positions, axes: [0, 2], weight };
  });
}

/** Scoring spans re-derived from the image window after sliding: material of a role whose projection lies near its polyline. */
export function windowSpans(points, labels, annotation, camera, assignment, fixedSpans) {
  const unproject = unprojector(camera), spans = { ...fixedSpans }, D = annotation.nominalVisibleRopeDiameterPx / camera.pixelsPerMetre;
  for (const [id, roles] of Object.entries(assignment)) {
    const poly = annotation.visiblePolylines.find((x) => x.id === id).points.map(unproject);
    const [first, last] = [poly[0], poly.at(-1)], dir = [last[0] - first[0], last[1] - first[1]], len = Math.hypot(...dir);
    const along = (q) => ((q[0] - first[0]) * dir[0] + (q[2] - first[1]) * dir[1]) / len;
    let ids = [];
    points.forEach((q, i) => {
      const role = labels[Math.min(i, labels.length - 1)] ?? '';
      if (!roles.includes(role)) return;
      const a = along(q), near = nearestOnPolyline(q, poly);
      if (a >= 0 && a <= len && Math.hypot(q[0] - near[0], q[2] - near[2]) < 3 * D) ids.push(i);
    });
    if (ids.length < 2) throw new Error(`window span ${id} is empty`);
    ids.sort((i, j) => along(points[i]) - along(points[j]));
    spans[id] = { role: roles.join('+'), window: true, ids };
  }
  return spans;
}
