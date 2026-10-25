const STATUSES = new Set(['CONFIRMED', 'CONFIRMED_VISUAL', 'PENDING_REVIEW']);

export function validateSomervilleStructure(topology) {
  const errors = [];
  const unique = (items, label) => {
    const ids = items.map(item => item.id);
    if (new Set(ids).size !== ids.length) errors.push(`${label} IDs must be unique`);
    return new Set(ids);
  };
  if (!topology || topology.schemaVersion !== 1) return { valid: false, errors: ['schemaVersion must be 1'] };
  const objectIds = unique(topology.objects ?? [], 'object');
  const evidenceIds = unique(topology.evidence ?? [], 'evidence');
  const segmentIds = unique(topology.ropePath?.segments ?? [], 'rope segment');
  const nodeIds = unique(topology.ropePath?.nodes ?? [], 'path node');
  const crossingIds = unique(topology.crossings ?? [], 'crossing');
  const passageIds = unique(topology.passages ?? [], 'passage');
  const path = topology.ropePath;
  const segmentIdSet = new Set((path?.segments ?? []).map(segment => segment.id));
  unique(topology.relationships ?? [], 'relationship');

  if (!Array.isArray(path?.orderedSegments) || path.orderedSegments.length !== path.segments?.length || path.orderedSegments.some((id, i) => id !== path.segments[i].id)) {
    errors.push('orderedSegments must list each path segment once in stored traversal order');
  }
  if (path?.segments?.length) {
    const nodes = new Map(path.nodes.map(node => [node.id, node]));
    for (const segment of path.segments) {
      if (!nodes.has(segment.from) || !nodes.has(segment.to)) errors.push(`${segment.id} references an unknown route node`);
      if (!STATUSES.has(segment.referenceStatus)) errors.push(`${segment.id} has an invalid reference status`);
      if (!segment.evidence?.length || segment.evidence.some(id => !evidenceIds.has(id))) errors.push(`${segment.id} needs valid reference evidence`);
    }
    for (let i = 1; i < path.segments.length; i++) {
      if (path.segments[i - 1].to !== path.segments[i].from) errors.push(`rope path breaks between ${path.segments[i - 1].id} and ${path.segments[i].id}`);
    }
    const endpoints = path.nodes.filter(node => node.kind === 'endpoint').map(node => node.id);
    if (endpoints.length !== 2 || endpoints[0] !== path.segments[0].from || endpoints[1] !== path.segments.at(-1).to) errors.push('the physical rope path must have exactly two ordered endpoints');
    const foldCount = path.segments.filter(segment => segment.role === 'continuous-fold').length;
    if (foldCount !== 1 || !path.segments.some(segment => segment.role === 'continuous-fold' && segment.referenceStatus === 'CONFIRMED')) errors.push('the bight must be represented as one evidenced continuous fold');
    if (path.nodes.filter(node => node.kind === 'fold-entry' || node.kind === 'fold-exit').length !== 2) errors.push('the bight fold must have an entry and an exit on the same rope path');
    if (path.segments.some(segment => segment.from === segment.to)) errors.push('a rope path segment cannot create a branch or self-loop');
  }

  const relationships = new Map((topology.relationships ?? []).map(relationship => [relationship.id, relationship]));
  for (const relationship of topology.relationships ?? []) {
    if (!STATUSES.has(relationship.status)) errors.push(`${relationship.id} has an invalid status`);
    if (!relationship.evidence?.length || relationship.evidence.some(id => !evidenceIds.has(id))) errors.push(`${relationship.id} needs valid evidence references`);
    for (const id of relationship.participants ?? [relationship.from, relationship.to, relationship.over, relationship.under, relationship.moving, relationship.beneath, relationship.through, relationship.around].filter(Boolean)) {
      if (!objectIds.has(id) && !segmentIds.has(id)) errors.push(`${relationship.id} references unknown object or segment ${id}`);
    }
    if (relationship.kind === 'over-under' && relationship.status === 'CONFIRMED' && (!relationship.over || !relationship.under || relationship.over === relationship.under)) errors.push(`${relationship.id} needs one unambiguous over and under participant`);
  }
  for (const crossing of topology.crossings ?? []) {
    const relation = relationships.get(crossing.relationshipId);
    if (!relation) errors.push(`${crossing.id} references an unknown relationship`);
    if (!crossing.participants?.length || crossing.participants.some(id => !objectIds.has(id))) errors.push(`${crossing.id} references unknown crossing participants`);
    if (!crossing.ropePortions?.length || crossing.ropePortions.some(portion => !crossing.participants.includes(portion.objectId) || !portion.segmentIds?.length || portion.segmentIds.some(id => !segmentIdSet.has(id)) || !STATUSES.has(portion.status)) || new Set(crossing.ropePortions.map(portion => portion.objectId)).size !== crossing.participants.length) errors.push(`${crossing.id} must map each participant to valid rope-path segments and a review status`);
    if (!crossing.evidence?.length || crossing.evidence.some(id => !evidenceIds.has(id))) errors.push(`${crossing.id} needs valid evidence references`);
    if (crossing.status === 'CONFIRMED' && (!crossing.over || !crossing.under || crossing.over === crossing.under)) errors.push(`${crossing.id} needs an explicit over/under assignment`);
    if (crossing.status === 'PENDING_REVIEW' && (crossing.over !== null || crossing.under !== null)) errors.push(`${crossing.id} must not assert an over/under assignment while pending`);
  }
  const traversal = topology.crossingTraversalOrder ?? [];
  if (traversal.length !== crossingIds.size || new Set(traversal.map(item => item.crossingId)).size !== traversal.length || traversal.some(item => !crossingIds.has(item.crossingId))) errors.push('crossing traversal records must cover every crossing ID exactly once');
  for (const item of traversal) if (!STATUSES.has(item.status) || !item.evidence?.length || item.evidence.some(id => !evidenceIds.has(id))) errors.push(`${item.crossingId} traversal needs a valid status and reference evidence`);
  for (const passage of topology.passages ?? []) {
    if (!relationships.has(passage.relationshipId)) errors.push(`${passage.id} references an unknown relationship`);
    if (!passage.participants?.length || passage.participants.some(id => !objectIds.has(id))) errors.push(`${passage.id} references unknown passage participants`);
    if (!passage.evidence?.length || passage.evidence.some(id => !evidenceIds.has(id))) errors.push(`${passage.id} needs valid evidence references`);
  }

  const wraps = topology.columnWrapping;
  if (!objectIds.has(wraps?.objectId) || wraps.objectId !== 'column') errors.push('column wrapping must refer to the separate column object');
  if (wraps?.windingCount * 2 !== wraps?.strandCountAtCuff || wraps?.strandRuns?.length !== wraps?.strandCountAtCuff) errors.push('winding count and strand count are inconsistent for a doubled rope');
  if (!['CONFIRMED', 'PENDING_REVIEW'].includes(wraps?.direction?.status)) errors.push('wrap direction must be confirmed or explicitly pending');
  if (wraps?.evidence?.some(id => !evidenceIds.has(id))) errors.push('column wrapping references unknown evidence');

  for (const view of topology.views ?? []) {
    for (const element of view.elements ?? []) {
      if (element.entityId && !objectIds.has(element.entityId)) errors.push(`${view.id} references unknown object ${element.entityId}`);
      if (element.crossingId && !crossingIds.has(element.crossingId)) errors.push(`${view.id} references unknown crossing ${element.crossingId}`);
      if (element.passageId && !passageIds.has(element.passageId)) errors.push(`${view.id} references unknown passage ${element.passageId}`);
      if (element.segmentId && !segmentIds.has(element.segmentId)) errors.push(`${view.id} references unknown segment ${element.segmentId}`);
      for (const id of element.strandIds ?? []) if (!wraps.strandRuns.includes(id)) errors.push(`${view.id} references unknown strand ${id}`);
    }
  }
  const stages = topology.tutorialMilestones ?? [];
  unique(stages, 'milestone');
  if (stages.length !== 5) errors.push('exactly five evidence-grounded milestones are required');
  for (const stage of stages) for (const id of [...(stage.existingRelationships ?? []), ...(stage.newRelationships ?? [])]) if (!relationships.has(id)) errors.push(`${stage.id} references unknown relationship ${id}`);
  return { valid: errors.length === 0, errors, pathSegmentCount: path?.segments?.length ?? 0, physicalEndpointCount: path?.nodes?.filter(node => node.kind === 'endpoint').length ?? 0, crossingRecordCount: topology.crossings?.length ?? 0, crossingTraversalRecordCount: traversal.length, confirmedCrossingRecordCount: topology.crossings?.filter(item => item.status === 'CONFIRMED').length ?? 0, pendingCrossingRecordCount: topology.crossings?.filter(item => item.status === 'PENDING_REVIEW').length ?? 0, passageCount: topology.passages?.length ?? 0, columnWrapCount: wraps?.windingCount ?? null, cuffStrandCount: wraps?.strandCountAtCuff ?? null, diagramCount: topology.views?.length ?? 0, milestoneCount: stages.length };
}

export function validateSomervilleReferences(topology) {
  const evidenceIds = new Set((topology.evidence ?? []).map(item => item.id));
  const claims = [
    ...(topology.relationships ?? []).map(item => ({ id: item.id, status: item.status, evidence: item.evidence ?? [] })),
    ...(topology.crossings ?? []).map(item => ({ id: item.id, status: item.status, evidence: item.evidence ?? [] })),
    ...(topology.crossings ?? []).filter(item => item.multiplicityStatus).map(item => ({ id: `${item.id}:multiplicity`, status: item.multiplicityStatus, evidence: item.evidence ?? [] })),
    ...(topology.crossingTraversalOrder ?? []).map(item => ({ id: `traversal:${item.crossingId}`, status: item.status, evidence: item.evidence ?? [] })),
    ...(topology.passages ?? []).map(item => ({ id: item.id, status: item.status, evidence: item.evidence ?? [] })),
    ...(topology.passages ?? []).filter(item => item.strandLevelCrossings).map(item => ({ id: `${item.id}:strand-level-crossings`, status: item.strandLevelCrossings, evidence: item.evidence ?? [] })),
    ...(topology.ropePath?.segments ?? []).map(item => ({ id: item.id, status: item.referenceStatus, evidence: item.evidence ?? [] })),
    ...(topology.objects ?? []).filter(item => item.status).map(item => ({ id: item.id, status: item.status, evidence: item.evidence ?? [] })),
    ...(topology.objects ?? []).filter(item => item.nameStatus).map(item => ({ id: `${item.id}:name`, status: item.nameStatus, evidence: item.evidence ?? [] })),
    ...Object.entries(topology.variant ?? {}).map(([id, item]) => ({ id: `variant:${id}`, status: item.status, evidence: item.evidence ?? [] })),
    { id: 'column-winding-direction', status: topology.columnWrapping?.direction?.status, evidence: topology.columnWrapping?.evidence ?? [] }
  ];
  const unsupported = claims.filter(claim => !claim.evidence.length || claim.evidence.some(id => !evidenceIds.has(id))).map(claim => claim.id);
  const pending = claims.filter(claim => claim.status === 'PENDING_REVIEW').map(claim => claim.id);
  const confirmed = claims.filter(claim => claim.status === 'CONFIRMED' || claim.status === 'CONFIRMED_VISUAL').map(claim => claim.id);
  return { evidenceCoverageValid: unsupported.length === 0, unsupported, pendingReview: pending, evidencedClaims: confirmed.length + pending.length, confirmedClaims: confirmed.length, topologyVerified: unsupported.length === 0 && pending.length === 0, status: pending.length ? 'PARTIAL_REFERENCE_RECONSTRUCTION' : 'REFERENCE_VERIFIED' };
}

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function renderSomervilleSvg(topology, viewId) {
  const view = topology.views.find(item => item.id === viewId);
  if (!view) throw new Error(`Unknown Somerville view: ${viewId}`);
  const segments = new Map(topology.ropePath.segments.map(item => [item.id, item]));
  const crossings = new Map(topology.crossings.map(item => [item.id, item]));
  const passages = new Map(topology.passages.map(item => [item.id, item]));
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view.width} ${view.height}" role="img" aria-label="${xml(view.title)}">`, `<style>.diagram-title{font:600 19px system-ui;fill:#172c37}.diagram-description{font:12px system-ui;fill:#526675}.diagram-label{font:600 13px system-ui;fill:#253a45}.diagram-small-label{font:11px system-ui;fill:#344955}.diagram-column,.diagram-cylinder-strip{fill:#e8edef;stroke:#728591;stroke-width:2}.diagram-axis,.diagram-seam{stroke:#abb7bd;stroke-width:1;stroke-dasharray:5 5}.diagram-strand{fill:none;stroke:#4c8292;stroke-width:7;stroke-linecap:round}.diagram-rope{fill:none;stroke-width:9;stroke-linecap:round;stroke-linejoin:round}.bight-line{stroke:#1e7895}.tail-line{stroke:#d88945}.diagram-pending circle{fill:#fff4d6;stroke:#a75f00;stroke-width:2;stroke-dasharray:4 3}.diagram-confirmed circle{fill:#e5f4ed;stroke:#27815b;stroke-width:2}.diagram-pending text,.diagram-confirmed text{font:700 11px system-ui;fill:#172c37}.diagram-route{fill:none;stroke:#357d91;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}.diagram-route.is-pending{stroke:#c88935;stroke-dasharray:9 7}.diagram-arrow{stroke:#324d5a;stroke-width:2}.diagram-arrowhead{fill:#324d5a}</style>`];
  for (const item of view.elements) {
    if (item.type === 'column') {
      out.push(`<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="56" class="diagram-column"/>`);
      out.push(`<line x1="${item.x + item.width / 2}" y1="${item.y}" x2="${item.x + item.width / 2}" y2="${item.y + item.height}" class="diagram-axis"/>`);
    } else if (item.type === 'strand-stack') {
      for (let i = 0; i < item.count; i++) out.push(`<path d="M ${item.x} ${item.y + i * item.gap} H ${item.x + item.width}" class="diagram-strand"/>`);
    } else if (item.type === 'path') {
      out.push(`<path d="${xml(item.d)}" class="diagram-rope ${xml(item.class)}" data-entity="${xml(item.entityId)}"/>`);
      out.push(`<text x="92" y="${item.entityId === 'bight' ? 104 : 294}" class="diagram-label">${xml(item.label)}</text>`);
    } else if (item.type === 'crossing-label') {
      const crossing = crossings.get(item.crossingId);
      const text = crossing.status === 'PENDING_REVIEW' ? `${crossing.id} · O/U PENDING` : `${crossing.id} · ${crossing.over.toUpperCase()} OVER${crossing.multiplicityStatus === 'PENDING_REVIEW' ? ' · COUNT PENDING' : ''}`;
      out.push(`<g class="${crossing.status === 'PENDING_REVIEW' ? 'diagram-pending' : 'diagram-confirmed'}"><circle cx="${item.x}" cy="${item.y}" r="17"/><text x="${item.x}" y="${item.y + 4}" text-anchor="middle">${xml(crossing.id)}</text></g>`);
      out.push(`<text x="${item.x + 23}" y="${item.y + 4}" class="diagram-small-label">${xml(text.slice(crossing.id.length + 3))}</text>`);
    } else if (item.type === 'passage-label') {
      const passage = passages.get(item.passageId);
      out.push(`<g class="${passage.strandLevelCrossings === 'PENDING_REVIEW' ? 'diagram-pending' : 'diagram-confirmed'}"><circle cx="${item.x}" cy="${item.y}" r="17"/><text x="${item.x}" y="${item.y + 4}" text-anchor="middle">${xml(passage.id)}</text></g>`);
      out.push(`<text x="${item.x + 23}" y="${item.y + 4}" class="diagram-small-label">UNDER CUFF · STRAND ORDER PENDING</text>`);
    } else if (item.type === 'text') {
      out.push(`<text x="${item.x}" y="${item.y}" text-anchor="middle" class="diagram-label">${xml(item.text)}</text>`);
    } else if (item.type === 'cylinder-strip') {
      out.push(`<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="18" class="diagram-cylinder-strip"/>`);
      out.push(`<line x1="${item.x}" y1="${item.y}" x2="${item.x}" y2="${item.y + item.height}" class="diagram-seam"/>`);
      out.push(`<line x1="${item.x + item.width}" y1="${item.y}" x2="${item.x + item.width}" y2="${item.y + item.height}" class="diagram-seam"/>`);
    } else if (item.type === 'wrap-pass') {
      const first = item.strandIds[0], second = item.strandIds[1];
      for (let i = 0; i < 2; i++) out.push(`<path d="M ${item.x} ${item.y + i * item.gap} H ${item.x + item.width}" class="diagram-strand" data-strand="${xml(i ? second : first)}"/>`);
      out.push(`<text x="${item.x + item.width / 2}" y="${item.y - 9}" text-anchor="middle" class="diagram-small-label">${xml(item.label)}</text>`);
    } else if (item.type === 'route-segment') {
      const segment = segments.get(item.segmentId), points = item.points.map(point => point.join(',')).join(' ');
      out.push(`<polyline points="${points}" class="diagram-route ${segment.referenceStatus === 'PENDING_REVIEW' ? 'is-pending' : ''}" data-segment="${xml(item.segmentId)}"/>`);
      const middle = item.points[Math.floor(item.points.length / 2)]; out.push(`<text x="${middle[0]}" y="${middle[1] - 14}" text-anchor="middle" class="diagram-small-label">${xml(item.label)}</text>`);
    } else if (item.type === 'route-arrow') {
      out.push('<defs><marker id="phase4-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="diagram-arrowhead"/></marker></defs>');
      out.push(`<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" class="diagram-arrow" marker-end="url(#phase4-arrow)"/>`);
    }
  }
  out.splice(1, 0, `<text x="24" y="32" class="diagram-title">${xml(view.title)}</text>`);
  out.push(`<text x="24" y="${view.height - 14}" class="diagram-description">${xml(view.description)}</text></svg>`);
  return out.join('\n');
}

export function renderSomervilleView(topology, viewId, svg) {
  const markup = renderSomervilleSvg(topology, viewId);
  const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  svg.replaceChildren(...Array.from(root.childNodes));
  svg.setAttribute('viewBox', root.getAttribute('viewBox'));
  svg.setAttribute('role', root.getAttribute('role'));
  svg.setAttribute('aria-label', root.getAttribute('aria-label'));
  return topology.views.find(item => item.id === viewId);
}
