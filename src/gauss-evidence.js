import { inspectGaussReview } from './extended-gauss.js';

// A source-ledger gate: rejects a reassuring-looking Gauss export while the
// authoritative Phase 4B observations still have missing physical continuity.
export function auditSomervilleReadiness(source, candidate) {
  const problems=[];
  if (source?.schemaVersion !== 2 || source?.id !== 'somerville-phase4b')
    problems.push('Expected the Phase 4B authoritative source ledger');
  const finalState=source?.states?.find(s=>s.id==='FINAL');
  if (!finalState) problems.push('No FINAL observation state');
  if (!Array.isArray(finalState?.orderedMaterialPath) || !finalState.orderedMaterialPath.length)
    problems.push('No evidenced FINAL E0->E1 ordered material path');
  if (finalState?.crossingInventoryComplete !== true)
    problems.push('FINAL crossing inventory incomplete');
  if (source?.review?.completeMaterialPathSupported !== true || source?.review?.humanApproved !== true)
    problems.push('Phase 4B has not approved the complete material path');
  if (source?.column?.status !== 'CONFIRMED' || ![1,-1].includes(source?.column?.materialWindingSign))
    problems.push('Signed column winding unresolved');
  const gaps = source?.unknownConnections;
  if (!Array.isArray(gaps)) problems.push('No unknownConnections inventory');
  else for (const gap of gaps) problems.push('Unresolved observation: '+gap.id);

  const observedFinalCrossings = (source?.crossings ?? []).filter(c=>c.stateId==='FINAL');
  const constructionCrossings = (source?.crossings ?? []).filter(c=>c.stateId!=='FINAL');
  const gauss=inspectGaussReview(candidate);
  if (!gauss.exportable) problems.push(...gauss.errors.map(s=>'Gauss: '+s), ...gauss.blockers.map(s=>'Gauss: '+s));

  return {
    ready:problems.length===0,
    problems,
    finalFragmentCount:finalState?.segments?.length??0,
    verifiedFinalCrossingRecords:observedFinalCrossings.filter(c=>c.status==='CONFIRMED').length,
    constructionCrossingsExcluded:constructionCrossings.map(c=>c.id),
    unknownConnectionGroups:gaps?.length??null,
    gaussExportable:gauss.exportable,
    note:'Structural readiness gate only. It cannot prove a source interpretation is visually correct.'
  };
}
