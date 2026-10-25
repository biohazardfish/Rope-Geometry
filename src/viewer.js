import { mountMaterialInspector } from './material-viewer.js';
import { mountReferenceGallery } from './reference-gallery.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseDocument, evaluateAt } from './schema.js';
import { detectCollisions } from './geometry.js';
import { renderSomervilleView, validateSomervilleReferences, validateSomervilleStructure } from './somerville-topology.js';

const $=s=>document.querySelector(s);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(devicePixelRatio);$('#viewport').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#101820');
const camera=new THREE.PerspectiveCamera(45,1,.001,100);camera.up.set(0,0,1);camera.position.set(.16,-.22,.16);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.update();
scene.add(new THREE.GridHelper(.2,10,0x425466,0x283642));
const materials={rope:new THREE.LineBasicMaterial({color:0x4fc3f7}),hit:new THREE.LineBasicMaterial({color:0xff5263}),marker:new THREE.MeshBasicMaterial({color:0xff5263})};
let doc,topology,phase4Topology,phase4View='structure',tube=false,playing=false,group=new THREE.Group();scene.add(group);
async function load(which){
  $('header > span').textContent=which==='P4R'?'90 inspected references · source and state separated':which==='P4B'?'Reference evidence · 2D layout · no metric scale':which==='P4'?'Historical Phase 4 model · see Phase 4B audit':'Finite capsule collision · metres · Z-up';
  $('aside > .note').hidden=which==='P4B'||which==='P4'||which==='P4R';
  $('#reference-gallery').hidden=which!=='P4R';
  $('aside').hidden=which==='P4R';
  document.querySelector('main').classList.toggle('references-active',which==='P4R');
  if(which==='P4R'){
    const material=await(await fetch('/data/somerville-bowline-topology-v2.json')).json();
    playing=false;topology=null;$('#viewport').hidden=true;$('#phase4-views').hidden=true;$('#tube').hidden=true;$('#topology').hidden=true;$('#anim').hidden=true;document.querySelector('main').classList.remove('phase4-active');
    mountReferenceGallery(material,$('#reference-gallery'));return;
  }
  if(which==='P4B'){
    const material=await(await fetch('/data/somerville-bowline-topology-v2.json')).json();
    playing=false;topology=null;$('#viewport').hidden=true;$('#phase4-views').hidden=false;$('#tube').hidden=true;$('#topology').hidden=true;$('#anim').hidden=true;document.querySelector('main').classList.add('phase4-active');
    $('#title').textContent='Phase 4B · material evidence';mountMaterialInspector(material);return;
  }
  if(which==='P4'){
    phase4Topology=await(await fetch('/data/somerville-bowline-topology.json')).json();
    playing=false;
    topology=null;$('#viewport').hidden=true;$('#phase4-views').hidden=false;$('#tube').hidden=true;$('#topology').hidden=true;$('#anim').hidden=true;document.querySelector('main').classList.add('phase4-active');
    $('#title').textContent='Phase 4 · topology reconstruction';
    $('#phase4-tabs').innerHTML=phase4Topology.views.map(view=>`<button type="button" data-view="${view.id}" aria-pressed="${view.id===phase4View}">${view.title}</button>`).join('');
    $('#phase4-tabs').querySelectorAll('button').forEach(button=>button.onclick=()=>{phase4View=button.dataset.view;renderPhase4();});
    renderPhase4();return;
  }
  $('#viewport').hidden=false;$('#phase4-views').hidden=true;$('#tube').hidden=false;document.querySelector('main').classList.remove('phase4-active');
  if(which==='P2'||which==='P3'){
    const multi=which==='P3';
    const requestedMode=$('#validity').value;
    topology=JSON.parse(await(await fetch(`/data/${multi?'multiple-crossings-topology':'crossing-topology'}.json`)).text());
    if(multi){$('#validity').innerHTML='<option value="multiple-valid-A">A · X1 and X2 over</option><option value="multiple-valid-B">B · X1 over, X2 under</option><option value="multiple-invalid">Negative control</option>';}
    else $('#validity').innerHTML='<option value="valid">Valid clearance</option><option value="invalid">Negative control</option>';
    if([...$('#validity').options].some(o=>o.value===requestedMode))$('#validity').value=requestedMode;
    const mode=$('#validity').value, file=multi?`/data/${mode}.json`:`/data/crossing-${mode}.json`;
    doc=parseDocument(await(await fetch(file)).text());
    if(multi)topology.crossings=doc.topology.crossings;
    $('#title').textContent=multi?'Phase 3 · two interacting crossings':'Phase 2 · single crossing';$('#topology').hidden=false;$('#anim').hidden=true;drawSchematic(multi);render();return;
  }
  topology=null;$('#topology').hidden=true;$('#anim').hidden=which!=='C';
  const path=which==='A'?'/data/experiments.json':`/data/${which}.json`;
  doc=parseDocument(await(await fetch(path)).text());$('#title').textContent=`Experiment ${which}`;render(which==='C'?0:undefined);
}
function drawSchematic(multi=false){
  const svg=$('#schematic'),path=topology.path,xy=p=>`${p[0]*1000},${-p[1]*1000}`;
  svg.innerHTML='';const full=document.createElementNS('http://www.w3.org/2000/svg','polyline');full.setAttribute('points',path.map(xy).join(' '));full.setAttribute('class','schematic-path');svg.append(full);
  for(const crossing of topology.crossings){
    const over=document.createElementNS(svg.namespaceURI,'line');
    const portion=multi?crossing.portions[crossing.over==='A'?0:1]:null;
    const a=multi?path[portion.segment]:path[crossing.overSegment],b=multi?path[portion.segment+1]:path[crossing.overSegment+1];
    over.setAttribute('x1',a[0]*1000);over.setAttribute('y1',-a[1]*1000);over.setAttribute('x2',b[0]*1000);over.setAttribute('y2',-b[1]*1000);over.setAttribute('class','over-path');svg.append(over);
    const center=multi?path[crossing.portions[0].segment].map((v,i)=>v+(path[crossing.portions[0].segment+1][i]-v)*crossing.portions[0].t):path[crossing.underSegments[0]+1];
    const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',center[0]*1000+6);label.setAttribute('y',-center[1]*1000-7);label.textContent=multi?`${crossing.id} · OVER ${crossing.over}`:`${crossing.id} · OVER → UNDER`;svg.append(label);
  }
}
function renderPhase4(){
  if(!phase4Topology)return;
  const structural=validateSomervilleStructure(phase4Topology),reference=validateSomervilleReferences(phase4Topology);
  const view=renderSomervilleView(phase4Topology,phase4View,$('#phase4-diagram'));
  $('#phase4-tabs').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===phase4View)));
  const crossingRows=phase4Topology.crossings.map(c=>{const order=phase4Topology.crossingTraversalOrder.find(item=>item.crossingId===c.id);const portions=c.ropePortions.map(part=>`${part.objectId}: ${part.segmentIds.join(', ')}${part.status==='PENDING_REVIEW'?' (pending)':''}`).join('<br>');return `<tr><td>${c.id}</td><td>${c.participants.join(' ↔ ')}</td><td>${portions}</td><td>${c.status==='PENDING_REVIEW'?'Over/Under pending':`${c.over} over ${c.under}${c.multiplicityStatus==='PENDING_REVIEW'?'; strand count pending':''}`}</td><td>${order?.status==='PENDING_REVIEW'?'Path order pending':'Confirmed'}</td><td>${c.tutorialSteps?.join(', ')??c.tutorialStep}</td></tr>`}).join('');
  const passageRows=phase4Topology.passages.map(p=>`<tr><td>${p.id}</td><td>${p.participants.join(' ↔ ')}</td><td>${p.kind.replaceAll('-',' ')}</td><td>${p.strandLevelCrossings==='PENDING_REVIEW'?'strand-level crossings pending':'confirmed'}</td></tr>`).join('');
  const stageRows=phase4Topology.tutorialMilestones.map(stage=>`<li><b>${stage.title}</b><br>Steps ${stage.sourceSteps.join(', ')} · ${stage.status.replaceAll('_',' ').toLowerCase()}</li>`).join('');
  const pending=reference.pendingReview.map(id=>`<span class="phase4-pending">${id}</span>`).join(', ');
  $('#report').innerHTML=`<div class="phase4-status ${structural.valid?'':'partial'}"><strong>Structural validation: ${structural.valid?'PASS':'FAIL'}</strong><span>${structural.pathSegmentCount} path segments · ${structural.physicalEndpointCount} physical endpoints · one column object · ${structural.columnWrapCount} wraps / ${structural.cuffStrandCount} strands</span></div><div class="phase4-status partial"><strong>Reference validation: ${reference.status.replaceAll('_',' ')}</strong><span>${reference.confirmedClaims} supported relationships · ${reference.pendingReview.length} pending · topology verified: no</span></div>${structural.errors.length?`<p>${structural.errors.join('<br>')}</p>`:''}<h3>Crossing records</h3><table class="phase4-table"><thead><tr><th>ID</th><th>Participants</th><th>Rope-path portions</th><th>Relationship</th><th>Rope-path order</th><th>Steps</th></tr></thead><tbody>${crossingRows}</tbody></table><h3>Passages</h3><table class="phase4-table"><thead><tr><th>ID</th><th>Participants</th><th>Relationship</th><th>Open detail</th></tr></thead><tbody>${passageRows}</tbody></table><p><b>Wrap direction:</b> <span class="phase4-pending">PENDING REVIEW</span><br><b>Other physical end label:</b> provisional “standing/lead end”</p><p><b>Unresolved:</b> ${pending}</p><h3>Reference stages</h3><ol class="phase4-stages">${stageRows}</ol><p><a href="${phase4Topology.reference.url}" target="_blank" rel="noreferrer">Open TheDuchy detailed tutorial</a></p><p class="note">${view.description} Crossing inventory and strand-by-strand over/under relationships remain incomplete. No completed 3D knot geometry is generated in this phase.</p>`;
}
function render(time){
  scene.remove(group);group=new THREE.Group();scene.add(group);
  const ropes=time===undefined?doc.ropes:evaluateAt(doc,time);
  for(const rope of ropes){const pts=rope.points.map(p=>new THREE.Vector3(...p));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),materials.rope));
    if(tube)for(let i=0;i+1<pts.length;i++){const dir=new THREE.Vector3().subVectors(pts[i+1],pts[i]),len=dir.length();if(!len)continue;const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rope.diameter/2,rope.diameter/2,len,8),new THREE.MeshBasicMaterial({color:0x287e9f}));mesh.position.copy(pts[i]).add(pts[i+1]).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());group.add(mesh); }
  }
  const report=detectCollisions(ropes);let html=`<div>Time: ${time===undefined?'static':time.toFixed(3)+' s'}</div><div>Pairs excluded by shared topology: ${report.excluded.length}</div>`;
  if(topology){
    if(topology.crossings.length>1){const v=doc.validation;html+=`<article class="${v.valid?'separated':'penetrating'}"><b>Topology: ${v.topology.valid?'PASS':'FAIL'} · Collisions: ${v.collisions.valid?'PASS':'FAIL'}</b><br>Projected crossings ${v.topology.projectedCrossingCount}/${v.topology.expectedCrossingCount}; traversal ${v.topology.crossingTraversalOrder.join(' → ')}<br>Global minimum separation ${(v.collisions.minimumNonlocalSeparation*1000).toFixed(3)} mm; required ${(v.collisions.requiredMinimumSeparation*1000).toFixed(3)} mm<br>Global surface clearance ${(v.collisions.globalSurfaceClearance*1000).toFixed(3)} mm; penetrations ${v.collisions.penetrationCount}<br>Overlapping constraint pairs: ${v.topology.interactingCrossingConstraints.length}<br>${v.crossings.crossingMeasurements.map(c=>`${c.id}: ${c.overPortion} over · separation ${(c.centerlineSeparation*1000).toFixed(3)} mm · clearance ${(c.surfaceClearance*1000).toFixed(3)} mm · ${c.valid?'PASS':'FAIL'}`).join('<br>')}</article>`;}
    else {const v=doc.validation;html+=`<article class="${v.valid?'separated':'penetrating'}"><b>${topology.crossings[0].id}: ${topology.crossings[0].order}</b><br>Projected crossings: ${v.projectedCrossingCount}<br>Centerline crossing distance ${(v.crossingCenterlineSeparation*1000).toFixed(3)} mm; required ${(v.requiredMinimumSeparation*1000).toFixed(3)} mm<br>Surface clearance ${(v.clearance*1000).toFixed(3)} mm<br>Minimum nonlocal separation ${(v.minimumNonlocalSegmentSeparation*1000).toFixed(3)} mm<br>Penetrations: ${v.penetrationCount}; over/under preserved: ${v.overUnderPreserved?'yes':'no'}<br>Result: ${v.valid?'PASS':'FAIL'}</article>`;}
  }
  html+=report.collisions.length?report.collisions.slice(0,30).map(c=>`<article class="${c.state}"><b>${c.segmentA} ↔ ${c.segmentB}: ${c.state}</b><br>Distance ${(c.distance*1000).toFixed(3)} mm · penetration ${(c.penetration*1000).toFixed(3)} mm</article>`).join(''):`<p class="separated">No detected penetration.</p>`;
  $('#report').innerHTML=html;
  for(const c of report.collisions){const a=new THREE.Vector3(...c.pointA),b=new THREE.Vector3(...c.pointB);group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),materials.hit));for(const p of [a,b]){const m=new THREE.Mesh(new THREE.SphereGeometry(.002,10,8),materials.marker);m.position.copy(p);group.add(m);}}
}
function resize(){const r=$('#viewport').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
$('#case').onchange=e=>load(e.target.value);$('#validity').onchange=()=>load($('#case').value);$('#tube').onclick=()=>{tube=!tube;render($('#case').value==='C'?Number($('#time').value):undefined)};
$('#time').oninput=e=>{$('#anim output').value=`${Number(e.target.value).toFixed(3)} s`;render(Number(e.target.value))};
$('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Pause':'Play'};
let last=performance.now();setInterval(()=>{const now=performance.now();if(playing){const t=(Number($('#time').value)+(now-last)/1000)%1;$('#time').value=t;$('#anim output').value=`${t.toFixed(3)} s`;render(t);}last=now;},50);
load('A');
