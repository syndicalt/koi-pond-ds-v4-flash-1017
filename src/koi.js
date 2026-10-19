// Koi. Each fish is a tube of rings with a flat tail and paired fins; the
// swim animation is a travelling wave pushed through the vertices on the CPU,
// so the tail and body bend like a living thing without a skeleton.
import * as THREE from "three";
import { clamp, lerp, mulberry32, smoothstep } from "./pond-shape.js";

const PALETTES = {
  // Body base, belly, pattern, and fin tint.
  kohaku: ["#f2ece0", "#fff7ee", "#d4472a", "#f6c9b6"],
  sanke: ["#f4eee2", "#fff9f1", "#c8422a", "#f3d2c0"],
  showa: ["#3a3a36", "#f2ebdf", "#d0492c", "#e8dcc9"],
  ogon: ["#e6b45f", "#fbe6b0", "#d59a45", "#f7d9a0"],
  asagi: ["#6f8b96", "#d9d6c9", "#cf5b36", "#bcc7cc"],
  chagoi: ["#9a6a3c", "#c89a6b", "#7d5228", "#c9a273"],
};

const RINGS = 22;
const SIDES = 14;
const LENGTH = 1.9;

function buildBodyGeometry(palette, seed) {
  const rand = mulberry32(seed);
  const base = new THREE.Color(palette[0]);
  const belly = new THREE.Color(palette[1]);
  const patch = new THREE.Color(palette[2]);

  const positions = [];
  const colors = [];
  const indices = [];
  const uvs = [];

  // A few soft blobs of pattern along the spine, koi-style.
  // Blotches ride the spine: the camera looks down at the pond, so the back is
  // the surface that matters.
  const blobs = Array.from({ length: 3 + Math.floor(rand() * 2) }, () => ({
    u: 0.18 + rand() * 0.50,
    v: 0.62 + rand() * 0.38,
    r: 0.14 + rand() * 0.12,
  }));

  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    const u = t;
    // Profile: a blunt, rounded head at t=0 (z=0), widest a third of the way
    // back, then tapering to a narrow wrist at the tail.
    // Snout grows from a small ring at the tip to the full head width, so the
    // cap closes into a dome instead of a flat disc.
    // sin(pi*x)^0.7 rises quickly from the tip, so the first rings are small and
    // the snout closes into a dome rather than a wide cone.
    // Rounded snout, shoulders at a quarter of the length, then a long taper
    // down to a thin wrist just before the tail fin.
    // The snout is a dome: the first rings are already fairly wide and the cap
    // sits only a little ahead of them, so the head reads round, not pointed.
    const shoulder = smoothstep(0.0, 0.30, t);
    const taper = 1 - smoothstep(0.26, 0.97, t);
    const radius = (0.052 + 0.193 * shoulder * (0.32 + 0.68 * taper)) *
      (1 - smoothstep(0.90, 1, t) * 0.55);
    // Head lifts slightly above the body axis, tail drops a touch.
    const y = lerp(0.012, -0.03, smoothstep(0, 1, t)) + Math.sin(t * Math.PI) * 0.012;
    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const yy = Math.sin(a) * radius * 0.78;
      positions.push(x, yy + y, -t * LENGTH);
      uvs.push(u, s / SIDES);

      const up = clamp(yy / (radius * 0.82 + 1e-4), -1, 1);
      const color = new THREE.Color().copy(belly).lerp(base, smoothstep(-0.75, -0.1, up));
      // Blotches sit across the back.
      if (up > 0.1) {
        let best = 0;
        for (const b of blobs) {
          const d = Math.hypot((u - b.u) * 1.1, (up - b.v) * 0.75);
          best = Math.max(best, smoothstep(b.r, b.r * 0.20, d));
        }
        // Patches sit on the back, fading toward the flanks but never to zero
        // where the camera can see them from above.
        color.lerp(patch, clamp(best * 1.35, 0, 1) * smoothstep(0.25, 0.60, up));
      }
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = SIDES + 1;
  const noseRing = 0;
  const wristRing = RINGS * stride;

  // Caps get their own rim vertices. Reusing the body ring would average the
  // radially-pointing body normals into the fan and shade it black.
  const noseCapStart = positions.length / 3;
  const noseTipY = 0.014;
  for (let s = 0; s <= SIDES; s++) {
    const i = noseRing + s;
    positions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    colors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    uvs.push(0, s / SIDES);
  }
  const noseIndex = positions.length / 3;
  positions.push(0, noseTipY, 0.018);
  colors.push(belly.r, belly.g, belly.b);
  uvs.push(0, 0.5);

  const wristCapStart = positions.length / 3;
  for (let s = 0; s <= SIDES; s++) {
    const i = wristRing + s;
    positions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    colors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    uvs.push(1, s / SIDES);
  }
  const wristIndex = positions.length / 3;
  positions.push(0, -0.03, -LENGTH - 0.012);
  // Match the last body ring rather than the body's base colour, so the tip
  // does not read as a black plug.
  const lastRing = wristRing * 3;
  colors.push(colors[lastRing], colors[lastRing + 1], colors[lastRing + 2]);
  uvs.push(1, 0.5);

  for (let s = 0; s < SIDES; s++) {
    indices.push(noseIndex, noseCapStart + s, noseCapStart + s + 1);
    indices.push(wristIndex, wristCapStart + s + 1, wristCapStart + s);
  }

  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SIDES; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The cap fans are nearly flat, so computed normals are unreliable. Give the
  // whole nose cap a forward-and-up normal and the wrist cap a rearward one.
  const normals = geometry.attributes.normal;
  for (let s = 0; s <= SIDES; s++) {
    const a = (s / SIDES) * Math.PI * 2;
    const nx = Math.cos(a) * 0.42;
    const ny = Math.sin(a) * 0.30 + 0.42;
    const len = Math.hypot(nx, ny, 0.90);
    normals.setXYZ(noseCapStart + s, nx / len, ny / len, 0.90 / len);
    normals.setXYZ(wristCapStart + s, Math.cos(a) * 0.35, Math.sin(a) * 0.25, -0.90);
  }
  normals.setXYZ(noseIndex, 0, 0.30, 0.95);
  normals.setXYZ(wristIndex, 0, 0, -1);
  normals.needsUpdate = true;
  return geometry;
}

// Flat fins: a rounded triangle fan, double sided, slightly translucent.
function buildFinGeometry(length, spread) {
  const geometry = new THREE.BufferGeometry();
  // Root at the origin, tip at -length, widening to `spread` at the trailing
  // edge. Six vertices so the fin has a soft curved outline, not a hard wedge.
  const positions = [
    0, 0, 0,
    -length * 0.45, 0, -spread * 0.55,
    -length * 0.9, 0, -spread * 0.75,
    -length, 0, 0,
    -length * 0.9, 0, spread * 0.75,
    -length * 0.45, 0, spread * 0.55,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Tail fin: upright in the XY plane, root at the origin, spreading along Y and
// reaching back along -Z. Built in its own frame so no rotation is needed.
function buildTailGeometry(length, spread) {
  const geometry = new THREE.BufferGeometry();
  const positions = [
    0, 0, 0,
    0, -spread * 0.55, -length * 0.45,
    0, -spread * 0.75, -length * 0.90,
    0, 0, -length,
    0, spread * 0.75, -length * 0.90,
    0, spread * 0.55, -length * 0.45,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5];
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class Koi {
  constructor(scene, options) {
    const { palette = "kohaku", seed = 1, scale = 1, phase = 0 } = options;
    const rand = mulberry32(seed * 977 + 13);
    this.seed = seed;
    this.phase = phase;
    this.scale = scale;
    this.speed = 0.5 + rand() * 0.25;
    this.wag = 3.2 + rand() * 1.4;
    this.turnRate = 0.55 + rand() * 0.4;
    this.curiosity = rand();

    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    scene.add(this.group);

    const colors = PALETTES[palette];
    const bodyGeo = buildBodyGeometry(colors, seed);
    this.bodyPositions = bodyGeo.attributes.position.array.slice();
    const bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.0,
      // A little self-light keeps the fish legible under the water surface.
      // Tinted with the base colour at low strength so pattern colours survive.
      emissive: new THREE.Color(colors[0]).multiplyScalar(0.30),
      emissiveIntensity: 0.06,
      side: THREE.DoubleSide,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    // The water surface writes no depth, so the fish only need to draw after it.
    this.body.renderOrder = 3;
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);

    const finMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colors[3]).multiplyScalar(0.85),
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Tail fin at the wrist. The fin is built flat in XZ, so stand it upright
    // and sweep its length back along -Z.
    const tail = new THREE.Mesh(buildTailGeometry(0.46, 0.34), finMat);
    tail.position.set(0, -0.02, -LENGTH + 0.02);
    tail.renderOrder = 3;
    this.tail = tail;
    this.group.add(tail);

    // Eyes: a small dark bead each side of the head, just behind the snout.
    const eyeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#14130f"),
      roughness: 0.25,
      metalness: 0.15,
    });
    const eyeGeo = new THREE.SphereGeometry(0.030, 10, 8);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.135, 0.045, -0.30);
      eye.renderOrder = 4;
      this.group.add(eye);
    }

    // Pectoral fins, one each side.
    this.pectorals = [];
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(buildFinGeometry(0.26, 0.12), finMat);
      fin.position.set(side * 0.15, -0.05, -0.42);
      fin.rotation.set(0, side * Math.PI * 0.55, side * -0.35);
      fin.renderOrder = 3;
      this.pectorals.push(fin);
      this.group.add(fin);
    }


  // Position on a ring around the middle of the pond.
    // Spread the fish out: retry until the spawn point is clear of every fish
    // already in the pond, so they never start overlapping.
    const neighbours = options.neighbours || [];
    this.neighbours = neighbours;
    let angle = 0;
    let radius = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      angle = rand() * Math.PI * 2;
      radius = 1.5 + rand() * 3.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (neighbours.every((n) => Math.hypot(n.pos.x - x, n.pos.y - z) > 1.35 * n.scale)) break;
    }
    this.pos = new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    this.heading = angle + Math.PI * 0.5;
    this.target = this.pos.clone();
    this.think = rand() * 3;
    this.depth = -0.14 - rand() * 0.16;
    this.lean = 0;
    this.flee = 0;
    this.eat = 0;
  }

  pickWander(pond) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.78 * pond.shoreRadius(angle);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    this.target.set(x, z);
    this.think = 3 + Math.random() * 5;
  }

  // Called when food lands nearby: aim at the crumb and rise.
  approach(point, strength) {
    this.target.copy(point);
    this.think = 2.2;
    this.eat = Math.max(this.eat, strength);
  }

  update(dt, time, pond, ripple) {
    this.think -= dt;
    const toTarget = this.target.clone().sub(this.pos);
    const dist = toTarget.length();
    if (this.think <= 0 || dist < 0.45) this.pickWander(pond);

    // Ease toward the target; the fish keeps swimming while it turns.
    // The snout sits at local +Z (the body runs back along -Z), so aim +Z at
    // the target and swim that way; otherwise the fish travels tail first.
    const desired = Math.atan2(toTarget.x, toTarget.y);
    let delta = desired - this.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const turn = clamp(delta, -this.turnRate * dt * 2, this.turnRate * dt * 2);
    this.heading += turn;

    const urge = this.eat > 0 ? 1.7 : 1;
    const step = this.speed * urge * dt;
    this.pos.x += Math.sin(this.heading) * step;
    this.pos.y += Math.cos(this.heading) * step;

    // Keep a little distance from the other fish so they do not bunch up.
    for (const other of this.neighbours) {
      if (other === this) continue;
      const dx = this.pos.x - other.pos.x;
      const dz = this.pos.y - other.pos.y;
      const d2 = dx * dx + dz * dz;
      // Fish are ~1.9 long, so the comfort radius has to be well above that.
      if (d2 > 0.0001 && d2 < 4.2) {
        const push = (4.2 - d2) / 4.2;
        this.pos.x += (dx / Math.sqrt(d2)) * push * dt * 1.8;
        this.pos.y += (dz / Math.sqrt(d2)) * push * dt * 1.8;
      }
    }

    // Stay off the bank.
    const r = this.pos.length();
    const limit = pond.shoreRadius(Math.atan2(this.pos.y, this.pos.x)) * 0.86;
    if (r > limit) {
      this.pos.multiplyScalar(limit / r);
      this.heading += 1.2 * dt;
    }

    this.eat = Math.max(0, this.eat - dt * 0.6);

    // Depth: dip toward the centre, rise near the rim; rise when eating.
    const depthTarget = lerp(-0.42, -0.12, clamp(r / limit, 0, 1)) + (this.eat > 0 ? 0.18 * this.eat : 0);
    this.depth = lerp(this.depth, depthTarget, 1 - Math.exp(-dt * 1.5));

    // Bank the body into the turn.
    this.lean = lerp(this.lean, clamp(-turn * 6, -0.35, 0.35), 1 - Math.exp(-dt * 4));

    this.group.position.set(this.pos.x, this.depth, this.pos.y);
    this.group.rotation.set(0, this.heading, 0);
    this.group.rotateZ(this.lean);

    this.animateBody(time);

    // A fish near the surface stirs the water.
    if (this.depth > -0.34 && ripple) ripple(this.pos.x, this.pos.y, 0.22);
  }

  animateBody(time) {
    const pos = this.body.geometry.attributes.position;
    const arr = pos.array;
    const src = this.bodyPositions;
    const t = time * this.wag + this.phase;
    for (let i = 0; i < arr.length; i += 3) {
      const z = src[i + 2];
      // The snout cap sits ahead of z = 0, which would make u negative;
      // Math.pow on a negative base is NaN, so clamp it.
      const u = clamp(-z / LENGTH, 0, 1.2);
      // Wave amplitude grows toward the tail.
      const amp = 0.03 + 0.11 * Math.pow(u, 2.2);
      const wave = Math.sin(t + u * 4.2) * amp;
      arr[i] = src[i];
      arr[i + 1] = src[i + 1] + wave * 0.25;
      arr[i + 2] = src[i + 2] + wave * 0.55;
    }
    pos.needsUpdate = true;
    this.body.geometry.computeVertexNormals();

    this.tail.rotation.x = Math.sin(t - 1.2) * 0.5;
    for (let k = 0; k < this.pectorals.length; k++) {
      const side = k === 0 ? -1 : 1;
      this.pectorals[k].rotation.x = Math.sin(t * 0.8 + k * 1.4) * 0.35;
      this.pectorals[k].rotation.z = side * (-0.5 + Math.sin(t * 1.3 + k) * 0.12);
    }
  }
}
