// Material-arc correspondence between model sections and the 148 s annotation.
// Spans are fixed in material arc so they survive resampling and relaxation.
import {geometryArc} from './rope-state.js';

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

function segmentRoleAt(labels, index) {
  if (!Array.isArray(labels) || labels.length === 0) return '';
  const value = labels[index] ?? labels[Math.min(index, labels.length - 1)];
  return value == null ? '' : String(value);
}

function projectXZ(point, camera) {
  const c = Math.cos(camera.rollRadians);
  const s = Math.sin(camera.rollRadians);
  const ppm = camera.pixelsPerMetre;
  const [u0, v0] = camera.originPixel;
  return [u0 + ppm * (c * point[0] + s * point[2]), v0 + ppm * (s * point[0] - c * point[2])];
}

function lerp(a, b, t) {
  const out = new Array(a.length);
  for (let k = 0; k < a.length; k++) out[k] = a[k] + t * (b[k] - a[k]);
  return out;
}

function dist2Segment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const q = vx * vx + vy * vy;
  const t = q ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / q)) : 0;
  return { distance: Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy), t };
}

function distanceToTraced(uv, polylines) {
  let best = Infinity;
  for (const pl of polylines) {
    const pts = pl?.points;
    if (!pts || pts.length < 2) continue;
    for (let k = 1; k < pts.length; k++) best = Math.min(best, dist2Segment(uv, pts[k - 1], pts[k]).distance);
  }
  return best;
}

function clipSegmentToRect(a, b, width, height) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0], width - a[0], a[1], height - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
}

function subtractIntervals(source, cuts) {
  let intervals = source;
  for (const cut of cuts) {
    const next = [];
    for (const [a, b] of intervals) {
      if (cut[1] <= a || cut[0] >= b) next.push([a, b]);
      else {
        if (cut[0] > a) next.push([a, Math.min(cut[0], b)]);
        if (cut[1] < b) next.push([Math.max(cut[1], a), b]);
      }
    }
    intervals = next;
  }
  return intervals.filter((iv) => iv[1] > iv[0]);
}

function predicateIntervals(t0, t1, predicate, pixelLength, resolutionPx) {
  const span = t1 - t0;
  if (!(span > 0)) return [];
  const steps = Math.max(1, Math.ceil(Math.max(pixelLength, resolutionPx) / resolutionPx));
  const ts = [];
  const values = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + span * (i / steps);
    ts.push(t);
    values.push(!!predicate(t));
  }
  const edges = [];
  for (let i = 1; i < ts.length; i++) {
    if (values[i] === values[i - 1]) continue;
    let lo = ts[i - 1];
    let hi = ts[i];
    const left = values[i - 1];
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (predicate(mid) === left) lo = mid;
      else hi = mid;
    }
    edges.push((lo + hi) / 2);
  }
  const intervals = [];
  let cursor = t0;
  let on = values[0];
  for (const edge of edges) {
    if (on) intervals.push([cursor, edge]);
    on = !on;
    cursor = edge;
  }
  if (on) intervals.push([cursor, t1]);
  return intervals;
}

function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const crosses = (yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function handMaskPolygons(annotation) {
  if (!Array.isArray(annotation?.handMasks)) return [];
  const polygons = [];
  for (const mask of annotation.handMasks) {
    const polygon = Array.isArray(mask?.polygon) ? mask.polygon : mask;
    if (Array.isArray(polygon) && polygon.length >= 3 && polygon.every((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))) {
      polygons.push(polygon);
    }
  }
  return polygons;
}

function columnOccludes(point, radius, center) {
  if (!(radius > 0)) return false;
  const y = point[1] - center[1];
  const z = point[2] - center[2];
  const behind = radius * radius - z * z;
  if (behind < 0) return false;
  return y > -Math.sqrt(behind);
}

function buildImageGrid(records, cell) {
  const grid = new Map();
  const size = Math.max(cell, 1e-6);
  for (const record of records) {
    const minU = Math.min(record.a2[0], record.b2[0]);
    const maxU = Math.max(record.a2[0], record.b2[0]);
    const minV = Math.min(record.a2[1], record.b2[1]);
    const maxV = Math.max(record.a2[1], record.b2[1]);
    const i0 = Math.floor(minU / size);
    const i1 = Math.floor(maxU / size);
    const j0 = Math.floor(minV / size);
    const j1 = Math.floor(maxV / size);
    for (let ix = i0; ix <= i1; ix++) {
      for (let iy = j0; iy <= j1; iy++) {
        const key = `${ix}:${iy}`;
        let bucket = grid.get(key);
        if (!bucket) grid.set(key, bucket = []);
        bucket.push(record);
      }
    }
  }
  return { grid, size };
}

/**
 * Visible extra rope, measured as projected length.
 * A correspondence span index and the locking-core box do not remove length.
 * Only the frame boundary, proximity to a traced centerline, physical column occlusion,
 * rope occlusion, or an explicit hand mask may exclude a portion.
 */
export function unexplainedVisible(points, labels, spans, annotation, camera, options = {}) {
  const {
    columnRadius = 0.0275,
    columnCenter = [0, 0, 0],
    samplingResolutionPx = 1,
    ropeDiameterMetres = null,
    materialArc = null,
  } = options;
  if (!Array.isArray(annotation?.imageSize) || annotation.imageSize.length < 2) {
    throw new Error('annotation.imageSize must be [width, height]');
  }
  const resolutionPx = samplingResolutionPx > 0 ? samplingResolutionPx : 1;
  const [width, height] = annotation.imageSize;
  const diameterPx = annotation.nominalVisibleRopeDiameterPx;
  const traced = (annotation.visiblePolylines ?? []).filter((pl) => pl?.kind !== 'crossing');
  const masks = handMaskPolygons(annotation);
  const ropeDiameter = ropeDiameterMetres
    ?? annotation.scaleCalibration?.diameterMetres
    ?? (Number.isFinite(diameterPx) && camera.pixelsPerMetre > 0 ? diameterPx / camera.pixelsPerMetre : 0.006);
  const radiusPx = (ropeDiameter / 2) * camera.pixelsPerMetre;
  const spanIndices = new Set();
  if (spans && typeof spans === 'object') {
    for (const span of Object.values(spans)) {
      if (Array.isArray(span?.ids)) for (const id of span.ids) spanIndices.add(id);
    }
  }
  const records = [];
  // Visibility must not depend on index density. This is a geometric neighbourhood,
  // not an assertion that current arclength replaces fixed material identity.
  const visibilityArc=geometryArc(points);
  for (let i = 0; i < points.length - 1; i++) {
    const a3 = points[i];
    const b3 = points[i + 1];
    const a2 = projectXZ(a3, camera);
    const b2 = projectXZ(b3, camera);
    records.push({
      i,
      role: segmentRoleAt(labels, i),
      a3,
      b3,
      a2,
      b2,
      imageLength: Math.hypot(b2[0] - a2[0], b2[1] - a2[1]),
      s: visibilityArc[i],
    });
  }
  const grid = buildImageGrid(records, Math.max(radiusPx, resolutionPx));
  const lengthByRole = {};
  const byRole = {};
  const pieces = [];
  let lengthPx = 0;
  let lengthInsideKnownSpansPx = 0;
  let maxDistancePx = 0;

  const ropeOccludes = (record, uv, point) => {
    const ix = Math.floor(uv[0] / grid.size);
    const iy = Math.floor(uv[1] / grid.size);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.grid.get(`${ix + dx}:${iy + dy}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (Math.abs(other.i - record.i) <= 1) continue;
          if (Number.isFinite(record.s) && Number.isFinite(other.s) && Math.abs(other.s - record.s) < 4 * ropeDiameter) continue;
          const closest = dist2Segment(uv, other.a2, other.b2);
          if (closest.distance > radiusPx) continue;
          const y = other.a3[1] + closest.t * (other.b3[1] - other.a3[1]);
          if (y < point[1] - 1e-9) return true;
        }
      }
    }
    return false;
  };

  for (const record of records) {
    if (!(record.imageLength > 0)) continue;
    const visible = clipSegmentToRect(record.a2, record.b2, width, height);
    if (!visible) continue;
    const at2 = (t) => lerp(record.a2, record.b2, t);
    const at3 = (t) => lerp(record.a3, record.b3, t);
    const visiblePixels = (visible[1] - visible[0]) * record.imageLength;
    let intervals = [visible];
    intervals = subtractIntervals(intervals, predicateIntervals(visible[0], visible[1], (t) => distanceToTraced(at2(t), traced) <= diameterPx, visiblePixels, resolutionPx));
    if (masks.length) {
      intervals = subtractIntervals(intervals, predicateIntervals(visible[0], visible[1], (t) => masks.some((polygon) => pointInPolygon(at2(t), polygon)), visiblePixels, resolutionPx));
    }
    if (columnRadius > 0) {
      intervals = subtractIntervals(intervals, predicateIntervals(visible[0], visible[1], (t) => columnOccludes(at3(t), columnRadius, columnCenter), visiblePixels, resolutionPx));
    }
    intervals = subtractIntervals(intervals, predicateIntervals(visible[0], visible[1], (t) => ropeOccludes(record, at2(t), at3(t)), visiblePixels, resolutionPx));
    const knownSpan = spanIndices.has(record.i) || spanIndices.has(record.i + 1);
    for (const [t0, t1] of intervals) {
      const pieceLength = (t1 - t0) * record.imageLength;
      if (!(pieceLength > 1e-6)) continue;
      lengthPx += pieceLength;
      if (knownSpan) lengthInsideKnownSpansPx += pieceLength;
      lengthByRole[record.role] = (lengthByRole[record.role] ?? 0) + pieceLength;
      byRole[record.role] = (byRole[record.role] ?? 0) + 1;
      const mid = at2((t0 + t1) / 2);
      const distance = distanceToTraced(mid, traced);
      if (distance > maxDistancePx) maxDistancePx = distance;
      pieces.push({ index: record.i, role: record.role, lengthPx: pieceLength, midpoint: mid, distance });
    }
  }
  return {
    count: pieces.length,
    lengthPx,
    lengthInsideKnownSpansPx,
    samplingResolutionPx: resolutionPx,
    maxDistancePx: pieces.length ? maxDistancePx : 0,
    byRole,
    lengthByRole,
    pieces,
    coreBoxExempt: false,
    spanExempt: false,
    exclusions: ['outside-frame', 'traced-centerline', 'column', 'rope', 'hand-mask'],
  };
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
    // Keep the actual material polyline: never stitch disjoint near-image pieces.
    if (ids.some((id, k) => k && id !== ids[k - 1] + 1)) {
      const error = new Error(`window span ${id} is disjoint in material order`);
      error.code = 'UNVERIFIED_CORRESPONDENCE'; throw error;
    }
    const p0 = points[ids[0]], p1 = points[ids.at(-1)];
    const d = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[1]);
    if (d(p0, first) + d(p1, last) > d(p1, first) + d(p0, last)) ids.reverse();
    spans[id] = { role: roles.join('+'), window: true, ids };
  }
  return spans;
}
