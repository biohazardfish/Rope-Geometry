import { integrateCore, validateColumn, validateCore, validateUnderCuff } from './phase5-recovery.js';
import { verifyGeometry } from './verification.js';

const RECOVERY_COLUMN = { axis: 'X', center: [0, 0, 0], radius: 0.055, length: 0.36 };

function classify(pairs) {
  const groups = {};
  let cuffRoot = 0, connector = 0, other = 0;
  for (const pair of pairs) {
    const roles = pair.roles ?? ['unknown', 'unknown'];
    const key = [...roles].sort().join(' × ');
    groups[key] = (groups[key] ?? 0) + 1;
    const cuff = role => role.startsWith('cuff/');
    const iface = role => role.startsWith('interface-');
    const core = role => !cuff(role) && !iface(role);
    const [a, b] = roles;
    if ((cuff(a) && core(b)) || (cuff(b) && core(a))) cuffRoot++;
    else if (iface(a) || iface(b)) connector++;
    else other++;
  }
  return { cuffRoot, connector, other, groups };
}

// Decides whether a second integrated polyline may be emitted.
// The stage-4 core stays an engineering hypothesis. This function does not write geometry
// and does not promote either polyline to reference truth.
export function assessIntegratedRepair(core, cuff) {
  const local = validateCore(core);
  const under = validateUnderCuff(core, cuff);
  const column = validateColumn(core);
  const localVerification = verifyGeometry(core, { column: RECOVERY_COLUMN, factors: [1] });
  const signed = local.constraints.filter(item => item.satisfied !== null);
  const localSignedConstraintsHold = local.status === 'LOCAL_FIXTURE_VALID_TOPOLOGY_UNVERIFIED'
    && signed.length > 0
    && signed.every(item => item.satisfied)
    && under.satisfied === true
    && column.penetrations.length === 0
    && localVerification.valid === true
    && local.phase5Accepted === false
    && local.topologyVerified !== true;

  let integrated = null, whole = null, wholeVerification = null, failure = null;
  try {
    integrated = integrateCore(core, cuff);
    whole = validateCore(integrated);
    wholeVerification = verifyGeometry(integrated, { column: RECOVERY_COLUMN, factors: [1] });
  } catch (error) {
    failure = error?.message ?? 'Integration failed';
  }
  const penetrating = whole ? whole.pairs.filter(pair => pair.penetration > 1e-9) : [];
  const counts = classify(penetrating);
  const connectorOnlyWouldLeaveCuffRootContact = counts.cuffRoot > 0;
  const repairEmitted = false;
  const obstacle = {
    id: connectorOnlyWouldLeaveCuffRootContact ? 'frozen-cuff-intersects-frozen-root' : (failure ? 'integration-not-formed' : 'no-defensible-repair'),
    cuffRootPenetrations: counts.cuffRoot,
    connectorPenetrations: counts.connector,
    otherPenetrations: counts.other,
    groups: counts.groups,
    integrationError: failure,
    statement: failure
      ? 'No repaired candidate was emitted. The existing integrator refused to build a polyline: ' + failure
      : `No repaired integrated candidate was emitted. ${counts.cuffRoot} penetrating pairs are between unchanged cuff arcs and unchanged core segments, and ${counts.connector} involve the assumed interface connectors (${counts.other} in any other class). Editing only the connectors cannot separate those frozen arcs from the frozen roots. Clearing the contact would move preserved cuff coordinates, move the signed local root embedding, or choose a rear-cuff and endpoint permutation that the source ledger does not record. The local fixture is an engineering hypothesis and is not promoted.`
  };
  return {
    repairEmitted,
    referenceTruth: false,
    promotedToReference: false,
    engineeringHypothesis: 'stage-4-local-fixture-only',
    classification: 'ENGINEERING_HYPOTHESIS_NOT_PROMOTED',
    localSignedConstraintsHold,
    local: {
      status: local.status,
      phase5Accepted: local.phase5Accepted,
      topologyVerified: false,
      continuity: local.continuity,
      selfPenetrations: local.selfPenetrations,
      signed: signed.map(item => ({ id: item.id, satisfied: item.satisfied, referenceStatus: item.referenceStatus ?? null }))
    },
    underCuffSatisfied: under.satisfied === true,
    columnPenetrations: column.penetrations.length,
    whole: whole ? {
      status: whole.status,
      continuity: whole.continuity,
      selfPenetrations: whole.selfPenetrations,
      phase5Accepted: whole.phase5Accepted,
      topologyVerified: false,
      verificationAccepted: wholeVerification.valid === true
    } : null,
    obstacle
  };
}
