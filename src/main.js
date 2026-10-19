import * as THREE from "three";
import { buildGround } from "./ground.js";
import { buildWater } from "./water.js";
import { buildLilies, buildReeds, buildStones, buildDuckweed, buildTrees } from "./dressing.js";
import { buildSky, buildLantern, buildFireflies, createFoodField } from "./atmosphere.js";
import { Koi } from "./koi.js";
import { clamp, shoreRadius, WATER_LEVEL } from "./pond-shape.js";

const canvas = document.querySelector("#pond");
const feedButton = document.querySelector("#feed");
const status = document.querySelector("#status");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
// The bank does not reach the bottom of every view, so clear to the haze colour
// rather than letting the page background show as a black wedge.
scene.background = new THREE.Color("#7b8478");
// Warm haze that picks up the sky's horizon colour, so distance reads as dusk
// air rather than a flat olive wall.
scene.fog = new THREE.FogExp2(new THREE.Color("#8a9284"), 0.016);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

// Dusk key light from the west, a cool sky fill, and a warm bounce off the bank.
const sun = new THREE.DirectionalLight("#ffdcb4", 2.6);
sun.position.set(-14, 13, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0015;
sun.shadow.radius = 4;
// Keep shadows as soft shade rather than black cutouts on the near bank.
sun.shadow.intensity = 0.25;
scene.add(sun);
// Sky fill is cool blue from above, warm bounce from the bank below.
scene.add(new THREE.HemisphereLight("#a9c6d6", "#5b4a34", 1.05));
const rim = new THREE.DirectionalLight("#8fa7b8", 0.55);
rim.position.set(11, 6, -13);
scene.add(rim);

buildSky(scene);
scene.add(buildGround());
const water = buildWater();
scene.add(water.mesh);
const lilies = buildLilies(scene);
const reeds = buildReeds(scene);
buildStones(scene);
const duckweed = buildDuckweed(scene);
const trees = buildTrees(scene);
const lantern = buildLantern(scene);
const fireflies = buildFireflies(scene);
const food = createFoodField(scene);

const clock = { last: performance.now(), elapsed: 0 };
const pond = { shoreRadius };

// Fish are added one at a time so each can see where the earlier ones spawned.
const koi = [];
for (const spec of [
  { palette: "kohaku", seed: 1, scale: 1.05, phase: 0.2 },
  { palette: "ogon", seed: 2, scale: 0.95, phase: 1.6 },
  { palette: "sanke", seed: 3, scale: 0.9, phase: 3.1 },
  { palette: "showa", seed: 4, scale: 1.1, phase: 4.4 },
  { palette: "asagi", seed: 5, scale: 0.85, phase: 5.2 },
  { palette: "chagoi", seed: 6, scale: 1.0, phase: 2.4 },
]) {
  koi.push(new Koi(scene, { ...spec, neighbours: koi }));
}

// ---------------------------------------------------------------- camera rig
const view = {
  yaw: -0.55,
  pitch: 0.32,
  distance: 24,
  targetYaw: -0.55,
  targetPitch: 0.32,
  targetDistance: 24,
  dragging: false,
  lastX: 0,
  lastY: 0,
  moved: 0,
};
const focus = new THREE.Vector3(0, -0.25, 0);

function placeCamera() {
  const yaw = view.yaw;
  const pitch = view.pitch;
  const d = view.distance;
  const horizontal = Math.cos(pitch) * d;
  camera.position.set(
    focus.x + Math.sin(yaw) * horizontal,
    focus.y + Math.sin(pitch) * d,
    focus.z + Math.cos(yaw) * horizontal
  );
  camera.lookAt(focus);
  water.uniforms.uCamera.value.copy(camera.position);
}

function easeView(dt) {
  const k = 1 - Math.exp(-dt * (reducedMotion ? 20 : 6));
  view.yaw += (view.targetYaw - view.yaw) * k;
  view.pitch += (view.targetPitch - view.pitch) * k;
  view.distance += (view.targetDistance - view.distance) * k;
  placeCamera();
}

// ---------------------------------------------------------------- interaction
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_LEVEL);

function waterPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  return hit;
}

const DRAG_THRESHOLD = 6;

canvas.addEventListener("pointerdown", (e) => {
  view.dragging = true;
  view.moved = 0;
  view.lastX = e.clientX;
  view.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!view.dragging) return;
  const dx = e.clientX - view.lastX;
  const dy = e.clientY - view.lastY;
  view.lastX = e.clientX;
  view.lastY = e.clientY;
  view.moved += Math.abs(dx) + Math.abs(dy);
  // Hold the view still until the gesture is clearly a drag, so a tap to feed
  // never nudges the camera.
  if (view.moved < DRAG_THRESHOLD) return;
  // The tree line sits on the far side of the pond; keep the orbit inside a
  // 100-degree arc so the camera never swings behind the trees.
  view.targetYaw = clamp(view.targetYaw - dx * 0.005, -1.35, 0.25);
  view.targetPitch = clamp(view.targetPitch + dy * 0.004, 0.28, 1.18);
});

canvas.addEventListener("pointerup", (e) => {
  if (!view.dragging) return;
  view.dragging = false;
  if (view.moved < DRAG_THRESHOLD) feedAtClient(e.clientX, e.clientY);
});

canvas.addEventListener("pointercancel", () => {
  view.dragging = false;
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    view.targetDistance = clamp(view.targetDistance * (1 + e.deltaY * 0.0012), 8.5, 24);
  },
  { passive: false }
);

// Gentle auto-drift when nobody is touching the pond.
let lastInteraction = performance.now();
window.addEventListener("pointerdown", () => (lastInteraction = performance.now()));
window.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") feedCenter();
});

function feedAtClient(clientX, clientY) {
  const point = waterPoint(clientX, clientY);
  if (!point) return;
  const r = Math.hypot(point.x, point.z);
  if (r > shoreRadius(Math.atan2(point.z, point.x)) * 0.95) {
    say("The bank is too dry for crumbs.");
    return;
  }
  feedAt(point.x, point.z);
}

function feedCenter() {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 3.2;
  feedAt(Math.cos(angle) * radius, Math.sin(angle) * radius);
}

function feedAt(x, z) {
  food.drop(x, z, 10);
  water.addRipple(x, z, clock.elapsed);
  water.addRipple(x + 0.25, z - 0.1, clock.elapsed + 0.25);
  for (const fish of koi) {
    const d = Math.hypot(fish.pos.x - x, fish.pos.y - z);
    if (d < 7) fish.approach(new THREE.Vector2(x, z), clamp(1 - d / 9, 0.25, 1));
  }
  say("The koi come to the surface.");
  lastInteraction = performance.now();
}

feedButton.addEventListener("click", feedCenter);

let statusTimer = 0;
function say(text) {
  status.textContent = text;
  status.classList.remove("fade");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.add("fade"), 4200);
}

// ---------------------------------------------------------------- loop
let running = true;
let generation = 0;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep a little more of the pond in frame on narrow screens.
  camera.fov = w < 700 ? 54 : 42;
  camera.updateProjectionMatrix();
  placeCamera();
}
window.addEventListener("resize", resize);
resize();

document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
  if (running) {
    // Restart exactly one loop; a frame already queued by the old chain would
    // otherwise run beside it and double the animation speed.
    clock.last = performance.now();
    generation++;
    requestAnimationFrame(frame);
  }
});

let rippleBudget = 0;
function frame(now) {
  const myGeneration = generation;
  if (!running) return;
  const dt = Math.min(0.05, (now - clock.last) / 1000);
  clock.last = now;
  clock.elapsed += dt;
  const time = clock.elapsed;

  if (!reducedMotion && !view.dragging && now - lastInteraction > 9000) {
    view.targetYaw += dt * 0.018;
  }
  easeView(dt);

  water.uniforms.uTime.value = time;

  // Fish stir the surface now and then; keep the number of new ripples bounded.
  rippleBudget += dt;
  const canStir = rippleBudget > 0.4;
  if (canStir) rippleBudget = 0;
  const stir = canStir ? (x, z) => water.addRipple(x, z, time) : null;

  // Reduced motion: no ambient surface stirring; the fish still answer food.
  const ambientStir = reducedMotion ? null : stir;
  for (const fish of koi) {
    fish.update(dt, time, pond, ambientStir);
  }
  // Keep the fish from swimming through each other.
  for (let i = 0; i < koi.length; i++) {
    for (let j = i + 1; j < koi.length; j++) {
      const a = koi[i];
      const b = koi[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dz);
      const minGap = 0.52 * (a.scale + b.scale) * 0.5;
      if (d > 1e-4 && d < minGap) {
        const push = (minGap - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.y -= nz * push;
        b.pos.x += nx * push;
        b.pos.y += nz * push;
        a.group.position.x = a.pos.x;
        a.group.position.z = a.pos.y;
        b.group.position.x = b.pos.x;
        b.group.position.z = b.pos.y;
      }
    }
  }

  // Hungry fish make for the crumbs.
  const crumb = food.target();
  if (crumb) {
    for (const fish of koi) {
      const d = Math.hypot(fish.pos.x - crumb.x, fish.pos.y - crumb.z);
      if (d < 3.2) fish.approach(new THREE.Vector2(crumb.x, crumb.z), clamp(1 - d / 4, 0.2, 1));
    }
  }

  food.update(dt);
  // Sway and firefly drift are ambient motion; hold them still when asked.
  if (!reducedMotion) {
    lilies.update(time);
    reeds.update(time);
    duckweed.update(time);
    fireflies.update(time);
    trees.update(time);
  }
  lantern.update(time);

  renderer.render(scene, camera);
  window.pond = { scene, camera, renderer, water, koi, clock, view };
  if (myGeneration === generation) requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
