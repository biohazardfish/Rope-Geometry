const GROUPS={
  original:{short:'Original photos',title:'Topologist · original publication',description:'The creator’s 2010 article. The two colours distinguish working and long-side bundles; they do not identify individual rope limbs.'},
  detail:{short:'Detailed steps',title:'TheDuchy · detailed construction',description:'Numbered stills from the detailed tutorial. These are kept in page order and treated as one construction sequence.'},
  untie:{short:'Untying',title:'TheDuchy · untying sequence',description:'A separate release sequence used to check continuity in reverse. It is not assumed to be a frame-for-frame reverse of tying.'},
  duchyVideo:{short:'Target video',title:'TheDuchy · target video frames',description:'Sampled frames from the supplied right-handed video before the 149-second “Slipped” title card.'},
  nonTarget:{short:'Non-target',title:'TheDuchy · non-target chapters',description:'Frames at or after 149 seconds. They were inspected only to mark variant boundaries and are not target-knot evidence.'},
  topologistVideo:{short:'Creator video',title:'Topologist · demonstration video frames',description:'Sampled frames from the creator-linked local video. Bundle-level operations are compared; crossings are not transferred to the target.'}
};
export function classifyEvidence(e){
  if(e.source==='original')return 'original';
  if(e.source==='topologist-video')return 'topologistVideo';
  if(e.id.startsWith('duchy-detail-'))return 'detail';
  if(e.id.startsWith('duchy-untie-'))return 'untie';
  const seconds=Number(e.locator?.match(/^([0-9]+) seconds$/)?.[1]);
  return Number.isFinite(seconds)&&seconds>=149?'nonTarget':'duchyVideo';
}
export function groupReferenceEvidence(evidence){
  return Object.fromEntries(Object.keys(GROUPS).map(id=>[id,evidence.filter(e=>classifyEvidence(e)===id)]));
}
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function mountReferenceGallery(topology,root){
  const groups=groupReferenceEvidence(topology.evidence),ordered=Object.entries(groups).flatMap(([,items])=>items);
  root.innerHTML=`<div class="reference-intro"><div><p class="reference-kicker">PHASE 4B · INSPECTED SOURCES</p><h1>Every reference used in the reconstruction</h1><p>90 evidence images, two source pages and two supplied videos. Construction states, completed states and non-target chapters stay separate.</p></div><div class="reference-source-links"><a href="${esc(topology.sources.find(s=>s.id==='original').url)}" target="_blank" rel="noreferrer">Original article ↗</a><a href="${esc(topology.sources.find(s=>s.id==='duchy').url)}" target="_blank" rel="noreferrer">TheDuchy tutorial ↗</a><a href="/references/video/01-TheDuchy-RightHanded.mp4" target="_blank">Play TheDuchy video ↗</a><a href="/references/video/02-Topologist-SingleColumn.mp4" target="_blank">Play Topologist video ↗</a></div></div><div class="reference-boundary"><strong>Target boundary</strong><span>Right-handed · two wraps · non-slipped · TheDuchy video 8 ≤ t &lt; 149 s</span><span>Image labels report where each item came from; they do not certify a complete rope path.</span></div><nav class="reference-filters" aria-label="Reference source filters"><button type="button" data-filter="all" aria-pressed="true">All <span>${ordered.length}</span></button>${Object.entries(groups).map(([id,items])=>`<button type="button" data-filter="${id}" aria-pressed="false">${esc(GROUPS[id].short)} <span>${items.length}</span></button>`).join('')}</nav><div class="reference-sections">${Object.entries(groups).map(([id,items])=>`<section data-group="${id}"><header><div><p>${esc(GROUPS[id].title)}</p><span>${esc(GROUPS[id].description)}</span></div><b>${items.length}</b></header><div class="reference-grid">${items.map(e=>`<button class="reference-item" type="button" data-evidence="${esc(e.id)}"><img src="/${esc(e.asset)}" alt="${esc(e.locator)}" loading="lazy"><span><b>${esc(e.id)}</b><small>${esc(e.locator)}</small></span></button>`).join('')}</div></section>`).join('')}</div><dialog class="reference-lightbox"><button class="reference-close" type="button" aria-label="Close reference">×</button><button class="reference-prev" type="button" aria-label="Previous reference">‹</button><figure><img alt=""><figcaption><div><b></b><span></span></div><a target="_blank" rel="noreferrer">Open source ↗</a></figcaption></figure><button class="reference-next" type="button" aria-label="Next reference">›</button></dialog>`;
  const dialog=root.querySelector('dialog'),image=dialog.querySelector('img'),name=dialog.querySelector('figcaption b'),locator=dialog.querySelector('figcaption span'),source=dialog.querySelector('figcaption a');
  let visible=ordered,index=0;
  const show=i=>{index=(i+visible.length)%visible.length;const e=visible[index];image.src='/'+e.asset;image.alt=e.locator;name.textContent=e.id;locator.textContent=`${GROUPS[classifyEvidence(e)].title} · ${e.locator}`;source.hidden=!e.url;source.href=e.url||'#';if(!dialog.open)dialog.showModal();};
  root.querySelectorAll('.reference-item').forEach(button=>button.onclick=()=>show(visible.findIndex(e=>e.id===button.dataset.evidence)));
  root.querySelectorAll('.reference-filters button').forEach(button=>button.onclick=()=>{const filter=button.dataset.filter;root.querySelectorAll('.reference-filters button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));root.querySelectorAll('.reference-sections>section').forEach(s=>s.hidden=filter!=='all'&&s.dataset.group!==filter);visible=filter==='all'?ordered:groups[filter];});
  dialog.querySelector('.reference-close').onclick=()=>dialog.close();dialog.querySelector('.reference-prev').onclick=()=>show(index-1);dialog.querySelector('.reference-next').onclick=()=>show(index+1);dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
  root.onkeydown=e=>{if(!dialog.open)return;if(e.key==='ArrowLeft')show(index-1);if(e.key==='ArrowRight')show(index+1);};
}
