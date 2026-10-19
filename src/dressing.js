// Everything that sits on or around the water: lily pads and their flowers,
// reed clumps, shore stones, drifting duckweed, and a low lantern.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { groundHeight, mulberry32, shoreRadius, WATER_LEVEL, wobble } from "./pond-shape.js";

const swayers = [];

function lilyPadGeometry() {
  const segments = 26;
  const notch = 0.5;
  const positions = [];
  const indices = [];
  positions.push(0, 0, 0);
  for (let i = 0; i <= segments; i++) {
    const a = notch + (i / segments) * (Math.PI * 2 - notch * 2);
    const r = 1 + Math.sin(a * 3) * 0.05;
    positions.push(Math.cos(a) * r, 0.02 + Math.sin(a * 2) * 0.012, Math.sin(a) * r);
  }
  for (let i = 1; i <= segments; i++) indices.push(0, i, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function blossomGeometry() {
  const petals = 9;
  const positions = [];
  const indices = [];
  positions.push(0, 0.06, 0);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const inner = 0.1;
    const outer = 0.2;
    positions.push(Math.cos(a) * inner, 0.1, Math.sin(a) * inner);
    positions.push(Math.cos(a) * outer, 0.14 + Math.sin(i * 2.1) * 0.02, Math.sin(a) * outer);
    positions.push(Math.cos(a + 0.18) * outer, 0.15, Math.sin(a + 0.18) * outer);
  }
  for (let i = 0; i < petals; i++) {
    const b = 1 + i * 3;
    indices.push(0, b, b + 1, 0, b + 1, b + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function reedGeometry(height) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];
  const segments = 6;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = 0.022 * (1 - t * 0.85);
    const y = t * height;
    const bend = Math.pow(t, 2) * 0.1;
    positions.push(-w + bend, y, 0, w + bend, y, 0);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildLilies(scene) {
  const rand = mulberry32(41);
  const padGeo = lilyPadGeometry();
  const padMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#5b8244"),
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  const padMatDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#456b38"),
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const flowerGeo = blossomGeometry();
  const flowerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#e8879f"),
    roughness: 0.55,
    side: THREE.DoubleSide,
    // A warm inner glow keeps the blossoms from greying out under the dusk key.
    emissive: new THREE.Color("#c85a78"),
    emissiveIntensity: 0.35,
  });
  const heartMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#f2d36b"), roughness: 0.5 });

  const pads = [];
  const clusters = 7;
  for (let c = 0; c < clusters; c++) {
    const angle = rand() * Math.PI * 2;
    const radius = (0.45 + rand() * 0.42) * shoreRadius(angle);
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const count = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const x = cx + (rand() - 0.5) * 2.4;
      const z = cz + (rand() - 0.5) * 2.4;
      if (Math.hypot(x, z) > shoreRadius(Math.atan2(z, x)) * 0.88) continue;
      const pad = new THREE.Mesh(padGeo, rand() > 0.55 ? padMat : padMatDark);
      const size = 0.26 + rand() * 0.24;
      pad.scale.setScalar(size);
      pad.position.set(x, WATER_LEVEL + 0.035, z);
      pad.rotation.y = rand() * Math.PI * 2;
      pad.rotation.x = (rand() - 0.5) * 0.06;
      pad.castShadow = true;
      pad.receiveShadow = true;
      // The water is drawn after the pads and tints them; draw on top instead.
      pad.renderOrder = 4;
      scene.add(pad);
      pads.push(pad);
      if (rand() > 0.62) {
        const flower = new THREE.Group();
        const petals = new THREE.Mesh(flowerGeo, flowerMat);
        // Flowers are their own size, not tied to the pad they sit on.
        petals.scale.setScalar(0.55 + rand() * 0.25);
        flower.add(petals);
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), heartMat);
        heart.position.y = 0.17;
        flower.add(heart);
        flower.position.set(x + (rand() - 0.5) * 0.05, WATER_LEVEL + 0.04, z);
        flower.renderOrder = 4;
        flower.rotation.y = rand() * Math.PI;
        scene.add(flower);
      }
    }
  }

  // Pads bob gently on the swell.
  return {
    update(time) {
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const seed = i * 1.7;
        p.position.y = WATER_LEVEL + 0.035 + wobble(time * 0.5, seed) * 0.012;
        p.rotation.z = wobble(time * 0.35, seed + 2) * 0.02;
      }
    },
  };
}

export function buildReeds(scene) {
  const rand = mulberry32(88);
  const clumps = 14;
  for (let c = 0; c < clumps; c++) {
    const angle = rand() * Math.PI * 2;
    const radius = shoreRadius(angle) * (0.94 + rand() * 0.1);
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const count = 5 + Math.floor(rand() * 7);
    const blades = [];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.24 + rand() * 0.04, 0.32, 0.24 + rand() * 0.06),
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < count; i++) {
      const height = 0.5 + rand() * 0.9;
      const blade = new THREE.Mesh(reedGeometry(height), mat);
      blade.position.set(cx + (rand() - 0.5) * 0.8, groundHeight(cx, cz) - 0.05, cz + (rand() - 0.5) * 0.8);
      blade.rotation.y = rand() * Math.PI * 2;
      blade.castShadow = true;
      scene.add(blade);
      blades.push({ mesh: blade, seed: rand() * 10 });
    }
    swayers.push({ blades, strength: 0.05 + rand() * 0.04 });
  }

  return {
    update(time) {
      for (const group of swayers) {
        for (const { mesh, seed } of group.blades) {
          const s = wobble(time * 0.6, seed) * group.strength;
          mesh.rotation.z = s;
          mesh.rotation.x = wobble(time * 0.5, seed + 4) * group.strength * 0.6;
        }
      }
    },
  };
}

export function buildStones(scene) {
  const rand = mulberry32(1234);
  const stones = 16;
  for (let i = 0; i < stones; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = shoreRadius(angle) * (0.97 + rand() * 0.22);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const size = 0.16 + Math.pow(rand(), 2) * 0.42;
    // Weld first: the icosahedron ships with duplicated corners, and jittering
    // them apart would leave the stone faceted.
    const geo = mergeVertices(new THREE.IcosahedronGeometry(size, 1), 1e-4);
    // Squash and jitter the vertices so no two stones look alike.
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      pos.setXYZ(
        v,
        pos.getX(v) * (0.92 + rand() * 0.16),
        pos.getY(v) * (0.62 + rand() * 0.18),
        pos.getZ(v) * (0.92 + rand() * 0.16)
      );
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.09 + rand() * 0.05, 0.05 + rand() * 0.05, 0.13 + rand() * 0.09),
      roughness: 0.96,
    });
    const stone = new THREE.Mesh(geo, mat);
    stone.position.set(x, groundHeight(x, z) + size * 0.20, z);
    // Tumble each stone fully: the icosahedron's pole seam is visible when a
    // stone sits upright, and a random orientation hides it.
    stone.rotation.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI);
    stone.castShadow = true;
    stone.receiveShadow = true;
    scene.add(stone);
  }
}

export function buildDuckweed(scene) {
  const rand = mulberry32(5150);
  const count = 160;
  const geo = new THREE.CircleGeometry(0.045, 6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#5d7a3a"), roughness: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const spots = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = (0.55 + rand() * 0.35) * shoreRadius(angle);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    spots.push({ x, z, phase: rand() * 10 });
    dummy.position.set(x, WATER_LEVEL + 0.02, z);
    dummy.scale.setScalar(0.7 + rand() * 0.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
  return {
    update(time) {
      for (let i = 0; i < count; i++) {
        const s = spots[i];
        dummy.position.set(s.x + Math.sin(time * 0.3 + s.phase) * 0.04, WATER_LEVEL + 0.02, s.z + Math.cos(time * 0.26 + s.phase) * 0.04);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

export function buildTrees(scene) {
  const rand = mulberry32(9001);
  const trunkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a2f24"), roughness: 0.95 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: new THREE.Color("#2f4a2c"), roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: new THREE.Color("#38542f"), roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: new THREE.Color("#27402a"), roughness: 0.9 }),
  ];
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);

  const trees = [];
  const count = 13;
  // The default camera sits near -13 degrees; keep trees well away from it so
  // none of them lands in the foreground and blocks the pond.
  // The camera orbits and drifts, so keep trees inside a 120-degree arc on the
  // far side of the pond; nothing can then sit in the foreground.
  // Camera default (main.js): yaw -0.55, distance 24; its position angle is
  // atan2(cos yaw, sin yaw) and it looks across the pond. The orbit is clamped
  // to a narrow arc, so the tree line only needs to sit opposite the camera.
  const camYaw = -0.55;
  const camAngle = Math.atan2(Math.cos(camYaw), Math.sin(camYaw));
  const far = camAngle + Math.PI;
  const arcStart = far - 0.85;
  const arcSpan = 1.70;
  for (let i = 0; i < count; i++) {
    let angle = arcStart + (i / (count - 1)) * arcSpan;
    angle += (rand() - 0.5) * 0.10;
    const radius = shoreRadius(angle) + 4.5 + rand() * 4.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const ground = groundHeight(x, z);
    const height = 2.6 + rand() * 2.2;

    const group = new THREE.Group();
    group.position.set(x, ground, z);

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.set(1, height, 1);
    trunk.position.y = height * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Three stacked blobs make a soft, readable canopy.
    const layers = 3;
    for (let l = 0; l < layers; l++) {
      const blob = new THREE.Mesh(canopyGeo, leafMats[(i + l) % leafMats.length]);
      const spread = (0.85 - l * 0.16) * (0.85 + rand() * 0.3);
      blob.scale.set(spread, spread * 0.72, spread);
      blob.position.set(
        (rand() - 0.5) * 0.5,
        height * 0.82 + l * 0.62,
        (rand() - 0.5) * 0.5
      );
      blob.castShadow = true;
      blob.receiveShadow = true;
      group.add(blob);
    }

    group.rotation.y = rand() * Math.PI * 2;
    scene.add(group);
    trees.push({ group, phase: rand() * Math.PI * 2, height });
  }

  return {
    update(time) {
      for (const t of trees) {
        t.group.rotation.z = Math.sin(time * 0.35 + t.phase) * 0.012;
      }
    },
  };
}
