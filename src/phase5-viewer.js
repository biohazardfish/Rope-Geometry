import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const $=s=>document.querySelector(s),stage=$('#stage'),renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(devicePixelRatio);stage.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#121d25');
const camera=new THREE.PerspectiveCamera(40,1,.001,10);camera.up.set(0,0,1);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,-.08,0);
scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(1,-2,3);scene.add(light);
let group=new THREE.Group(),lines,markers,viewScale=1,request=0;scene.add(group);
const views={Front:[0,-.7,0],Rear:[0,.73,0],Left:[-.7,0,0],Right:[.7,0,0],Top:[0,0,.7],Oblique:[.48,-.5,.38]};
function setView(name){camera.position.copy(controls.target).add(new THREE.Vector3(...views[name]).multiplyScalar(viewScale));controls.update();}
for(const name of Object.keys(views)){const b=document.createElement('button');b.textContent=name;b.onclick=()=>setView(name);$('#views').append(b);}
const requested=new URLSearchParams(location.search).get('model');if([...$('#model').options].some(o=>o.value===requested))$('#model').value=requested;
async function load(){
  const token=++request,name=$('#model').value,recovery=name.startsWith('recovery-'),partial=name==='partial-cuff',key=name.replace('recovery-','');
  const [doc,raw]=await Promise.all([
    fetch(recovery?`/data/phase5-recovery/${key}.json`:`/data/phase5-${name}.json`).then(r=>{if(!r.ok)throw Error('Geometry unavailable');return r.json();}),
    fetch(recovery?`/reports/phase5-recovery/${key}.json`:`/reports/phase5/${partial?'partial-':''}validation.json`).then(r=>{if(!r.ok)throw Error('Report unavailable');return r.json();})
  ]);if(token!==request)return;
  const r=recovery?{...raw,minimumRopeGap:raw.minimumGap,minimumColumnGap:raw.column.minimumGap,columnPenetrations:raw.column.penetrations.length}:raw;
  scene.remove(group);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group=new THREE.Group();scene.add(group);
  lines=new THREE.Group();markers=new THREE.Group();group.add(lines,markers);
  const rope=doc.ropes[0],points=rope.points.map(p=>new THREE.Vector3(...p)),roles=recovery?doc.recovery.segmentRoles:doc.candidate.pointRoles;
  for(let i=0;i<points.length-1;i++){
    const role=roles[i],color=role.includes('cuff')?0x49bad2:role.includes('loop')||role.includes('root')?0xe69a56:0xe4d273,delta=points[i+1].clone().sub(points[i]);
    const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(rope.diameter/2,delta.length(),4,8),new THREE.MeshLambertMaterial({color}));
    mesh.position.copy(points[i]).add(points[i+1]).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);
  }
  lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.6})));
  const col=recovery?{radius:.055,length:.36}:doc.candidate.spec.column;
  const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(col.radius,col.radius,col.length,48),new THREE.MeshLambertMaterial({color:0x87949d,transparent:true,opacity:.35}));cylinder.rotation.z=Math.PI/2;group.add(cylinder);
  for(const c of r.pairs){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.006,8,6),new THREE.MeshBasicMaterial({color:0xff374b}));mesh.position.set(...c.pointA);markers.add(mesh);}
  lines.visible=$('#centerline').checked;markers.visible=$('#markers').checked;
  const box=new THREE.Box3().setFromPoints(points);controls.target.copy(box.getCenter(new THREE.Vector3()));
  viewScale=Math.max(1,box.getSize(new THREE.Vector3()).length()/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*Math.min(camera.aspect,1))/.7*1.1);setView('Oblique');
  const common=`<p>一條連續繩：${r.continuity?'是':'否'}<br>線段：${r.segments}<br>自穿透配對：${r.selfPenetrations}<br>柱穿透：${r.columnPenetrations}<br>最小繩間隙：${(r.minimumRopeGap*1000).toFixed(3)} mm<br>最小柱間隙：${(r.minimumColumnGap*1000).toFixed(3)} mm</p>`;
  const explanation=recovery?
    `<p>${doc.recovery.cuffIntegrated?'接合失敗：紅點為實測穿透。核心及 cuff 座標保持固定。':'局部測試：外圍黃色接續段代替尚未接入的 cuff，不是完整繩結。'}</p><p>所有位置、圈根方向及股配對仍是 ASSUMED。Phase 5 未通過。</p><p>零穿透只適用於所列取樣。加密會報出更多局部膠囊重疊；未調整容差或排除規則。</p><p>局部關係：${raw.constraints.filter(c=>c.satisfied!==null).map(c=>`${c.id}: ${c.satisfied?'通過':'失敗'}`).join('<br>')}</p>${raw.underCuff?`<p>下穿四股 cuff：${raw.underCuff.satisfied?'通過':'失敗'}<br>最小間隙 ${(raw.underCuff.minimumGap*1000).toFixed(3)} mm</p>`:''}`:
    `<p>OBSERVED：兩圈四股及來源操作描述。<br>ASSUMED：所有尺寸、背面接續、鎖環嵌入。<br>UNRESOLVED：X 交叉與兩次同向穿環。</p><p>${partial?'此部分沒有鎖結，不是完整 Somerville Bowline。':'完整路徑有穿透；不是已驗證的 Somerville Bowline。'}</p>`;
  $('#summary').innerHTML=`<h2 class="failure">${r.status}</h2>${common}${explanation}<details><summary>碰撞線段及穿透量</summary>${r.pairs.map(c=>`<p>${c.segmentA} ↔ ${c.segmentB}<br>${(c.penetration*1000).toFixed(3)} mm</p>`).join('')}</details>`;
}
const reload=()=>load().catch(e=>{$('#summary').textContent=e.message;});
$('#model').onchange=reload;$('#centerline').onchange=()=>{if(lines)lines.visible=$('#centerline').checked;};$('#markers').onchange=()=>{if(markers)markers.visible=$('#markers').checked;};
function resize(){const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});await reload();
