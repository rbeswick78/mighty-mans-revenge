import Phaser from 'phaser';
import { ParallaxBackdrop } from './parallax-backdrop.js';

// ─────────────────────────────────────────────────────────────────────────────
// Texture generation — called once from BootScene.generateProceduralAssets().
// Textures are cached on the Phaser texture manager and reused by every
// WastelandStreet instance for the lifetime of the game.
// ─────────────────────────────────────────────────────────────────────────────

export const MENU_TEXTURES = Object.freeze({
  SKY: 'menu-sky-grad',
  CITY: 'menu-city-silhouette',
  RUINS: 'menu-ruins-distant',
  WALL: 'menu-wall-mid',
  GROUND: 'menu-ground-near',
  FENCE: 'menu-fence-near',
  EMBER: 'menu-ember',
});

// Tiny deterministic LCG so texture generation is reproducible across runs.
// Each call to next() returns 0..1.
class Mulberry32 {
  constructor(private seed: number) {}
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  int(min: number, maxExcl: number): number {
    return Math.floor(this.range(min, maxExcl));
  }
}

const drawPx = (
  gfx: Phaser.GameObjects.Graphics,
  color: number,
  alpha: number,
  x: number,
  y: number,
): void => {
  gfx.fillStyle(color, alpha);
  gfx.fillRect(x, y, 1, 1);
};

/** Generate every menu-scene procedural texture. Idempotent. */
export function generateMenuTextures(scene: Phaser.Scene): void {
  const tm = scene.textures;
  if (!tm.exists(MENU_TEXTURES.SKY)) generateSky(scene);
  if (!tm.exists(MENU_TEXTURES.CITY)) generateCitySilhouette(scene);
  if (!tm.exists(MENU_TEXTURES.RUINS)) generateRuinsDistant(scene);
  if (!tm.exists(MENU_TEXTURES.WALL)) generateWallMid(scene);
  if (!tm.exists(MENU_TEXTURES.GROUND)) generateGroundNear(scene);
  if (!tm.exists(MENU_TEXTURES.FENCE)) generateFenceNear(scene);
  if (!tm.exists(MENU_TEXTURES.EMBER)) generateEmber(scene);
}

function generateSky(scene: Phaser.Scene): void {
  const W = 960;
  const H = 320;
  const gfx = scene.add.graphics().setVisible(false);
  // Vertical bands — top (deep night plum) down to bottom (dusk orange).
  // 10 bands across the height for a stepped-pixel gradient feel.
  const bands: Array<{ y0: number; y1: number; color: number }> = [
    { y0: 0, y1: 40, color: 0x2e222f },
    { y0: 40, y1: 80, color: 0x3e3546 },
    { y0: 80, y1: 120, color: 0x45293f },
    { y0: 120, y1: 160, color: 0x625565 },
    { y0: 160, y1: 200, color: 0x753c54 },
    { y0: 200, y1: 235, color: 0x966c6c },
    { y0: 235, y1: 265, color: 0xa24b6f },
    { y0: 265, y1: 290, color: 0xcd683d },
    { y0: 290, y1: 310, color: 0xe6904e },
    { y0: 310, y1: H, color: 0xf57d4a },
  ];
  for (const b of bands) {
    gfx.fillStyle(b.color, 1);
    gfx.fillRect(0, b.y0, W, b.y1 - b.y0);
  }
  // Scatter a few "stars" / dust specks in the upper third.
  const rng = new Mulberry32(0x5113c0de);
  for (let i = 0; i < 25; i++) {
    const x = rng.int(0, W);
    const y = rng.int(0, 110);
    drawPx(gfx, 0xc7dcd0, 0.5, x, y);
  }
  // A pale moon, low and orange-tinted by the haze.
  gfx.fillStyle(0xfdcbb0, 0.55);
  gfx.fillCircle(740, 140, 18);
  gfx.fillStyle(0xfbb954, 0.75);
  gfx.fillCircle(740, 140, 11);
  gfx.generateTexture(MENU_TEXTURES.SKY, W, H);
  gfx.destroy();
}

function generateCitySilhouette(scene: Phaser.Scene): void {
  const W = 480;
  const H = 90;
  const gfx = scene.add.graphics().setVisible(false);
  const DARK = 0x2e222f;
  // Tileable: ensure left edge skyline mirrors right edge so the pattern
  // wraps cleanly when used as a TileSprite.
  const buildings: Array<{ x: number; w: number; h: number }> = [
    { x: 0, w: 38, h: 58 },
    { x: 38, w: 26, h: 72 },
    { x: 64, w: 44, h: 48 },
    { x: 108, w: 34, h: 66 },
    { x: 142, w: 56, h: 38 },
    { x: 198, w: 30, h: 80 },
    { x: 228, w: 40, h: 52 },
    { x: 268, w: 26, h: 68 },
    { x: 294, w: 50, h: 44 },
    { x: 344, w: 36, h: 74 },
    { x: 380, w: 28, h: 56 },
    { x: 408, w: 44, h: 62 },
    { x: 452, w: 28, h: 58 },
  ];
  gfx.fillStyle(DARK, 1);
  for (const b of buildings) {
    gfx.fillRect(b.x, H - b.h, b.w, b.h);
    // Roof antenna on some buildings.
    if (b.h > 60 && (b.x % 7) % 2 === 0) {
      gfx.fillRect(b.x + Math.floor(b.w / 2), H - b.h - 4, 1, 4);
    }
  }
  // Smoke columns (thin, semi-transparent ash rising from a couple of buildings).
  gfx.fillStyle(0x3e3546, 0.55);
  gfx.fillRect(50, 0, 2, 24);
  gfx.fillRect(48, 24, 4, 8);
  gfx.fillRect(214, 0, 2, 28);
  gfx.fillRect(213, 28, 4, 6);
  gfx.fillRect(360, 0, 2, 22);
  // Lit windows — small amber pixels on a handful of buildings.
  const rng = new Mulberry32(0x90DA5);
  const litWindows: Array<[number, number]> = [];
  for (const b of buildings) {
    if (b.h < 40) continue;
    const winCount = rng.int(0, 4);
    for (let i = 0; i < winCount; i++) {
      const wx = b.x + rng.int(2, Math.max(3, b.w - 2));
      const wy = H - b.h + rng.int(6, Math.max(7, b.h - 6));
      litWindows.push([wx, wy]);
    }
  }
  for (const [x, y] of litWindows) {
    drawPx(gfx, 0xf9c22b, 0.85, x, y);
  }
  gfx.generateTexture(MENU_TEXTURES.CITY, W, H);
  gfx.destroy();
}

function generateRuinsDistant(scene: Phaser.Scene): void {
  const W = 480;
  const H = 90;
  const gfx = scene.add.graphics().setVisible(false);
  const FILL = 0x3e3546;
  const HIGHLIGHT = 0x625565;
  // Broken-wall silhouettes — varied heights, with chips/notches taken out
  // along the top.
  const walls: Array<{ x: number; w: number; h: number; notch?: number }> = [
    { x: 0, w: 50, h: 40, notch: 18 },
    { x: 50, w: 30, h: 22 },
    { x: 80, w: 60, h: 36, notch: 30 },
    { x: 140, w: 22, h: 18 },
    { x: 162, w: 70, h: 50, notch: 24 },
    { x: 232, w: 26, h: 20 },
    { x: 258, w: 56, h: 44, notch: 28 },
    { x: 314, w: 40, h: 28 },
    { x: 354, w: 32, h: 36, notch: 14 },
    { x: 386, w: 50, h: 30 },
    { x: 436, w: 44, h: 42, notch: 20 },
  ];
  gfx.fillStyle(FILL, 1);
  for (const w of walls) {
    gfx.fillRect(w.x, H - w.h, w.w, w.h);
    if (w.notch !== undefined) {
      // Crumbled top notch
      gfx.fillStyle(0x000000, 0); // no-op switch
      const notchX = w.x + Math.floor(w.w / 2 - 4);
      gfx.fillStyle(0x12101a, 1);
      gfx.fillRect(notchX, H - w.h, 8, Math.min(8, w.notch / 2));
      gfx.fillStyle(FILL, 1);
    }
  }
  // 1px highlight along the very top of each wall to suggest morning light.
  gfx.fillStyle(HIGHLIGHT, 0.6);
  for (const w of walls) {
    gfx.fillRect(w.x, H - w.h, w.w, 1);
  }
  gfx.generateTexture(MENU_TEXTURES.RUINS, W, H);
  gfx.destroy();
}

function generateWallMid(scene: Phaser.Scene): void {
  const W = 480;
  const H = 120;
  const gfx = scene.add.graphics().setVisible(false);
  const MORTAR = 0x2e222f;
  const BRICK_A = 0x694f62;
  const BRICK_B = 0x625565;
  const BRICK_HIGHLIGHT = 0x7f708a;
  const BRICK_DARK = 0x3e3546;
  // Background mortar fill
  gfx.fillStyle(MORTAR, 1);
  gfx.fillRect(0, 0, W, H);
  // Brick rows. 16px tall bricks, 32px wide. Alternating row offset for
  // running-bond pattern.
  const brickW = 32;
  const brickH = 16;
  const rng = new Mulberry32(0xb12cca7);
  let rowY = 0;
  let rowIdx = 0;
  while (rowY < H) {
    const xOffset = rowIdx % 2 === 0 ? 0 : -brickW / 2;
    let x = xOffset;
    while (x < W) {
      // Pick a brick variant
      const variant = rng.next();
      let color: number;
      if (variant < 0.45) color = BRICK_A;
      else if (variant < 0.85) color = BRICK_B;
      else color = BRICK_DARK; // damaged/dark brick
      gfx.fillStyle(color, 1);
      gfx.fillRect(x + 1, rowY + 1, brickW - 2, brickH - 2);
      // Faint top highlight on most bricks
      if (variant > 0.2) {
        gfx.fillStyle(BRICK_HIGHLIGHT, 0.35);
        gfx.fillRect(x + 1, rowY + 1, brickW - 2, 1);
      }
      // Random chip — a missing pixel or two near corners
      if (rng.next() < 0.12) {
        const chipX = x + rng.int(1, brickW - 2);
        const chipY = rowY + rng.int(1, brickH - 2);
        drawPx(gfx, MORTAR, 1, chipX, chipY);
        if (rng.next() < 0.5) drawPx(gfx, MORTAR, 1, chipX + 1, chipY);
      }
      x += brickW;
    }
    rowY += brickH;
    rowIdx++;
  }
  // Big damaged hole in the wall, roughly center. Lets the distant ruins
  // layer "show through" visually since we punch a transparent-feeling
  // dark block here.
  gfx.fillStyle(MORTAR, 1);
  gfx.fillRect(200, 40, 60, 50);
  // Rubble edge around the hole
  gfx.fillStyle(BRICK_A, 1);
  gfx.fillRect(196, 38, 4, 4);
  gfx.fillRect(258, 38, 6, 4);
  gfx.fillRect(196, 88, 4, 4);
  gfx.fillRect(258, 86, 4, 6);
  drawPx(gfx, BRICK_DARK, 1, 198, 42);
  drawPx(gfx, BRICK_DARK, 1, 262, 44);
  gfx.generateTexture(MENU_TEXTURES.WALL, W, H);
  gfx.destroy();
}

function generateGroundNear(scene: Phaser.Scene): void {
  const W = 480;
  const H = 120;
  const gfx = scene.add.graphics().setVisible(false);
  const DIRT_A = 0x4c3e24;
  const DIRT_B = 0x676633;
  const DIRT_DARK = 0x2e222f;
  const DEBRIS = 0xab947a;
  const HIGHLIGHT = 0xfbb954;
  // Base dirt fill with horizontal banding
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let color: number;
    if (t < 0.15) color = DIRT_DARK;       // recess shadow at top edge
    else if (t < 0.55) color = DIRT_A;
    else color = DIRT_B;
    gfx.fillStyle(color, 1);
    gfx.fillRect(0, y, W, 1);
  }
  // Specks of debris and lighter dust
  const rng = new Mulberry32(0xd1bbed1);
  for (let i = 0; i < 200; i++) {
    const x = rng.int(0, W);
    const y = rng.int(8, H);
    const c = rng.next();
    const color = c < 0.5 ? DEBRIS : c < 0.85 ? DIRT_DARK : HIGHLIGHT;
    const alpha = c > 0.85 ? 0.35 : 0.7;
    drawPx(gfx, color, alpha, x, y);
  }
  // Larger rocks/rubble chunks
  for (let i = 0; i < 12; i++) {
    const x = rng.int(8, W - 8);
    const y = rng.int(30, H - 12);
    const w = rng.int(3, 8);
    const h = rng.int(2, 4);
    gfx.fillStyle(0x625565, 1);
    gfx.fillRect(x, y, w, h);
    gfx.fillStyle(0x3e3546, 1);
    gfx.fillRect(x, y + h - 1, w, 1);
  }
  gfx.generateTexture(MENU_TEXTURES.GROUND, W, H);
  gfx.destroy();
}

function generateFenceNear(scene: Phaser.Scene): void {
  const W = 480;
  const H = 120;
  const gfx = scene.add.graphics().setVisible(false);
  const WIRE = 0x2e222f;
  // Vertical posts every 96px
  for (let x = 0; x < W; x += 96) {
    gfx.fillStyle(WIRE, 0.9);
    gfx.fillRect(x, 0, 2, H);
    // Post cap (slightly thicker top)
    gfx.fillRect(x - 1, 0, 4, 3);
  }
  // Horizontal wires at the top and middle of the fence
  gfx.fillStyle(WIRE, 0.75);
  gfx.fillRect(0, 6, W, 1);
  gfx.fillRect(0, H - 8, W, 1);
  // Chain-link diagonal cross pattern — sparse, just enough to read as
  // wire mesh without dominating the foreground.
  gfx.fillStyle(WIRE, 0.45);
  for (let x = 0; x < W; x += 8) {
    for (let y = 12; y < H - 12; y += 8) {
      drawPx(gfx, WIRE, 0.55, x, y);
      drawPx(gfx, WIRE, 0.55, x + 4, y + 4);
    }
  }
  // A few broken / hanging wires for character
  drawPx(gfx, WIRE, 0.7, 60, 22);
  drawPx(gfx, WIRE, 0.7, 61, 23);
  drawPx(gfx, WIRE, 0.7, 62, 24);
  drawPx(gfx, WIRE, 0.7, 63, 26);
  drawPx(gfx, WIRE, 0.7, 232, 30);
  drawPx(gfx, WIRE, 0.7, 233, 31);
  drawPx(gfx, WIRE, 0.7, 234, 33);
  gfx.generateTexture(MENU_TEXTURES.FENCE, W, H);
  gfx.destroy();
}

function generateEmber(scene: Phaser.Scene): void {
  const W = 4;
  const H = 4;
  const gfx = scene.add.graphics().setVisible(false);
  // Soft 4×4 round ember with a hot center pixel.
  gfx.fillStyle(0xf57d4a, 0.4);
  gfx.fillRect(0, 0, W, H);
  gfx.fillStyle(0xfbb954, 0.85);
  gfx.fillRect(1, 1, 2, 2);
  drawPx(gfx, 0xfbff86, 1, 1, 1);
  gfx.generateTexture(MENU_TEXTURES.EMBER, W, H);
  gfx.destroy();
}

// ─────────────────────────────────────────────────────────────────────────────
// WastelandStreet — composes the 5-layer parallax scene + particles,
// owned by either LobbyScene or ResultsScene. Auto-cleans on scene SHUTDOWN.
// ─────────────────────────────────────────────────────────────────────────────

export type Outcome = 'victory' | 'defeat' | 'draw';

export interface WastelandStreetOpts {
  /** Reduce particle counts for mobile / low-end devices. */
  lowDetail?: boolean;
}

// Outcome wash colors — chosen to read distinctly while staying inside the
// Resurrect-64 palette. Alpha kept low so the parallax still reads through.
const OUTCOME_WASH: Record<Outcome, { color: number; alpha: number }> = {
  victory: { color: 0xf57d4a, alpha: 0.28 }, // warm sunset orange
  defeat: { color: 0x4d65b4, alpha: 0.34 },  // cold ash blue
  draw: { color: 0x694f62, alpha: 0.28 },    // muted concrete gray
};

// Particle config per outcome — embers thicker for victory, slow ash for
// defeat, light dust for draw. Default (no outcome / lobby) is moderate
// orange embers.
interface EmberConfig {
  count: number;
  tint: number;
  speedY: { min: number; max: number };
  lifespanMs: number;
}

const EMBER_DEFAULT: EmberConfig = {
  count: 40,
  tint: 0xfbb954,
  speedY: { min: -28, max: -14 },
  lifespanMs: 4200,
};
const EMBER_VICTORY: EmberConfig = {
  count: 70,
  tint: 0xf68181,
  speedY: { min: -36, max: -18 },
  lifespanMs: 4400,
};
const EMBER_DEFEAT: EmberConfig = {
  count: 30,
  tint: 0x9babb2,
  speedY: { min: -14, max: -6 },
  lifespanMs: 5600,
};
const EMBER_DRAW: EmberConfig = {
  count: 30,
  tint: 0xab947a,
  speedY: { min: -18, max: -10 },
  lifespanMs: 4400,
};

export class WastelandStreet {
  private readonly parallax: ParallaxBackdrop;
  private readonly sky: Phaser.GameObjects.Image;
  private readonly washRect: Phaser.GameObjects.Rectangle;
  private readonly emberEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly lowDetail: boolean;

  // Depth layout — UI sits above all of these.
  static readonly DEPTH = Object.freeze({
    SKY: 0,
    CITY: 1,
    RUINS: 2,
    SMOKE: 3,
    WALL: 4,
    /** Lobby places the Mighty Man sprite at this depth. */
    CHARACTERS: 5,
    GROUND: 6,
    FENCE: 7,
    EMBERS: 8,
    OUTCOME_WASH: 9,
    /** UI (panels, logo, buttons) should sit at 10+. */
    UI: 10,
  });

  constructor(scene: Phaser.Scene, opts?: WastelandStreetOpts) {
    this.lowDetail = opts?.lowDetail ?? false;

    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;

    // Sky — static, no drift. Stretched to canvas width.
    this.sky = scene.add
      .image(0, 0, MENU_TEXTURES.SKY)
      .setOrigin(0, 0)
      .setDisplaySize(camW, 320)
      .setDepth(WastelandStreet.DEPTH.SKY);

    // Parallax drifting layers (city silhouette through fence).
    this.parallax = new ParallaxBackdrop(scene, [
      // City silhouette — low and far.
      {
        textureKey: MENU_TEXTURES.CITY,
        pxPerSec: 4,
        y: 230,
        depth: WastelandStreet.DEPTH.CITY,
      },
      // Distant brick ruins band.
      {
        textureKey: MENU_TEXTURES.RUINS,
        pxPerSec: 10,
        y: 300,
        depth: WastelandStreet.DEPTH.RUINS,
      },
      // Mid-ground damaged brick wall — Mighty Man stands in front.
      {
        textureKey: MENU_TEXTURES.WALL,
        pxPerSec: 20,
        y: 360,
        depth: WastelandStreet.DEPTH.WALL,
      },
      // Near-foreground ground with debris.
      {
        textureKey: MENU_TEXTURES.GROUND,
        pxPerSec: 35,
        y: camH - 140,
        depth: WastelandStreet.DEPTH.GROUND,
      },
      // Near foreground wire fence — overlays the ground, mostly transparent.
      {
        textureKey: MENU_TEXTURES.FENCE,
        pxPerSec: 45,
        y: camH - 130,
        depth: WastelandStreet.DEPTH.FENCE,
        alpha: 0.75,
      },
    ]);

    // Ember particles rising from the near foreground.
    const emberDef = EMBER_DEFAULT;
    this.emberEmitter = scene.add.particles(0, 0, MENU_TEXTURES.EMBER, {
      x: { min: 0, max: camW },
      y: camH - 30,
      lifespan: emberDef.lifespanMs,
      speedX: { min: -8, max: 4 },
      speedY: emberDef.speedY,
      scale: { start: 1, end: 0.4 },
      alpha: { start: 0.95, end: 0 },
      tint: emberDef.tint,
      frequency: this.lowDetail ? 320 : 160,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    });
    this.emberEmitter.setDepth(WastelandStreet.DEPTH.EMBERS);

    // Slow smoke wisps rising over the distant ruins.
    this.smokeEmitter = scene.add.particles(0, 0, 'particle', {
      x: { min: 100, max: camW - 100 },
      y: 290,
      lifespan: 6500,
      speedX: { min: -6, max: 2 },
      speedY: { min: -12, max: -5 },
      scale: { start: 1.6, end: 5.0 },
      alpha: { start: 0.18, end: 0 },
      tint: 0x625565,
      frequency: this.lowDetail ? 1100 : 700,
      quantity: 1,
    });
    this.smokeEmitter.setDepth(WastelandStreet.DEPTH.SMOKE);

    // Outcome wash overlay — invisible by default (lobby), filled and tinted
    // when end screen calls setOutcomeWash(outcome).
    this.washRect = scene.add
      .rectangle(0, 0, camW, camH, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(WastelandStreet.DEPTH.OUTCOME_WASH);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Apply (or clear) the outcome color wash + retune particles. */
  setOutcomeWash(outcome: Outcome | null): void {
    if (outcome === null) {
      this.washRect.setFillStyle(0x000000, 0);
      this.retuneEmbers(EMBER_DEFAULT);
      return;
    }
    const wash = OUTCOME_WASH[outcome];
    this.washRect.setFillStyle(wash.color, wash.alpha);
    const emberDef =
      outcome === 'victory'
        ? EMBER_VICTORY
        : outcome === 'defeat'
          ? EMBER_DEFEAT
          : EMBER_DRAW;
    this.retuneEmbers(emberDef);
  }

  private retuneEmbers(def: EmberConfig): void {
    const e = this.emberEmitter;
    e.setParticleTint(def.tint);
    e.setParticleLifespan(def.lifespanMs);
    e.setParticleSpeed(0, this.lerpSpeedY(def));
    // Adjust frequency to roughly hit the desired steady-state count.
    e.frequency = Math.max(
      80,
      Math.floor(def.lifespanMs / Math.max(1, def.count)),
    );
  }

  private lerpSpeedY(def: EmberConfig): number {
    // Pick the midpoint as the emitter's nominal Y speed — Phaser emitters
    // re-derive the range from the ops object on demand; setting a scalar
    // here gives a stable feel even though setParticleSpeed only takes
    // scalars in the public API.
    return (def.speedY.min + def.speedY.max) / 2;
  }

  destroy(): void {
    this.sky.destroy();
    this.parallax.destroy();
    this.washRect.destroy();
    this.emberEmitter.destroy();
    this.smokeEmitter.destroy();
  }
}
