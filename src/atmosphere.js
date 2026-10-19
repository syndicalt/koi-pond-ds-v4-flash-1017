// The dusk around the pond: a soft gradient sky, hanging lantern light,
// drifting fireflies, and the crumbs the fish are fed.
import * as THREE from "three";
import { groundHeight, mulberry32, WATER_LEVEL } from "./pond-shape.js";

export function buildSky(scene) {
  const geometry = new THREE.SphereGeometry(120, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color("#2e4a63") },
      uMid: { value: new THREE.Color("#8fa6a8") },
      uHorizon: { value: new THREE.Color("#e8b98a") },
      uGlow: { value: new THREE.Color("#ffdcaa") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      varying vec3 vDir;
      void main() {
        // The camera looks down at the pond, so only a thin band of sky near the
        // horizon is ever on screen: spread the gradient across y 0.0 - 0.12.
        float h = clamp(vDir.y * 9.0, 0.0, 1.0);
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.55, h));
        c = mix(c, uTop, smoothstep(0.55, 1.0, h));
        // Below the horizon the sky is only ever seen as haze behind the bank.
        c = mix(vec3(0.54, 0.58, 0.52), c, smoothstep(-0.30, 0.01, vDir.y));
        // A low sun to the west, with a wide soft halo around it.
        vec3 sunDir = normalize(vec3(-0.72, 0.14, 0.35));
        float sun = pow(max(0.0, dot(vDir, sunDir)), 48.0);
        float halo = pow(max(0.0, dot(vDir, sunDir)), 4.0);
        c += uGlow * (sun * 1.4 + halo * 0.35);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = "sky";
  scene.add(sky);
  return sky;
}

export function buildLantern(scene) {
  const rand = mulberry32(31);
  const group = new THREE.Group();
  const x = 6.2;
  const z = 4.4;

  const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#3a2d22"), roughness: 0.9 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8), postMat);
  post.position.set(x, groundHeight(x, z) + 0.8, z);
  post.castShadow = true;
  group.add(post);

  const shadeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#e8b878"),
    emissive: new THREE.Color("#ffb45e"),
    emissiveIntensity: 1.5,
    roughness: 0.5,
  });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.26, 6, 1, true), shadeMat);
  shade.position.set(x, groundHeight(x, z) + 1.72, z);
  group.add(shade);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.14, 6), postMat);
  cap.position.set(x, groundHeight(x, z) + 1.92, z);
  group.add(cap);

  const light = new THREE.PointLight("#ffbe78", 14, 14, 2);
  light.position.set(x, groundHeight(x, z) + 1.62, z);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.bias = -0.002;
  group.add(light);

  scene.add(group);
  return {
    light,
    update(time) {
      // A candle never burns quite evenly.
      const flicker = 1 + Math.sin(time * 7.3) * 0.04 + Math.sin(time * 13.1 + 1.7) * 0.03 + (rand() - 0.5) * 0.02;
      light.intensity = 14 * flicker;
      shadeMat.emissiveIntensity = 1.5 * flicker;
    },
  };
}

export function buildFireflies(scene) {
  const rand = mulberry32(9001);
  const count = 42;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 8.5 + rand() * 7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.7 + rand() * 2.2;
    positions[i * 3 + 2] = z;
    seeds.push({ x, y: positions[i * 3 + 1], z, phase: rand() * 20, speed: 0.3 + rand() * 0.5 });
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const sprite = glowTexture();
  const material = new THREE.PointsMaterial({
    size: 0.28,
    map: sprite,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: new THREE.Color("#ffd78a"),
    opacity: 0.9,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  return {
    update(time) {
      const attr = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const s = seeds[i];
        attr.setXYZ(
          i,
          s.x + Math.sin(time * s.speed + s.phase) * 1.1,
          s.y + Math.sin(time * s.speed * 1.7 + s.phase * 2) * 0.35,
          s.z + Math.cos(time * s.speed * 0.8 + s.phase) * 1.1
        );
      }
      attr.needsUpdate = true;
    },
  };
}

function glowTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,230,1)");
  g.addColorStop(0.25, "rgba(255,220,140,0.65)");
  g.addColorStop(1, "rgba(255,190,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Crumbs that drift down and settle on the surface before vanishing.
export function createFoodField(scene) {
  const geometry = new THREE.SphereGeometry(0.035, 6, 5);
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color("#c79a5a"), roughness: 0.9 });
  const pool = Array.from({ length: 28 }, () => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, active: false, vel: new THREE.Vector3(), life: 0 };
  });
  let cursor = 0;

  return {
    drop(x, z, count = 9) {
      for (let i = 0; i < count; i++) {
        const item = pool[cursor];
        cursor = (cursor + 1) % pool.length;
        item.active = true;
        item.life = 4 + Math.random() * 2;
        item.mesh.visible = true;
        item.mesh.position.set(x + (Math.random() - 0.5) * 0.5, 1.6 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.5);
        item.vel.set((Math.random() - 0.5) * 0.12, -0.35 - Math.random() * 0.2, (Math.random() - 0.5) * 0.12);
      }
    },
    update(dt) {
      for (const item of pool) {
        if (!item.active) continue;
        item.life -= dt;
        if (item.mesh.position.y > WATER_LEVEL + 0.03) {
          item.vel.y -= dt * 0.8;
          item.mesh.position.addScaledVector(item.vel, dt);
        } else {
          item.mesh.position.y = WATER_LEVEL + 0.03 + Math.sin(item.life * 3) * 0.004;
        }
        if (item.life <= 0) {
          item.active = false;
          item.mesh.visible = false;
        }
      }
    },
    // Where the fish should look for food right now.
    target() {
      let best = null;
      for (const item of pool) {
        if (!item.active) continue;
        if (!best || item.mesh.position.y < best.y) best = item.mesh.position;
      }
      return best;
    },
  };
}
