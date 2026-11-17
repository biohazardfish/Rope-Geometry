import * as THREE from 'three';
import { makeTube } from './rope-tube.js';
import {
  EDITOR_PARAMETERS, advanceEditorStep, apertureMeasure, assessEditorTube, bambooSolids, buildBambooFixture,
  centroid, extendEditorPath, finishEditorStep, grabBasis, handleInterval, openEditorStep, sealEditorPath, snapGrabDelta,
} from './rope-edit-step.js';
import {
  boundsOf, dollyStep, frameCamera, orbitStep, panStep, pointerAction, triadPlacement,
} from './rope-edit-camera.js';
import {
  commitStep, createSession, fixtureByReference, loadSession, replaySession, serializeSession, undoSession,
} from './rope-edit-session.js';

const $ = (id) => document.getElementById(id);
let fixture = buildBambooFixture();
let session = createSession(fixture);
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1d20');
const camera = new THREE.PerspectiveCamera(fixture.cameraA.fov, 1, fixture.cameraA.near, fixture.cameraA.far);
const target = new THREE.Vector3();
scene.add(new THREE.HemisphereLight(0xf7f3ea, 0x3a433c, 1.05));
const key = new THREE.DirectionalLight(0xfff7ee, 1.85);
key.position.set(1.2, -0.6, 2.4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xd7e4dc, 0.7);
fill.position.set(-1.8, 1.1, 1.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xcfe0d4, 0.35);
rim.position.set(0.2, 1.8, 0.4);
scene.add(rim);
const dressing = new THREE.Group();
const ropeRoot = new THREE.Group();
const sleeveRoot = new THREE.Group();
const markerRoot = new THREE.Group();
scene.add(dressing, ropeRoot, sleeveRoot, markerRoot);

const triadScene = new THREE.Scene();
const triadCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 20);
buildTriad();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane();
const hitPoint = new THREE.Vector3();
let phase = 'idle';
let shift = false;
let cameraEnabled = true;
let cameraLock = null;
let cameraGesture = null;
let framed = false;
let ropeMesh = null;
let drag = null;
let playbackTimer = 0;
let selected = null;
let hover = null;
const sleeves = { hover: null, selected: null };
const requestedLine = line('#9eb6d2');
const actualLine = line('#d7b56d');
scene.add(requestedLine, actualLine);
let bambooMap = null;
let hempMaps = null;

applyCamera(session.cameraA);
present();
resize();
rebuildRope();
refreshHud();

function line(color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
}
function setLine(object, points) {
  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry().setFromPoints(points.length ? points.map((p) => new THREE.Vector3(...p)) : [new THREE.Vector3(), new THREE.Vector3()]);
  object.visible = points.length > 1;
}
function readCamera() {
  return {
    projection: 'perspective', fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far, zoom: camera.zoom,
    position: camera.position.toArray(), target: target.toArray(), up: camera.up.toArray(),
  };
}
function applyCamera(record) {
  camera.up.set(...record.up);
  camera.position.set(...record.position);
  camera.fov = record.fov;
  camera.near = record.near;
  camera.far = record.far;
  camera.zoom = record.zoom ?? 1;
  camera.aspect = record.aspect || camera.aspect || 1;
  target.set(...record.target);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
function lockCamera() {
  cameraLock = readCamera();
  cameraEnabled = false;
}
function unlockCamera() {
  cameraLock = null;
  cameraEnabled = phase === 'idle';
}
function subjectExtras(source = fixture) {
  const extra = [];
  if (source.bamboo) {
    const center = source.column.center, r = source.column.radius;
    const a0 = source.bamboo.base, a1 = a0 + source.bamboo.height;
    if (source.bamboo.axis === 'Y') {
      extra.push([center[0] - r, a0, center[2] - r], [center[0] + r, a0, center[2] + r], [center[0] - r, a1, center[2] - r], [center[0] + r, a1, center[2] + r]);
    } else if (source.bamboo.axis === 'Z') {
      extra.push([center[0] - r, center[1] - r, a0], [center[0] + r, center[1] + r, a0], [center[0] - r, center[1] - r, a1], [center[0] + r, center[1] + r, a1]);
    } else {
      extra.push([a0, center[1] - r, center[2] - r], [a1, center[1] + r, center[2] + r]);
    }
  } else if (source.column) {
    const index = 'XYZ'.indexOf(source.column.axis);
    const axis = source.column.frame.axes[index];
    const center = source.column.center;
    extra.push(center.map((v, k) => v + axis[k] * 0.21), center.map((v, k) => v - axis[k] * 0.21));
    const side = source.column.frame.axes[(index + 1) % 3];
    extra.push(center.map((v, k) => v + side[k] * source.column.radius));
  }
  if (source.aperture) extra.push([...source.aperture.center]);
  return extra;
}
function viewFrame() {
  if (phase !== 'idle' || cameraGesture) return;
  const bounds = boundsOf(session.points, subjectExtras());
  applyCamera(frameCamera(readCamera(), bounds, { aspect: camera.aspect, padding: 1.32 }));
  session.cameraA = readCamera();
}
function upName(up = fixture.cameraA.up) {
  if (up[1] > 0.9) return 'Y';
  if (up[2] > 0.9) return 'Z';
  return 'X';
}
function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    const materials = child.material ? [].concat(child.material) : [];
    for (const material of materials) {
      if (material.map && material.map !== bambooMap) material.map.dispose();
      material.dispose?.();
    }
  });
}
function bambooTexture() {
  if (bambooMap) return bambooMap;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  // Ink-green bamboo: keep the hue, but stay mid-tone so MeshStandard lighting can read form.
  context.fillStyle = '#5f9a72';
  context.fillRect(0, 0, 128, 512);
  for (let x = 0; x < 128; x++) {
    const band = 0.5 + 0.5 * Math.sin(x * 0.35);
    const fiber = 0.5 + 0.5 * Math.sin(x * 1.63 + 0.6);
    context.fillStyle = `rgba(28, 72, 46, ${0.05 + 0.16 * band * fiber})`;
    context.fillRect(x, 0, 1, 512);
  }
  for (const x of [8, 22, 37, 54, 71, 89, 104, 118]) {
    context.fillStyle = 'rgba(24, 58, 38, 0.18)';
    context.fillRect(x, 0, 2, 512);
  }
  for (let y = 0; y < 512; y += 3) {
    const mottled = 0.5 + 0.5 * Math.sin(y * 0.11) * Math.sin(y * 0.027);
    context.fillStyle = `rgba(168, 214, 176, ${0.03 + 0.08 * mottled})`;
    context.fillRect(0, y, 128, 2);
  }
  bambooMap = new THREE.CanvasTexture(canvas);
  bambooMap.colorSpace = THREE.SRGBColorSpace;
  bambooMap.wrapS = bambooMap.wrapT = THREE.RepeatWrapping;
  bambooMap.anisotropy = 4;
  return bambooMap;
}
function hempTextures() {
  if (hempMaps) return hempMaps;
  const size = 256;
  const color = document.createElement('canvas');
  const bump = document.createElement('canvas');
  color.width = color.height = bump.width = bump.height = size;
  const c = color.getContext('2d');
  const b = bump.getContext('2d');
  c.fillStyle = '#b98a52';
  c.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  const image = c.createImageData(size, size);
  const bumpImage = b.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const twist = (u * 3 + v * 0.35) % 1;
      const strand = Math.floor(twist * 3);
      const local = twist * 3 - strand;
      const ridge = Math.sin(local * Math.PI);
      const fiber = 0.55 + 0.45 * Math.sin((u * 48 + v * 7 + strand) * Math.PI * 2);
      const fuzz = 0.5 + 0.5 * Math.sin(u * 91.3 + v * 17.7) * Math.sin(u * 13.1 - v * 53.4);
      const shade = 0.62 + 0.22 * ridge + 0.1 * fiber + 0.06 * fuzz;
      const i = (y * size + x) * 4;
      image.data[i] = Math.round(148 * shade);
      image.data[i + 1] = Math.round(108 * shade);
      image.data[i + 2] = Math.round(64 * shade);
      image.data[i + 3] = 255;
      const height = Math.round(90 + 110 * ridge + 30 * fiber + 18 * fuzz);
      bumpImage.data[i] = bumpImage.data[i + 1] = bumpImage.data[i + 2] = Math.max(0, Math.min(255, height));
      bumpImage.data[i + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  b.putImageData(bumpImage, 0, 0);
  const map = new THREE.CanvasTexture(color);
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const texture of [map, bumpMap]) {
    texture.colorSpace = texture === map ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  map.repeat.set(1, 1);
  bumpMap.repeat.set(1, 1);
  hempMaps = { map, bumpMap };
  return hempMaps;
}
function textSprite(text, color, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.font = '600 52px system-ui, "PingFang TC", sans-serif';
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 128, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.renderOrder = 4;
  return sprite;
}
function buildTriad() {
  const colors = [0xd36a5c, 0x7dba82, 0x6a95d6];
  const names = ['X', 'Y', 'Z'];
  for (let axis = 0; axis < 3; axis++) {
    const dir = [0, 0, 0];
    dir[axis] = 1;
    triadScene.add(new THREE.ArrowHelper(new THREE.Vector3(...dir), new THREE.Vector3(), 0.85, colors[axis], 0.18, 0.1));
    const label = textSprite(names[axis], '#' + colors[axis].toString(16).padStart(6, '0'), [0.42, 0.16]);
    label.position.set(...dir.map((v) => v * 1.12));
    triadScene.add(label);
  }
}
function present() {
  disposeObject(dressing);
  dressing.clear();
  const up = new THREE.Vector3(...fixture.cameraA.up).normalize();
  const grid = new THREE.GridHelper(2.4, 24, 0x3c4148, 0x2a2e33);
  grid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  dressing.add(grid);
  if (fixture.bamboo) {
    const map = bambooTexture();
    const axisDir = new THREE.Vector3(...({ X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }[fixture.bamboo.axis] ?? [0, 0, 1]));
    for (const solid of bambooSolids(fixture)) {
      // Node profile is a fraction of the dressed radius, which itself stays inside the collision cylinder.
      const radius = Math.min(solid.radius, fixture.column.radius);
      const profile = [[0.88, -0.5], [0.94, -0.35], [1, -0.12], [0.98, 0.12], [0.92, 0.35], [0.88, 0.5]];
      const geometry = solid.kind === 'node'
        ? new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.min(r, 1) * radius, y * solid.height)), 48)
        : new THREE.CylinderGeometry(radius, radius, solid.height, 48, 1, false);
      const material = new THREE.MeshStandardMaterial({
        color: solid.kind === 'node' ? 0x6fad80 : 0x86c094,
        map, roughness: solid.kind === 'node' ? 0.72 : 0.84, metalness: 0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisDir);
      mesh.position.set(...solid.position);
      dressing.add(mesh);
    }
  } else if (fixture.column) {
    const column = fixture.column;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(column.radius, column.radius, 0.42, 40),
      new THREE.MeshStandardMaterial({ color: 0x87949d, transparent: true, opacity: 0.28, roughness: 1, depthWrite: false }),
    );
    const axis = column.frame.axes['XYZ'.indexOf(column.axis)];
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis));
    mesh.position.set(...column.center);
    dressing.add(mesh);
  }
  if (fixture.aperture) {
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(fixture.aperture.radius, 64),
      new THREE.MeshBasicMaterial({ color: 0x8aa4b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    disk.position.set(...fixture.aperture.center);
    disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...fixture.aperture.normal));
    dressing.add(disk);
  }
  const bounds = boundsOf(fixture.points, subjectExtras());
  const upIndex = fixture.cameraA.up.findIndex((v) => Math.abs(v) > 0.9);
  const outward = Math.max(0.42, bounds.radius);
  const origin = fixture.bamboo
    ? [fixture.column.center[0] - 0.55, fixture.bamboo.base - 0.05, 0.002]
    : bounds.center.map((value, axis) => (axis === upIndex ? Math.min(0, bounds.min[axis]) + 0.002 : bounds.min[axis] - outward));
  const colors = [0xd36a5c, 0x7dba82, 0x6a95d6];
  const names = ['X', 'Y', 'Z'];
  for (let axis = 0; axis < 3; axis++) addAxis(dressing, origin, axis, colors[axis], names[axis], 0.24);
  layoutMarkers(session.points);
  const name = upName();
  $('coord-readout').textContent = `${name} 向上`;
  $('up-chip').textContent = `${name} 向上`;
  $('frame-note').textContent = fixture.referenceId === 'bamboo-u-v1'
    ? 'Z 向上。竹子沿 Y 橫放。紅 X、綠 Y、藍 Z。'
    : `此工作階段是 ${name} 向上。幾何維持原參考。`;
  $('frame-view').title = fixture.bamboo ? '把竹與繩放進畫面（F）' : '把繩與柱放進畫面（F）';
}
function addAxis(parent, origin, axis, color, name, length) {
  const dir = new THREE.Vector3();
  dir.setComponent(axis, 1);
  const shaftLen = length * 0.78;
  const headLen = length * 0.22;
  const material = new THREE.MeshBasicMaterial({ color });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, shaftLen, 10), material);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.013, headLen, 14), material);
  const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  shaft.quaternion.copy(aim);
  head.quaternion.copy(aim);
  const base = new THREE.Vector3(...origin);
  shaft.position.copy(base).addScaledVector(dir, shaftLen / 2);
  head.position.copy(base).addScaledVector(dir, shaftLen + headLen / 2);
  parent.add(shaft, head);
  const label = textSprite(name, `#${color.toString(16).padStart(6, '0')}`, [0.042, 0.017]);
  label.position.copy(base).addScaledVector(dir, length + 0.03);
  parent.add(label);
}
function markerSpecs() {
  const specs = [{ index: fixture.bightIndex, name: '繩耳', color: '#e2c07a' }];
  if (fixture.referenceId === 'bamboo-u-v1') {
    specs.unshift({ index: 0, name: '尾端 1', color: '#d7a06a' });
    specs.push({ index: session.initialState.points.length - 1, name: '尾端 2', color: '#d7a06a' });
  }
  return specs;
}
function layoutMarkers(points) {
  const specs = markerSpecs();
  const current = markerRoot.children.filter((child) => child.userData.marker);
  if (current.length !== specs.length || current.some((child, i) => child.userData.name !== specs[i].name)) {
    disposeObject(markerRoot);
    markerRoot.clear();
    for (const spec of specs) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0042, 16, 12),
        new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.45, metalness: 0 }),
      );
      dot.userData.marker = true;
      dot.userData.name = spec.name;
      dot.userData.index = spec.index;
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      proxy.userData.pickS0 = fixture.s0[spec.index];
      const label = textSprite(spec.name, spec.color, [0.036, 0.014]);
      markerRoot.add(dot, proxy, label);
      dot.userData.proxy = proxy;
      dot.userData.label = label;
    }
  }
  for (const child of markerRoot.children) {
    if (!child.userData.marker) continue;
    const point = points[child.userData.index];
    const offset = { '尾端 1': [0.016, -0.042, 0.038], '尾端 2': [0.016, 0.042, 0.038], 繩耳: [0.036, 0, -0.018] }[child.userData.name] ?? [0, 0, 0.028];
    child.position.set(point[0], point[1], point[2]);
    child.userData.proxy.position.set(point[0], point[1], point[2]);
    child.userData.label.position.set(point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]);
  }
}
function colorFor(index) {
  const label = fixture.labels?.[Math.min(index, (fixture.labels?.length ?? 1) - 1)] ?? '';
  const previous = index > 0 ? fixture.labels?.[index - 1] : label;
  if (label === 'bight' || previous === 'bight') return [0.92, 0.78, 0.52];
  if (label === 'tail' || previous === 'tail') return [0.86, 0.7, 0.46];
  if (label === 'loop' || label === 'neck' || previous === 'loop' || previous === 'neck') return [0.88, 0.68, 0.42];
  return [0.8, 0.66, 0.44];
}
function rebuildRope(points = session.points) {
  ropeMesh?.geometry.dispose();
  if (ropeMesh?.material) {
    const materials = [].concat(ropeMesh.material);
    for (const material of materials) {
      if (material.map && material.map !== hempMaps?.map && material.map !== bambooMap) material.map.dispose();
      if (material.bumpMap && material.bumpMap !== hempMaps?.bumpMap) material.bumpMap.dispose();
      material.dispose?.();
    }
  }
  ropeRoot.clear();
  const radial = Math.max(EDITOR_PARAMETERS.radialSegments, 24);
  const tube = makeTube(points, fixture.diameter / 2, { radialSegments: radial });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(tube.vertices.flat(), 3));
  const colors = [];
  const uvs = [];
  let arc = 0;
  const pitch = Math.PI * fixture.diameter;
  for (let i = 0; i < points.length; i++) {
    if (i) arc += Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
    const color = colorFor(i);
    const v = arc / pitch;
    for (let j = 0; j < radial; j++) {
      colors.push(...color);
      uvs.push(j / radial, v);
    }
  }
  colors.push(...colorFor(0), ...colorFor(points.length - 1));
  uvs.push(0, 0, 0, arc / pitch);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(tube.indices.flat());
  geometry.computeVertexNormals();
  const hemp = hempTextures();
  ropeMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: hemp.map,
    bumpMap: hemp.bumpMap,
    bumpScale: fixture.diameter * 0.55,
    roughness: 0.97,
    metalness: 0,
  }));
  ropeMesh.userData.sideFaces = (points.length - 1) * radial * 2;
  ropeRoot.add(ropeMesh);
  layoutMarkers(points);
}
function clearSleeve(kind) {
  const mesh = sleeves[kind];
  if (!mesh) return;
  mesh.geometry.dispose();
  mesh.material.dispose();
  sleeveRoot.remove(mesh);
  sleeves[kind] = null;
}
function setSleeve(kind, indices, points, color, opacity) {
  clearSleeve(kind);
  if (!indices || indices.length < 2) return;
  const tube = makeTube(indices.map((index) => points[index]), fixture.diameter * 0.62, { radialSegments: 8 });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(tube.vertices.flat(), 3));
  geometry.setIndex(tube.indices.flat());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
  mesh.renderOrder = 2;
  sleeveRoot.add(mesh);
  sleeves[kind] = mesh;
}
function regionName(indices, points = session.points) {
  if (!indices?.length) return '沒有';
  let bight = false;
  let tail = false;
  for (const index of indices) {
    const label = fixture.labels?.[index] ?? fixture.labels?.[index - 1] ?? '';
    const previous = index > 0 ? fixture.labels?.[index - 1] : label;
    if (label === 'bight' || previous === 'bight') bight = true;
    if (label === 'tail' || previous === 'tail') tail = true;
  }
  if (fixture.referenceId === 'bamboo-u-v1') {
    if (bight) return '繩耳';
    const z = indices.reduce((sum, index) => sum + points[index][2], 0) / indices.length;
    if (z < -1e-4) return '尾端 1';
    if (z > 1e-4) return '尾端 2';
  }
  if (bight) return '繩耳';
  if (tail) return '尾端';
  return '繩身';
}
function materialAt(hit) {
  const radial = EDITOR_PARAMETERS.radialSegments;
  const side = ropeMesh.userData.sideFaces;
  const s0 = session.initialState.s0;
  if (hit.faceIndex >= side) return (hit.faceIndex - side) % 2 === 1 ? s0.at(-1) : s0[0];
  const segment = Math.floor(hit.faceIndex / (radial * 2));
  const a = session.points[segment], b = session.points[segment + 1];
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [hit.point.x - a[0], hit.point.y - a[1], hit.point.z - a[2]];
  const denom = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = denom ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / denom)) : 0;
  return s0[segment] + t * (s0[segment + 1] - s0[segment]);
}
function pick(event) {
  pointerRay(event);
  const proxies = markerRoot.children.filter((child) => child.userData.pickS0 != null);
  const hits = raycaster.intersectObjects([ropeMesh, ...proxies], false);
  if (!hits.length) return null;
  const hit = hits[0];
  if (hit.object.userData.pickS0 != null) return { s: hit.object.userData.pickS0, point: hit.point.clone() };
  return { s: materialAt(hit), point: hit.point.clone() };
}
function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
  return total;
}
function refreshHud(extra = '') {
  const name = upName();
  $('coord-readout').textContent = `${name} 向上`;
  const aperture = $('aperture-status');
  if (!fixture.aperture) aperture.hidden = true;
  else {
    const measure = apertureMeasure(session.points, fixture);
    aperture.hidden = false;
    aperture.textContent = `收環有號距離 ${(measure.signed * 1000).toFixed(1)} mm。`;
  }
  $('hover-readout').textContent = regionName(hover);
  $('selection-readout').textContent = regionName(selected);
  const busy = phase !== 'idle';
  for (const id of ['undo', 'play', 'verify', 'export', 'reset', 'frame-view']) $(id).disabled = busy;
  $('import').disabled = busy;
  $('timeline').textContent = session.timeline.map((event, i) => event.kind === 'A'
    ? `${i + 1}  視角`
    : `${i + 1}  拖曳 · ${session.steps[event.step].accepted.length} 子步`).join('\n') || '尚無步驟';
  if (extra) $('step-status').textContent = extra;
}
function clearReadouts() {
  setLine(requestedLine, []);
  setLine(actualLine, []);
  $('request-readout').textContent = '0.0 mm';
  $('actual-readout').textContent = '0.0 mm';
}
function adopt(result, handle, cameras) {
  if (!result.ok || !result.accepted.length) {
    session.mode = 'A';
    session.points = result.points.map((p) => [...p]);
    rebuildRope();
    setSleeve('selected', selected, session.points, 0xd7b56d, 0.45);
    $('step-status').className = 'error';
    refreshHud(result.reason === 'tube' ? '整步已退回：管體檢查未通過。' : '這一步沒有產生可接受的位移。');
    return false;
  }
  commitStep(session, result, cameras, handle);
  const requested = pathLength(result.requestedPath);
  const actual = pathLength(result.accepted.map((item) => centroid(item.points, handle.indices)));
  $('request-readout').textContent = `${(requested * 1000).toFixed(1)} mm`;
  $('actual-readout').textContent = `${(actual * 1000).toFixed(1)} mm`;
  setLine(requestedLine, result.requestedPath);
  setLine(actualLine, result.accepted.map((item) => centroid(item.points, handle.indices)));
  rebuildRope();
  setSleeve('selected', selected, session.points, 0xd7b56d, 0.45);
  $('step-status').className = '';
  refreshHud(`已接受 ${result.accepted.length} 個子步。`);
  return true;
}
function resize() {
  const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (!framed && width > 2 && height > 2 && phase === 'idle' && !cameraGesture) {
    framed = true;
    viewFrame();
  } else if (phase === 'idle' && !cameraGesture && !cameraLock) session.cameraA = readCamera();
}
window.addEventListener('resize', resize);
function pointerRay(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}
function anchorFromPointer(event) {
  pointerRay(event);
  if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null;
  const raw = hitPoint.clone().sub(drag.down).toArray();
  const delta = snapGrabDelta(raw, drag.basis, shift);
  return drag.origin.map((v, k) => v + delta[k]);
}
function trackDesired(anchor) {
  drag.lastAnchor = anchor;
  const path = drag.ctx.requestedPath;
  const gap = Math.hypot(...anchor.map((v, k) => v - path.at(-1)[k]));
  if (path.length > 1 && gap <= 0.0004) extendEditorPath(drag.ctx, anchor, { tip: true });
  else if (gap > 0.0004) extendEditorPath(drag.ctx, anchor);
  drag.ghost = path.length === 1 && gap > 1e-8 ? anchor : null;
}
function drainDrag() {
  const active = drag;
  if (!active || active.scheduled) return;
  active.scheduled = true;
  setTimeout(() => {
    if (drag !== active) return;
    active.scheduled = false;
    try {
      const step = advanceEditorStep(active.ctx);
      if (step.accepted) {
        active.blocked = false;
        active.revision++;
        active.actual.push(centroid(active.ctx.current, active.handle.indices));
      } else if (step.reason === 'blocked') active.blocked = true;
      paintDrag();
      if (active.ctx.closed && active.ctx.done) {
        const result = finishEditorStep(active.ctx);
        const handle = active.handle;
        const cameras = active.cameras;
        drag = null;
        phase = 'idle';
        unlockCamera();
        adopt(result, handle, cameras);
        return;
      }
      if (!step.done && step.reason !== 'pending') drainDrag();
    } catch (error) {
      cancelDrag(`這一步已中止。${error.message}`);
    }
  }, 0);
}
function paintDrag() {
  if (!drag) return;
  if (drag.painted !== drag.revision) {
    rebuildRope(drag.ctx.current);
    drag.painted = drag.revision;
  }
  clearSleeve('hover');
  setSleeve('selected', drag.handle.indices, drag.ctx.current, drag.blocked ? 0xd4574a : 0xffe3a8, 0.58);
  const requested = drag.ghost ? [...drag.ctx.requestedPath, drag.ghost] : drag.ctx.requestedPath;
  setLine(requestedLine, requested);
  setLine(actualLine, drag.actual);
  $('request-readout').textContent = `${(pathLength(requested) * 1000).toFixed(1)} mm${shift ? ' · 已吸附 45°' : ''}`;
  $('actual-readout').textContent = `${(pathLength(drag.actual) * 1000).toFixed(1)} mm`;
  $('step-status').className = drag.blocked ? 'error' : '';
  const span = `可動段 ${((drag.handle.s0End - drag.handle.s0Start) * 1000) | 0} mm，上限 ${(fixture.diameter * 6000) | 0} mm。`;
  refreshHud(drag.blocked
    ? '這一段被擋住。放開後才檢查整條管體。'
    : (drag.ctx.accepted.length ? `已接受 ${drag.ctx.accepted.length} 個子步。放開後才檢查整條管體。` : span));
}
function releaseDragPointer() {
  if (!drag) return;
  const pointerId = drag.pointerId;
  drag.ignoreLost = true;
  try { renderer.domElement.releasePointerCapture(pointerId); } catch { /* capture already gone */ }
}
function cancelDrag(message) {
  if (!['dragging', 'solving'].includes(phase) || !drag) {
    unlockCamera();
    return;
  }
  releaseDragPointer();
  drag = null;
  phase = 'idle';
  session.mode = 'A';
  unlockCamera();
  clearReadouts();
  rebuildRope(session.points);
  setSleeve('selected', selected, session.points, 0xd7b56d, 0.45);
  $('step-status').className = '';
  session.audit.push({ seq: session.audit.length, op: 'cancel', ok: true });
  refreshHud(message);
  renderer.domElement.style.cursor = '';
}
function stepInput(handle) {
  return {
    points: session.points, restLengths: session.initialState.restLengths, pins: session.pins, column: session.initialState.column,
    diameter: session.initialState.diameter, handleIndices: handle.indices, parameters: session.parameters,
  };
}
function startDrag(event, hit) {
  const handle = handleInterval(session.initialState.s0, session.pins, hit.s, fixture.diameter, EDITOR_PARAMETERS.handleDiameters);
  if (!handle) {
    $('step-status').className = 'error';
    refreshHud('這裡沒有可動的材料。');
    return;
  }
  const origin = centroid(session.points, handle.indices);
  const basis = grabBasis(readCamera());
  plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(...basis.forward), hit.point);
  session.cameraA = readCamera();
  session.cameraB = readCamera();
  session.mode = 'B';
  phase = 'dragging';
  lockCamera();
  selected = [...handle.indices];
  hover = null;
  drag = {
    handle, origin, down: hit.point.clone(), basis, pointerId: event.pointerId, ignoreLost: false,
    blocked: false, revision: 0, painted: -1, ghost: null, lastAnchor: [...origin],
    actual: [[...origin]],
    cameras: { cameraA: structuredClone(session.cameraA), cameraB: structuredClone(session.cameraB) },
    ctx: openEditorStep({ ...stepInput(handle), requestedPath: [origin] }),
  };
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* pointer already inactive */ }
  renderer.domElement.style.cursor = 'grabbing';
  paintDrag();
}
function finishDrag(event) {
  if (phase !== 'dragging' || !drag || (event && event.pointerId !== drag.pointerId)) return;
  releaseDragPointer();
  phase = 'solving';
  const anchor = event ? (anchorFromPointer(event) ?? drag.lastAnchor) : drag.lastAnchor;
  trackDesired(anchor);
  const ctx = drag.ctx;
  if (!ctx.accepted.length && pathLength(ctx.requestedPath) < 0.0004) {
    drag = null;
    phase = 'idle';
    session.mode = 'A';
    unlockCamera();
    clearReadouts();
    rebuildRope(session.points);
    setSleeve('selected', selected, session.points, 0xd7b56d, 0.45);
    $('step-status').className = '';
    refreshHud('位移太小，沒有形成一步。');
    renderer.domElement.style.cursor = '';
    return;
  }
  try {
    sealEditorPath(ctx);
    refreshHud('正在結算最後的子步。Esc 可取消。');
    drainDrag();
  } catch (error) {
    cancelDrag(`這一步已中止。${error.message}`);
  }
}
function startNavigation(kind, event) {
  cameraGesture = { kind, pointerId: event.pointerId, button: event.button, x: event.clientX, y: event.clientY };
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* already captured */ }
  renderer.domElement.style.cursor = kind === 'pan' ? 'all-scroll' : kind === 'dolly' ? 'ns-resize' : 'grabbing';
}
function moveNavigation(event) {
  if (!cameraGesture || event.pointerId !== cameraGesture.pointerId) return false;
  const dx = event.clientX - cameraGesture.x;
  const dy = event.clientY - cameraGesture.y;
  cameraGesture.x = event.clientX;
  cameraGesture.y = event.clientY;
  if (!dx && !dy) return true;
  const current = readCamera();
  const height = renderer.domElement.clientHeight || 1;
  // Kind stays as it was at pointer-down. Alt changing mid-drag does not retarget it.
  const next = cameraGesture.kind === 'orbit' ? orbitStep(current, dx, dy)
    : cameraGesture.kind === 'pan' ? panStep(current, dx, dy, { pixels: height })
      : dollyStep(current, -(dx + dy) * 1.8);
  applyCamera(next);
  if (phase === 'idle') session.cameraA = readCamera();
  return true;
}
function endNavigation(event) {
  if (!cameraGesture) return;
  if (event && event.pointerId !== cameraGesture.pointerId) return;
  if (event?.type === 'pointerup' && event.button !== cameraGesture.button) return;
  const pointerId = cameraGesture.pointerId;
  cameraGesture = null;
  try { renderer.domElement.releasePointerCapture(pointerId); } catch { /* already released */ }
  if (phase === 'idle' && !cameraLock) session.cameraA = readCamera();
  if (phase === 'idle') renderer.domElement.style.cursor = '';
}
function hoverAt(event) {
  if (phase !== 'idle' || cameraGesture) return;
  const hit = pick(event);
  if (!hit) {
    hover = null;
    clearSleeve('hover');
    $('hover-readout').textContent = '沒有';
    $('material-readout').textContent = selected ? `${(session.initialState.s0[selected[0]] * 1000).toFixed(1)} mm` : '—';
    renderer.domElement.style.cursor = '';
    return;
  }
  const handle = handleInterval(session.initialState.s0, session.pins, hit.s, fixture.diameter, EDITOR_PARAMETERS.handleDiameters);
  hover = handle ? [...handle.indices] : null;
  const same = selected && hover && selected.join() === hover.join();
  if (same) clearSleeve('hover');
  else setSleeve('hover', hover, session.points, 0xf0d7a2, 0.34);
  $('hover-readout').textContent = regionName(hover);
  $('material-readout').textContent = `${(hit.s * 1000).toFixed(1)} mm`;
  renderer.domElement.style.cursor = handle ? 'grab' : '';
}
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 1 || event.button === 2) event.preventDefault();
  const action = pointerAction({
    button: event.button, altKey: event.altKey, cameraEnabled,
    ropeDrag: phase === 'dragging' || phase === 'solving', navigating: cameraGesture != null,
  });
  if (action === 'orbit' || action === 'pan' || action === 'dolly') {
    event.preventDefault();
    startNavigation(action, event);
    return;
  }
  if (action !== 'rope' || phase !== 'idle') return;
  const hit = pick(event);
  if (!hit) return;
  startDrag(event, hit);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (moveNavigation(event)) return;
  if (phase === 'dragging' && drag && event.pointerId === drag.pointerId) {
    const anchor = anchorFromPointer(event);
    if (!anchor) return;
    trackDesired(anchor);
    drainDrag();
    paintDrag();
    return;
  }
  hoverAt(event);
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (cameraGesture && event.pointerId === cameraGesture.pointerId && event.button === cameraGesture.button) {
    endNavigation(event);
    return;
  }
  finishDrag(event);
});
renderer.domElement.addEventListener('pointercancel', (event) => {
  if (cameraGesture && event.pointerId === cameraGesture.pointerId) endNavigation(event);
  if (phase === 'dragging' && drag && event.pointerId === drag.pointerId) cancelDrag('拖曳已取消，預覽已回到已接受的繩。視角已恢復。');
});
renderer.domElement.addEventListener('lostpointercapture', (event) => {
  if (cameraGesture && event.pointerId === cameraGesture.pointerId) {
    cameraGesture = null;
    if (phase === 'idle') renderer.domElement.style.cursor = '';
  }
  if (phase === 'dragging' && drag && !drag.ignoreLost && event.pointerId === drag.pointerId) {
    cancelDrag('指標捕捉中斷，預覽已回到已接受的繩。視角已恢復。');
  }
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('auxclick', (event) => event.preventDefault());
renderer.domElement.addEventListener('wheel', (event) => {
  if (!cameraEnabled || phase !== 'idle' || cameraGesture || cameraLock) return;
  event.preventDefault();
  const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * (renderer.domElement.clientHeight || 1) : event.deltaY;
  applyCamera(dollyStep(readCamera(), pixels));
  session.cameraA = readCamera();
}, { passive: false });
window.addEventListener('pointerup', (event) => {
  if (cameraGesture && event.pointerId === cameraGesture.pointerId && event.button === cameraGesture.button) endNavigation(event);
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'Shift') shift = true;
  if (event.key === 'Escape' && (phase === 'dragging' || phase === 'solving' || playbackTimer)) {
    event.preventDefault();
    if (phase === 'dragging' || phase === 'solving') cancelDrag('已取消整步，繩回到這一步之前。視角已恢復。');
    else stopPlayback(true);
  }
  if ((event.key === 'f' || event.key === 'F') && !event.altKey && !event.metaKey && !event.ctrlKey && phase === 'idle' && !cameraGesture) {
    event.preventDefault();
    viewFrame();
    refreshHud('已框選。');
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && phase === 'idle') {
    event.preventDefault();
    undo();
  }
});
window.addEventListener('keyup', (event) => { if (event.key === 'Shift') { shift = false; if (drag) paintDrag(); } });
function undo() {
  if (phase !== 'idle') return false;
  if (!undoSession(session)) { refreshHud('沒有可復原的步驟。'); return false; }
  clearReadouts();
  applyCamera(session.mode === 'B' && session.cameraB ? session.cameraB : session.cameraA);
  unlockCamera();
  cameraEnabled = true;
  selected = null;
  hover = null;
  clearSleeve('hover');
  clearSleeve('selected');
  rebuildRope();
  refreshHud('已復原繩的形狀與相機。');
  return true;
}
$('undo').addEventListener('click', undo);
$('frame-view').addEventListener('click', () => { viewFrame(); refreshHud('已框選。'); });
$('reset').addEventListener('click', () => {
  if (phase !== 'idle') return;
  const next = fixtureByReference(session.initialState.referenceId) ?? buildBambooFixture();
  session = createSession(next);
  fixture = next;
  present();
  applyCamera(next.cameraA);
  viewFrame();
  selected = null;
  hover = null;
  clearSleeve('hover');
  clearSleeve('selected');
  clearReadouts();
  rebuildRope();
  refreshHud('已回到初始形狀與視角。');
});
$('export').addEventListener('click', () => {
  if (phase === 'idle' && !cameraGesture) session.cameraA = readCamera();
  const blob = new Blob([serializeSession(session)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'rope-edit-session.json';
  link.click();
  URL.revokeObjectURL(url);
});
function useSession(next) {
  session = next;
  const resolved = fixtureByReference(session.initialState.referenceId);
  if (!resolved) return false;
  fixture = resolved;
  framed = true;
  present();
  applyCamera(session.mode === 'B' && session.cameraB ? session.cameraB : session.cameraA);
  cameraGesture = null;
  cameraLock = null;
  cameraEnabled = true;
  phase = 'idle';
  selected = null;
  hover = null;
  clearSleeve('hover');
  clearSleeve('selected');
  clearReadouts();
  rebuildRope();
  return true;
}
$('import').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || phase !== 'idle') return;
  phase = 'loading';
  cameraEnabled = false;
  refreshHud('正在核對工作階段。');
  let loaded;
  try { loaded = loadSession(await file.text()); }
  catch { loaded = { ok: false, errors: ['file'] }; }
  phase = 'idle';
  cameraEnabled = true;
  if (!loaded.ok) {
    $('step-status').className = 'error';
    refreshHud(`沒有載入。檢查未過：${loaded.errors.join('、')}。目前的繩保持不變。`);
    return;
  }
  session = loaded.session;
  session.audit.push({ seq: session.audit.length, op: 'load', ok: true });
  useSession(session);
  refreshHud(fixture.referenceId === 'bamboo-u-v1' ? '已載入工作階段。' : '已載入舊的收環繩。幾何維持原參考。');
});
function stopPlayback(cancelled) {
  cancelAnimationFrame(playbackTimer);
  playbackTimer = 0;
  phase = 'idle';
  unlockCamera();
  cameraEnabled = true;
  applyCamera(session.mode === 'B' && session.cameraB ? session.cameraB : session.cameraA);
  rebuildRope();
  refreshHud(cancelled ? '播放已停止。' : '播放結束。');
}
$('play').addEventListener('click', () => {
  if (!session.timeline.length) { refreshHud('還沒有可播放的步驟。'); return; }
  phase = 'playing';
  cameraEnabled = false;
  let eventIndex = 0, substep = 0, points = session.initialState.points;
  rebuildRope(points);
  function tick() {
    if (phase !== 'playing') return;
    if (eventIndex >= session.timeline.length) { stopPlayback(false); return; }
    const event = session.timeline[eventIndex];
    if (event.kind === 'A') {
      applyCamera(event.camera);
      eventIndex++;
    } else {
      const step = session.steps[event.step];
      if (substep === 0) applyCamera(step.cameraB);
      points = step.accepted[substep++].points;
      rebuildRope(points);
      if (substep === step.accepted.length) { substep = 0; eventIndex++; }
    }
    refreshHud(`播放 ${eventIndex}/${session.timeline.length}`);
    playbackTimer = requestAnimationFrame(tick);
  }
  playbackTimer = requestAnimationFrame(tick);
});
$('verify').addEventListener('click', () => {
  refreshHud('正在依請求路徑重算並核對。');
  const report = replaySession(session);
  session.audit.push({ seq: session.audit.length, op: 'replay', ok: report.ok });
  $('step-status').className = report.ok ? '' : 'error';
  refreshHud(report.ok ? '重算與紀錄一致。' : `重算在第 ${report.index ?? '—'} 步不一致（${report.reason}）。`);
});
function render() {
  requestAnimationFrame(render);
  if (cameraLock) {
    const aspect = camera.aspect;
    applyCamera(cameraLock);
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }
  // setViewport and setScissor take logical pixels and apply the device ratio internally.
  renderer.getSize(bufferSize);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, bufferSize.x, bufferSize.y);
  renderer.render(scene, camera);
  const place = triadPlacement(readCamera(), 4.4);
  triadCamera.up.set(...place.up);
  triadCamera.position.set(...place.position);
  triadCamera.lookAt(...place.target);
  const size = Math.round(Math.min(bufferSize.x, bufferSize.y) * 0.16);
  const pad = Math.round(Math.min(bufferSize.x, bufferSize.y) * 0.03);
  renderer.setScissorTest(true);
  renderer.setViewport(pad, pad, size, size);
  renderer.setScissor(pad, pad, size, size);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(triadScene, triadCamera);
  renderer.autoClear = true;
  renderer.setScissorTest(false);
}
const bufferSize = new THREE.Vector2();
requestAnimationFrame(render);
const initialTube = assessEditorTube(session.points, { diameter: fixture.diameter, column: fixture.column, parameters: fixture.parameters });
$('step-status').textContent = initialTube.valid ? '初始管體通過。左鍵拖繩，中鍵旋轉。' : '初始管體未通過。';

window.ropeEditor = {
  get phase() { return phase; },
  get referenceId() { return fixture.referenceId; },
  get cameraEnabled() { return cameraEnabled && !cameraLock; },
  get navigation() { return cameraGesture?.kind ?? null; },
  get up() { return camera.up.toArray(); },
  points: () => session.points.map((p) => [...p]),
  displayedCamera: readCamera,
  pointerAction,
  serialize: () => { if (phase === 'idle' && !cameraGesture) session.cameraA = readCamera(); return serializeSession(session); },
  load: (text) => {
    if (phase !== 'idle') return { ok: false, errors: ['busy'] };
    const loaded = loadSession(text);
    if (!loaded.ok) return loaded;
    session = loaded.session;
    session.audit.push({ seq: session.audit.length, op: 'load', ok: true });
    useSession(session);
    return { ok: true, errors: [] };
  },
  undo: () => undo(),
  replay: () => replaySession(session),
  frame: () => { viewFrame(); return readCamera(); },
};
