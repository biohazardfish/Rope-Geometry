/** Independent orthographic pose fit/score for Somerville source-frame annotations. */

const FIT_ARC_FRACTIONS = Object.freeze([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
const SCORE_ARC_FRACTIONS = Object.freeze(Array.from({ length: 21 }, (_, i) => i / 20));

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function assertFinitePoint2(point, name) {
  if (!Array.isArray(point) || point.length !== 2) throw new Error(`${name} must be [u, v]`);
  assertFiniteNumber(point[0], `${name}[0]`);
  assertFiniteNumber(point[1], `${name}[1]`);
}

function assertFinitePoint3(point, name) {
  if (!Array.isArray(point) || point.length !== 3) throw new Error(`${name} must be [x, y, z]`);
  for (let i = 0; i < 3; i++) assertFiniteNumber(point[i], `${name}[${i}]`);
}

function validateCamera(camera) {
  if (!camera || typeof camera !== 'object') throw new Error('camera must be an object');
  if (camera.projection !== 'orthographic') {
    throw new Error('camera.projection must be "orthographic"');
  }
  assertFiniteNumber(camera.pixelsPerMetre, 'camera.pixelsPerMetre');
  if (camera.pixelsPerMetre <= 0) throw new Error('camera.pixelsPerMetre must be positive');
  if (!Array.isArray(camera.originPixel) || camera.originPixel.length !== 2) {
    throw new Error('camera.originPixel must be [u, v]');
  }
  assertFinitePoint2(camera.originPixel, 'camera.originPixel');
  assertFiniteNumber(camera.rollRadians, 'camera.rollRadians');
  return camera;
}

function xzPair(point) {
  return [point[0], point[2]];
}

/** Orthographic view from −Y toward +Y, world Z up, optional roll in the XZ plane. */
export function projectPoint(point, camera) {
  assertFinitePoint3(point, 'point');
  const cam = validateCamera(camera);
  const c = Math.cos(cam.rollRadians);
  const s = Math.sin(cam.rollRadians);
  const ppm = cam.pixelsPerMetre;
  const x = point[0];
  const z = point[2];
  return [
    cam.originPixel[0] + ppm * (c * x + s * z),
    cam.originPixel[1] + ppm * (s * x - c * z),
  ];
}

function polylineArcLength(points) {
  let total = 0;
  const seg = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d =
      a.length === 3
        ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
        : Math.hypot(b[0] - a[0], b[1] - a[1]);
    total += d;
    seg.push(total);
  }
  return { total, seg };
}

function pointAtArcFraction(points, fraction) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('polyline must contain at least two points');
  }
  assertFiniteNumber(fraction, 'arc fraction');
  if (fraction <= 0) return points[0].slice();
  if (fraction >= 1) return points[points.length - 1].slice();
  const { total, seg } = polylineArcLength(points);
  if (total === 0) throw new Error('degenerate polyline: zero arc length');
  const target = fraction * total;
  for (let i = 1; i < seg.length; i++) {
    if (target <= seg[i]) {
      const segLen = seg[i] - seg[i - 1];
      const t = segLen === 0 ? 0 : (target - seg[i - 1]) / segLen;
      const a = points[i - 1];
      const b = points[i];
      if (a.length === 3) return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
  }
  return points[points.length - 1].slice();
}

function distPointToSegment2(p, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(p[0] - (a[0] + t * abx), p[1] - (a[1] + t * aby));
}

function distPointToPolyline2(p, polyline) {
  let best = Infinity;
  for (let i = 1; i < polyline.length; i++) {
    best = Math.min(best, distPointToSegment2(p, polyline[i - 1], polyline[i]));
  }
  return best;
}

function validateAnnotation(annotation) {
  if (!annotation || typeof annotation !== 'object') throw new Error('annotation must be an object');
  assertFiniteNumber(annotation.nominalVisibleRopeDiameterPx, 'annotation.nominalVisibleRopeDiameterPx');
  if (annotation.nominalVisibleRopeDiameterPx <= 0) {
    throw new Error('annotation.nominalVisibleRopeDiameterPx must be positive');
  }
  if (!Array.isArray(annotation.visiblePolylines) || annotation.visiblePolylines.length === 0) {
    throw new Error('annotation.visiblePolylines must be a non-empty array');
  }
  for (const pl of annotation.visiblePolylines) {
    if (!pl?.id) throw new Error('each visible polyline requires an id');
    if (!Array.isArray(pl.points) || pl.points.length < 2) {
      throw new Error(`polyline "${pl.id}" must have at least two points`);
    }
    for (const pt of pl.points) assertFinitePoint2(pt, `polyline "${pl.id}" point`);
  }
  return annotation;
}

function listAnnotationTargets(annotation) {
  validateAnnotation(annotation);
  return annotation.visiblePolylines.map((pl) => ({ id: pl.id, kind: pl.kind ?? 'centerline', points: pl.points }));
}

function validateWorldMap(worldByTargetId, annotation) {
  if (!worldByTargetId || typeof worldByTargetId !== 'object') {
    throw new Error('worldByTargetId must be an object');
  }
  const targets = listAnnotationTargets(annotation);
  const allowed = new Set(targets.map((t) => t.id));
  for (const key of Object.keys(worldByTargetId)) {
    if (!allowed.has(key)) {
      throw new Error(`worldByTargetId contains unexpected target "${key}"; only explicit annotation ids are allowed`);
    }
    const poly = worldByTargetId[key];
    if (!Array.isArray(poly) || poly.length < 2) {
      throw new Error(`world polyline "${key}" must be an ordered array of at least two XYZ points`);
    }
    for (let i = 0; i < poly.length; i++) assertFinitePoint3(poly[i], `worldByTargetId["${key}"][${i}]`);
  }
  return targets;
}

const SCALE_KEYS = ['nominalPixelsPerMetre', 'minPixelsPerMetre', 'maxPixelsPerMetre', 'diameterMetres'];

/** Absent calibration stays unconstrained. A present record must be the frozen admissible range. */
export function parseScaleCalibration(annotation) {
  if (!annotation || typeof annotation !== 'object' || !Object.prototype.hasOwnProperty.call(annotation, 'scaleCalibration')) {
    return null;
  }
  const calibration = annotation.scaleCalibration;
  if (!calibration || typeof calibration !== 'object' || Array.isArray(calibration)) {
    throw new Error('annotation.scaleCalibration must be an object');
  }
  for (const key of SCALE_KEYS) {
    if (typeof calibration[key] !== 'number' || !Number.isFinite(calibration[key])) {
      throw new Error(`annotation.scaleCalibration.${key} must be a finite number`);
    }
  }
  if (calibration.minPixelsPerMetre <= 0 || calibration.maxPixelsPerMetre <= 0 || calibration.diameterMetres <= 0) {
    throw new Error('annotation.scaleCalibration bounds and diameterMetres must be positive');
  }
  if (calibration.minPixelsPerMetre > calibration.maxPixelsPerMetre) {
    throw new Error('annotation.scaleCalibration minPixelsPerMetre exceeds maxPixelsPerMetre');
  }
  if (calibration.nominalPixelsPerMetre < calibration.minPixelsPerMetre || calibration.nominalPixelsPerMetre > calibration.maxPixelsPerMetre) {
    throw new Error('annotation.scaleCalibration nominalPixelsPerMetre is outside the admissible range');
  }
  return {
    nominalPixelsPerMetre: calibration.nominalPixelsPerMetre,
    minPixelsPerMetre: calibration.minPixelsPerMetre,
    maxPixelsPerMetre: calibration.maxPixelsPerMetre,
    diameterMetres: calibration.diameterMetres,
  };
}

function originForScale(ppm, rollRadians, mean) {
  const c = Math.cos(rollRadians);
  const s = Math.sin(rollRadians);
  return [
    mean.mu - ppm * (c * mean.mx + s * mean.mz),
    mean.mv - ppm * (s * mean.mx - c * mean.mz),
  ];
}

function fitSimilarity2D(modelPoints, imagePoints, calibration) {
  if (modelPoints.length !== imagePoints.length || modelPoints.length < 2) {
    throw new Error('similarity fit requires at least two corresponding points');
  }
  const n = modelPoints.length;
  let mx = 0;
  let mz = 0;
  let mu = 0;
  let mv = 0;
  for (let i = 0; i < n; i++) {
    mx += modelPoints[i][0];
    mz += modelPoints[i][1];
    mu += imagePoints[i][0];
    mv += imagePoints[i][1];
  }
  mx /= n;
  mz /= n;
  mu /= n;
  mv /= n;

  let modelVar = 0, c00 = 0, c01 = 0, c10 = 0, c11 = 0;
  for (let i = 0; i < n; i++) {
    const x = modelPoints[i][0] - mx;
    const z = modelPoints[i][1] - mz;
    const u = imagePoints[i][0] - mu, v = imagePoints[i][1] - mv;
    c00 += u * x; c01 += u * z; c10 += v * x; c11 += v * z;
    modelVar += x * x + z * z;
  }
  if (modelVar === 0) throw new Error('degenerate fit: model samples collapse to a point');

  // Solve u = tx + A*x + B*z, v = ty + B*x - A*z directly.
  // This is the global least-squares optimum, without angular grid resolution.
  const A = (c00 - c11) / modelVar;
  const B = (c01 + c10) / modelVar;
  const ppm = Math.hypot(A, B);
  if (!(ppm > 0) || !Number.isFinite(ppm)) throw new Error('degenerate fit: non-positive scale');
  const rollRadians = Math.atan2(B, A);
  const mean = { mx, mz, mu, mv };
  const unconstrainedOrigin = originForScale(ppm, rollRadians, mean);
  let constrainedPpm = ppm;
  let clamped = false;
  let status = 'UNCALIBRATED';
  if (calibration) {
    if (ppm < calibration.minPixelsPerMetre) {
      constrainedPpm = calibration.minPixelsPerMetre;
      clamped = true;
    } else if (ppm > calibration.maxPixelsPerMetre) {
      constrainedPpm = calibration.maxPixelsPerMetre;
      clamped = true;
    }
    status = 'PASS';
  }
  const originPixel = originForScale(constrainedPpm, rollRadians, mean);

  return {
    camera: validateCamera({
      projection: 'orthographic',
      pixelsPerMetre: constrainedPpm,
      originPixel,
      rollRadians,
    }),
    scale: {
      status,
      unconstrainedPixelsPerMetre: ppm,
      constrainedPixelsPerMetre: constrainedPpm,
      clamped,
      unconstrainedScaleStatus: calibration ? (clamped ? 'OUTSIDE_RANGE' : 'IN_RANGE') : 'UNCALIBRATED',
      nominalPixelsPerMetre: calibration?.nominalPixelsPerMetre ?? null,
      minPixelsPerMetre: calibration?.minPixelsPerMetre ?? null,
      maxPixelsPerMetre: calibration?.maxPixelsPerMetre ?? null,
      diameterMetres: calibration?.diameterMetres ?? null,
      unconstrainedOriginPixel: unconstrainedOrigin,
      independent: true,
    },
  };
}

function collectFitPairs(worldByTargetId, annotation) {
  const targets = validateWorldMap(worldByTargetId, annotation);
  const model = [];
  const image = [];
  for (const target of targets) {
    const worldPoly = worldByTargetId[target.id];
    if (!worldPoly) throw new Error(`missing world span for annotation target "${target.id}"`);
    for (const fraction of FIT_ARC_FRACTIONS) {
      const wp = pointAtArcFraction(worldPoly.map(xzPair), fraction);
      const ip = pointAtArcFraction(target.points, fraction);
      model.push(wp);
      image.push(ip.slice());
    }
  }
  return { model, image, targets };
}

export function fitPoseCamera(worldByTargetId, annotation) {
  const calibration = parseScaleCalibration(annotation);
  const { model, image } = collectFitPairs(worldByTargetId, annotation);
  return fitSimilarity2D(model, image, calibration);
}

function projectPolyline(worldPoly, camera) {
  return worldPoly.map((p) => projectPoint(p, camera));
}

function symmetricPolylineResidualPx(sourcePoly, projectedPoly, fractions) {
  const dists = [];
  for (const f of fractions) {
    const sp = pointAtArcFraction(sourcePoly, f);
    dists.push(distPointToPolyline2(sp, projectedPoly));
    const pp = pointAtArcFraction(projectedPoly, f);
    dists.push(distPointToPolyline2(pp, sourcePoly));
  }
  return dists;
}

function summarizeDists(dists) {
  if (dists.length === 0) return { rmsPx: NaN, maxPx: NaN };
  let sumSq = 0;
  let maxPx = 0;
  for (const d of dists) {
    sumSq += d * d;
    if (d > maxPx) maxPx = d;
  }
  return { rmsPx: Math.sqrt(sumSq / dists.length), maxPx };
}

function crossingTargets(annotation) {
  return listAnnotationTargets(annotation).filter((t) => t.kind === 'crossing');
}

const LEGACY_CROSSING_REASON = 'annotation contains no explicit crossing targets; camera fit cannot certify topology';

function explicitCrossing(entry) {
  return !!entry
    && entry.bindingStatus === 'reviewed'
    && typeof entry.over?.role === 'string'
    && entry.over.role.length > 0
    && typeof entry.under?.role === 'string'
    && entry.under.role.length > 0
    && Array.isArray(entry.positionPx)
    && entry.positionPx.length === 2
    && entry.positionPx.every((n) => Number.isFinite(n))
    && Number.isFinite(entry.uncertaintyPx) && entry.uncertaintyPx >= 0;
}

function segmentRole(labels, index) {
  if (!Array.isArray(labels) || labels.length === 0) return '';
  const value = labels[index] ?? labels[Math.min(index, labels.length - 1)];
  return value == null ? '' : String(value);
}

function materialAt(materialArc, index, t) {
  if (!Array.isArray(materialArc)) return null;
  const a = materialArc[index];
  const b = materialArc[index + 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + t * (b - a);
}

function rangeError(range, name) {
  if (range == null) return null;
  if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isFinite(n))) {
    return `${name}.materialRange must be [start, end] when supplied`;
  }
  return null;
}

function insideRange(range, value) {
  if (range == null) return true;
  if (!Number.isFinite(value)) return false;
  const lo = Math.min(range[0], range[1]);
  const hi = Math.max(range[0], range[1]);
  return value >= lo - 1e-9 && value <= hi + 1e-9;
}

function intersectProjected(p, p2, q, q2) {
  const rx = p2[0] - p[0];
  const ry = p2[1] - p[1];
  const sx = q2[0] - q[0];
  const sy = q2[1] - q[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const qpx = q[0] - p[0];
  const qpy = q[1] - p[1];
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return null;
  const tc=Math.max(0,Math.min(1,t)),uc=Math.max(0,Math.min(1,u));
  return { t:tc, u:uc, point: [p[0] + tc * rx, p[1] + tc * ry] };
}

function measureCrossing(entry, index, ctx) {
  const id = typeof entry?.id === 'string' && entry.id ? entry.id : `crossing-${index}`;
  const bindingStatus = entry?.bindingStatus ?? 'missing';
  if (!explicitCrossing(entry)) {
    return {
      id,
      bindingStatus,
      status: 'UNVERIFIED',
      explicit: false,
      reason: 'crossing binding is not a reviewed material correspondence',
    };
  }
  const problem = rangeError(entry.over.materialRange, 'over') || rangeError(entry.under.materialRange, 'under');
  if (problem) return { id, bindingStatus, status: 'FAIL', explicit: true, reason: problem };
  if ((entry.over.materialRange || entry.under.materialRange) && !Array.isArray(ctx.materialArc)) {
    return {
      id,
      bindingStatus,
      status: 'UNVERIFIED',
      explicit: true,
      reason: 'material range cannot be checked without material coordinates',
    };
  }
  const { points, labels, materialArc, camera } = ctx;
  const hits = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentRole(labels, i) !== entry.over.role) continue;
    const overS = materialAt(materialArc, i, 0.5);
    if (entry.over.materialRange && !Array.isArray(materialArc)) continue;
    for (let j = 0; j < points.length - 1; j++) {
      if (Math.abs(i-j)<=1 || segmentRole(labels, j) !== entry.under.role) continue;
      const overPx = projectPoint(points[i], camera);
      const overPx2 = projectPoint(points[i + 1], camera);
      const underPx = projectPoint(points[j], camera);
      const underPx2 = projectPoint(points[j + 1], camera);
      const hit = intersectProjected(overPx, overPx2, underPx, underPx2);
      if (!hit) continue;
      const overMaterial = materialAt(materialArc, i, hit.t);
      const underMaterial = materialAt(materialArc, j, hit.u);
      if (!insideRange(entry.over.materialRange, overMaterial ?? overS)) continue;
      if (!insideRange(entry.under.materialRange, underMaterial)) continue;
      const overY = points[i][1] + hit.t * (points[i + 1][1] - points[i][1]);
      const underY = points[j][1] + hit.u * (points[j + 1][1] - points[j][1]);
      hits.push({
        residualPx: Math.hypot(hit.point[0] - entry.positionPx[0], hit.point[1] - entry.positionPx[1]),
        projectedPx: hit.point,
        overY,
        underY,
        segmentOver: i,
        segmentUnder: j,
      });
    }
  }
  if (hits.length === 0) {
    return {
      id,
      bindingStatus,
      status: 'FAIL',
      explicit: true,
      residualPx: null,
      reason: 'no projected segment crossing matches the declared roles and material ranges',
    };
  }
  hits.sort((a, b) => a.residualPx - b.residualPx || a.segmentOver - b.segmentOver || a.segmentUnder - b.segmentUnder);
  const best = hits[0];
  const limitPx = ctx.annotation.nominalVisibleRopeDiameterPx;
  const measured = {
    id,
    bindingStatus,
    explicit: true,
    residualPx: best.residualPx,
    limitPx,
    uncertaintyPx: entry.uncertaintyPx,
    projectedPx: best.projectedPx,
    overY: best.overY,
    underY: best.underY,
    overRole: entry.over.role,
    underRole: entry.under.role,
  };
  if (!(best.overY < best.underY)) {
    return { ...measured, status: 'FAIL', reason: 'projected over strand is not closer to the camera than the under strand' };
  }
  if (!(best.residualPx <= limitPx)) {
    return { ...measured, status: 'FAIL', reason: 'crossing position residual exceeds one rope diameter' };
  }
  return { ...measured, status: 'PASS' };
}

/**
 * Crossings come only from annotation.crossings. Positions are not invented,
 * and the list is not copied into visible polylines.
 */
export function evaluateCrossings({ annotation, camera, points = null, labels = null, materialArc = null } = {}) {
  if (!annotation || !Array.isArray(annotation.crossings)) {
    return { status: 'UNVERIFIED', reason: LEGACY_CROSSING_REASON, crossings: [] };
  }
  const listed = annotation.crossings;
  const explicit = listed.filter(explicitCrossing);
  if (explicit.length === 0) {
    return {
      status: 'UNVERIFIED',
      reason: LEGACY_CROSSING_REASON,
      crossings: listed.map((entry, index) => ({
        id: typeof entry?.id === 'string' && entry.id ? entry.id : `crossing-${index}`,
        bindingStatus: entry?.bindingStatus ?? 'missing',
        explicit: false,
        status: 'UNVERIFIED',
      })),
    };
  }
  if (!Array.isArray(points) || points.length < 2) {
    return {
      status: 'UNVERIFIED',
      reason: 'reviewed crossings require the rope centerline; no segments were supplied',
      crossings: listed.map((entry, index) => ({
        id: typeof entry?.id === 'string' && entry.id ? entry.id : `crossing-${index}`,
        bindingStatus: entry?.bindingStatus ?? 'missing',
        explicit: explicitCrossing(entry),
        status: 'UNVERIFIED',
      })),
    };
  }
  validateCamera(camera);
  const crossings = listed.map((entry, index) => measureCrossing(entry, index, { points, labels, materialArc, annotation, camera }));
  let status = 'PASS';
  if (crossings.some((item) => item.status === 'FAIL')) status = 'FAIL';
  else if (crossings.some((item) => item.status !== 'PASS')) status = 'UNVERIFIED';
  return { status, crossings, thresholdPx: annotation.nominalVisibleRopeDiameterPx };
}

function resolveCrossingPose(annotation, perRole, camera, context) {
  if (Array.isArray(annotation?.crossings)) {
    return evaluateCrossings({
      annotation,
      camera,
      points: context?.points,
      labels: context?.labels,
      materialArc: context?.materialArc,
    });
  }
  return buildCrossingPose(annotation, perRole);
}

export function scorePose(worldByTargetId, annotation, camera, context = undefined) {
  validateCamera(camera);
  const ann = validateAnnotation(annotation);
  if (worldByTargetId && typeof worldByTargetId === 'object') {
    const allowed = new Set(ann.visiblePolylines.map((pl) => pl.id));
    for (const key of Object.keys(worldByTargetId)) {
      if (!allowed.has(key)) {
        throw new Error(`worldByTargetId contains unexpected target "${key}"; only explicit annotation ids are allowed`);
      }
    }
  }
  const diameterPx = ann.nominalVisibleRopeDiameterPx;
  const threshold =
    ann.acceptance?.visibleCenterlineRmsInDiameters ?? 1;

  const targets = listAnnotationTargets(annotation);
  const perRole = {};
  const allDists = [];
  let allRequiredRolesPresent = true;
  let anyMissing = false;

  for (const target of targets) {
    const worldPoly = worldByTargetId?.[target.id];
    if (!worldPoly) {
      anyMissing = true;
      allRequiredRolesPresent = false;
      perRole[target.id] = {
        kind: target.kind,
        status: 'UNVERIFIED',
        reason: 'missing world span for explicit annotation target',
      };
      continue;
    }
    try {
      for (let i = 0; i < worldPoly.length; i++) assertFinitePoint3(worldPoly[i], `worldByTargetId["${target.id}"][${i}]`);
      if (worldPoly.length < 2) throw new Error('too few points');
      const projected = projectPolyline(worldPoly, camera);
      const dists = symmetricPolylineResidualPx(target.points, projected, SCORE_ARC_FRACTIONS);
      const { rmsPx, maxPx } = summarizeDists(dists);
      const rmsInDiameters = rmsPx / diameterPx;
      const rolePass = rmsInDiameters <= threshold;
      perRole[target.id] = {
        kind: target.kind,
        status: rolePass ? 'PASS' : 'FAIL',
        rmsPx,
        maxPx,
        rmsInDiameters,
      };
      allDists.push(...dists);
    } catch (err) {
      perRole[target.id] = {
        kind: target.kind,
        status: 'UNVERIFIED',
        reason: err.message,
      };
      allRequiredRolesPresent = false;
    }
  }

  if (anyMissing) {
    return {
      status: 'UNVERIFIED',
      rmsPx: null,
      maxPx: null,
      rmsInDiameters: null,
      perRole,
      allRequiredRolesPresent: false,
      centerlinePose: {
        status: 'UNVERIFIED',
        reason: 'one or more centerline spans missing in worldByTargetId',
      },
      crossingPose: resolveCrossingPose(annotation, perRole, camera, context),
    };
  }

  const { rmsPx, maxPx } = summarizeDists(allDists);
  const rmsInDiameters = rmsPx / diameterPx;
  const centerlineIds = targets.filter((t) => t.kind === 'centerline').map((t) => t.id);
  const centerlineStatuses = centerlineIds.map((id) => perRole[id]?.status);
  const centerlinePass =
    centerlineIds.length > 0 && centerlineStatuses.every((s) => s === 'PASS');

  const status = rmsInDiameters <= threshold && centerlinePass ? 'PASS' : 'FAIL';

  return {
    status,
    rmsPx,
    maxPx,
    rmsInDiameters,
    perRole,
    allRequiredRolesPresent,
    centerlinePose: {
      status: centerlinePass ? 'PASS' : 'FAIL',
      rmsPx,
      maxPx,
      rmsInDiameters,
      targetIds: centerlineIds,
    },
    crossingPose: resolveCrossingPose(annotation, perRole, camera, context),
  };
}

function buildCrossingPose(annotation, perRole) {
  const crossings = crossingTargets(annotation);
  if (crossings.length === 0) {
    return {
      status: 'UNVERIFIED',
      reason: 'annotation contains no explicit crossing targets; camera fit cannot certify topology',
    };
  }
  const allPass = crossings.every((t) => perRole[t.id]?.status === 'PASS');
  return {
    status: allPass ? 'PASS' : 'FAIL',
    targetIds: crossings.map((t) => t.id),
  };
}
