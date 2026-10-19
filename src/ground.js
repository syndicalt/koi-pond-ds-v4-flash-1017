// The bank: a quiet disc of moss, gravel and dark soil around the water.
import * as THREE from "three";
import { groundHeight, mulberry32, shoreRadius } from "./pond-shape.js";

const COLORS = {
  deep: new THREE.Color("#24322a"),
  wet: new THREE.Color("#5a5340"),
  moss: new THREE.Color("#56683a"),
  grass: new THREE.Color("#64763f"),
  stone: new THREE.Color("#6a635a"),
  soil: new THREE.Color("#2a2820"),
};

export function buildGround() {
  const rand = mulberry32(7);
  const segments = 240;
  const rings = 72;
  const maxRadius = 140;

  const positions = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    // Sample along the pond's own outline so the basin and the bank agree with
    // the water mesh: rings run from the centre out to the far bank, and the
    // spacing tightens near the shoreline where the shape changes fastest.
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const shore = shoreRadius(angle);
      const depth = Math.pow(t, 1.35) * (maxRadius / shore);
      const radius = shore * depth;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = groundHeight(x, z);
      positions.push(x, y, z);
      const color = new THREE.Color();
      if (depth < 0.92) {
        color.copy(COLORS.deep).lerp(COLORS.wet, depth / 0.92);
      } else if (depth < 1.04) {
        // Narrow wet rim right at the waterline.
        color.copy(COLORS.wet).lerp(COLORS.soil, (depth - 0.92) / 0.12);
      } else {
        const grassMix = Math.min(1, (depth - 1.02) / 0.5);
        color.copy(COLORS.moss).lerp(COLORS.grass, grassMix);
        // World-space waves at unrelated angles and scales: enough variation to
        // read as grass, without the radial streaks a single frequency gives.
        const patch =
          Math.sin(x * 2.3 + z * 1.1) * 0.34 +
          Math.sin(x * 0.7 - z * 2.9) * 0.30 +
          Math.sin((x - z) * 4.1) * 0.20;
        color.offsetHSL(0.006 * patch, 0.05 * patch, 0.075 * patch);
        if (patch > 0.72) color.lerp(COLORS.stone, (patch - 0.72) * 0.5);
        if (depth > 1.9) color.lerp(COLORS.soil, Math.min(0.55, (depth - 1.9) * 0.3));
      }
      // No per-vertex grain: on a radial grid it reads as moire from above.
      if (depth > 1.0) color.offsetHSL(0, 0, (rand() - 0.5) * 0.04);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = "bank";
  return mesh;
}
