import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRopeState, materialResiduals } from '../src/rope-state.js';
import { checkTube, makeTube } from '../src/rope-tube.js';
import { evaluateAcceptance } from '../src/rope-acceptance.js';
import { fitPoseCamera, scorePose } from '../src/somerville-pose-fit.js';
import { correspondenceSpans, unexplainedVisible, worldByTargetId } from '../src/somerville-pose-targets.js';
import { seedClearance } from '../src/somerville-build.js';
import { validateOperations } from '../src/somerville-verify.js';

const LIMITATIONS = [
  'Named dressed candidate evaluation. This is not a finished knot.',
  'Historical final, continuation, and loose JSON files are not modified.',
  'Motion continuity is not inferred from endpoints or from a static pose.',
  'Unreviewed crossing bindings and an uncalibrated camera cannot pass.',
];
const REQUIRED_TOTAL_LENGTH=7.138936637394829;

const PROTECTED = [
  'data/somerville-final/final.json',
  'data/somerville-final/loose.json',
  'data/somerville-final/loose-v2.json',
  'data/somerville-final/loose-v3.json',
  'data/somerville-final/continuation.json',
  'data/somerville-final/pose-videoTight-history.json',
  'data/somerville-pose148.json',
  'reports/somerville-final-report.json',
  'reports/somerville-final-timing.json',
  'reports/somerville-continuation.json',
  'reports/somerville-videoTight-history.json',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readOptional(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function preferResidual(previous, current) {
  const prev = Number.isFinite(previous?.rmsPx) ? previous : null;
  const cur = Number.isFinite(current?.rmsPx) ? current : null;
  if (!prev) return { source: cur ? 'current-candidate' : 'none', rmsPx: cur?.rmsPx ?? null, pose: cur };
  if (!cur || !(cur.rmsPx <= prev.rmsPx)) return { source: 'previous-report', rmsPx: prev.rmsPx, pose: prev };
  return { source: 'current-candidate', rmsPx: cur.rmsPx, pose: cur };
}

function assertWritable(path) {
  const normalized = resolve(path);
  if (PROTECTED.some((file) => resolve(file) === normalized)) {
    throw new Error(`refusing to overwrite ${path}`);
  }
}

function documentedSweep(motion) {
  const basis = motion?.basis;
  return motion?.status === 'PASS'
    && motion.verified === true
    && (basis === 'continuous-sweep' || basis === 'swept-tube')
    && motion.endpointsOnly !== true
    && Array.isArray(motion.samples)
    && motion.samples.length >= 3;
}

function readStoredMaterial(doc) {
  const points = doc?.ropes?.[0]?.points;
  if (!Array.isArray(points)) return null;
  const stored = doc.somerville?.material;
  if (Array.isArray(stored?.s0) && stored.s0.length === points.length) {
    return { s0: stored.s0, referenceId: stored.referenceId ?? null, source: 'candidate.somerville.material.s0' };
  }
  if (Array.isArray(doc.somerville?.materialArc) && doc.somerville.materialArc.length === points.length) {
    return { s0: doc.somerville.materialArc, referenceId: stored?.referenceId ?? null, source: 'candidate.somerville.materialArc' };
  }
  return null;
}

function resolveMaterial(candidate, seed, seedPath) {
  const own = readStoredMaterial(candidate);
  if (own) return { ...own, seedPath: seedPath ?? null, seedPointCount: seed?.ropes?.[0]?.points?.length ?? null, matchedSeedPointCount: false };
  const seedMaterial = readStoredMaterial(seed);
  const candidateCount = candidate?.ropes?.[0]?.points?.length ?? null;
  if (seedMaterial && candidateCount === seedMaterial.s0.length) {
    return { ...seedMaterial, source: `static-seed:${seedPath}`, seedPath, seedPointCount: seedMaterial.s0.length, matchedSeedPointCount: true };
  }
  return {
    s0: null,
    referenceId: null,
    source: null,
    seedPath: seedPath ?? null,
    seedPointCount: seed?.ropes?.[0]?.points?.length ?? null,
    candidatePointCount: candidateCount,
    matchedSeedPointCount: false,
    reason: 'static seed material coordinates do not match this candidate; point count was not borrowed from another rope',
  };
}

function findSeed(seedPaths) {
  for (const path of seedPaths) {
    if (existsSync(path)) return path;
  }
  return null;
}

function safe(label, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: `${label}: ${error.message}` };
  }
}

function guessCamera(annotation) {
  const guess = annotation?.cameraInitialGuess ?? {};
  return {
    projection: 'orthographic',
    pixelsPerMetre: Number.isFinite(guess.pixelsPerMetre) ? guess.pixelsPerMetre : 5000,
    originPixel: Array.isArray(guess.originPixel) ? guess.originPixel : [0, 0],
    rollRadians: Number.isFinite(guess.rollRadians) ? guess.rollRadians : 0,
  };
}

function unavailableReport(paths, previous, reason) {
  const best = preferResidual(previous?.pose ?? previous?.bestResidual?.pose, null);
  return {
    finishedKnot: false,
    designation: 'named dressed candidate',
    status: 'FAIL',
    checks: null,
    staticReconstruction: { status: 'UNVERIFIED', reason },
    motionContinuity: { status: 'UNVERIFIED', reason: 'continuous motion was not supplied; endpoints do not certify a sweep', endpointAgreementIsPass: false },
    constructionCorrespondence: { status: 'UNVERIFIED', claims: [], fabricatesSourceClaims: false },
    pose: null,
    bestResidual: best,
    scale: { status: 'UNCALIBRATED' },
    limitations: LIMITATIONS,
    candidatePath: paths.candidatePath,
    historicalFinalPreserved: true,
    v2PointCountAssumed: false,
  };
}

function buildReport(paths, previous) {
  if (!existsSync(paths.candidatePath)) return unavailableReport(paths, previous, 'dressed candidate file is not available');
  const candidateBytes = readFileSync(paths.candidatePath);
  const candidate = JSON.parse(candidateBytes.toString('utf8'));
  const annotation = JSON.parse(readFileSync(paths.annotationPath, 'utf8'));
  const seedPath = findSeed(paths.seedPaths);
  const seed = seedPath ? JSON.parse(readFileSync(seedPath, 'utf8')) : null;
  const rope = candidate.ropes?.[0];
  if (!rope?.points || !(rope.diameter > 0)) throw new Error('candidate needs one rope with a positive diameter');
  const materialInfo = resolveMaterial(candidate, seed, seedPath);
  let material = null;
  let materialError = materialInfo.reason ?? null;
  if (materialInfo.s0) {
    const labels = Array.isArray(rope.segmentLabels) && rope.segmentLabels.length === rope.points.length - 1 ? rope.segmentLabels : null;
    const stateResult = safe('material', () => createRopeState(rope.points, {
      diameter: rope.diameter,
      materialCoordinates: materialInfo.s0,
      labels,
      column: candidate.somerville?.column ?? null,
      referenceId: materialInfo.referenceId,
    }));
    if (stateResult.ok) {
      material=materialResiduals(stateResult.value);
      material.requiredTotalLength=REQUIRED_TOTAL_LENGTH;
      material.totalLengthResidual=material.geometryLength-REQUIRED_TOTAL_LENGTH;
      material.materialTotalResidual=material.referenceLength-REQUIRED_TOTAL_LENGTH;
    }
    else materialError = stateResult.error;
  }
  const referenceId = materialInfo.referenceId ?? (materialInfo.s0 ? sha256(JSON.stringify(materialInfo.s0)) : null);
  const motionRecord = candidate.somerville?.motion ?? null;
  const lineage = {
    status: materialInfo.s0 && referenceId ? 'REFERENCE_PRESERVED' : 'UNVERIFIED',
    referenceId,
    continuousMotion: documentedSweep(motionRecord) ? 'PASS' : 'UNVERIFIED',
    comparedToV2PointCount: false,
    materialSource: materialInfo.source,
    v2PointCountAssumed: false,
  };
  const spansResult = safe('correspondence', () => correspondenceSpans(candidate, annotation));
  const world = spansResult.ok ? worldByTargetId(rope.points, spansResult.value) : {};
  const fitResult = spansResult.ok ? safe('camera', () => fitPoseCamera(world, annotation)) : { ok: false, error: spansResult.error };
  const camera = fitResult.ok ? fitResult.value.camera : guessCamera(annotation);
  const scale = fitResult.ok ? fitResult.value.scale : { status: 'UNCALIBRATED', reason: fitResult.error ?? 'camera fit was not run' };
  scale.actualDiameterMetres=rope.diameter;
  if(scale.diameterMetres!=null&&Math.abs(scale.diameterMetres-rope.diameter)>1e-12){
    scale.status='FAIL';scale.reason='actual rope diameter differs from the frozen scale calibration';
  }
  const geometry = {
    points: rope.points,
    labels: rope.segmentLabels ?? candidate.somerville?.segmentRoles ?? null,
    materialArc: materialInfo.s0 ?? candidate.somerville?.materialArc ?? null,
  };
  const score = safe('pose', () => scorePose(world, annotation, camera, geometry));
  const pose = score.ok ? score.value : { status: 'UNVERIFIED', centerlinePose: { status: 'UNVERIFIED', reason: score.error }, crossingPose: { status: 'UNVERIFIED', reason: score.error }, error: score.error };
  const column = candidate.somerville?.column ?? null;
  const extraResult = safe('unexplained', () => unexplainedVisible(rope.points, geometry.labels, spansResult.ok ? spansResult.value : {}, annotation, camera, {
    columnRadius: column?.radius ?? 0,
    columnCenter: column?.center ?? [0, 0, 0],
    ropeDiameterMetres: rope.diameter,
    materialArc: geometry.materialArc,
  }));
  const extra = extraResult.ok ? extraResult.value : { count: null, lengthPx: null, error: extraResult.error };
  const tubeResult = safe('tube', () => checkTube(makeTube(rope.points, rope.diameter / 2), { column }));
  const clearanceResult = safe('clearance', () => seedClearance(candidate));
  const operationsResult = safe('operations', () => validateOperations(candidate, { scope: 'final' }));
  const acceptance = evaluateAcceptance({
    tube: tubeResult.ok ? tubeResult.value : null,
    operations: operationsResult.ok ? operationsResult.value : null,
    pose,
    unexplainedVisible: extraResult.ok ? extra : null,
    clearance: clearanceResult.ok ? clearanceResult.value : null,
    material,
    lineage,
    scale,
    construction: candidate.somerville?.constructionCorrespondence ?? null,
    motion: motionRecord,
  });
  const generatorPath = paths.generatorReportPath;
  const generator = generatorPath && existsSync(generatorPath) ? readOptional(generatorPath) : null;
  return {
    ...acceptance,
    finishedKnot: false,
    designation: 'named dressed candidate',
    lineage,
    material,
    materialError,
    materialPolicy: {
      source: materialInfo.source,
      seedPath,
      seedPointCount: materialInfo.seedPointCount ?? null,
      candidatePointCount: rope.points.length,
      matchedSeedPointCount: materialInfo.matchedSeedPointCount === true,
      v2PointCountAssumed: false,
    },
    correspondenceError: spansResult.ok ? null : spansResult.error,
    pose,
    bestResidual: preferResidual(null, pose),
    crossingPose: pose.crossingPose ?? null,
    camera,
    cameraSource: fitResult.ok ? 'constrained-similarity' : 'annotation-initial-guess',
    scale,
    unexplainedVisible: extraResult.ok ? {
      count: extra.count,
      lengthPx: extra.lengthPx,
      samplingResolutionPx: extra.samplingResolutionPx,
      maxDistancePx: extra.maxDistancePx,
      byRole: extra.byRole,
      lengthByRole: extra.lengthByRole,
      coreBoxExempt: extra.coreBoxExempt,
      spanExempt: extra.spanExempt,
    } : { error: extra.error },
    tube: tubeResult.ok ? tubeResult.value : { valid: false, error: tubeResult.error },
    clearance: clearanceResult.ok ? clearanceResult.value : { error: clearanceResult.error },
    operations: operationsResult.ok ? operationsResult.value : { valid: false, error: operationsResult.error },
    generatorReport: generator ? { path: generatorPath, claimedStatus: generator.status ?? null, accepted: false } : null,
    candidateSha256: sha256(candidateBytes),
    historicalFinalPreserved: true,
    v2PointCountAssumed: false,
    limitations: LIMITATIONS,
  };
}

function defaultPaths() {
  return {
    candidatePath: resolve('data/somerville-final/dressed-candidate.json'),
    seedPaths: [resolve('data/somerville-final/dressed-seed.json'), resolve('data/somerville-final/loose-v3.json')],
    annotationPath: resolve('data/somerville-pose148.json'),
    reportPath: resolve('reports/somerville-dressed-report.json'),
    metadataPath: resolve('reports/somerville-dressed-metadata.json'),
    generatorReportPath: resolve('reports/somerville-dressed-build.json'),
  };
}

export function evaluateSomervilleDressed(options = {}) {
  const defaults = defaultPaths();
  const paths = {
    candidatePath: resolve(options.candidatePath ?? defaults.candidatePath),
    seedPaths: (options.seedPaths ?? defaults.seedPaths).map((path) => resolve(path)),
    annotationPath: resolve(options.annotationPath ?? defaults.annotationPath),
    reportPath: resolve(options.reportPath ?? defaults.reportPath),
    metadataPath: resolve(options.metadataPath ?? defaults.metadataPath),
    generatorReportPath: resolve(options.generatorReportPath ?? defaults.generatorReportPath),
  };
  if (options.write !== false) {
    assertWritable(paths.reportPath);
    assertWritable(paths.metadataPath);
  }
  // Evaluation is a pure function of this candidate and annotation. Keep run-history
  // best-candidate selection outside this numerical report.
  const previous = null;
  let report;
  try {
    report = buildReport(paths, previous);
  } catch (error) {
    report = unavailableReport(paths, previous, error.message);
    report.error = error.message;
  }
  report.candidatePath = paths.candidatePath;
  if (options.write !== false) {
    mkdirSync(dirname(paths.reportPath), { recursive: true });
    mkdirSync(dirname(paths.metadataPath), { recursive: true });
    writeFileSync(paths.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const metadata = {
      evaluatedAt: new Date().toISOString(),
      finishedKnot: false,
      designation: report.designation,
      candidatePath: paths.candidatePath,
      candidatePresent: existsSync(paths.candidatePath),
      candidateSha256: report.candidateSha256 ?? null,
      annotationPath: paths.annotationPath,
      reportPath: paths.reportPath,
      staticReconstruction: report.staticReconstruction?.status ?? null,
      motionContinuity: report.motionContinuity?.status ?? null,
      legacyStatus: report.status ?? null,
      bestResidualPx: report.bestResidual?.rmsPx ?? null,
      bestResidualSource: report.bestResidual?.source ?? null,
      materialSource: report.materialPolicy?.source ?? null,
      candidatePointCount: report.materialPolicy?.candidatePointCount ?? null,
      v2PointCountAssumed: false,
      overwroteHistoricalFinal: false,
      generatorClaimAccepted: false,
    };
    writeFileSync(paths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = evaluateSomervilleDressed();
  console.log(JSON.stringify({
    finishedKnot: report.finishedKnot,
    status: report.status,
    staticReconstruction: report.staticReconstruction?.status ?? null,
    motionContinuity: report.motionContinuity?.status ?? null,
    bestResidualPx: report.bestResidual?.rmsPx ?? null,
  }));
  if (report.staticReconstruction?.status !== 'PASS') process.exitCode = 2;
}
