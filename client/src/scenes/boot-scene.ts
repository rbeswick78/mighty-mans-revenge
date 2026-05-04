import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { AudioManager } from '../audio/audio-manager.js';
import type { Direction4 } from '../rendering/sprite-direction.js';

interface FrameDim {
  w: number;
  h: number;
}

/**
 * Frame dimensions for each character sprite sheet. Each sheet has 6 frames
 * laid out horizontally; sheet width varies per direction so frame width
 * does too. Heights also vary slightly between idle vs run for the same
 * direction (the asset pack isn't strictly uniform).
 *
 * Player uses the `_no-hands` variants of the asset pack — the gun overlay
 * (registered separately below) supplies the held weapon. No-hands sprites
 * are 1–4 px narrower than the with-hands originals.
 */
const PLAYER_IDLE_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 11, h: 16 },        // 66 × 16
  up: { w: 11, h: 16 },          // 66 × 16
  side: { w: 10, h: 16 },        // 60 × 16
  'side-left': { w: 10, h: 16 }, // 60 × 16
};

const PLAYER_RUN_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 11, h: 17 },        // 66 × 17
  up: { w: 11, h: 17 },          // 66 × 17
  side: { w: 10, h: 17 },        // 60 × 17
  'side-left': { w: 10, h: 17 }, // 60 × 17
};

const ENEMY_IDLE_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 13, h: 16 },        // 78 × 16
  up: { w: 13, h: 15 },          // 78 × 15
  side: { w: 11, h: 15 },        // 66 × 15
  'side-left': { w: 11, h: 15 }, // 66 × 15
};

const ENEMY_RUN_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 12, h: 16 },        // 72 × 16 (zombie walk)
  up: { w: 13, h: 16 },          // 78 × 16
  side: { w: 13, h: 15 },        // 78 × 15
  'side-left': { w: 13, h: 15 }, // 78 × 15
};

/**
 * Gun overlay (the "Gun" weapon — pack ships Pistol/Gun/Shotgun/Bat; this
 * is the medium gun that matches our 3-round-burst feel). 6-frame hold
 * animation plays continuously while held; 3-frame shoot animation plays
 * once per shot. Sheets are smaller than the character — the artist drew
 * the gun centered relative to the character such that overlaying both at
 * the same origin places the gun in the held hand.
 */
const GUN_HOLD_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 5, h: 16 },          // 30 × 16
  up: { w: 5, h: 16 },            // 30 × 16
  side: { w: 16, h: 10 },         // 96 × 10
  'side-left': { w: 16, h: 10 },  // 96 × 10
};

const GUN_SHOOT_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 5, h: 17 },          // 15 × 17
  up: { w: 5, h: 17 },            // 15 × 17
  side: { w: 18, h: 10 },         // 54 × 10
  'side-left': { w: 18, h: 10 },  // 54 × 10
};

/**
 * Muzzle flash sprite (replaces the old procedural circle in
 * effects-renderer). 3-frame flash, plays once per shot at the bullet
 * spawn position with the direction matching the bullet's travel angle.
 */
const FIRE_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 7, h: 10 },          // 21 × 10
  up: { w: 7, h: 10 },            // 21 × 10
  side: { w: 10, h: 7 },          // 30 × 7
  'side-left': { w: 10, h: 7 },   // 30 × 7
};

const DIRECTIONS: readonly Direction4[] = ['down', 'up', 'side', 'side-left'];
const IDLE_FPS = 6;
const RUN_FPS = 12;
const GUN_HOLD_FPS = 9;     // between idle and run — visually close enough either way
const GUN_SHOOT_FPS = 24;   // 3 frames in ~125 ms
const FIRE_FPS = 30;        // 3 frames in ~100 ms — matches old procedural flash duration

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.setupLoadingBar();
    this.loadRealAssets();
    this.generateProceduralAssets();
  }

  create(): void {
    this.createCharacterAnimations();
    // Singleton; subsequent scenes call setScene() to retarget it.
    if (!AudioManager.getInstance()) {
      new AudioManager(this);
    }
    // `?tilepicker` URL param routes straight into the debug tile-frame
    // visualizer instead of the lobby — used to identify exact frame
    // indices for map-renderer.ts variant pools.
    const wantTilePicker = new URLSearchParams(window.location.search).has('tilepicker');
    const nextScene = wantTilePicker ? 'TilePickerScene' : 'LobbyScene';
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(nextScene);
    });
  }

  private setupLoadingBar(): void {
    const barWidth = 320;
    const barHeight = 20;
    const barX = (this.cameras.main.width - barWidth) / 2;
    const barY = this.cameras.main.height / 2;

    const bgBar = this.add.graphics();
    bgBar.fillStyle(Wasteland.LOADING_BAR_BG, 1);
    bgBar.fillRect(barX, barY, barWidth, barHeight);

    const progressBar = this.add.graphics();

    const loadingText = this.add.text(
      this.cameras.main.width / 2,
      barY - 30,
      'LOADING...',
      {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '16px',
        color: cssHex(Wasteland.TEXT_LOADING),
      },
    );
    loadingText.setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(Wasteland.LOADING_BAR_FILL, 1);
      progressBar.fillRect(barX + 2, barY + 2, (barWidth - 4) * value, barHeight - 4);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      bgBar.destroy();
      loadingText.destroy();
    });
  }

  private loadRealAssets(): void {
    // Player + enemy sprite sheets — 4 directions × 2 states (idle, run).
    for (const dir of DIRECTIONS) {
      this.loadCharacterSheet('player', dir, 'idle', PLAYER_IDLE_FRAMES[dir]);
      this.loadCharacterSheet('player', dir, 'run', PLAYER_RUN_FRAMES[dir]);
      this.loadCharacterSheet('enemy', dir, 'idle', ENEMY_IDLE_FRAMES[dir]);
      this.loadCharacterSheet('enemy', dir, 'run', ENEMY_RUN_FRAMES[dir]);
    }

    // Gun overlay + muzzle flash — 4 directions each.
    for (const dir of DIRECTIONS) {
      this.load.spritesheet(
        `gun_${dir}_hold`,
        `/assets/player/gun_${dir}_hold.png`,
        { frameWidth: GUN_HOLD_FRAMES[dir].w, frameHeight: GUN_HOLD_FRAMES[dir].h },
      );
      this.load.spritesheet(
        `gun_${dir}_shoot`,
        `/assets/player/gun_${dir}_shoot.png`,
        { frameWidth: GUN_SHOOT_FRAMES[dir].w, frameHeight: GUN_SHOOT_FRAMES[dir].h },
      );
      this.load.spritesheet(
        `fire_${dir}`,
        `/assets/player/fire_${dir}.png`,
        { frameWidth: FIRE_FRAMES[dir].w, frameHeight: FIRE_FRAMES[dir].h },
      );
    }

    // Bleak-yellow tileset (16×16 tiles, 24 cols × 17 rows = 408 frames).
    // Specific frame indices are tunable in map-renderer.ts.
    this.load.spritesheet(
      'tiles_bleak',
      '/assets/tiles/background_bleak-yellow.png',
      { frameWidth: 16, frameHeight: 16 },
    );
    // Brick-wall tileset (16×16 tiles, 6 cols × 3 rows = 18 frames).
    // Used for wall variants — see WALL_VARIANTS in map-renderer.ts.
    this.load.spritesheet(
      'tiles_brick',
      '/assets/tiles/brick-wall.png',
      { frameWidth: 16, frameHeight: 16 },
    );
    // Wire-fence closing animation (21×22 px frames, 7 frames in a row).
    // Not a placement tileset — single-strip animation. Loaded so the
    // tile picker can preview frames and decide how to use them.
    this.load.spritesheet(
      'tiles_wire_fence_closing',
      '/assets/tiles/wire-fence-closing-no-lock.png',
      { frameWidth: 21, frameHeight: 22 },
    );
    // Iron-fence tileset (16×16 tiles, 3 cols × 4 rows = 12 frames).
    this.load.spritesheet(
      'tiles_iron_fence',
      '/assets/tiles/iron-fence.png',
      { frameWidth: 16, frameHeight: 16 },
    );

    // Pickups — single static images, scaled at render time.
    // Ammo uses the asset-pack crate; grenade is generated procedurally
    // (see generateProceduralAssets) so it actually reads as a grenade.
    this.load.image('pickup_ammo', '/assets/pickups/ammo-crate_blue.png');

    // Bullet head — 2×1 px sprite, rotated to bullet angle and tweened
    // start→end. Replaces the procedural 'bullet-trail' streak.
    this.load.image('bullet', '/assets/player/bullet.png');

    // Music tracks. Played via AudioManager.playMusic(<key>) on scene
    // entry; gameplay match length is tied to game-play track length.
    this.load.audio('music-lobby', '/assets/audio/lobby.mp3');
    this.load.audio('music-gameplay', '/assets/audio/game-play.mp3');
    this.load.audio('music-win', '/assets/audio/post-game-win.mp3');
    this.load.audio('music-lose', '/assets/audio/post-game-lose.mp3');

    // SFX. Key matches the entry in AudioManager's SOUND_MAP — bullet
    // trails fire at the burst interval, so playing this on each trail
    // naturally gives three shots per burst at 150 ms spacing.
    this.load.audio('sfx-gunshot', '/assets/audio/gun-shot.wav');
    this.load.audio('sfx-explosion', '/assets/audio/grenade-explosion.wav');
    this.load.audio('sfx-grenade-throw', '/assets/audio/grenade-throw.wav');
    this.load.audio('sfx-kill', '/assets/audio/kill.wav');
    this.load.audio('sfx-death', '/assets/audio/death.wav');
    this.load.audio('sfx-pickup', '/assets/audio/pickup.wav');
    this.load.audio('sfx-out-of-ammo', '/assets/audio/out-of-ammo.wav');
  }

  private loadCharacterSheet(
    kind: 'player' | 'enemy',
    direction: Direction4,
    state: 'idle' | 'run',
    dim: FrameDim,
  ): void {
    const folder = kind === 'player' ? 'player' : 'enemies';
    const filePrefix = kind === 'player' ? 'character' : 'zombie';
    const key = `${kind}_${direction}_${state}`;
    const path = `/assets/${folder}/${filePrefix}_${direction}_${state}.png`;
    this.load.spritesheet(key, path, { frameWidth: dim.w, frameHeight: dim.h });
  }

  /**
   * Define looping idle and run animations for player and enemy. Each anim
   * key matches its texture key (Phaser keeps anims and textures in
   * separate registries so this isn't ambiguous).
   */
  private createCharacterAnimations(): void {
    for (const kind of ['player', 'enemy'] as const) {
      for (const dir of DIRECTIONS) {
        for (const state of ['idle', 'run'] as const) {
          const key = `${kind}_${dir}_${state}`;
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(key, {}),
            frameRate: state === 'run' ? RUN_FPS : IDLE_FPS,
            repeat: -1,
          });
        }
      }
    }

    // Gun hold loops (one anim per direction, played continuously while
    // the player is alive). Gun shoot is a one-shot per trigger pull;
    // muzzle flash (fire) is also one-shot, fired alongside the trail.
    for (const dir of DIRECTIONS) {
      const holdKey = `gun_${dir}_hold`;
      this.anims.create({
        key: holdKey,
        frames: this.anims.generateFrameNumbers(holdKey, {}),
        frameRate: GUN_HOLD_FPS,
        repeat: -1,
      });
      const shootKey = `gun_${dir}_shoot`;
      this.anims.create({
        key: shootKey,
        frames: this.anims.generateFrameNumbers(shootKey, {}),
        frameRate: GUN_SHOOT_FPS,
        repeat: 0,
      });
      const fireKey = `fire_${dir}`;
      this.anims.create({
        key: fireKey,
        frames: this.anims.generateFrameNumbers(fireKey, {}),
        frameRate: FIRE_FPS,
        repeat: 0,
      });
    }
  }

  /**
   * Generate textures we don't yet have real art for — kept as procedural
   * placeholders so the rest of the game keeps working. The effects pass
   * (later in the graphics roadmap) will replace these with real sprites.
   */
  private generateProceduralAssets(): void {
    const gfx = (): Phaser.GameObjects.Graphics => this.add.graphics().setVisible(false);

    // Bullet trail — 4×2 cream rectangle
    const bulletGfx = gfx();
    bulletGfx.fillStyle(Wasteland.BULLET_TRAIL, 1);
    bulletGfx.fillRect(0, 0, 4, 2);
    bulletGfx.generateTexture('bullet-trail', 4, 2);
    bulletGfx.destroy();

    // Grenade — 8×8 oxidized-steel circle
    const grenadeGfx = gfx();
    grenadeGfx.fillStyle(Wasteland.GRENADE_TINT, 1);
    grenadeGfx.fillCircle(4, 4, 4);
    grenadeGfx.generateTexture('grenade', 8, 8);
    grenadeGfx.destroy();

    // Grenade pickup — 16×16 hand-pixeled icon (oxidized body, steel
    // spoon/lever, gold pin ring). Drawn pixel-by-pixel so the pickup reads
    // as a grenade rather than the generic crate we used as a placeholder.
    const pickupGrenadeGfx = gfx();
    const px = (color: number, x: number, y: number): void => {
      pickupGrenadeGfx.fillStyle(color, 1);
      pickupGrenadeGfx.fillRect(x, y, 1, 1);
    };
    const BODY = Wasteland.GRENADE_TINT;
    const HIGHLIGHT = 0x547e64;
    const GROOVE = 0x2e222f;
    const STEEL = 0xb2ba90;
    const PIN = 0xf9c22b;
    // Body shape (rough sphere, widest at y=10–12).
    const bodyRows: Array<[number, number, number]> = [
      [8, 6, 9],
      [9, 5, 10],
      [10, 4, 11],
      [11, 4, 11],
      [12, 4, 11],
      [13, 5, 10],
      [14, 6, 9],
    ];
    for (const [y, xStart, xEnd] of bodyRows) {
      for (let x = xStart; x <= xEnd; x++) px(BODY, x, y);
    }
    // Pineapple grooves (3-dot horizontal pattern, two rows).
    px(GROOVE, 5, 10); px(GROOVE, 8, 10); px(GROOVE, 10, 10);
    px(GROOVE, 5, 12); px(GROOVE, 8, 12); px(GROOVE, 10, 12);
    // Left-edge highlight pixels.
    px(HIGHLIGHT, 5, 9); px(HIGHLIGHT, 5, 11);
    // Neck (steel collar between body and lever).
    px(STEEL, 7, 7); px(STEEL, 8, 7);
    // Spoon/lever sweeping up to the right.
    px(STEEL, 7, 6); px(STEEL, 8, 6); px(STEEL, 9, 6);
    px(STEEL, 9, 5); px(STEEL, 10, 5); px(STEEL, 11, 5);
    px(STEEL, 11, 4);
    // Pin ring (gold loop above the lever).
    px(PIN, 11, 3); px(PIN, 12, 3);
    px(PIN, 10, 2); px(PIN, 13, 2);
    px(PIN, 11, 1); px(PIN, 12, 1);
    pickupGrenadeGfx.generateTexture('pickup_grenade', 16, 16);
    pickupGrenadeGfx.destroy();

    // Explosion — 32×32 layered hot circles
    const explosionGfx = gfx();
    explosionGfx.fillStyle(Wasteland.EXPLOSION_PARTICLE_B, 1);
    explosionGfx.fillCircle(16, 16, 16);
    explosionGfx.fillStyle(Wasteland.EXPLOSION_PARTICLE_A, 0.7);
    explosionGfx.fillCircle(16, 16, 10);
    explosionGfx.fillStyle(Wasteland.EXPLOSION_PARTICLE_C, 0.5);
    explosionGfx.fillCircle(16, 16, 5);
    explosionGfx.generateTexture('explosion', 32, 32);
    explosionGfx.destroy();

    // Particle texture used by emitters in effects-renderer.
    const particleGfx = gfx();
    particleGfx.fillStyle(0xffffff, 1);
    particleGfx.fillCircle(2, 2, 2);
    particleGfx.generateTexture('particle', 4, 4);
    particleGfx.destroy();

    // Crosshair / bullseye — replaces the OS cursor over the gameboard.
    // Two concentric rings + center pip + 4 cardinal tick marks, in hot
    // red so the reticle pops against the dusty wasteland palette.
    // Native pixel size; no scaling at draw-time.
    const crosshairSize = 24;
    const cx = crosshairSize / 2;
    const cy = crosshairSize / 2;
    const crosshairThickness = 2;
    const crosshairGfx = gfx();
    crosshairGfx.lineStyle(crosshairThickness, Wasteland.CROSSHAIR, 1);
    crosshairGfx.strokeCircle(cx, cy, 10);
    crosshairGfx.strokeCircle(cx, cy, 5);
    // Cardinal tick marks (gap between center and outer ring helps reads).
    crosshairGfx.lineBetween(cx, 0, cx, 3);
    crosshairGfx.lineBetween(cx, crosshairSize - 3, cx, crosshairSize);
    crosshairGfx.lineBetween(0, cy, 3, cy);
    crosshairGfx.lineBetween(crosshairSize - 3, cy, crosshairSize, cy);
    // Center pip — chunky 3×3 so it pops on top of bloom/scanlines.
    crosshairGfx.fillStyle(Wasteland.CROSSHAIR, 1);
    crosshairGfx.fillRect(cx - 1, cy - 1, 3, 3);
    crosshairGfx.generateTexture('crosshair', crosshairSize, crosshairSize);
    crosshairGfx.destroy();
  }
}
