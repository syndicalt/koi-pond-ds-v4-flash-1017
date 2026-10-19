// The water surface. A disc that follows the pond outline, shaded with a small
// custom shader: shallow tea-stained edges, deep jade centre, drifting caustic
// bands, and expanding rings wherever something touches the surface.
import * as THREE from "three";
import { groundHeight, shoreRadius, WATER_LEVEL } from "./pond-shape.js";

export const MAX_RIPPLES = 24;

// Raw sRGB triples for the unlit water shader.
function srgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uRipples[${MAX_RIPPLES}]; // x, z, birth time
  varying vec2 vPond;
  varying vec3 vWorld;
  varying float vDepth;

  float ring(vec2 p, vec3 r, float t) {
    float age = t - r.z;
    if (age < 0.0 || age > 7.0) return 0.0;
    float d = distance(p, r.xy);
    float radius = age * 0.85;
    float width = 0.16 + age * 0.05;
    float band = exp(-pow((d - radius) / width, 2.0));
    float fade = 1.0 - age / 7.0;
    return band * fade * sin((d - radius) * 7.0 - age * 5.0);
  }

  void main() {
    vPond = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // Local +Z is the bed depth below the surface, so depth is positive.
    vDepth = position.z;

    // Long, gentle swells only: short wavelengths alias against this tessellation.
    float wave = sin(position.x * 0.10 + uTime * 0.35) * 0.010
               + sin(position.y * 0.13 - uTime * 0.28) * 0.008;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      wave += ring(position.xy, uRipples[i], uTime) * 0.05;
    }
    vec3 p = position;
    p.z += wave;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uWarm;
  uniform vec3 uCamera;
  varying vec2 vPond;
  varying vec3 vWorld;
  varying float vDepth;

  // Integer hash: the classic sin-based hash aliases into diagonal bands on some
  // GPUs, so mix the bit pattern instead.
  float hash(vec2 p) {
    uvec2 q = uvec2(ivec2(floor(p)) + 32768);
    uint h = q.x * 1597334677u ^ q.y * 3812015801u;
    h = (h ^ (h >> 16u)) * 2246822519u;
    h = (h ^ (h >> 13u)) * 3266489917u;
    h ^= h >> 16u;
    return float(h) / 4294967295.0;
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // Caustics: thin bright filaments where two warped noise fields cross. The
  // warp keeps the pattern from collapsing into wide parallel bands.
  float caustic(vec2 p, float t) {
    vec2 warp = vec2(noise(p * 1.3 + vec2(0.0, t * 0.07)),
                     noise(p * 1.3 + vec2(5.2, t * 0.05)));
    vec2 q = p * 2.1 + warp * 1.8;
    float a = noise(q + vec2(t * 0.16, t * 0.09));
    float b = noise(q * 1.17 - vec2(t * 0.11, t * 0.14));
    // Ridges where the two fields cross: thin bright filaments.
    float c = abs(a - b);
    return pow(1.0 - smoothstep(0.0, 0.055, c), 5.0);
  }

  void main() {
    // Radial ramp: jade through the body of the pond, darkening to the rim so
    // the water meets the bank without a pale halo.
    float radius = length(vPond);
    // Continuous ramp from the silty shallows at the rim to the deep centre.
    float depthFade = 1.0 - smoothstep(2.2, 7.4, radius);
    vec3 base = mix(uShallow, uDeep, depthFade);
    // A thin wet line over silt right at the waterline.
    float rim = smoothstep(7.6, 8.7, radius);
    base = mix(base, vec3(0.20, 0.22, 0.16), rim * 0.75);

    vec3 viewDir = normalize(uCamera - vWorld);
    float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 5.0);
    // Sky reflection: the pond mirrors the dusk above it.
    base = mix(base, uSky, clamp(fres * 0.55, 0.0, 0.45));

    // Caustics: thin filaments of light on the silt, strongest mid-pond.
    float caus = caustic(vPond * 1.0, uTime);
    base += vec3(0.50, 0.47, 0.34) * caus * (1.0 - smoothstep(6.8, 8.5, radius)) * 0.30;

    // A sharp glint where the low sun catches the ripples.
    vec3 sunDir = normalize(vec3(-10.0, 20.0, 9.0));
    float glint = pow(max(0.0, dot(viewDir, reflect(-sunDir, vec3(0.0, 1.0, 0.0)))), 26.0);
    base += vec3(1.0, 0.86, 0.62) * glint * 0.5;

    // Warm lantern light pooling on one side.
    float lantern = smoothstep(2.6, 0.0, distance(vWorld.xz, vec2(6.5, 4.5)));
    base += uWarm * lantern * 0.12;

    // A thin wet line at the shore, with a little foam drift.
    // A faint scum line right at the waterline, not a wide band.
    float foam = smoothstep(8.3, 8.85, radius) * (0.6 + 0.4 * sin(vPond.x * 2.4 + vPond.y * 2.0 + uTime * 0.4));
    base = mix(base, vec3(0.20, 0.23, 0.18), foam * 0.35);

    // Dither: the water sits low in the tone-mapping curve, where 8-bit output
    // would otherwise show Mach bands across these near-flat gradients.
    base += vec3((hash(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0));

    // Clear over the middle so the koi read; near-opaque at the rim so the
    // pond meets the bank with a crisp edge.
    // Thickness follows depth: the sheet thins to nothing where the bed rises
    // to the waterline, so it melts into the silt instead of ending in a lip.
    // Fade to fully transparent exactly at the waterline, so the sheet has no
    // visible edge against the bank.
    float thin = smoothstep(0.0, 0.07, vDepth);
    float alpha = mix(0.28, 0.46, thin) + foam * 0.06;
    gl_FragColor = vec4(base, clamp(alpha, 0.0, 1.0));
  }
`;

export function buildWater() {
  const segments = 256;
  const rings = 90;
  const positions = [];
  const indices = [];

  // Build in XY, extruded along Z; the mesh is rotated flat afterwards so the
  // shader can keep working in pond-local (x, z) coordinates.
  // Stop the water where the bed actually crosses the waterline. The bank has
  // hills, so the crossing is not a simple multiple of shoreRadius: walk
  // outward and take the last radius that is still under water.
  const rim = [];
  const STEPS = 400;
  for (let s = 0; s <= segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    let edge = 0;
    for (let i = 1; i <= STEPS; i++) {
      const r = (i / STEPS) * shoreRadius(angle) * 1.35;
      if (groundHeight(cx * r, cz * r) < WATER_LEVEL) edge = r;
      else {
        // Run a little past the crossing so the sheet overlaps the rising bank
        // instead of leaving a bare strip of bed at the waterline.
        edge = Math.min(r, shoreRadius(angle) * 1.02);
        break;
      }
    }
    rim.push(edge);
  }

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const radius = rim[s] * t;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const bed = groundHeight(x, z);
      const depth = Math.max(0, WATER_LEVEL - bed);
      positions.push(x, z, depth);
    }
  }
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(0, 0, -1000));
  const uniforms = {
    uTime: { value: 0 },
    uRipples: { value: ripples },
    // This shader writes gl_FragColor directly, so the colours must stay in
    // sRGB space; THREE.Color would convert them to linear and render mud.
    uShallow: { value: srgb("#9aa877") },
    uDeep: { value: srgb("#35685e") },
    uSky: { value: srgb("#c3cdc2") },
    uWarm: { value: srgb("#ffbe78") },
    uCamera: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // The surface is a height field, so the camera can see it from below at the
    // near rim; render both faces.
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_LEVEL;
  mesh.renderOrder = 2;
  mesh.name = "water";

  let cursor = 0;
  return {
    mesh,
    uniforms,
    // Records a ripple; oldest slot is recycled when the ring buffer is full.
    addRipple(x, z, time) {
      ripples[cursor].set(x, z, time);
      cursor = (cursor + 1) % MAX_RIPPLES;
    },
  };
}
