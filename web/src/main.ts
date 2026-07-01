import * as THREE from 'three';
import { BodyType, Box3DRuntime } from './box3d.js';
import { ThreeWorld } from './three-world.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) {
  throw new Error('App container not found');
}

app.innerHTML = `
  <div class="hud">
    <div class="title">Box3D in the browser</div>
    <div class="copy">Drag dynamic bodies. Orbit empty space. Space fires spheres.</div>
    <div class="status" id="status">Loading wasm...</div>
    <div class="meta-row">
      <div class="meta" id="fps">FPS --</div>
    </div>
  </div>
  <canvas id="view"></canvas>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#view');
if (canvas === null) {
  throw new Error('Canvas not found');
}

const status = document.querySelector<HTMLDivElement>('#status');
if (status === null) {
  throw new Error('Status element not found');
}

const fps = document.querySelector<HTMLDivElement>('#fps');
if (fps === null) {
  throw new Error('FPS element not found');
}
const fpsLabel = fps;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(9, 7, 10);
camera.lookAt(0, 1.25, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.2, 0);
controls.update();

const ambient = new THREE.HemisphereLight(0xbcdcff, 0x172033, 1.2);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(8, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

scene.add(new THREE.GridHelper(24, 24, 0x334155, 0x1f2937));
let groundBodyMesh: THREE.Mesh | null = null;

const runtime = await Box3DRuntime.load();
status.textContent = 'Ready';
const world = new ThreeWorld(runtime, scene, { gravity: [0, -9.81, 0] });

groundBodyMesh = world.box({
  size: [12, 0.5, 12],
  position: [0, -0.5, 0],
  static: true,
  color: 0x1f2937,
  roughness: 1,
}).mesh;

for (let y = 0; y < 3; ++y) {
  for (let x = 0; x < 3; ++x) {
    world.box({
      size: [0.5, 0.5, 0.5],
      position: [x * 1.05 - 1.05, 1 + y * 1.05, 0],
      density: 1,
      color: 0xf59e0b + x * 0x080808 + y * 0x050505,
    });
  }
}

world.box({
  size: [0.75, 0.75, 0.75],
  position: [-2.5, 7, 0.5],
  density: 1,
  color: 0x7dd3fc,
});

world.box({
  size: [0.75, 0.75, 0.75],
  position: [2.2, 9, -1.5],
  density: 1,
  color: 0xa78bfa,
});

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let accumulator = 0;
let fpsAccumulator = 0;
let fpsFrames = 0;
const fixedDt = 1 / 60;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragPoint = new THREE.Vector3();
const objectMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffb703 }),
);
const grabMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.04, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
);
const groundMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
);
objectMarker.visible = false;
grabMarker.visible = false;
groundMarker.visible = false;
scene.add(objectMarker);
scene.add(grabMarker);
scene.add(groundMarker);
let dragBody: import('./box3d.js').PhysicsBody | null = null;
let dragMouseHandle: number | null = null;
let dragJointHandle: number | null = null;
let grabLocalPoint = new THREE.Vector3();
const hiddenGrabPoint = new THREE.Vector3(0, -1000, 0);

function updatePointer(clientX: number, clientY: number): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  pointer.x = (clientX / width) * 2 - 1;
  pointer.y = -(clientY / height) * 2 + 1;
}

function bodyFromPointer(): { body: import('./box3d.js').PhysicsBody; point: THREE.Vector3; normal: THREE.Vector3 } | null {
  raycaster.setFromCamera(pointer, camera);
  const hit = world.pickBody(raycaster);
  if (hit === null) {
    return null;
  }

  return hit;
}

function updateMarkers(): void {
  raycaster.setFromCamera(pointer, camera);

  const hit = world.pickBody(raycaster);
  if (hit === null) {
    objectMarker.visible = false;
    world.setHoveredBody(null);
  } else {
    world.setHoveredBody(hit.body);
    objectMarker.visible = true;
    objectMarker.position.copy(hit.point).addScaledVector(hit.normal, 0.02);
  }

  if (groundBodyMesh !== null) {
    const groundHits = raycaster.intersectObject(groundBodyMesh, false);
    if (groundHits.length > 0) {
      groundMarker.visible = true;
      groundMarker.position.copy(groundHits[0].point).addScaledVector(new THREE.Vector3(0, 1, 0), 0.02);
      return;
    }
  }

  groundMarker.visible = false;
}

function shootSphere(): void {
  raycaster.setFromCamera(pointer, camera);

  const origin = raycaster.ray.origin;
  const direction = raycaster.ray.direction.clone().normalize();
  const speed = 22;
  const spawnOffset = 1.6;

  world.sphere({
    radius: 0.35,
    position: [origin.x + direction.x * spawnOffset, origin.y + direction.y * spawnOffset, origin.z + direction.z * spawnOffset],
    velocity: [direction.x * speed, direction.y * speed, direction.z * speed],
    density: 1,
    color: 0xf97316,
  });
}

canvas.addEventListener('pointerdown', (event: PointerEvent) => {
  updatePointer(event.clientX, event.clientY);
  updateMarkers();
  const hit = bodyFromPointer();
  if (hit === null || hit.body.isStatic) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  canvas.setPointerCapture(event.pointerId);
  controls.enabled = false;

  dragBody = hit.body;
  raycaster.setFromCamera(pointer, camera);
  dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.point);
  raycaster.ray.intersectPlane(dragPlane, dragPoint);
  const dragPointVec: [number, number, number] = [dragPoint.x, dragPoint.y, dragPoint.z];
  dragMouseHandle = world.physics.createBody({
    type: BodyType.Kinematic,
    position: dragPointVec,
    enableSleep: false,
    awake: true,
  });
  const localPoint = world.physics.getBodyLocalPoint(hit.body.handle, dragPointVec);
  grabLocalPoint = new THREE.Vector3(localPoint[0], localPoint[1], localPoint[2]);
  grabMarker.visible = true;
  dragJointHandle = world.physics.createMotorJoint(dragMouseHandle, hit.body.handle, localPoint, 7.5, 1.0, 500.0);
  world.physics.setBodyAwake(hit.body.handle, true);
  status.textContent = 'Dragging';
});

canvas.addEventListener('pointermove', (event: PointerEvent) => {
  updatePointer(event.clientX, event.clientY);
  updateMarkers();
  if (dragBody === null) {
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
    const dragPointVec: [number, number, number] = [dragPoint.x, dragPoint.y, dragPoint.z];
    if (dragMouseHandle !== null) {
      world.physics.setBodyTransform(dragMouseHandle, dragPointVec);
    }
  }

  if (dragBody !== null && dragBody.mesh !== null) {
    const grabWorld = dragBody.mesh.localToWorld(grabLocalPoint.clone());
    grabMarker.position.copy(grabWorld);
  } else {
    grabMarker.position.copy(hiddenGrabPoint);
  }
});

canvas.addEventListener('pointerup', () => {
  if (dragJointHandle !== null) {
    world.physics.destroyJoint(dragJointHandle);
    dragJointHandle = null;
  }
  if (dragMouseHandle !== null) {
    world.physics.destroyBody(dragMouseHandle);
    dragMouseHandle = null;
  }
  dragBody = null;
  grabMarker.visible = false;
  grabMarker.position.copy(hiddenGrabPoint);
  controls.enabled = true;
  status.textContent = 'Ready';
  world.setHoveredBody(null);
});

canvas.addEventListener('pointercancel', () => {
  if (dragJointHandle !== null) {
    world.physics.destroyJoint(dragJointHandle);
    dragJointHandle = null;
  }
  if (dragMouseHandle !== null) {
    world.physics.destroyBody(dragMouseHandle);
    dragMouseHandle = null;
  }
  dragBody = null;
  grabMarker.visible = false;
  grabMarker.position.copy(hiddenGrabPoint);
  controls.enabled = true;
  status.textContent = 'Ready';
  world.setHoveredBody(null);
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.code === 'Space') {
    event.preventDefault();
    shootSphere();
  }
});

function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  accumulator += dt;
  fpsAccumulator += dt;
  fpsFrames += 1;

  if (fpsAccumulator >= 0.5) {
    const value = Math.round(fpsFrames / fpsAccumulator);
    fpsLabel.textContent = `FPS ${value}`;
    fpsAccumulator = 0;
    fpsFrames = 0;
  }

  while (accumulator >= fixedDt) {
    world.step(fixedDt, 4);
    accumulator -= fixedDt;
  }

  world.sync();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

frame();
