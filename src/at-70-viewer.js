import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeAt70, makeAt70Cleared, evaluateAt70, HYPOTHESES, QUESTION, DISCLAIMER } from './at-70-model.js';

const stage = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#172427');
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, -0.03);
scene.add(new THREE.HemisphereLight(0xffffff, 0x465353, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-0.6, -1, 0.8);
scene.add(key);

const root = new THREE.Group();
scene.add(root);
const rearParts = [];
const colors = { 0: 0x3d8fd1, 1: 0xe08a3c, fold: 0xf0c14d };
const hiddenRoles = new Set(['rear', 'upper', 'lower']);
let mode = 'cleared';

function labelSprite(title, subtitle) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 180;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(18, 32, 36, 0.92)';
  g.fillRect(0, 0, 720, 180);
  g.strokeStyle = '#d7c39a';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 704, 164);
  g.fillStyle = '#f4efe4';
  g.font = '700 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 360, 78);
  g.font = '400 32px system-ui, sans-serif';
  g.fillStyle = '#d5c7a4';
  g.fillText(subtitle, 360, 132);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.46, 0.115, 1);
  sprite.position.set(0, 0, 0.2);
  sprite.renderOrder = 2;
  return sprite;
}

function endpointSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(244, 239, 228, 0.94)';
  g.fillRect(0, 0, 420, 96);
  g.fillStyle = '#1c2c30';
  g.font = '700 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 210, 48);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.16, 0.037, 1);
  sprite.renderOrder = 3;
  return sprite;
}

function addSegment(group, a, b) {
  const from = new THREE.Vector3(...a.xyz);
  const to = new THREE.Vector3(...b.xyz);
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length < 1e-5) return;
  const hidden = hiddenRoles.has(a.role) || hiddenRoles.has(b.role);
  const color = a.role === 'fold' || b.role === 'fold' ? colors.fold : colors[a.limb];
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.0049, length, 2, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0 }),
  );
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  group.add(mesh);
  if (hidden) rearParts.push(mesh);
}

function build() {
  root.traverse(object => {
    object.geometry?.dispose();
    if (object.material) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
  root.clear();
  rearParts.length = 0;
  const factory = mode === 'cleared' ? makeAt70Cleared : makeAt70;
  HYPOTHESES.forEach((hypothesis, index) => {
    const model = factory(hypothesis.id);
    const group = new THREE.Group();
    group.position.x = (index - 1) * 0.74;
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(model.cuff.radius, model.cuff.radius, model.cuff.length, 64, 1),
      new THREE.MeshStandardMaterial({ color: 0xd7c4c2, transparent: true, opacity: 0.28, depthWrite: false, roughness: 1, side: THREE.DoubleSide }),
    );
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
    cylinder.renderOrder = -1;
    group.add(cylinder, labelSprite(hypothesis.title, hypothesis.subtitle));
    const points = model.ordered;
    for (let i = 0; i < points.length - 1; i++) addSegment(group, points[i], points[i + 1]);
    const mark = (point, text, dz) => {
      const sprite = endpointSprite(text);
      sprite.position.set(point.xyz[0], point.xyz[1], point.xyz[2] + dz);
      group.add(sprite);
    };
    mark(points[0], 'E0 unassigned', -0.045);
    mark(points.at(-1), 'E1 unassigned', -0.045);
    const fold = points.find(point => point.role === 'fold');
    if (fold) mark(fold, 'fold', 0.04);
    root.add(group);
  });
  rearParts.forEach(part => { part.visible = document.querySelector('#show-rear').checked; });
}

function view(name) {
  const frames = {
    front: { position: [0, -2.2, -0.02], target: [0, 0, -0.03] },
    orbit: { position: [1.35, -1.55, 0.85], target: [0, 0, -0.02] },
    rear: { position: [0, 2.2, -0.02], target: [0, 0, -0.03] },
    top: { position: [0, -0.45, 2.4], target: [0, 0, -0.02] },
  };
  const frame = frames[name];
  camera.position.set(...frame.position);
  controls.target.set(...frame.target);
  controls.update();
  const showBack = name !== 'front';
  const toggle = document.querySelector('#show-rear');
  toggle.checked = showBack;
  rearParts.forEach(part => { part.visible = showBack; });
  document.querySelectorAll('.view-controls button').forEach(button => button.setAttribute('aria-pressed', String(button.id === name)));
}

function millimeters(value) {
  return `${(value * 1000).toFixed(3)} mm`;
}

function report() {
  const rows = HYPOTHESES.map(hypothesis => {
    const schematic = evaluateAt70(makeAt70(hypothesis.id));
    const cleared = evaluateAt70(makeAt70Cleared(hypothesis.id));
    return `<tr><th>${hypothesis.id}</th><td>${millimeters(schematic.minimumRopeGapM)}</td><td>${schematic.selfPenetrations}</td><td>${millimeters(cleared.minimumRopeGapM)}</td><td>${millimeters(cleared.minimumColumnGapM)}</td></tr>`;
  });
  const shown = mode === 'cleared' ? evaluateAt70(makeAt70Cleared('C')) : evaluateAt70(makeAt70('A'));
  document.querySelector('#numbers').innerHTML = `<table><thead><tr><th></th><th>Schematic rope gap</th><th>Schematic penetrations</th><th>Cleared rope gap</th><th>Cleared column gap</th></tr></thead><tbody>${rows.join('')}</tbody></table><p>${shown.claim} The column figure is an infinite X-axis cylinder, which is conservative relative to the finite transparent mesh. The 20 mm camera-ward shift of the cleared bight is an embedding choice, not a measurement.</p>`;
}

document.querySelector('#question').textContent = QUESTION;
document.querySelector('#disclaimer').textContent = DISCLAIMER;
document.querySelector('#routing').innerHTML = HYPOTHESES.map(item => `<p><b>${item.title} · ${item.subtitle}.</b> ${item.routing}</p>`).join('');
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  build();
  report();
}));
for (const name of ['front', 'orbit', 'rear', 'top']) document.querySelector(`#${name}`).addEventListener('click', () => view(name));
document.querySelector('#show-rear').addEventListener('change', event => rearParts.forEach(part => { part.visible = event.target.checked; }));
document.querySelector('#show-reference').addEventListener('change', event => {
  document.querySelector('#reference').hidden = !event.target.checked;
});

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const halfW = Math.max(1.2, 0.62 * aspect);
  const halfH = halfW / aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
new ResizeObserver(resize).observe(stage);
build();
report();
view('front');
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
