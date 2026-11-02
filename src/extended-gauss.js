// Interchange for Knoto-ID's spherical/open Extended Gauss format.
// Crossing labels are in first-encounter order along the physical E0 -> E1 rope.
// Positive visit = over, negative visit = under. The terminal +/- characters
// are crossing writhe signs, NOT the over/under visit signs.
// This module validates DATA CONSISTENCY, never historical/source truth.
const SIDE = new Set(['over', 'under']);

export function inspectGaussReview(review) {
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return { valid: false, exportable: false, errors: ['Expected review object'] };
  }
  if (review.schemaVersion !== 1) errors.push('Unsupported schemaVersion');
  if (review.projection !== 'sphere') errors.push('Only spherical/open EGC export is implemented');
  if (!['PENDING_REVIEW', 'SOURCE_VERIFIED'].includes(review.status)) errors.push('Invalid status');
  const path = review.materialPath;
  if (path?.from !== 'E0' || path?.to !== 'E1') errors.push('Physical material path must be E0 -> E1');
  if (typeof path?.complete !== 'boolean') errors.push('materialPath.complete must be boolean');
  if (typeof review.crossingInventoryComplete !== 'boolean') errors.push('crossingInventoryComplete must be boolean');
  if (!Array.isArray(review.crossings) || !Array.isArray(review.visits)) {
    errors.push('Expected crossings and visits arrays');
    return { valid: false, exportable: false, errors };
  }
  const crosses = new Map();
  for (const cross of review.crossings) {
    if (!cross || typeof cross.id !== 'string' || !cross.id) {
      errors.push('Crossing must have an ID');
      continue;
    }
    if (crosses.has(cross.id)) errors.push('Duplicate crossing: ' + cross.id);
    if (![1, -1, null].includes(cross.writhe)) errors.push(cross.id + ': writhe must be +1, -1, or null');
    if (!['PENDING_REVIEW', 'SOURCE_VERIFIED'].includes(cross.status)) errors.push(cross.id + ': invalid crossing status');
    if (!Array.isArray(cross.evidenceIds)) errors.push(cross.id + ': missing evidenceIds');
    else if (cross.status === 'SOURCE_VERIFIED' && !cross.evidenceIds.length) errors.push(cross.id + ': verified crossing needs evidence');
    crosses.set(cross.id, []);
  }
  const firstEncounter = [];
  for (const visit of review.visits) {
    if (!visit || !crosses.has(visit.crossingId)) {
      errors.push('Visit references unknown crossing');
      continue;
    }
    if (!SIDE.has(visit.side)) errors.push(visit.crossingId + ': visit must be over or under');
    if (crosses.get(visit.crossingId).length === 0) firstEncounter.push(visit.crossingId);
    crosses.get(visit.crossingId).push(visit.side);
  }
  for (const [id, sides] of crosses) {
    if (sides.length > 2) errors.push(id + ': more than two passes');
    if (sides.length === 2 && (!sides.includes('over') || !sides.includes('under')))
      errors.push(id + ': crossing must have one over and one under passage');
  }
  const complete = path?.complete === true && review.crossingInventoryComplete === true;
  const verified = review.status === 'SOURCE_VERIFIED' &&
    review.crossings.every(c => c.status === 'SOURCE_VERIFIED' && [1, -1].includes(c.writhe)) &&
    [...crosses.values()].every(sides => sides.length === 2) &&
    firstEncounter.length === review.crossings.length;
  const exportable = errors.length === 0 && complete && verified;
  const blockers = [];
  if (!complete) blockers.push('Incomplete E0->E1 material path or final crossing inventory');
  if (!verified) blockers.push('Unsigned, unvisited, or unverified crossings');
  return { valid: errors.length === 0, exportable, errors, blockers, crossingCount: crosses.size,
    visitCount: review.visits.length };
}

export function toKnotoIdExtendedGauss(review) {
  const gate = inspectGaussReview(review);
  if (!gate.exportable) throw new Error('EGC export blocked: ' + [...gate.errors, ...gate.blockers].join('; '));
  if (review.crossings.length === 0) return 'empty_diagram\n';
  const byId = new Map();
  for (const visit of review.visits) {
    if (!byId.has(visit.crossingId)) byId.set(visit.crossingId, byId.size + 1);
  }
  const visits = review.visits.map(v =>
    (v.side === 'under' ? '-' : '') + byId.get(v.crossingId)).join(' ');
  const signs = [...byId].map(([id]) =>
    review.crossings.find(c => c.id === id).writhe === 1 ? '+' : '-').join('');
  return visits + ' ' + signs + '\n';
}

// Geometry interchange for Knoto-ID; never a topological certification.
export function toKnotoIdXyz(metricDocument, ropeIndex = 0) {
  if (metricDocument?.units !== 'm') throw new Error('Expected metric geometry in metres');
  const points = metricDocument?.ropes?.[ropeIndex]?.points;
  if (!Array.isArray(points) || points.length < 2 ||
      points.some(p => !Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x))))
    throw new Error('Expected finite, ordered 3D rope centerline points');
  return points.map(p => p.join(' ')).join('\n') + '\n';
}
