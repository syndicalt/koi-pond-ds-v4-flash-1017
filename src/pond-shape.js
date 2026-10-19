// Small, deterministic helpers shared by the pond builders.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// The pond's outline. Two lobes plus a few wobbles keep it from reading as a circle.
// `angle` in radians; returns the shore radius at that angle.
export function shoreRadius(angle) {
  const a = angle;
  return (
    7.2 +
    0.85 * Math.cos(a * 2 + 0.6) +
    0.5 * Math.sin(a * 3 - 1.1) +
    0.3 * Math.cos(a * 5 + 2.2) +
    0.22 * Math.sin(a * 7 + 0.3)
  );
}

// How far from the centre a point lies, as a fraction of the shore radius.
export function pondDepth(x, z) {
  const angle = Math.atan2(z, x);
  const radius = Math.hypot(x, z);
  return radius / shoreRadius(angle);
}

// The bank rises away from the water. Returns ground height for a point.
export function groundHeight(x, z) {
  const d = pondDepth(x, z);
  if (d < 1) {
    // The basin: shallow shelf, then a gentle bowl.
    const t = smoothstep(0, 1, d);
    return lerp(-1.35, -0.12, t * t) - 0.06 * Math.sin(x * 1.7) * Math.cos(z * 1.3);
  }
  const t = d - 1;
  const rise = 1 - Math.exp(-t * 0.9);
  const hill = 0.55 * Math.sin(x * 0.32 + 1.2) * Math.cos(z * 0.27 - 0.4) * smoothstep(0, 6, t * 4);
  return lerp(-0.06, 1.9, rise) + hill;
}

// Height of the water plane.
export const WATER_LEVEL = 0;

// A cheap value-noise-ish wobble used for foliage sway and caustics.
export function wobble(t, seed) {
  return (
    Math.sin(t * 0.9 + seed) * 0.6 +
    Math.sin(t * 1.7 + seed * 2.3) * 0.3 +
    Math.sin(t * 2.9 + seed * 0.7) * 0.1
  );
}
