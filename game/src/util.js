// util.js — shared math helpers for Sunset Neon City 3D.
// One seeded generator drives every procedural choice (buildings, traffic,
// pedestrians) so every player explores the same harbour city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Shortest signed turn from heading a to heading b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * t;
}

// Push a circle (x, z, r) out of an axis-aligned box. Returns the fixed
// position, or null when the circle does not touch the box at all.
export function collideCircleBox(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r, hit: true };
  }
  // Centre is inside the box: leave through the nearest face.
  const left = x - box.minX;
  const right = box.maxX - x;
  const top = z - box.minZ;
  const bottom = box.maxZ - z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: box.minX - r, z, hit: true };
  if (m === right) return { x: box.maxX + r, z, hit: true };
  if (m === top) return { x, z: box.minZ - r, hit: true };
  return { x, z: box.maxZ + r, hit: true };
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function formatCash(amount) {
  return `$${Math.floor(amount).toLocaleString('en-US')}`;
}
