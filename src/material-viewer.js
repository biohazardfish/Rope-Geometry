import {renderMaterialSvg,validateMaterialTopology} from './material-topology.js';
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function mountMaterialInspector(t){
 const tabs=document.querySelector('#phase4-tabs'),svg=document.querySelector('#phase4-diagram'),report=document.querySelector('#report');
 const checks=validateMaterialTopology(t);
 const link=id=>{const e=t.evidence.find(e=>e.id===id);return `<a href="/${escape(e.asset)}" target="_blank" rel="noreferrer">${escape(id)}</a>`};
 function show(id){
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===id)));
  const root=new DOMParser().parseFromString(renderMaterialSvg(t,id),'image/svg+xml').documentElement;
  svg.replaceChildren(...Array.from(root.childNodes));svg.setAttribute('viewBox',root.getAttribute('viewBox'));svg.setAttribute('aria-label',root.getAttribute('aria-label'));
  report.innerHTML=`<div class="phase4-status"><strong>Evidence inventory: ${checks.inventoryValid?'PASS':'FAIL'}</strong></div><div class="phase4-status partial"><strong>Complete rope path: NOT ESTABLISHED</strong><span>${checks.observedGraph.components} observed components · ${checks.observedGraph.openPorts.length} unresolved ports.<br>These are gaps in observation, not separate ropes.</span></div><p>Target: right-handed · two wraps · non-slipped.<br>Video evidence: 8 ≤ t &lt; 149 seconds.</p><h3>Observed crossing visits</h3><p>Construction step 8 only. Final crossing inventory remains incomplete.</p><table class="phase4-table"><tr><th>Crossing</th><th>Two visits</th><th>Source</th></tr>${t.crossings.map(c=>`<tr><td>${c.id}</td><td>${c.visits.map(v=>`${v.segmentId}: ${v.overUnder}`).join('<br>')}</td><td>${c.evidence.map(link).join(' ')}</td></tr>`).join('')}</table><h3>Reference findings</h3>${t.claims.map(c=>`<p><b>${escape(c.id)}</b> · ${c.status}<br>${escape(c.reason)}<br>${c.evidence.map(link).join(' · ')}</p>`).join('')}<h3>Missing evidence</h3>${t.unknownConnections.map(u=>`<details><summary>${escape(u.id)}</summary><p>${escape(u.requiredEvidence)}</p><p>${escape(u.interval)}</p>${u.reviewed.map(link).join(' · ')}</details>`).join('')}<h3>Previous 12 unknowns</h3>${t.legacyReview.map(r=>`<details><summary>${escape(r.id)} · ${r.outcome}</summary><p>${escape(r.finding)}</p>${r.evidence.map(link).join(' · ')}</details>`).join('')}<p><a href="/reports/phase4b/review.md" target="_blank">Full review and limitations</a></p>`;
 }
 tabs.innerHTML=t.views.map(v=>`<button data-view="${v.id}" type="button">${escape(v.title.split(' · ')[0])}</button>`).join('');
 tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>show(b.dataset.view));show('completed');
}
