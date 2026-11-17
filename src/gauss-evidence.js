import { inspectGaussReview } from './extended-gauss.js';
import { diagnoseMaterialGraph, validateMaterialTopology } from './material-topology.js';

// Authoritative Phase 4B observation statuses. CONFIRMED is not in this set.
const RECORD_STATUS = new Set(['SUPPORTED', 'OBSERVED']);

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

function finalRecords(source) {
  const crossings = Array.isArray(source?.crossings) ? source.crossings : [];
  const finalCrossings = crossings.filter(c => c?.stateId === 'FINAL' && RECORD_STATUS.has(c?.status));
  const invalidFinal = crossings.filter(c => c?.stateId === 'FINAL' && !RECORD_STATUS.has(c?.status));
  const construction = crossings.filter(c => c && c.stateId && c.stateId !== 'FINAL');
  return { finalCrossings, invalidFinal, construction };
}

function materialOrderVisits(finalCrossings) {
  const rows = [];
  for (const crossing of finalCrossings) {
    if (!Array.isArray(crossing.visits)) return { ok: false, visits: [] };
    for (const visit of crossing.visits) {
      if (!Number.isInteger(visit?.materialOrdinal)) return { ok: false, visits: [] };
      rows.push({ crossingId: crossing.id, side: visit.overUnder, materialOrdinal: visit.materialOrdinal });
    }
  }
  if (new Set(rows.map(v => v.materialOrdinal)).size !== rows.length) return { ok: false, visits: [] };
  rows.sort((a, b) => a.materialOrdinal - b.materialOrdinal);
  return { ok: true, visits: rows.map(({ crossingId, side }) => ({ crossingId, side })) };
}

// Structural gate. Review flags and a nonempty path array are not evidence.
// Writhe must be explicitly supplied by a future reviewed FINAL ledger.
export function auditSomervilleReadiness(source, candidate) {
  const problems = [];
  if(source?.schemaVersion!==2 || source?.id!=='somerville-phase4b') problems.push('Expected the authoritative Phase 4B ledger');
  let inventory = null;
  if (!source || typeof source !== 'object' || Array.isArray(source)) problems.push('Malformed source ledger');
  else {
    try { inventory = validateMaterialTopology(source); }
    catch (error) { problems.push('Malformed source ledger: ' + (error?.message ?? 'validation failed')); }
  }
  if (inventory && !inventory.inventoryValid) problems.push('Material inventory invalid: ' + inventory.errors.join('; '));
  if (!inventory?.completeMaterialPath) problems.push('No complete evidenced FINAL E0->E1 material path');
  if(inventory?.referenceStatus!=='REFERENCE_SUPPORTED_BY_RECORDED_REVIEW' || source?.review?.humanApproved!==true)
    problems.push('Complete source correspondence has not been approved in the recorded review');

  const finalState = Array.isArray(source?.states) ? source.states.find(s => s?.id === 'FINAL') : null;
  let graph = null;
  if (!finalState) problems.push('No FINAL observation state');
  else {
    if(JSON.stringify(finalState.endpoints)!==JSON.stringify(['E0','E1'])) problems.push('Source path orientation must be E0 -> E1');
    try { graph = diagnoseMaterialGraph(finalState); }
    catch { problems.push('Malformed FINAL material graph'); }
    if (graph && !graph.complete) problems.push('FINAL material graph is not a single E0->E1 path');
  }

  const column = source?.column;
  if (column?.status === 'CONFIRMED') problems.push('Column status CONFIRMED is not authoritative; expected SUPPORTED or OBSERVED');
  if (!RECORD_STATUS.has(column?.status) || ![1, -1].includes(column?.materialWindingSign)) problems.push('Signed column winding unresolved');

  const gaps = source?.unknownConnections;
  if (!Array.isArray(gaps)) problems.push('No unknownConnections inventory');
  else for (const gap of gaps) problems.push('Unresolved observation: ' + gap?.id);

  const { finalCrossings, invalidFinal, construction } = finalRecords(source);
  if (invalidFinal.length) problems.push('FINAL crossing status must be SUPPORTED or OBSERVED');

  let gauss = { exportable: false, errors: ['Malformed Gauss candidate'], blockers: [] };
  try { gauss = inspectGaussReview(candidate); }
  catch (error) { gauss = { exportable: false, errors: [error?.message ?? 'Malformed Gauss candidate'], blockers: [] }; }
  if (!gauss.exportable) {
    for (const item of gauss.errors ?? []) problems.push('Gauss: ' + item);
    for (const item of gauss.blockers ?? []) problems.push('Gauss: ' + item);
  }
  bindCandidate(candidate, finalCrossings, construction, problems);

  return {
    ready: problems.length === 0,
    problems,
    inventoryValid: inventory?.inventoryValid === true,
    completeMaterialPath: inventory?.completeMaterialPath === true,
    referenceStatus: inventory?.referenceStatus ?? 'INCOMPLETE',
    topologyVerified: false,
    writheBoundToSource: finalCrossings.length>0 && finalCrossings.every(c=>[1,-1].includes(c.writhe)) && !problems.length,
    finalFragmentCount: finalState?.segments?.length ?? 0,
    verifiedFinalCrossingRecords: finalCrossings.length,
    constructionCrossingsExcluded: construction.map(c => c.id),
    unknownConnectionGroups: Array.isArray(gaps) ? gaps.length : null,
    graphComplete: graph?.complete === true,
    gaussExportable: gauss.exportable === true,
    note: 'Structural readiness only. ready checks recorded source correspondence, not whether that interpretation of the photograph is true. No knot identity theorem is asserted.'
  };
}

function bindCandidate(candidate, finalCrossings, construction, problems) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !Array.isArray(candidate.crossings) || !Array.isArray(candidate.visits)) {
    problems.push('Malformed Gauss candidate');
    return;
  }
  const authoritative = new Set(finalCrossings.map(c => c.id));
  const constructionIds = new Set(construction.map(c => c.id));
  const seen = new Set();
  for (const crossing of candidate.crossings) {
    const id = crossing?.id;
    if (typeof id !== 'string' || !id || seen.has(id)) {
      problems.push('Malformed or duplicate candidate crossing');
      continue;
    }
    seen.add(id);
    if (constructionIds.has(id)) problems.push('Construction-only crossing is not a FINAL record: ' + id);
    else if (!authoritative.has(id)) problems.push('Extra crossing is not an authoritative FINAL record: ' + id);
  }
  for (const id of authoritative) if (!seen.has(id)) problems.push('Missing authoritative FINAL crossing: ' + id);

  const ordered = materialOrderVisits(finalCrossings);
  const actual = candidate.visits.map(v => ({ crossingId: v?.crossingId, side: v?.side }));
  if (!ordered.ok || JSON.stringify(actual) !== JSON.stringify(ordered.visits))
    problems.push('Candidate over/under visits do not follow authoritative FINAL material order');

  const byId = new Map(finalCrossings.map(c => [c.id, c]));
  for (const crossing of candidate.crossings) {
    const record = byId.get(crossing?.id);
    if (!record) continue;
    if(![1,-1].includes(record.writhe) || record.writhe!==crossing.writhe)
      problems.push(crossing.id+': source writhe missing or mismatched');
    const recorded = Array.isArray(record.evidence) ? record.evidence : [];
    const cited = Array.isArray(crossing.evidenceIds) ? crossing.evidenceIds : null;
    if (!cited || !sameIds(cited, recorded)) problems.push((crossing.id ?? 'crossing') + ': candidate evidence does not match the authoritative FINAL record');
  }
}
