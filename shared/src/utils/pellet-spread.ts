/**
 * Deterministic shotgun pellet spread.
 *
 * Pellet angles are an even fan across the weapon's spread arc plus a
 * small per-pellet jitter drawn from a seeded PRNG. Everything is derived
 * from the arguments — no Math.random, no wall-clock — so the server's
 * lag-compensated hit validation and any client-side preview produce the
 * exact same rays for the same shot. The seed is the firing input's
 * sequence number, which both sides know.
 */

/**
 * mulberry32 — tiny 32-bit PRNG. Uses Math.imul and float division only,
 * so results are bit-identical across JS engines.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute the absolute aim angles (radians) for one multi-pellet shot.
 *
 * @param aimAngle    Center of the fan.
 * @param pelletCount Number of pellets (>= 1).
 * @param spreadAngle Full width of the fan in radians.
 * @param seed        Deterministic seed (the firing input's sequenceNumber).
 */
export function computePelletAngles(
  aimAngle: number,
  pelletCount: number,
  spreadAngle: number,
  seed: number,
): number[] {
  if (pelletCount <= 1 || spreadAngle <= 0) {
    return [aimAngle];
  }

  const rand = mulberry32(seed);
  const spacing = spreadAngle / (pelletCount - 1);
  // Jitter stays under half the fan spacing so pellets never cross over
  // or bunch outside the declared spread arc.
  const maxJitter = spacing * 0.4;

  const lo = aimAngle - spreadAngle / 2;
  const hi = aimAngle + spreadAngle / 2;
  const angles: number[] = [];
  for (let i = 0; i < pelletCount; i++) {
    const base = lo + i * spacing;
    const jitter = (rand() * 2 - 1) * maxJitter;
    // Clamp so edge pellets can't jitter outside the declared arc. Interior
    // pellets can never reach the bounds (jitter < spacing/2), so ordering
    // is preserved.
    angles.push(Math.min(hi, Math.max(lo, base + jitter)));
  }
  return angles;
}
