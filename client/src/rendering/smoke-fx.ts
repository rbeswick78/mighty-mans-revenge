import Phaser from 'phaser';

/**
 * Lingering smoke puffs from grenade detonations. A pool of additively-
 * blended `Phaser.GameObjects.Image` puffs that grow, drift outward + up,
 * and fade — well after the bright debris/ring/flash have died. Reads as
 * dust kicked up by the blast catching the explosion's afterglow, which
 * fits the dusty-wasteland palette.
 *
 * Same pool / FIFO-recycle / per-frame-update pattern as `ImpactFx` and
 * `ExplosionFx`. Zero per-frame allocations after warmup.
 *
 * Depth `SMOKE_FX_DEPTH = 28` — just under the debris band (30). Smoke is
 * faint when the bright effects are alive, so depth ordering against ring/
 * flash doesn't matter visually. Above the lighting overlay would skip
 * ambient tinting; we want the puffs to stay in-world, so this stays
 * below 100.
 */

// --- Tunables ---------------------------------------------------------------

const SMOKE_FX_DEPTH = 28;

const SMOKE_TEXTURE_KEY = 'smoke-puff';
// Source texture geometry. Cubic falloff gives a softer edge than the
// quadratic falloff used for dust/scorch — important since these puffs
// are big and we don't want a hard ring at the edge.
const SMOKE_TEXTURE_RADIUS_PX = 32;
const SMOKE_GRADIENT_STEPS = 16;

// Pool cap. Each explosion spawns 8 puffs; with ~2.4 s lifetime, four
// closely-spaced explosions can reach 32 active. 64 leaves headroom; FIFO
// recycle on overflow.
const MAX_SMOKE = 64;
const SMOKE_PUFFS_PER_EXPLOSION = 8;

const SMOKE_LIFE_MIN_MS = 1400;
const SMOKE_LIFE_MAX_MS = 2400;

// Visible radius lerps from initial → final over life with an ease-out.
const SMOKE_INITIAL_RADIUS_PX = 12;
const SMOKE_FINAL_RADIUS_PX = 36;

// Asymmetric alpha curve: fast fade-in to PEAK over PEAK_T fraction of
// life, then slow fade-out for the remainder. Peak kept conservative
// because additive blending stacks brightness across overlapping puffs
// and the bloom postFX amplifies bright pixels.
const SMOKE_PEAK_ALPHA = 0.4;
const SMOKE_ALPHA_PEAK_T = 0.18;

// Per-puff drift. Random outward direction; upward bias added in spawn so
// the cloud rises overall like proper smoke.
const SMOKE_DRIFT_SPEED_MIN = 8;
const SMOKE_DRIFT_SPEED_MAX = 30;
const SMOKE_RISE_VY = -10;
const SMOKE_DRAG_PER_S = 0.6;
const SMOKE_ROTATION_SPEED_MAX = 0.4; // radians/sec, slow tumble

// Position jitter at spawn so 8 puffs from one explosion don't perfectly
// stack into one bright disk.
const SMOKE_SPAWN_JITTER_PX = 14;

// Warm tan + cool grey mix from RESURRECT_64. Under additive blending
// these read as atmospheric dust catching warm light, not dense smoke.
const SMOKE_TINTS: readonly number[] = [
  0xab947a, // warm tan
  0x966c6c, // muted brown
  0x7f708a, // cool dust
  0xc7dcd0, // bone-white
];

// --- Types ------------------------------------------------------------------

interface Smoke {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  rotationSpeed: number;
  ageMs: number;
  lifeMs: number;
  active: boolean;
}

// --- Class ------------------------------------------------------------------

export class SmokeFx {
  private readonly scene: Phaser.Scene;
  private readonly pool: Smoke[] = [];
  private nextSlot = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    bakeSmokeTexture(
      scene,
      SMOKE_TEXTURE_KEY,
      SMOKE_TEXTURE_RADIUS_PX,
      SMOKE_GRADIENT_STEPS,
    );

    for (let i = 0; i < MAX_SMOKE; i++) {
      const img = scene.add.image(0, 0, SMOKE_TEXTURE_KEY);
      img.setDepth(SMOKE_FX_DEPTH);
      img.setBlendMode(Phaser.BlendModes.ADD);
      img.setVisible(false);
      img.setActive(false);
      this.pool.push({
        img,
        vx: 0,
        vy: 0,
        rotationSpeed: 0,
        ageMs: 0,
        lifeMs: 0,
        active: false,
      });
    }
  }

  /** Emit a layered cloud of puffs at a detonation point. */
  spawnExplosionSmoke(x: number, y: number): void {
    for (let i = 0; i < SMOKE_PUFFS_PER_EXPLOSION; i++) {
      this.spawnPuff(x, y);
    }
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const dt = deltaMs / 1000;
    const drag = Math.exp(-SMOKE_DRAG_PER_S * dt);

    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s.active) continue;
      s.ageMs += deltaMs;
      if (s.ageMs >= s.lifeMs) {
        deactivate(s);
        continue;
      }
      const t = s.ageMs / s.lifeMs;

      s.vx *= drag;
      s.vy *= drag;
      const x = s.img.x + s.vx * dt;
      const y = s.img.y + s.vy * dt;
      s.img.setPosition(x, y);
      s.img.setRotation(s.img.rotation + s.rotationSpeed * dt);

      const radius =
        SMOKE_INITIAL_RADIUS_PX +
        (SMOKE_FINAL_RADIUS_PX - SMOKE_INITIAL_RADIUS_PX) * easeOutCubic(t);
      s.img.setScale(radius / SMOKE_TEXTURE_RADIUS_PX);
      s.img.setAlpha(smokeAlpha(t));
    }
  }

  destroy(): void {
    for (const s of this.pool) s.img.destroy();
    this.pool.length = 0;
    if (this.scene.textures.exists(SMOKE_TEXTURE_KEY)) {
      this.scene.textures.remove(SMOKE_TEXTURE_KEY);
    }
  }

  private spawnPuff(x: number, y: number): void {
    const slot = acquireSlot(this.pool, this.nextSlot);
    if (slot === -1) return;
    this.nextSlot = (slot + 1) % this.pool.length;
    const s = this.pool[slot];

    const jitterAngle = Math.random() * Math.PI * 2;
    const jitterDist = Math.random() * SMOKE_SPAWN_JITTER_PX;
    const px = x + Math.cos(jitterAngle) * jitterDist;
    const py = y + Math.sin(jitterAngle) * jitterDist;

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed =
      SMOKE_DRIFT_SPEED_MIN +
      Math.random() * (SMOKE_DRIFT_SPEED_MAX - SMOKE_DRIFT_SPEED_MIN);
    s.vx = Math.cos(driftAngle) * driftSpeed;
    s.vy = Math.sin(driftAngle) * driftSpeed + SMOKE_RISE_VY;
    s.rotationSpeed = (Math.random() * 2 - 1) * SMOKE_ROTATION_SPEED_MAX;
    s.ageMs = 0;
    s.lifeMs = SMOKE_LIFE_MIN_MS + Math.random() * (SMOKE_LIFE_MAX_MS - SMOKE_LIFE_MIN_MS);
    s.active = true;

    s.img.setActive(true);
    s.img.setVisible(true);
    s.img.setPosition(px, py);
    s.img.setRotation(Math.random() * Math.PI * 2);
    s.img.setScale(SMOKE_INITIAL_RADIUS_PX / SMOKE_TEXTURE_RADIUS_PX);
    s.img.setAlpha(0);
    s.img.setTint(SMOKE_TINTS[Math.floor(Math.random() * SMOKE_TINTS.length)]);
  }
}

// --- Helpers ----------------------------------------------------------------

function deactivate(s: Smoke): void {
  s.active = false;
  s.img.setVisible(false);
  s.img.setActive(false);
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/** Asymmetric ramp: 0 → PEAK over PEAK_T, then PEAK → 0 over the rest. */
function smokeAlpha(t: number): number {
  if (t < SMOKE_ALPHA_PEAK_T) {
    return SMOKE_PEAK_ALPHA * (t / SMOKE_ALPHA_PEAK_T);
  }
  const u = (t - SMOKE_ALPHA_PEAK_T) / (1 - SMOKE_ALPHA_PEAK_T);
  return SMOKE_PEAK_ALPHA * (1 - u);
}

function acquireSlot(pool: Smoke[], start: number): number {
  if (pool.length === 0) return -1;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    if (!pool[idx].active) return idx;
  }
  return start;
}

function bakeSmokeTexture(
  scene: Phaser.Scene,
  key: string,
  radius: number,
  steps: number,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // Cubic falloff — softer edge than dust/scorch's quadratic, so the puff
  // feels diffuse at the large size we expand to.
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const alpha = (1 - t) * (1 - t) * (1 - t);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(radius, radius, radius * t);
  }
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}
