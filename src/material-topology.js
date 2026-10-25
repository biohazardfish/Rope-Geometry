// Reference inventory checks cannot certify that a photographed knot has been reconstructed.
const STATUS = new Set(['SUPPORTED', 'OBSERVED', 'PENDING_REVIEW']);
const OUTCOMES = new Set(['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'CORRECTED']);
export function diagnoseMaterialGraph(state) {
  const nodes = new Map(state.nodes.map(n => [n.id, n]));
  const adj = new Map([...nodes.keys()].map(id => [id, []]));
  for (const s of state.segments) {
    if (!adj.has(s.fromNode) || !adj.has(s.toNode)) continue;
    adj.get(s.fromNode).push(s.toNode); adj.get(s.toNode).push(s.fromNode);
  }
  let components = 0; const visited = new Set();
  for (const id of nodes.keys()) if (!visited.has(id)) {
    components++; const queue = [id];
    while (queue.length) { const n = queue.pop(); if (visited.has(n)) continue; visited.add(n); queue.push(...adj.get(n).filter(v => !visited.has(v))); }
  }
  const physicalEnds = state.nodes.filter(n => n.kind === 'physical-end').map(n => n.id);
  const openPorts = state.nodes.filter(n => n.kind === 'open-observation-port').map(n => n.id);
  const branches = [...adj].filter(([, a]) => a.length > 2).map(([id]) => id);
  const connectivityValid = nodes.size === state.nodes.length && new Set(state.segments.map(s=>s.id)).size === state.segments.length && state.segments.every(s=>nodes.has(s.fromNode)&&nodes.has(s.toNode)&&s.fromNode!==s.toNode);
  const endpointsValid = state.endpoints?.length === 2 && new Set(state.endpoints).size === 2 && state.endpoints.every(id=>physicalEnds.includes(id));
  const portsValid = openPorts.every(id=>adj.get(id).length===1);
  const degreeValid = physicalEnds.length === 2 && [...adj].every(([id, a]) => a.length === (physicalEnds.includes(id) ? 1 : 2));
  const foldValid = nodes.get(state.foldNode)?.kind === 'fold' && adj.get(state.foldNode)?.length === 2;
  let orderValid = Array.isArray(state.orderedMaterialPath) && state.orderedMaterialPath.length === state.segments.length && new Set(state.orderedMaterialPath).size === state.segments.length;
  if (orderValid) {
    let current = state.endpoints?.[0];
    const byId = new Map(state.segments.map(s => [s.id, s]));
    for (const id of state.orderedMaterialPath) {
      const s = byId.get(id);
      if (!s || (s.fromNode !== current && s.toNode !== current)) { orderValid = false; break; }
      current = s.fromNode === current ? s.toNode : s.fromNode;
    }
    orderValid &&= current === state.endpoints?.[1];
  }
  return { complete: connectivityValid && endpointsValid && components === 1 && degreeValid && foldValid && orderValid && !openPorts.length, components, physicalEnds, openPorts, branches, connectivityValid, endpointsValid, portsValid, degreeValid, foldValid, orderValid, meaning: 'Graph of observed material fragments; disconnected components are unresolved evidence, not a claim that the physical rope is cut.' };
}
export function validateMaterialTopology(t) {
  const errors = [];
  if (t?.schemaVersion !== 2) return { inventoryValid: false, errors: ['Expected topology schemaVersion 2'], referenceStatus: 'INCOMPLETE' };
  const unique = (rows, label) => { const ids = rows.map(r => r.id); if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) errors.push(`${label}: unique string IDs required`); return new Set(ids); };
  const evidence = unique(t.evidence, 'evidence'), sources = unique(t.sources, 'source'), stateIds = unique(t.states, 'state');
  const checkEvidence = (row, label) => { if (!row.evidence?.length || row.evidence.some(id => !evidence.has(id))) errors.push(`${label}: missing evidence`); };
  for (const e of t.evidence) if (!sources.has(e.source) || !e.locator || !e.asset) errors.push(`${e.id}: source, locator and asset required`);
  const segments = new Map(), states = new Map(t.states.map(s => [s.id, s]));
  for (const state of t.states) {
    const nodeIds = unique(state.nodes, `${state.id} nodes`); unique(state.segments, `${state.id} segments`); checkEvidence(state,state.id);
    for (const s of state.segments) {
      if (segments.has(s.id)) errors.push(`${s.id}: segment IDs must be globally unique`);
      segments.set(s.id,{...s,stateId:state.id});
      if (!nodeIds.has(s.fromNode) || !nodeIds.has(s.toNode) || s.fromNode === s.toNode) errors.push(`${s.id}: invalid connectivity`);
      if (!STATUS.has(s.status)) errors.push(`${s.id}: invalid observation status`);
      if (s.materialOrdinal !== null && (!Number.isInteger(s.materialOrdinal) || s.materialOrdinal < 0)) errors.push(`${s.id}: invalid ordinal`);
      if (!s.polyline?.length || s.polyline.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) errors.push(`${s.id}: drawing requires finite 2D points`);
      checkEvidence(s,s.id);
    }
    const g=diagnoseMaterialGraph(state);
    if(g.branches.length) errors.push(`${state.id}: material branch`);
    if(!g.portsValid) errors.push(`${state.id}: observation ports must terminate exactly one visible fragment`);
    for(const s of state.segments)if(s.materialOrdinal!==null && (!state.orderedMaterialPath || state.orderedMaterialPath[s.materialOrdinal]!==s.id)) errors.push(`${s.id}: material ordinal requires the supported ordered path`);
  }
  const final = states.get('FINAL');
  if (!final || final.kind !== 'completed') errors.push('FINAL: completed state required');
  if(final && !diagnoseMaterialGraph(final).foldValid) errors.push('FINAL: visible fold must connect exactly two material limbs');
  if (t.column.partOfMaterialGraph !== false || t.states.some(s=>s.nodes.some(n=>n.id===t.column.id))) errors.push('Column must stay outside the material graph');
  if (t.column.count !== 2 || t.column.cuffIds.length !== 4 || new Set(t.column.cuffIds).size !== 4 || t.column.cuffIds.some(id => segments.get(id)?.role !== 'cuff-visible' || segments.get(id)?.stateId !== 'FINAL')) errors.push('Four distinct final cuff fragments required for selected two-wrap target');
  if (!t.column.axisConvention || !STATUS.has(t.column.status)) errors.push('Column requires viewpoint and status');
  if (t.column.status === 'PENDING_REVIEW' && t.column.materialWindingSign !== null) errors.push('Pending winding cannot assert a sign');
  checkEvidence(t.column,'column');
  const crossingIds = unique(t.crossings,'crossing');
  for (const c of t.crossings) {
    const state=states.get(c.stateId); checkEvidence(c,c.id);
    if (!state || c.projectionId !== state.projectionId) errors.push(`${c.id}: state/projection mismatch`);
    if (!STATUS.has(c.status)) errors.push(`${c.id}: invalid crossing status`);
    if (c.participants.length !== 2 || new Set(c.participants).size !== 2 || c.participants.some(id=>segments.get(id)?.stateId!==c.stateId)) errors.push(`${c.id}: participants must be two physical fragments in the same state`);
    if (c.status !== 'PENDING_REVIEW' && (c.over===c.under || !c.participants.includes(c.over) || !c.participants.includes(c.under))) errors.push(`${c.id}: unambiguous over/under required`);
    if (c.visits.length !== 2 || new Set(c.visits.map(v=>v.segmentId)).size !== 2 || c.visits.some(v=>!c.participants.includes(v.segmentId) || v.overUnder !== (v.segmentId===c.over?'over':'under') || !Number.isInteger(v.localOrder) || v.localOrder<1)) errors.push(`${c.id}: exactly two consistent visits required`);
    if (!c.point || c.point.length!==2 || c.point.some(v=>!Number.isFinite(v))) errors.push(`${c.id}: drawing crossing location missing`);
    if(c.visits.some(v=>v.materialOrdinal!==null && (!Number.isInteger(v.materialOrdinal)||v.materialOrdinal<0))) errors.push(`${c.id}: invalid material visit ordinal`);
    if(c.visits.some(v=>v.materialOrdinal!==null) && !state?.orderedMaterialPath) errors.push(`${c.id}: global visit order requires the material path`);
  }
  for (const order of t.crossingLocalOrders) {
    checkEvidence(order,order.segmentId);
    const actual=t.crossings.filter(c=>c.stateId===order.stateId && c.participants.includes(order.segmentId)).sort((a,b)=>a.visits.find(v=>v.segmentId===order.segmentId).localOrder-b.visits.find(v=>v.segmentId===order.segmentId).localOrder).map(c=>c.id);
    if (JSON.stringify(actual)!==JSON.stringify(order.order) || order.order.some(id=>!crossingIds.has(id))) errors.push(`${order.segmentId}: crossing order disagrees with observed order`);
  }
  for(const state of t.states){
    const visits=t.crossings.filter(c=>c.stateId===state.id).flatMap(c=>c.visits);
    for(const segment of state.segments){
      const local=visits.filter(v=>v.segmentId===segment.id);
      if(new Set(local.map(v=>v.localOrder)).size!==local.length)errors.push(`${segment.id}: duplicate local crossing position`);
    }
    const global=visits.filter(v=>v.materialOrdinal!==null).sort((a,b)=>a.materialOrdinal-b.materialOrdinal);
    if(new Set(global.map(v=>v.materialOrdinal)).size!==global.length)errors.push(`${state.id}: duplicate global crossing position`);
    if(state.orderedMaterialPath){
      const positions=global.map(v=>state.orderedMaterialPath.indexOf(v.segmentId));
      if(positions.some((p,i)=>p<0||(i>0&&p<positions[i-1])))errors.push(`${state.id}: global crossing traversal disagrees with material path`);
    }
  }
  for (const claim of t.claims) { checkEvidence(claim,claim.id); if(!STATUS.has(claim.status) || !claim.reason)errors.push(`${claim.id}: claim status/reason required`); }
  unique(t.legacyReview,'legacy review');
  if(t.legacyReview.length!==12) errors.push('All 12 historical unknowns require review');
  for(const r of t.legacyReview){checkEvidence(r,r.id);if(!OUTCOMES.has(r.outcome)||!r.finding)errors.push(`${r.id}: invalid review outcome`);}
  for(const r of t.confirmedAudit)checkEvidence(r,r.legacy);
  for(const u of t.unknownConnections) if(!u.requiredEvidence || !u.interval || u.reviewed.some(id=>!evidence.has(id)))errors.push(`${u.id}: exact missing evidence required`);
  for(const v of t.views)if(!stateIds.has(v.stateId))errors.push(`${v.id}: unknown view state`);
  const graph = final ? diagnoseMaterialGraph(final) : null;
  const unresolved=t.claims.filter(c=>c.status==='PENDING_REVIEW').map(c=>c.id);
  const finalCrossings=t.crossings.filter(c=>c.stateId==='FINAL');
  const finalVisits=finalCrossings.flatMap(c=>c.visits);
  const completeFinalVisits=finalCrossings.every(c=>c.status!=='PENDING_REVIEW') && finalVisits.every(v=>Number.isInteger(v.materialOrdinal)) && new Set(finalVisits.map(v=>v.materialOrdinal)).size===finalVisits.length;
  const materialComplete=errors.length===0 && !!graph?.complete && t.column.status!=='PENDING_REVIEW' && !!final.crossingInventoryComplete && completeFinalVisits && !t.unknownConnections.length;
  // This gate is explicitly a recorded review decision; the program never visually verifies a source.
  const supported=errors.length===0 && materialComplete && !unresolved.length && t.review.decision==='SUPPORTED' && t.review.completeMaterialPathSupported && t.review.sourceEquivalenceSupported;
  return {inventoryValid:errors.length===0,errors,observedGraph:graph,completeMaterialPath:materialComplete,finalCrossingInventoryComplete:!!final?.crossingInventoryComplete,finalCrossingsRecorded:finalCrossings.length,constructionCrossingsRecorded:t.crossings.length-finalCrossings.length,referenceStatus:supported?'REFERENCE_SUPPORTED_BY_RECORDED_REVIEW':'INCOMPLETE',topologyVerified:false,humanApproved:t.review.humanApproved===true,unresolved,reviewRounds:t.review.rounds};
}
const esc = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// Drawing-only intersections, in photo pixels. They never create topology records.
function drawingIntersections(segments) {
  const hits=[];
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j];
    for(let u=1;u<a.polyline.length;u++)for(let v=1;v<b.polyline.length;v++){
      const p=a.polyline[u-1],q=b.polyline[v-1],r=a.polyline[u].map((x,k)=>x-p[k]),s=b.polyline[v].map((x,k)=>x-q[k]);
      const cross=(x,y)=>x[0]*y[1]-x[1]*y[0],den=cross(r,s);if(Math.abs(den)<1e-10)continue;
      const delta=q.map((x,k)=>x-p[k]),ta=cross(delta,s)/den,tb=cross(delta,r)/den;
      if(ta>0&&ta<1&&tb>0&&tb<1)hits.push({participants:[a.id,b.id],point:p.map((x,k)=>x+ta*r[k])});
    }
  }
  return hits;
}
export function renderMaterialSvg(t,viewId,assetHref=p=>'/'+p) {
  const v=t.views.find(v=>v.id===viewId); if(!v)throw new Error('Unknown material view');
  const state=t.states.find(s=>s.id===v.stateId), ev=t.evidence.find(e=>e.id===state.image);
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 720" role="img" aria-label="${esc(v.title)}"><rect width="1000" height="720" fill="white"/><style>text{font:14px system-ui;fill:#263e4a}.heading{font-size:23px;font-weight:650}.minor{font-size:12px}.pending{fill:#965900}.rope{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.box{fill:#fff6df;stroke:#b57825;stroke-dasharray:7 5}</style><text x="24" y="34" class="heading">${esc(v.title)}</text><text x="24" y="58" class="pending">PARTIAL EVIDENCE — no complete E0 → E1 route established</text>`];
  const txt=(x,y,s,cls='')=>out.push(`<text x="${x}" y="${y}" class="${cls}">${esc(s)}</text>`);
  if(viewId==='completed'||viewId==='construction') {
    out.push(`<image href="${esc(assetHref(ev.asset))}" x="20" y="78" width="610" height="610" opacity="0.52"/>`);
    out.push('<g transform="translate(20 78) scale(0.4066667)">');
    for(const s of state.segments)out.push(`<polyline data-segment="${esc(s.id)}" points="${s.polyline.map(p=>p.join(',')).join(' ')}" class="rope" stroke="${s.role.includes('bight')?'#b35f24':'#147a92'}" style="stroke-width:6"/>`);
    const known=t.crossings.filter(c=>c.stateId===state.id&&c.status!=='PENDING_REVIEW');
    for(const hit of drawingIntersections(state.segments)){
      if(known.some(c=>hit.participants.every(id=>c.participants.includes(id))&&Math.hypot(c.point[0]-hit.point[0],c.point[1]-hit.point[1])<1))continue;
      const [x,y]=hit.point;
      out.push(`<g data-unknown-crossing="${hit.participants.map(esc).join('/')}"><circle cx="${x}" cy="${y}" r="22" fill="#fff6df" stroke="#b57825" stroke-dasharray="4 3"/><text x="${x-8}" y="${y+10}" style="font-size:30px">?</text></g>`);
    }
    if(viewId==='completed')out.push('<rect data-gap="locking-core" x="700" y="610" width="245" height="200" class="box"/><text x="705" y="695" style="font-size:29px">UNRESOLVED</text><text x="710" y="735" style="font-size:25px">loop / cuff links</text>');
    for(const c of known) {
      const [x,y]=c.point;
      // Both observed intersections lie on this over-limb's second straight trace section.
      const s=state.segments.find(s=>s.id===c.over),a=s.polyline[1],b=s.polyline[2],len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len*24,dy=(b[1]-a[1])/len*24;
      out.push(`<g data-crossing="${esc(c.id)}"><path d="M${x-dx},${y-dy} L${x+dx},${y+dy}" stroke="white" stroke-width="17"/><path d="M${x-dx},${y-dy} L${x+dx},${y+dy}" stroke="#b35f24" stroke-width="7"/><text x="${x+32}" y="${y-12}" style="font-size:26px">${esc(c.id)}</text></g>`);
    }
    out.push('</g>');
    txt(655,105,viewId==='completed'?'Completed photo, detailed step 24':'Construction photo, detailed step 8');
    txt(655,132,'Colored traces identify visible fragments.');txt(655,155,'They do not fill hidden connections.');
    state.segments.forEach((s,i)=>txt(655,195+i*26,`${s.id} · ${s.role}`,'minor'));
    if(viewId==='construction'){txt(655,395,'D8-X01: D8.BR OVER D8.C1');txt(655,420,'D8-X02: D8.BR OVER D8.C2');txt(655,455,'Only local BR order: X01 → X02');txt(655,480,'No final crossing transfer.','pending');txt(655,510,'? = other trace overlap not adjudicated.','minor');}
    else {txt(655,445,'C1–C4: screen-left → screen-right');txt(655,470,'B0 → fold → B1: visible connection');txt(655,495,'E0 / E1: physical ends off-frame');txt(655,530,'Rear cuff and locking core need views.','pending');}
    txt(24,703,`Source: ${ev.id}; original image retained in evidence index.`,'minor');
  } else if(viewId==='wrapping') {
    txt(35,110,'Front cuff lanes (photo order)');txt(485,110,'Rear / underside');
    out.push('<rect x="420" y="140" width="535" height="410" class="box"/>');
    t.column.cuffIds.forEach((id,i)=>{const y=190+i*95;out.push(`<path data-segment="${id}" d="M110 ${y} H400" stroke="#147a92" stroke-width="4" fill="none"/><circle cx="400" cy="${y}" r="6" fill="white" stroke="#965900"/>`);txt(45,y+5,id);});
    txt(455,230,'Unknown strand permutation');txt(455,265,'No connections drawn through this region.');txt(455,315,'Two doubled wraps / four visible runs');txt(455,355,'E0-based winding sign: PENDING');txt(455,395,'Do not equate screen order with material order.');
    txt(35,600,'Axis convention: wrist (photo left) → elbow (photo right).');txt(35,630,'Construction motion is known; directed material winding requires endpoint binding.');
  } else {
    txt(30,104,'E0 · unbound');txt(570,104,'E1 · unbound');txt(30,134,'Endpoints exist; their individual bindings to photographed strands are not established.','pending');
    const f=state.segments;
    f.forEach((s,i)=>{const y=185+i*53,reverse=s.fromNode===state.foldNode,left=reverse?s.toNode:s.fromNode,right=reverse?s.fromNode:s.toNode;out.push(`<path data-segment="${esc(s.id)}" d="M235 ${y} H530" stroke="${s.role.includes('bight')?'#b35f24':'#147a92'}" stroke-width="3"/>`);for(const [nodeId,x] of [[left,235],[right,530]])if(state.nodes.find(n=>n.id===nodeId)?.kind==='open-observation-port')out.push(`<circle data-open-port="${esc(nodeId)}" cx="${x}" cy="${y}" r="4" fill="white" stroke="#965900"/>`);txt(32,y+5,s.id);txt(570,y+5,reverse?`${left} ← ${right}`:`${left} → ${right}`);});
    // The only resolved fragment adjacency is the photographed bight fold.
    const limbs=f.map((s,i)=>s.fromNode===state.foldNode||s.toNode===state.foldNode?i:-1).filter(i=>i>=0);
    if(limbs.length===2)out.push(`<path data-fold="${esc(state.foldNode)}" d="M530 ${185+limbs[0]*53} H550 V${185+limbs[1]*53} H530" fill="none" stroke="#b35f24" stroke-width="2"/>`);
    txt(32,658,'Rows are a fragment inventory, NOT an end-to-end material sequence.','pending');txt(32,687,'Global ordinals and final crossing traversal remain null rather than guessed.');
  }
  out.push('</svg>');return out.join('\n');
}
