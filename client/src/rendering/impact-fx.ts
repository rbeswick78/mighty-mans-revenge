import Phaser from 'phaser';

import type { CollisionGrid } from '@shared/types/map.js';
import { sampleIsWall } from './wall-sample.js';

/**
 * Bullet-impact sparks + dust puffs. Pooled — every transient particle is a
 * preallocated `Phaser.GameObjects.Image` reused across impacts. After
 * construction the hot path makes zero per-frame allocations.
 *
 * Two visual layers:
 *   - Sparks: bright cream/yellow streaks rotated to their travel direction;
 *             always emitted, more on wall hits.
 *   - Dust:   soft tan radial puffs that grow + drift + fade; only on wall
 *             hits (open-air shots and player hits skip dust).
 */

// --- Tunables ---------------------------------------------------------------

// Above gameplay sprites and below the lighting overlay (depth 100) so the
// ambient darkness still tints sparks/dust into the scene.
const IMPACT_FX_DEPTH = 30;

const SPARK_TEXTURE_KEY = 'impact-spark';
const DUST_TEXTURE_KEY = 'impact-dust';

// Source texture sizes in pixels — actual on-screen size comes from setScale.
const SPARK_TEXTURE_SIZE_PX = 4;
const DUST_TEXTURE_RADIUS_PX = 24;
const DUST_TEXTURE_GRADIENT_STEPS = 12;

// Pool caps. Sized for a 1v1 with 3-round bursts: ~10 sparks + ~4 dust per
// wall hit, ~2 simultaneous impacts in flight at peak. Headroom for both.
// If exhausted the oldest active particle is recycled (FIFO).
const MAX_SPARKS = 96;
const MAX_DUST = 48;

const SPARK_COUNT_WALL = 10;
const SPARK_COUNT_AIR = 5;
const DUST_COUNT_WALL = 4;
const DUST_COUNT_AIR = 0;

// Spark motion. Streaks fan out in a cone centered on the reflected bullet
// direction (180° from travel). Velocity decays exponentially.
const SPARK_LIFE_MIN_MS = 110;
const SPARK_LIFE_MAX_MS = 220;
const SPARK_SPEED_MIN = 120;
const SPARK_SPEED_MAX = 260;
const SPARK_LENGTH_PX = 6;
const SPARK_THICKNESS_PX = 1;
const SPARK_DRAG_PER_S = 4.0;
const SPARK_SPREAD_RAD = Math.PI * 0.55; // ±100° cone (~200° total spread)

// Dust motion. Slow radial drift with mild upward bias so puffs feel like
// they rise then settle.
const DUST_LIFE_MIN_MS = 380;
const DUST_LIFE_MAX_MS = 620;
const DUST_INITIAL_RADIUS_PX = 4;
const DUST_MAX_RADIUS_PX = 14;
const DUST_INITIAL_ALPHA = 0.55;
const DUST_RISE_VY = -18; // px/s upward
const DUST_DRIFT_SPEED = 12; // px/s outward
const DUST_DAMPING = 0.92; // per-frame velocity scale; settles puffs

// Tints. Sparks: warm hot streaks. Dust: muted tan/sand to read as kicked
// debris from the wasteland tileset.
const SPARK_TINTS: readonly number[] = [0xfdcbb0, 0xfbff86, 0xf9c22b, 0xfca790];
const DUST_TINTS: readonly number[] = [0xab947a, 0x966c6c, 0x694f62, 0x4c3e24];

// --- Types ------------------------------------------------------------------

interface Spark {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  ageMs: number;
  lifeMs: number;
  active: boolean;
}

interface Dust {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  ageMs: number;
  lifeMs: number;
  active: boolean;
}

// --- Class ------------------------------------------------------------------

export class ImpactFx {
  private readonly scene: Phaser.Scene;
  private readonly sparkPool: Spark[] = [];
  private readonly dustPool: Dust[] = [];
  // Index of the next slot to consider when acquiring. Drives FIFO reuse.
  private nextSparkSlot = 0;
  private nextDustSlot = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    bakeSparkTexture(scene, SPARK_TEXTURE_KEY, SPARK_TEXTURE_SIZE_PX);
    bakeDustTexture(
      scene,
      DUST_TEXTURE_KEY,
      DUST_TEXTURE_RADIUS_PX,
      DUST_TEXTURE_GRADIENT_STEPS,
    );

    for (let i = 0; i < MAX_SPARKS; i++) {
      const img = scene.add.image(0, 0, SPARK_TEXTURE_KEY);
      img.setDepth(IMPACT_FX_DEPTH);
      img.setVisible(false);
      img.setActive(false);
      this.sparkPool.push({ img, vx: 0, vy: 0, ageMs: 0, lifeMs: 0, active: false });
    }
    for (let i = 0; i < MAX_DUST; i++) {
      const img = scene.add.image(0, 0, DUST_TEXTURE_KEY);
      img.setDepth(IMPACT_FX_DEPTH);
      img.setVisible(false);
      img.setActive(false);
      this.dustPool.push({ img, vx: 0, vy: 0, ageMs: 0, lifeMs: 0, active: false });
    }
  }

  /**
   * Emit sparks (and dust if the bullet hit a wall) at an impact point.
   * `bulletAngle` is the bullet's travel direction in radians.
   */
  spawnBulletImpact(
    x: number,
    y: number,
    bulletAngle: number,
    grid: CollisionGrid | null,
  ): void {
    const isWall = sampleIsWall(grid, x, y, bulletAngle);
    const sparkCount = isWall ? SPARK_COUNT_WALL : SPARK_COUNT_AIR;
    const dustCount = isWall ? DUST_COUNT_WALL : DUST_COUNT_AIR;

    // Sparks ricochet back from the surface — center the cone on the
    // reflected bullet direction.
    const ricochetAngle = bulletAngle + Math.PI;
    for (let i = 0; i < sparkCount; i++) {
      this.spawnSpark(x, y, ricochetAngle);
    }
    for (let i = 0; i < dustCount; i++) {
      this.spawnDust(x, y);
    }
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const dt = deltaMs / 1000;
    const sparkDecay = Math.exp(-SPARK_DRAG_PER_S * dt);

    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (!s.active) continue;
      s.ageMs += deltaMs;
      if (s.ageMs >= s.lifeMs) {
        deactivate(s);
        continue;
      }
      s.vx *= sparkDecay;
      s.vy *= sparkDecay;
      const x = s.img.x + s.vx * dt;
      const y = s.img.y + s.vy * dt;
      s.img.setPosition(x, y);
      s.img.setAlpha(1 - s.ageMs / s.lifeMs);
    }

    for (let i = 0; i < this.dustPool.length; i++) {
      const d = this.dustPool[i];
      if (!d.active) continue;
      d.ageMs += deltaMs;
      if (d.ageMs >= d.lifeMs) {
        deactivate(d);
        continue;
      }
      const t = d.ageMs / d.lifeMs;
      d.vx *= DUST_DAMPING;
      d.vy = (d.vy + DUST_RISE_VY * dt) * DUST_DAMPING;
      const x = d.img.x + d.vx * dt;
      const y = d.img.y + d.vy * dt;
      d.img.setPosition(x, y);

      const r =
        DUST_INITIAL_RADIUS_PX +
        (DUST_MAX_RADIUS_PX - DUST_INITIAL_RADIUS_PX) * easeOutCubic(t);
      d.img.setScale(r / DUST_TEXTURE_RADIUS_PX);
      d.img.setAlpha(DUST_INITIAL_ALPHA * (1 - t));
    }
  }

  destroy(): void {
    for (const s of this.sparkPool) s.img.destroy();
    for (const d of this.dustPool) d.img.destroy();
    this.sparkPool.length = 0;
    this.dustPool.length = 0;
    if (this.scene.textures.exists(SPARK_TEXTURE_KEY)) {
      this.scene.textures.remove(SPARK_TEXTURE_KEY);
    }
    if (this.scene.textures.exists(DUST_TEXTURE_KEY)) {
      this.scene.textures.remove(DUST_TEXTURE_KEY);
    }
  }

  private spawnSpark(x: number, y: number, baseAngle: number): void {
    const slot = acquireSlot(this.sparkPool, this.nextSparkSlot);
    if (slot === -1) return;
    this.nextSparkSlot = (slot + 1) % this.sparkPool.length;
    const s = this.sparkPool[slot];

    const angle = baseAngle + (Math.random() * 2 - 1) * SPARK_SPREAD_RAD;
    const speed = SPARK_SPEED_MIN + Math.random() * (SPARK_SPEED_MAX - SPARK_SPEED_MIN);
    s.vx = Math.cos(angle) * speed;
    s.vy = Math.sin(angle) * speed;
    s.ageMs = 0;
    s.lifeMs = SPARK_LIFE_MIN_MS + Math.random() * (SPARK_LIFE_MAX_MS - SPARK_LIFE_MIN_MS);
    s.active = true;

    s.img.setActive(true);
    s.img.setVisible(true);
    s.img.setPosition(x, y);
    s.img.setRotation(angle);
    s.img.setScale(
      SPARK_LENGTH_PX / SPARK_TEXTURE_SIZE_PX,
      SPARK_THICKNESS_PX / SPARK_TEXTURE_SIZE_PX,
    );
    s.img.setAlpha(1);
    s.img.setTint(SPARK_TINTS[Math.floor(Math.random() * SPARK_TINTS.length)]);
  }

  private spawnDust(x: number, y: number): void {
    const slot = acquireSlot(this.dustPool, this.nextDustSlot);
    if (slot === -1) return;
    this.nextDustSlot = (slot + 1) % this.dustPool.length;
    const d = this.dustPool[slot];

    // Dust drifts in any direction (it's kicked-up debris, not a ricochet
    // cone). Light upward bias added in update() via DUST_RISE_VY.
    const angle = Math.random() * Math.PI * 2;
    const speed = DUST_DRIFT_SPEED * (0.4 + Math.random() * 0.8);
    d.vx = Math.cos(angle) * speed;
    d.vy = Math.sin(angle) * speed;
    d.ageMs = 0;
    d.lifeMs = DUST_LIFE_MIN_MS + Math.random() * (DUST_LIFE_MAX_MS - DUST_LIFE_MIN_MS);
    d.active = true;

    d.img.setActive(true);
    d.img.setVisible(true);
    d.img.setPosition(x, y);
    d.img.setRotation(0);
    d.img.setScale(DUST_INITIAL_RADIUS_PX / DUST_TEXTURE_RADIUS_PX);
    d.img.setAlpha(DUST_INITIAL_ALPHA);
    d.img.setTint(DUST_TINTS[Math.floor(Math.random() * DUST_TINTS.length)]);
  }
}

// --- Helpers ----------------------------------------------------------------

function deactivate(p: { active: boolean; img: Phaser.GameObjects.Image }): void {
  p.active = false;
  p.img.setVisible(false);
  p.img.setActive(false);
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * Find a slot for a new particle: first inactive starting from `start`, or
 * the slot at `start` itself if the pool is full (FIFO recycling). Returns
 * -1 only for an empty pool.
 */
function acquireSlot<T extends { active: boolean }>(pool: T[], start: number): number {
  if (pool.length === 0) return -1;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    if (!pool[idx].active) return idx;
  }
  return start;
}

function bakeSparkTexture(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, size, size);
  g.generateTexture(key, size, size);
  g.destroy();
}

function bakeDustTexture(
  scene: Phaser.Scene,
  key: string,
  radius: number,
  steps: number,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const alpha = (1 - t) * (1 - t);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(radius, radius, radius * t);
  }
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}
