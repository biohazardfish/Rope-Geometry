// Numerical acceptance, separate from source interpretation and file existence.
// Legacy status/checks keep their previous meanings. Static reconstruction, motion
// continuity, and construction correspondence are additional and independent.

const STATIC_REQUIREMENTS = Object.freeze([
  'tubeGeometry',
  'operations',
  'scale',
  'materialLength',
  'segmentLengths',
  'positiveClearance',
  'centerlinePose',
  'crossingPose',
  'noUnexplainedVisibleRope',
  'operationSourceCorrespondence',
]);

const LENGTH_PX_TOLERANCE = 1e-3;

function finite(value) {
  return Number.isFinite(value);
}

function noUnexplained(unexplainedVisible) {
  if (!unexplainedVisible) return false;
  if (finite(unexplainedVisible.lengthPx)) return unexplainedVisible.lengthPx <= LENGTH_PX_TOLERANCE;
  return unexplainedVisible.count === 0;
}

function clearancePasses(clearance, targetGap, epsilon) {
  return finite(clearance?.minimumNonlocalGap)
    && clearance.minimumNonlocalGap >= targetGap - epsilon
    && finite(clearance?.minimumColumnGap)
    && clearance.minimumColumnGap >= targetGap - epsilon
    && clearance.penetratingPairs === 0;
}

function assessScale(scale) {
  if (!scale || scale.status === 'UNCALIBRATED') {
    return { status: 'UNCALIBRATED', reason: 'no admissible scale calibration; an uncalibrated fit cannot pass' };
  }
  const ppm = scale.constrainedPixelsPerMetre;
  const min = scale.minPixelsPerMetre;
  const max = scale.maxPixelsPerMetre;
  const diameter = scale.diameterMetres;
  if (!finite(ppm) || !finite(min) || !finite(max) || !finite(diameter) || min <= 0 || max <= 0 || diameter <= 0 || min > max) {
    return { status: 'FAIL', reason: 'scale calibration is malformed' };
  }
  if (ppm < min || ppm > max || scale.status === 'FAIL' || scale.status === 'MALFORMED') {
    return {
      status: 'FAIL',
      reason: scale.reason ?? 'actual camera scale is outside the admissible range',
      constrainedPixelsPerMetre: ppm,
      minPixelsPerMetre: min,
      maxPixelsPerMetre: max,
    };
  }
  if (scale.status !== 'PASS') {
    return { status: 'UNVERIFIED', reason: 'scale check was not independently passed' };
  }
  return {
    status: 'PASS',
    unconstrainedPixelsPerMetre: scale.unconstrainedPixelsPerMetre,
    constrainedPixelsPerMetre: finite(scale.constrainedPixelsPerMetre) ? scale.constrainedPixelsPerMetre : null,
    minPixelsPerMetre: min,
    maxPixelsPerMetre: max,
    diameterMetres: diameter,
    clamped: scale.clamped === true,
  };
}

function assessConstruction(construction) {
  if (!construction || construction.reviewed !== true) {
    return { status: 'UNVERIFIED', claims: [], reason: 'operation source correspondence is not a reviewed record' };
  }
  if (!Array.isArray(construction.claims) || construction.claims.length === 0) {
    return { status: 'UNVERIFIED', claims: [], reason: 'reviewed correspondence contains no source claims' };
  }
  for (const claim of construction.claims) {
    if (!claim || typeof claim !== 'object') return { status: 'FAIL', claims: [], reason: 'source claim is not a record' };
    if (typeof claim.source !== 'string' || !claim.source.trim()) return { status: 'FAIL', claims: [], reason: 'source claim lacks a source' };
    if (typeof claim.statement !== 'string' || !claim.statement.trim()) return { status: 'FAIL', claims: [], reason: 'source claim lacks a statement' };
  }
  if (construction.status === 'FAIL') {
    return { status: 'FAIL', claims: construction.claims, reason: construction.reason ?? 'correspondence failed' };
  }
  if (construction.status !== 'PASS') {
    return { status: 'UNVERIFIED', claims: construction.claims, reason: 'correspondence was not marked PASS by its source record' };
  }
  return { status: 'PASS', claims: construction.claims };
}

function assessMotion(motion) {
  const rejected = { endpointAgreementIsPass: false };
  if (!motion || typeof motion !== 'object') {
    return { ...rejected, status: 'UNVERIFIED', basis: null, reason: 'continuous motion was not supplied; endpoints do not certify a sweep' };
  }
  const basis = motion.basis ?? null;
  if (basis === 'endpoints' || basis === 'endpoint' || motion.endpointsOnly === true || !Array.isArray(motion.samples) || motion.samples.length < 3) {
    return { ...rejected, status: 'UNVERIFIED', basis, reason: 'endpoint states do not certify continuous motion' };
  }
  if (motion.status === 'FAIL') return { ...rejected, status: 'FAIL', basis, reason: motion.reason ?? 'motion check failed' };
  if (motion.status === 'PASS' && motion.verified === true && (basis === 'continuous-sweep' || basis === 'swept-tube')) {
    return { ...rejected, status: 'PASS', basis, samples: motion.samples.length };
  }
  return { ...rejected, status: 'UNVERIFIED', basis, reason: 'motion evidence is not a verified continuous sweep' };
}

function namedStatus(value) {
  return value === 'PASS' || value === 'FAIL' || value === 'UNVERIFIED' ? value : 'UNVERIFIED';
}

function rollup(parts) {
  if (parts.every((part) => part === 'PASS')) return 'PASS';
  if (parts.some((part) => part === 'FAIL')) return 'FAIL';
  return 'UNVERIFIED';
}

export function evaluateAcceptance({
  tube,
  operations,
  pose,
  unexplainedVisible,
  clearance,
  material,
  lineage,
  scale,
  construction,
  motion,
  targetGap = 0.0002,
  epsilon = 1e-6,
} = {}) {
  const checks = {
    tubeGeometry: tube?.valid === true,
    operations: operations?.valid === true,
    centerlinePose: pose?.centerlinePose?.status === 'PASS',
    crossingPose: pose?.crossingPose?.status === 'PASS',
    noUnexplainedVisibleRope: noUnexplained(unexplainedVisible),
    materialLength: finite(material?.lengthChange) && Math.abs(material.lengthChange) <= epsilon,
    segmentLengths: finite(material?.maxSegmentStretch) && material.maxSegmentStretch <= epsilon,
    positiveClearance: clearancePasses(clearance, targetGap, epsilon),
    materialLineage: ['PASS', 'REFERENCE_PRESERVED'].includes(lineage?.status) && lineage?.referenceId != null,
    continuousMotion: lineage?.continuousMotion === 'PASS',
  };
  const scaleAssessment = assessScale(scale);
  const constructionAssessment = assessConstruction(construction);
  const motionContinuity = assessMotion(motion);
  const staticParts = {
    tubeGeometry: tube == null ? 'UNVERIFIED' : (tube.valid === true ? 'PASS' : 'FAIL'),
    operations: operations == null ? 'UNVERIFIED' : (operations.valid === true ? 'PASS' : 'FAIL'),
    scale: scaleAssessment.status === 'UNCALIBRATED' ? 'UNVERIFIED' : scaleAssessment.status,
    materialLength: !finite(material?.lengthChange) ? 'UNVERIFIED' : (
      Math.abs(material.lengthChange)<=epsilon &&
      (material.requiredTotalLength===undefined ||
        finite(material.totalLengthResidual)&&Math.abs(material.totalLengthResidual)<=epsilon&&
        finite(material.materialTotalResidual)&&Math.abs(material.materialTotalResidual)<=epsilon)
      ? 'PASS' : 'FAIL'),
    segmentLengths: !finite(material?.maxSegmentStretch) ? 'UNVERIFIED' : (material.maxSegmentStretch <= epsilon ? 'PASS' : 'FAIL'),
    positiveClearance: clearance == null ? 'UNVERIFIED' : (clearancePasses(clearance, targetGap, epsilon) ? 'PASS' : (finite(clearance.minimumNonlocalGap) && finite(clearance.minimumColumnGap) && finite(clearance.penetratingPairs) ? 'FAIL' : 'UNVERIFIED')),
    centerlinePose: namedStatus(pose?.centerlinePose?.status),
    crossingPose: namedStatus(pose?.crossingPose?.status),
    noUnexplainedVisibleRope: unexplainedVisible == null
      ? 'UNVERIFIED'
      : (noUnexplained(unexplainedVisible) ? 'PASS' : 'FAIL'),
    operationSourceCorrespondence: constructionAssessment.status,
  };
  const staticReconstruction = {
    status: rollup(STATIC_REQUIREMENTS.map((key) => staticParts[key])),
    checks: staticParts,
    scale: scaleAssessment,
    construction: constructionAssessment,
  };
  const constructionCorrespondence = {
    status: constructionAssessment.status,
    claims: constructionAssessment.claims,
    reason: constructionAssessment.reason ?? null,
    fabricatesSourceClaims: false,
  };
  return {
    status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    checks,
    targetGap,
    epsilon,
    scope: {
      legacyOverall: { id: 'legacy-overall', checks: Object.keys(checks) },
      staticReconstruction: { id: 'static-reconstruction', requires: STATIC_REQUIREMENTS },
      motionContinuity: { id: 'motion-continuity', independentOf: 'staticReconstruction', endpointAgreementIsPass: false },
      constructionCorrespondence: { id: 'construction-correspondence', fabricatesSourceClaims: false },
    },
    staticReconstruction,
    motionContinuity,
    constructionCorrespondence,
  };
}
