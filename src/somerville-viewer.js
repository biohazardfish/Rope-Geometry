import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeTube, checkTube } from './rope-tube.js';
import { validateDocument } from './schema.js';

const DATA_ROOT = '/data/somerville-final';
const DRESSED_REPORT_PATH = '/reports/somerville-dressed-report.json';
let COLUMN = null;
const CHECK_OPTS = { epsilon: 1e-6 };
const TUBE_OPTS = { radialSegments: 12 };

const $ = (sel) => document.querySelector(sel);
const stage = $('#stage');
const loadStatus = $('#load-status');
const checkPanel = $('#check-panel');
const schemaNote = $('#schema-note');
const badgeAlign = $('#badge-align');
const badgeMotion = $('#badge-motion');
const modelSelect = $('#model');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#121d25');
const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 50);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(-0.8, -1.2, 1.4);
scene.add(key);

const root = new THREE.Group();
const centerlines = new THREE.Group();
root.add(centerlines);
scene.add(root);

let viewScale = 1;
let framing = 'full';
const savedFull = { target: new THREE.Vector3(), scale: 0.35 };
let doc = null;
let tubes = [];
let report = null;
let loadToken = 0;

const LABEL_COLORS = [
  ['cuff', 0x49bad2],
  ['loop', 0xe69a56],
  ['root', 0xe69a56],
  ['lock', 0xe69a56],
  ['bight', 0xe4d273],
  ['fold', 0xe4d273],
];
const ROPE_COLOR = 0x8aaebb;
const GENERIC_LABEL_COLOR = 0x94a9b8;

const viewNames = {
  front: '正視 (−Y)',
  rear: '後視 (+Y)',
  side: '側視 (+X)',
  top: '俯視 (+Z)',
  oblique: '斜視',
  core: '核心',
};
const viewOffsets = {
  front: [0, -1, 0],
  rear: [0, 1, 0],
  side: [1, 0, 0],
  top: [0, 0, 1],
  oblique: [0.72, -0.78, 0.62],
  core: [0, -1, 0],
};

function segmentLabel(labels, index) {
  if (!labels) return '';
  return String(labels[index] ?? labels[String(index)] ?? '');
}

function colorForLabel(label, semantic) {
  if (!semantic) return ROPE_COLOR;
  const text = label.toLowerCase();
  for (const [key, color] of LABEL_COLORS) {
    if (text.includes(key)) return color;
  }
  return label ? GENERIC_LABEL_COLOR : ROPE_COLOR;
}

function tubeToGeometry(tube) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(tube.vertices.flat(), 3));
  geometry.setIndex(tube.indices.flat());
  geometry.computeVertexNormals();
  return geometry;
}

function axisVector(axis) {
  return new THREE.Vector3(...({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[axis] ?? [1, 0, 0]));
}

function addColumnHelper() {
  if (!COLUMN) return;
  const length = 0.5;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(COLUMN.radius, COLUMN.radius, length, 48),
    new THREE.MeshStandardMaterial({
      color: 0x87949d,
      transparent: true,
      opacity: 0.32,
      roughness: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), COLUMN.frame?new THREE.Vector3(...COLUMN.frame.axes['XYZ'.indexOf(COLUMN.axis)]):axisVector(COLUMN.axis));
  mesh.position.set(...COLUMN.center);
  mesh.renderOrder = -1;
  root.add(mesh);
}

function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
      else object.material.dispose();
    }
  });
  group.clear();
}

function collectPoints(ropes) {
  const points = [];
  for (const rope of ropes) {
    for (const p of rope.points) points.push(new THREE.Vector3(...p));
  }
  return points;
}

function buildMeshes(ropes, semantic) {
  tubes = [];
  for (const rope of ropes) {
    const radius = rope.diameter / 2;
    const labels = rope.segmentLabels ?? rope.labels ?? doc?.somerville?.segmentRoles ?? doc?.segmentRoles ?? null;
    const points = rope.points;

    const tube = makeTube(points, radius, TUBE_OPTS);
    tubes.push(tube);
    const geometry = tubeToGeometry(tube);
    const colors = new Float32Array(tube.vertices.length * 3);
    for (let i = 0; i < tube.vertices.length; i++) {
      const index = Math.min(points.length - 2, Math.floor(i / TUBE_OPTS.radialSegments));
      const c = new THREE.Color(colorForLabel(segmentLabel(labels, index), semantic));
      c.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors:true, roughness:.82}));
    mesh.userData.ropeLabels = labels;
    mesh.userData.ropePoints = points.length;
    mesh.userData.isRope = true;
    root.add(mesh);

    const linePoints = points.map((p) => new THREE.Vector3(...p));
    centerlines.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePoints),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }),
      ),
    );
  }
}

function runChecks(ropes) {
  if (!ropes?.length) return null;
  const merged = {
    valid: true,
    selfIntersections: 0,
    foldedFaces: 0,
    columnPenetrations: 0,
    minimumColumnGap: Infinity,
  };
  for (const tube of tubes) {
    const part = checkTube(tube, { ...CHECK_OPTS, column: COLUMN });
    merged.valid &&= part.valid;
    merged.selfIntersections += part.selfIntersections ?? 0;
    merged.foldedFaces += part.foldedFaces ?? 0;
    merged.columnPenetrations += part.columnPenetrations ?? 0;
    if (typeof part.minimumColumnGap === 'number') {
      merged.minimumColumnGap = Math.min(merged.minimumColumnGap, part.minimumColumnGap);
    }
  }
  if (merged.minimumColumnGap === Infinity) merged.minimumColumnGap = null;
  return merged;
}

function formatGap(value) {
  return value == null || Number.isNaN(value) ? '—' : `${(value * 1000).toFixed(3)} mm`;
}

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderCheckPanel(state) {
  if (state === 'pending') {
    checkPanel.className = 'status pending';
    checkPanel.textContent = '檢查：等待幾何…';
    return;
  }
  if (state === 'error') return;
  checkPanel.className = report?.valid ? 'status' : 'status error';
  checkPanel.innerHTML = `
    <table class="check-table">
      <tr><th>項目</th><th>結果</th></tr>
      <tr><td>管體幾何通過</td><td>${report.valid ? '是' : '否'}</td></tr>
      <tr><td>管面自交</td><td>${report.selfIntersections}</td></tr>
      <tr><td>局部折疊</td><td>${report.foldedFaces}</td></tr>
      <tr><td>穿入柱體</td><td>${report.columnPenetrations}</td></tr>
      <tr><td>最小柱間隙</td><td>${formatGap(report.minimumColumnGap)}</td></tr>
      <tr><td>靜態重建（檔案）</td><td>${escapeHtml(doc?.somerville?.acceptance?.staticReconstruction?.status ?? '未驗證')}</td></tr>
      <tr><td>運動連續（檔案）</td><td>${escapeHtml(doc?.somerville?.acceptance?.motionContinuity?.status ?? '未驗證')}</td></tr>
    </table>`;
}

function fitCamera(points) {
  if (!points.length) {
    controls.target.set(0, 0, 0);
    viewScale = 0.35;
    return;
  }
  const box = new THREE.Box3().setFromPoints(points);
  controls.target.copy(box.getCenter(new THREE.Vector3()));
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.05);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  viewScale = span / (2 * Math.tan(fov / 2) * Math.min(camera.aspect, 1)) * 1.15;
  savedFull.target.copy(controls.target);
  savedFull.scale = viewScale;
  framing = 'full';
}

function frameCore(points) {
  const center = new THREE.Vector3();
  if (COLUMN?.center?.length === 3 && COLUMN.center.every((value) => Number.isFinite(value))) center.set(...COLUMN.center);
  else if (points.length) {
    const median = (axis) => {
      const values = points.map((point) => point.getComponent(axis)).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    };
    center.set(median(0), median(1), median(2));
  }
  controls.target.copy(center);
  const span = Math.max((COLUMN?.radius ?? 0.02) * 8, 0.1);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  viewScale = span / (2 * Math.tan(fov / 2) * Math.min(camera.aspect, 1)) * 1.35;
  framing = 'core';
}

function cameraOffsetForView(name) {
  if (name === 'core') return viewOffsets.front;
  return viewOffsets[name] ?? viewOffsets.oblique;
}

function applyViewDirection(name) {
  const offset = cameraOffsetForView(name);
  camera.position.copy(controls.target).add(new THREE.Vector3(...offset).multiplyScalar(viewScale));
  controls.update();
  document.querySelectorAll('#views button[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === name));
  });
}

function setView(name) {
  if (name === 'core' && doc) frameCore(collectPoints(doc.ropes));
  applyViewDirection(name);
}

function frameFullRope() {
  if (!doc) return;
  controls.target.copy(savedFull.target);
  viewScale = savedFull.scale;
  framing = 'full';
  const active = document.querySelector('#views button[data-view][aria-pressed="true"]');
  applyViewDirection(active?.dataset.view ?? 'oblique');
}

function updateAlignmentBadge() {
  // Tube geometry does not establish source alignment, and a static pass does not certify motion.
  badgeAlign.hidden = false;
  const example = doc?.knot?.recipe?.id === 'overhand';
  const staticStatus = doc?.somerville?.acceptance?.staticReconstruction?.status ?? null;
  const motionStatus = doc?.somerville?.acceptance?.motionContinuity?.status ?? null;
  const tubeOk = report?.valid !== false;
  if (example) {
    badgeAlign.textContent = '共用引擎範例；不涉及影片對齊';
    badgeAlign.className = 'badge warn';
    badgeMotion.hidden = true;
  } else if (staticStatus === 'PASS' && tubeOk) {
    badgeAlign.textContent = '靜態重建通過';
    badgeAlign.className = 'badge';
    badgeMotion.hidden = false;
  } else if (staticStatus === 'PASS' && !tubeOk) {
    badgeAlign.textContent = '管體幾何未通過（不採靜態通過）';
    badgeAlign.className = 'badge warn';
    badgeMotion.hidden = false;
  } else {
    badgeAlign.textContent = '尚未完成影片姿態對齊';
    badgeAlign.className = 'badge warn';
    badgeMotion.hidden = false;
  }
  if (!example) {
    if (motionStatus === 'PASS') {
      badgeMotion.textContent = '運動連續通過';
      badgeMotion.className = 'badge';
    } else {
      badgeMotion.textContent = '運動連續未驗證';
      badgeMotion.className = 'badge warn';
    }
  }
  document.querySelector('#reference').hidden = example;
}

function acceptanceLabel(document) {
  const acceptance = document?.somerville?.acceptance;
  if (acceptance?.staticReconstruction || acceptance?.motionContinuity) {
    return `靜態${acceptance.staticReconstruction?.status ?? '未驗證'} · 運動${acceptance.motionContinuity?.status ?? '未驗證'}`;
  }
  return acceptance?.status ?? document?.knot?.acceptance?.status ?? '候選';
}

function modelPath(key) {
  const option = [...modelSelect.options].find(o=>o.value===key);
  return option?.dataset.source ?? `${DATA_ROOT}/${key}.json`;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function mergeDressedReport(parsed, rawText) {
  if (!parsed.somerville) parsed.somerville = {};
  const prior = parsed.somerville.acceptance ?? {};
  const acceptance = { ...prior };
  delete acceptance.staticReconstruction;
  delete acceptance.motionContinuity;

  const candidateSha256 = await sha256Hex(rawText);
  let dressedReport = null;
  try {
    const reportResponse = await fetch(DRESSED_REPORT_PATH);
    if (reportResponse.ok) dressedReport = await reportResponse.json();
  } catch {
    dressedReport = null;
  }

  const reportMatches = dressedReport?.candidateSha256 === candidateSha256;
  if (reportMatches) {
    if (dressedReport.staticReconstruction) {
      acceptance.staticReconstruction = dressedReport.staticReconstruction;
    }
    if (dressedReport.motionContinuity) {
      acceptance.motionContinuity = dressedReport.motionContinuity;
    }
  }
  parsed.somerville.acceptance = acceptance;
  return { reportMatches, candidateSha256 };
}

async function refreshFinalOption() {
  const option = modelSelect.querySelector('option[value="final"]');
  let staticPass = false;
  try {
    const response = await fetch(modelPath('final'));
    if (response.ok) {
      const parsed = await response.json();
      staticPass = parsed?.somerville?.acceptance?.staticReconstruction?.status === 'PASS';
    }
  } catch {
    staticPass = false;
  }
  option.disabled = !staticPass;
  option.textContent = staticPass
    ? 'final.json · 靜態重建通過'
    : 'final.json · 靜態重建（尚未通過）';
  if (!staticPass && modelSelect.value === 'final') modelSelect.value = 'loose-v2';
}

function showLoadError(message) {
  loadStatus.className = 'status error';
  loadStatus.textContent = message;
  schemaNote.textContent = '';
  report = null;
  renderCheckPanel('error');
  checkPanel.className = 'status error';
  checkPanel.textContent = `檢查：無法執行（${message}）`;
  updateAlignmentBadge();
}

async function reload() {
  const token = ++loadToken;
  const key = modelSelect.value;
  renderCheckPanel('pending');
  loadStatus.className = 'status pending';
  loadStatus.textContent = `正在載入 ${key}.json…`;

  disposeGroup(root);
  disposeGroup(centerlines);
  root.add(centerlines);
  tubes = [];
  report = null;
  doc = null;

  let response;
  try {
    response = await fetch(modelPath(key));
  } catch (error) {
    console.error(error);
    if (token !== loadToken) return;
    showLoadError(`無法連線：${error.message}`);
    return;
  }

  if (response.status === 404) {
    if (token !== loadToken) return;
    showLoadError(
      key === 'loose'
        ? '尚未產生 loose.json（/data/somerville-final/）。幾何模組完成後再載入。'
        : `${key}.json 尚不存在。`,
    );
    return;
  }

  if (!response.ok) {
    if (token !== loadToken) return;
    showLoadError(`HTTP ${response.status}：無法讀取 ${key}.json`);
    console.error('Somerville fetch failed', response.status, response.statusText);
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    if (token !== loadToken) return;
    showLoadError(`${key}.json 尚不存在。`);
    return;
  }

  let parsed;
  let dressedMeta = null;
  try {
    if (key === 'dressed-candidate') {
      const rawText = await response.text();
      if (token !== loadToken) return;
      parsed = JSON.parse(rawText);
      dressedMeta = await mergeDressedReport(parsed, rawText);
      if (token !== loadToken) return;
    } else {
      parsed = await response.json();
    }
  } catch (error) {
    console.error(error);
    if (token !== loadToken) return;
    showLoadError('JSON 解析失敗');
    return;
  }

  if (token !== loadToken) return;

  try {
    validateDocument(parsed);
    if (parsed.ropes.length !== 1) throw new Error('此檢視器需要一條完整繩');
    doc = parsed;
    COLUMN = doc.somerville?.column ?? doc.knot?.column ?? null;
    addColumnHelper();
    const semantic = $('#semantic').checked;
    buildMeshes(doc.ropes, semantic);
    report = runChecks(doc.ropes);
    if (!report) throw new Error('無管狀網格可檢查');
  } catch (error) {
    console.error(error);
    showLoadError(`幾何建置失敗：${error.message}`);
    return;
  }

  const points = collectPoints(doc.ropes);
  centerlines.visible = $('#centerline').checked;
  fitCamera(points);
  setView(key === 'dressed-candidate' ? 'core' : 'oblique');

  loadStatus.className = 'status';
  let statusSuffix = acceptanceLabel(doc);
  if (key === 'dressed-candidate' && dressedMeta && !dressedMeta.reportMatches) {
    statusSuffix = `靜態未驗證 · 運動未驗證（報告與候選 SHA 不符或缺失）`;
  }
  loadStatus.textContent = `已載入 ${key}.json · ${statusSuffix} · ${doc.ropes.length} 條繩 · 座標 ${doc.coordinateSystem ?? '（未宣告）'}`;
  if (doc.coordinateSystem && doc.coordinateSystem !== 'right-handed Z-up') {
    schemaNote.textContent = `警告：coordinateSystem 為「${doc.coordinateSystem}」，預期 right-handed Z-up。`;
  } else {
    schemaNote.textContent = '中心線來自 JSON；管狀表面為 makeTube 三角網格（非額外 spline）。';
  }

  renderCheckPanel('done');
  updateAlignmentBadge();
  exposeDebug();
}

function exposeDebug() {
  window.somervilleDebug = {
    doc,
    mesh: root,
    tubes,
    report,
    scene,
    camera,
    controls,
    renderer,
    setView,
    frameFullRope,
    reload,
  };
}

for (const [name, label] of Object.entries(viewNames)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.view = name;
  button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => setView(name));
  $('#views').append(button);
}

const fullFrameButton = document.createElement('button');
fullFrameButton.type = 'button';
fullFrameButton.textContent = '全繩取景';
fullFrameButton.title = '以完整繩長取景（切換正/後/側視時維持核心取景則不會自動跳回）';
fullFrameButton.addEventListener('click', () => frameFullRope());
$('#views').append(fullFrameButton);

$('#centerline').addEventListener('change', () => {
  centerlines.visible = $('#centerline').checked;
});
$('#semantic').addEventListener('change', () => {
  root.traverse(mesh => {
    if (!mesh.userData.isRope) return;
    const attribute = mesh.geometry.getAttribute('color');
    for (let i = 0; i < attribute.count; i++) {
      const index = Math.min(mesh.userData.ropePoints - 2, Math.floor(i / TUBE_OPTS.radialSegments));
      const c = new THREE.Color(colorForLabel(segmentLabel(mesh.userData.ropeLabels,index), $('#semantic').checked));
      attribute.setXYZ(i,c.r,c.g,c.b);
    }
    attribute.needsUpdate=true;
  });
});
modelSelect.addEventListener('change', () => {
  reload().catch((error) => console.error(error));
});

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(stage);
resize();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

await refreshFinalOption();
exposeDebug();
await reload();
