import Phaser from 'phaser';
import { Wasteland, cssHex } from '@shared/config/palette.js';
import { CHARACTERS } from '@shared/config/game.js';
import {
  DEATH_DIRECTIONS,
  DIRECTIONS,
  type CharacterDef,
  type DeathVariantDef,
  type Direction4,
  type FrameDim,
} from '@shared/types/character.js';
import { AudioManager } from '../audio/audio-manager.js';
import { generateMenuTextures } from '../ui/menu/wasteland-street.js';
import { MENU_FONT_CHECK_LIST } from '../ui/menu/fonts.js';
import { preloadModernUiAtlas, registerModernUiAtlas } from '../ui/modern-ui-runtime.js';
import {
  WIRE_GATE_FRAME_HEIGHT,
  WIRE_GATE_FRAME_WIDTH,
  WIRE_GATE_OPEN_ANIMATION_KEY,
  WIRE_GATE_OPEN_FPS,
  WIRE_GATE_OPENING_FRAMES,
  WIRE_GATE_TEXTURE_KEY,
} from '../rendering/wire-gate.js';

/**
 * Per-direction frame dimensions for the gun overlay (the "Gun" weapon —
 * pack ships Pistol/Gun/Shotgun/Bat; this is the medium gun that matches
 * our 3-round-burst feel). 6-frame hold animation plays continuously while
 * held; 3-frame shoot animation plays once per shot. Sheets are smaller
 * than the character — the artist drew the gun centered relative to the
 * character such that overlaying both at the same origin places the gun
 * in the held hand.
 *
 * Character sprite frame dimensions live on the CHARACTERS registry in
 * /shared and are loaded automatically by the loop in `loadRealAssets`.
 */
const GUN_HOLD_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 5, h: 16 }, // 30 × 16
  up: { w: 5, h: 16 }, // 30 × 16
  side: { w: 16, h: 10 }, // 96 × 10
  'side-left': { w: 16, h: 10 }, // 96 × 10
};

const GUN_SHOOT_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 5, h: 17 }, // 15 × 17
  up: { w: 5, h: 17 }, // 15 × 17
  side: { w: 18, h: 10 }, // 54 × 10
  'side-left': { w: 18, h: 10 }, // 54 × 10
};

/**
 * Muzzle flash sprite (replaces the old procedural circle in
 * effects-renderer). 3-frame flash, plays once per shot at the bullet
 * spawn position with the direction matching the bullet's travel angle.
 */
const FIRE_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 7, h: 10 }, // 21 × 10
  up: { w: 7, h: 10 }, // 21 × 10
  side: { w: 10, h: 7 }, // 30 × 7
  'side-left': { w: 10, h: 7 }, // 30 × 7
};

/** Two three-frame player-hit splashes from Enemies/Shot. */
const HIT_SPLASH_SHEETS = [
  { key: 'hit_splash_1', file: 'player-hit-1.png', frameWidth: 7 },
  { key: 'hit_splash_2', file: 'player-hit-2.png', frameWidth: 6 },
] as const;
const HIT_SPLASH_FRAME_HEIGHT = 6;
const HIT_SPLASH_FPS = 30;

/**
 * Shotgun held-overlay frame dimensions (same layering trick as the gun:
 * overlay both sprites at the same origin and the weapon sits in the held
 * hand). hold = idle-and-run Sheet6, shoot = Sheet3, racking = Sheet2.
 */
const SHOTGUN_HOLD_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 6, h: 14 }, // 36 × 14
  up: { w: 6, h: 16 }, // 36 × 16
  side: { w: 15, h: 8 }, // 90 × 8
  'side-left': { w: 15, h: 8 }, // 90 × 8
};

const SHOTGUN_SHOOT_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 6, h: 15 }, // 18 × 15
  up: { w: 6, h: 17 }, // 18 × 17
  side: { w: 18, h: 8 }, // 54 × 8
  'side-left': { w: 18, h: 8 }, // 54 × 8
};

const SHOTGUN_RACK_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 6, h: 14 }, // 12 × 14
  up: { w: 6, h: 16 }, // 12 × 16
  side: { w: 16, h: 7 }, // 32 × 7
  'side-left': { w: 16, h: 7 }, // 32 × 7
};

/**
 * Pistol held-overlay frame dimensions (Gun Game rung weapon; same
 * layering trick as gun/shotgun). hold = 6-frame loop, shoot = 3-frame
 * one-shot. No racking state — the pistol is semi-auto; its fire rate is
 * the server's fireCooldown, with no pump animation to fill it.
 */
const PISTOL_HOLD_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 5, h: 11 }, // 30 × 11
  up: { w: 5, h: 11 }, // 30 × 11
  side: { w: 8, h: 9 }, // 48 × 9
  'side-left': { w: 8, h: 9 }, // 48 × 9
};

const PISTOL_SHOOT_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 5, h: 11 }, // 15 × 11
  up: { w: 5, h: 11 }, // 15 × 11
  side: { w: 10, h: 8 }, // 30 × 8
  'side-left': { w: 10, h: 8 }, // 30 × 8
};

const IDLE_FPS = 6;
const RUN_FPS = 12;
/** Thrown axe spins fast — 9 frames looping in ~0.5s. */
const AXE_THROWN_FPS = 18;
/** Axe landing one-shot — 5 frames in ~0.25s. */
const AXE_LANDING_FPS = 20;

/**
 * Thrown-axe projectile sheets (Jack's Axe Throw). The pack ships thrown
 * spins for side / side-left / vertical (vertical covers both up and
 * down), and landing/landed for all four directions. Frame dims measured
 * from the extracted sheets.
 */
const AXE_THROWN_DIRS = ['side', 'side-left', 'vertical'] as const;
const AXE_THROWN_FRAMES: Record<(typeof AXE_THROWN_DIRS)[number], FrameDim> = {
  side: { w: 14, h: 14 }, // 126 × 14, 9 frames
  'side-left': { w: 14, h: 14 }, // 126 × 14, 9 frames
  vertical: { w: 3, h: 16 }, // 27 × 16, 9 frames
};
const AXE_LANDING_FRAMES: Record<Direction4, FrameDim> = {
  down: { w: 13, h: 18 }, // 65 × 18, 5 frames
  up: { w: 13, h: 15 }, // 65 × 15, 5 frames
  side: { w: 19, h: 16 }, // 95 × 16, 5 frames
  'side-left': { w: 19, h: 16 }, // 95 × 16, 5 frames
};
const GUN_HOLD_FPS = 9; // between idle and run — visually close enough either way
const GUN_SHOOT_FPS = 24; // 3 frames in ~125 ms
const FIRE_FPS = 30; // 3 frames in ~100 ms — matches old procedural flash duration
/** 2 racking frames spread over the shotgun's 0.6 s pump delay. */
const SHOTGUN_RACK_FPS = 2 / 0.6;
/**
 * Punch swing duration in seconds. Attack sheets vary wildly in frame
 * count across the roster (4/4/8/7), so instead of a fixed FPS each
 * character's attack anim gets frameRate = attackFrameCount /
 * ATTACK_SWING_SECONDS — every swing plays in ~350ms regardless of frame
 * count. PlayerRenderer's ATTACK_SWING_DURATION_MS must match this.
 */
const ATTACK_SWING_SECONDS = 0.35;
/** Death sheets play once, then hold their final corpse frame until respawn. */
const DEATH_ANIMATION_SECONDS = 0.65;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.setupLoadingBar();
    preloadModernUiAtlas(this);
    this.loadRealAssets();
    this.generateProceduralAssets();
    // Menu-scene procedural textures (sky gradient, city silhouette, brick
    // wall band, near-ground debris, wire fence, ember particle). Cached on
    // the texture manager for the lifetime of the game.
    generateMenuTextures(this);
  }

  create(): void {
    registerModernUiAtlas(this);
    this.createCharacterAnimations();
    // Singleton bound to Phaser.Game (process lifetime). Scenes don't
    // retarget it — sounds and fades live above the scene graph.
    if (!AudioManager.getInstance()) {
      new AudioManager(this.game);
    }
    // `?tilepicker` URL param routes straight into the debug tile-frame
    // visualizer instead of the lobby — used to identify exact frame
    // indices for map-renderer.ts variant pools.
    const wantTilePicker = new URLSearchParams(window.location.search).has('tilepicker');
    const nextScene = wantTilePicker ? 'TilePickerScene' : 'LobbyScene';
    // Wait for menu web fonts before revealing LobbyScene. Painting first
    // with the Courier fallback (different character widths) and then
    // restamping in Press Start 2P produces a visible flicker.
    void this.awaitMenuFonts().then(() => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(nextScene);
      });
    });
  }

  private async awaitMenuFonts(): Promise<void> {
    if (!('fonts' in document)) return;
    try {
      await Promise.all(MENU_FONT_CHECK_LIST.map((spec) => document.fonts.load(spec)));
      await document.fonts.ready;
    } catch {
      // Fall through to Courier fallback — never block startup on font load.
    }
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

    const loadingText = this.add.text(this.cameras.main.width / 2, barY - 30, 'LOADING...', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '16px',
      color: cssHex(Wasteland.TEXT_LOADING),
    });
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
    // Character sprite sheets — four-direction living states plus the
    // asset pack's two horizontal death facings.
    // Driven by the CHARACTERS registry in /shared so adding a new
    // character only requires registering it there + dropping assets in
    // the right folder.
    //
    // Dedupe by spritePrefix: characters that intentionally share another
    // character's sheets (e.g. Frost Wizard → mighty_man, runtime-tinted)
    // would otherwise hit Phaser with duplicate texture keys and log a
    // noisy warning per direction × state.
    const loadedPrefixes = new Set<string>();
    // Annotated as CharacterDef so optional fields (altBody) are visible —
    // the frozen registry literal narrows each entry to its own shape.
    const roster: CharacterDef[] = Object.values(CHARACTERS);
    for (const char of roster) {
      if (!loadedPrefixes.has(char.spritePrefix)) {
        loadedPrefixes.add(char.spritePrefix);
        for (const dir of DIRECTIONS) {
          this.loadCharacterSheet(
            char.spritePrefix,
            dir,
            'idle',
            char.idleFrames[dir],
            char.assetFolder,
            char.assetBaseName,
          );
          this.loadCharacterSheet(
            char.spritePrefix,
            dir,
            'run',
            char.runFrames[dir],
            char.assetFolder,
            char.assetBaseName,
          );
          // Melee attack sheets (the Gun Game punch rung) — body-level
          // states, one per character, same registry-driven pipeline.
          this.loadCharacterSheet(
            char.spritePrefix,
            dir,
            'attack',
            char.attackFrames[dir],
            char.assetFolder,
            char.assetBaseName,
          );
        }
        for (const dir of DEATH_DIRECTIONS) {
          this.loadCharacterSheet(
            char.spritePrefix,
            dir,
            'death',
            char.deathFrames[dir],
            char.assetFolder,
            char.assetBaseName,
          );
        }
      }
      this.loadDeathVariants(char.deathVariants, char.assetFolder, loadedPrefixes);

      // Alt-body sheets (Jack's no-axe body while his thrown axe is in
      // flight / on cooldown). By CharacterDef.altBody contract the alt
      // sheets share the BASE def's frame counts but carry their own
      // frame dims (the pack crops variants differently).
      const alt = char.altBody;
      if (alt && !loadedPrefixes.has(alt.spritePrefix)) {
        loadedPrefixes.add(alt.spritePrefix);
        for (const dir of DIRECTIONS) {
          this.loadCharacterSheet(
            alt.spritePrefix,
            dir,
            'idle',
            alt.idleFrames[dir],
            char.assetFolder,
            alt.assetBaseName,
          );
          this.loadCharacterSheet(
            alt.spritePrefix,
            dir,
            'run',
            alt.runFrames[dir],
            char.assetFolder,
            alt.assetBaseName,
          );
          this.loadCharacterSheet(
            alt.spritePrefix,
            dir,
            'attack',
            alt.attackFrames[dir],
            char.assetFolder,
            alt.assetBaseName,
          );
        }
        for (const dir of DEATH_DIRECTIONS) {
          this.loadCharacterSheet(
            alt.spritePrefix,
            dir,
            'death',
            alt.deathFrames[dir],
            char.assetFolder,
            alt.assetBaseName,
          );
        }
      }
      this.loadDeathVariants(alt?.deathVariants, char.assetFolder, loadedPrefixes);

      // Optional synchronized cosmetic layer (Rook's helmet). It owns
      // tightly cropped frames but follows the body's state and frame count.
      const overlay = char.bodyOverlay;
      if (overlay && !loadedPrefixes.has(overlay.spritePrefix)) {
        loadedPrefixes.add(overlay.spritePrefix);
        for (const dir of DIRECTIONS) {
          this.loadCharacterSheet(
            overlay.spritePrefix,
            dir,
            'idle',
            overlay.idleFrames[dir],
            overlay.assetFolder,
            overlay.assetBaseName,
          );
          this.loadCharacterSheet(
            overlay.spritePrefix,
            dir,
            'run',
            overlay.runFrames[dir],
            overlay.assetFolder,
            overlay.assetBaseName,
          );
          this.loadCharacterSheet(
            overlay.spritePrefix,
            dir,
            'attack',
            overlay.attackFrames[dir],
            overlay.assetFolder,
            overlay.assetBaseName,
          );
        }
        for (const dir of DEATH_DIRECTIONS) {
          this.loadCharacterSheet(
            overlay.spritePrefix,
            dir,
            'death',
            overlay.deathFrames[dir],
            overlay.assetFolder,
            overlay.assetBaseName,
          );
        }
      }
    }

    // Thrown-axe projectile (Jack's Axe Throw): spinning flight loops for
    // side/side-left/vertical, landing one-shots + landed stills for all
    // four directions.
    for (const dir of AXE_THROWN_DIRS) {
      this.load.spritesheet(`axe_${dir}_thrown`, `/assets/enemies/axe_${dir}_thrown.png`, {
        frameWidth: AXE_THROWN_FRAMES[dir].w,
        frameHeight: AXE_THROWN_FRAMES[dir].h,
      });
    }
    for (const dir of DIRECTIONS) {
      this.load.spritesheet(`axe_${dir}_landing`, `/assets/enemies/axe_${dir}_landing.png`, {
        frameWidth: AXE_LANDING_FRAMES[dir].w,
        frameHeight: AXE_LANDING_FRAMES[dir].h,
      });
      this.load.image(`axe_${dir}_landed`, `/assets/enemies/axe_${dir}_landed.png`);
    }

    // Gun overlay + muzzle flash — 4 directions each. Shared across all
    // characters (not character-specific assets).
    for (const dir of DIRECTIONS) {
      this.load.spritesheet(`gun_${dir}_hold`, `/assets/player/gun_${dir}_hold.png`, {
        frameWidth: GUN_HOLD_FRAMES[dir].w,
        frameHeight: GUN_HOLD_FRAMES[dir].h,
      });
      this.load.spritesheet(`gun_${dir}_shoot`, `/assets/player/gun_${dir}_shoot.png`, {
        frameWidth: GUN_SHOOT_FRAMES[dir].w,
        frameHeight: GUN_SHOOT_FRAMES[dir].h,
      });
      this.load.spritesheet(`fire_${dir}`, `/assets/player/fire_${dir}.png`, {
        frameWidth: FIRE_FRAMES[dir].w,
        frameHeight: FIRE_FRAMES[dir].h,
      });
    }

    // Shotgun held overlay — 4 directions × (hold loop / shoot / racking).
    for (const dir of DIRECTIONS) {
      this.load.spritesheet(`shotgun_${dir}_hold`, `/assets/player/shotgun_${dir}_hold.png`, {
        frameWidth: SHOTGUN_HOLD_FRAMES[dir].w,
        frameHeight: SHOTGUN_HOLD_FRAMES[dir].h,
      });
      this.load.spritesheet(`shotgun_${dir}_shoot`, `/assets/player/shotgun_${dir}_shoot.png`, {
        frameWidth: SHOTGUN_SHOOT_FRAMES[dir].w,
        frameHeight: SHOTGUN_SHOOT_FRAMES[dir].h,
      });
      this.load.spritesheet(`shotgun_${dir}_racking`, `/assets/player/shotgun_${dir}_racking.png`, {
        frameWidth: SHOTGUN_RACK_FRAMES[dir].w,
        frameHeight: SHOTGUN_RACK_FRAMES[dir].h,
      });
    }

    // Pistol held overlay — 4 directions × (hold loop / shoot). No racking.
    for (const dir of DIRECTIONS) {
      this.load.spritesheet(`pistol_${dir}_hold`, `/assets/player/pistol_${dir}_hold.png`, {
        frameWidth: PISTOL_HOLD_FRAMES[dir].w,
        frameHeight: PISTOL_HOLD_FRAMES[dir].h,
      });
      this.load.spritesheet(`pistol_${dir}_shoot`, `/assets/player/pistol_${dir}_shoot.png`, {
        frameWidth: PISTOL_SHOOT_FRAMES[dir].w,
        frameHeight: PISTOL_SHOOT_FRAMES[dir].h,
      });
    }

    // Bleak-yellow tileset (16×16 tiles, 24 cols × 17 rows = 408 frames).
    // Specific frame indices are tunable in map-renderer.ts.
    this.load.spritesheet('tiles_bleak', '/assets/tiles/background_bleak-yellow.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Brick-wall tileset (16×16 tiles, 6 cols × 3 rows = 18 frames).
    // Used for wall variants — see WALL_VARIANTS in map-renderer.ts.
    this.load.spritesheet('tiles_brick', '/assets/tiles/brick-wall.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Wire-fence closing animation (21×22 px frames, 7 frames in a row).
    // Not a placement tileset — single-strip animation. Loaded so the
    // tile picker can preview frames and decide how to use them.
    this.load.spritesheet(WIRE_GATE_TEXTURE_KEY, '/assets/tiles/wire-fence-closing-no-lock.png', {
      frameWidth: WIRE_GATE_FRAME_WIDTH,
      frameHeight: WIRE_GATE_FRAME_HEIGHT,
    });
    // Iron-fence tileset (16×16 tiles, 3 cols × 4 rows = 12 frames).
    this.load.spritesheet('tiles_iron_fence', '/assets/tiles/iron-fence.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Theme tilesets (see map-themes.ts). The green/dark-green background
    // sheets are palette swaps of the bleak-yellow layout (24×17 frames);
    // roof is 16×5 (corrugated walls), garbage 8×4 (cover accents).
    this.load.spritesheet('tiles_green', '/assets/tiles/background_green.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('tiles_dark_green', '/assets/tiles/background_dark-green.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('tiles_roof', '/assets/tiles/roof.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('tiles_garbage', '/assets/tiles/garbage.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Aspect-correct low-cover barricades. MapRenderer rotates the horizontal
    // source at runtime for vertical runs, avoiding a stretched narrow prop.
    this.load.spritesheet('cover_reinforced', '/assets/tiles/cover-reinforced.png', {
      frameWidth: 16,
      frameHeight: 14,
    });
    this.load.spritesheet('cover_wooden', '/assets/tiles/cover-wooden.png', {
      frameWidth: 16,
      frameHeight: 14,
    });

    // Map decorations — free-placed cosmetic sprites referenced by
    // texture key from map JSON `decorations` (see MapRenderer).
    this.load.image('deco_car_overgrown_red', '/assets/decor/car-overgrown_red.png');
    this.load.image('deco_car_overgrown_blue', '/assets/decor/car-overgrown_blue.png');
    this.load.image('deco_car_scrap_gray', '/assets/decor/car-scrap_gray.png');
    this.load.image('deco_car_scrap_red', '/assets/decor/car-scrap_red.png');
    this.load.image('deco_container_gray', '/assets/decor/container-overgrown_gray.png');
    this.load.image('deco_container_red', '/assets/decor/container-overgrown_red.png');
    this.load.image('deco_barrel_red', '/assets/decor/barrel-red.png');
    this.load.image('deco_scavenger_cache', '/assets/pickups/ammo-crate_red.png');

    // Pickups — single static images, scaled at render time.
    // Ammo uses the asset-pack crate; grenade is generated procedurally
    // (see generateProceduralAssets) so it actually reads as a grenade.
    this.load.image('pickup_ammo', '/assets/pickups/ammo-crate_blue.png');
    this.load.image('pickup_shotgun', '/assets/pickups/shotgun.png');
    this.load.image('pickup_pistol', '/assets/pickups/pistol.png');
    this.load.image('pickup_bat', '/assets/pickups/bat.png');
    this.load.image('pickup_bandage', '/assets/pickups/bandage.png');

    // Bullet head — 2×1 px sprite, rotated to bullet angle and tweened
    // start→end. Replaces the procedural 'bullet-trail' streak.
    this.load.image('bullet', '/assets/player/bullet.png');
    // Shotgun pellet head — 3×1 px, one per pellet trail.
    this.load.image('shotgun-bullet', '/assets/player/shotgun-bullet.png');
    for (const splash of HIT_SPLASH_SHEETS) {
      this.load.spritesheet(splash.key, `/assets/effects/${splash.file}`, {
        frameWidth: splash.frameWidth,
        frameHeight: HIT_SPLASH_FRAME_HEIGHT,
      });
    }

    // HUD shell indicators for the special-weapon ammo panel.
    this.load.image('shotgun_shell', '/assets/ui/shotgun-bullet-indicator.png');
    this.load.image('shotgun_shell_empty', '/assets/ui/shotgun-bullet-indicator_empty.png');
    this.load.image('shotgun_shell_small', '/assets/ui/shotgun-bullet-indicator_small.png');
    this.load.image(
      'shotgun_shell_small_empty',
      '/assets/ui/shotgun-bullet-indicator_small_empty.png',
    );
    // Pistol row uses a single icon + numeric count (12 per-shell icons
    // would overflow the left column), so only the two base indicators.
    this.load.image('pistol_bullet', '/assets/ui/pistol-bullet-indicator.png');
    this.load.image('pistol_bullet_empty', '/assets/ui/pistol-bullet-indicator_empty.png');
    this.load.image('bat_icon', '/assets/ui/bat-icon.png');

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
    this.load.audio('sfx-hit-confirm', '/assets/audio/hit-confirm.wav');
    // Melee/axe SFX — procedurally generated WAVs (client/scripts/gen-sfx.mjs),
    // replacing the Session 7 rate/detune stand-ins derived from
    // grenade-throw/gun-shot.
    this.load.audio('sfx-punch-whoosh', '/assets/audio/punch-whoosh.wav');
    this.load.audio('sfx-punch-impact', '/assets/audio/punch-impact.wav');
    this.load.audio('sfx-axe-whoosh', '/assets/audio/axe-whoosh.wav');
    this.load.audio('sfx-axe-chop', '/assets/audio/axe-chop.wav');
  }

  private loadCharacterSheet(
    spritePrefix: string,
    direction: Direction4,
    state: 'idle' | 'run' | 'attack' | 'death',
    dim: FrameDim,
    assetFolder: string,
    assetBaseName: string,
  ): void {
    const key = `${spritePrefix}_${direction}_${state}`;
    const path = `/assets/${assetFolder}/${assetBaseName}_${direction}_${state}.png`;
    this.load.spritesheet(key, path, { frameWidth: dim.w, frameHeight: dim.h });
  }

  /** Load cosmetic-only death strips without inventing idle/run textures. */
  private loadDeathVariants(
    variants: readonly DeathVariantDef[] | undefined,
    assetFolder: string,
    loadedPrefixes: Set<string>,
  ): void {
    for (const variant of variants ?? []) {
      if (loadedPrefixes.has(variant.spritePrefix)) continue;
      loadedPrefixes.add(variant.spritePrefix);
      for (const dir of DEATH_DIRECTIONS) {
        this.loadCharacterSheet(
          variant.spritePrefix,
          dir,
          'death',
          variant.deathFrames[dir],
          assetFolder,
          variant.assetBaseName,
        );
      }
    }
  }

  /**
   * Define looping idle and run animations for every registered character.
   * Each anim key matches its texture key (Phaser keeps anims and textures
   * in separate registries so this isn't ambiguous).
   */
  private createCharacterAnimations(): void {
    this.anims.create({
      key: WIRE_GATE_OPEN_ANIMATION_KEY,
      frames: this.anims.generateFrameNumbers(WIRE_GATE_TEXTURE_KEY, {
        frames: [...WIRE_GATE_OPENING_FRAMES],
      }),
      frameRate: WIRE_GATE_OPEN_FPS,
      repeat: 0,
    });

    // Same dedupe rationale as loadRealAssets — sharing a spritePrefix
    // means sharing the animation keys.
    const animatedPrefixes = new Set<string>();
    // Same CharacterDef annotation rationale as loadRealAssets.
    const roster: CharacterDef[] = Object.values(CHARACTERS);
    for (const char of roster) {
      if (!animatedPrefixes.has(char.spritePrefix)) {
        animatedPrefixes.add(char.spritePrefix);
        this.createBodyAnimationSet(char.spritePrefix, char, char.deathFrameCount);
      }
      this.createDeathVariantAnimations(char.deathVariants, animatedPrefixes);

      // Alt-body anim set (Jack's no-axe body) — same frame counts and
      // pacing as the base set by CharacterDef.altBody contract, so it
      // reuses the exact same creation path under the alt prefix.
      const alt = char.altBody;
      if (alt && !animatedPrefixes.has(alt.spritePrefix)) {
        animatedPrefixes.add(alt.spritePrefix);
        this.createBodyAnimationSet(alt.spritePrefix, char, alt.deathFrameCount);
      }
      this.createDeathVariantAnimations(alt?.deathVariants, animatedPrefixes);

      const overlay = char.bodyOverlay;
      if (overlay && !animatedPrefixes.has(overlay.spritePrefix)) {
        animatedPrefixes.add(overlay.spritePrefix);
        this.createBodyAnimationSet(overlay.spritePrefix, char, char.deathFrameCount);
      }
    }

    // Thrown-axe projectile: spinning flight loop + landing one-shot.
    for (const dir of AXE_THROWN_DIRS) {
      const key = `axe_${dir}_thrown`;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 8 }),
        frameRate: AXE_THROWN_FPS,
        repeat: -1,
      });
    }
    for (const dir of DIRECTIONS) {
      const key = `axe_${dir}_landing`;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: 4 }),
        frameRate: AXE_LANDING_FPS,
        repeat: 0,
      });
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

      // Shotgun overlay: hold loops; shoot and racking are one-shots
      // (racking is chained after shoot by the player renderer).
      const sgHoldKey = `shotgun_${dir}_hold`;
      this.anims.create({
        key: sgHoldKey,
        frames: this.anims.generateFrameNumbers(sgHoldKey, {}),
        frameRate: GUN_HOLD_FPS,
        repeat: -1,
      });
      const sgShootKey = `shotgun_${dir}_shoot`;
      this.anims.create({
        key: sgShootKey,
        frames: this.anims.generateFrameNumbers(sgShootKey, {}),
        frameRate: GUN_SHOOT_FPS,
        repeat: 0,
      });
      const sgRackKey = `shotgun_${dir}_racking`;
      this.anims.create({
        key: sgRackKey,
        frames: this.anims.generateFrameNumbers(sgRackKey, {}),
        frameRate: SHOTGUN_RACK_FPS,
        repeat: 0,
      });

      // Pistol overlay: hold loop + shoot one-shot, mirroring the rifle
      // (no racking — semi-auto, the shoot anim reverts straight to hold).
      const pistolHoldKey = `pistol_${dir}_hold`;
      this.anims.create({
        key: pistolHoldKey,
        frames: this.anims.generateFrameNumbers(pistolHoldKey, {}),
        frameRate: GUN_HOLD_FPS,
        repeat: -1,
      });
      const pistolShootKey = `pistol_${dir}_shoot`;
      this.anims.create({
        key: pistolShootKey,
        frames: this.anims.generateFrameNumbers(pistolShootKey, {}),
        frameRate: GUN_SHOOT_FPS,
        repeat: 0,
      });
    }

    for (const splash of HIT_SPLASH_SHEETS) {
      this.anims.create({
        key: splash.key,
        frames: this.anims.generateFrameNumbers(splash.key, {}),
        frameRate: HIT_SPLASH_FPS,
        repeat: 0,
      });
    }
  }

  /**
   * Create the body-level anim set (idle/run loops + attack one-shot) for
   * one texture prefix, reading frame counts from the character def. Used
   * for both the base sheets and any altBody variant (which shares frame
   * counts with the base by contract).
   */
  private createBodyAnimationSet(
    prefix: string,
    char: CharacterDef,
    deathFrameCount: number,
  ): void {
    for (const dir of DIRECTIONS) {
      for (const state of ['idle', 'run'] as const) {
        const key = `${prefix}_${dir}_${state}`;
        // Explicit per-state frame counts from the registry — the pack
        // mixes 6-frame idles with 8-frame walks (Zombie_Big/Zombie_Axe),
        // so "all frames in the sheet" is only trustworthy if the
        // frameWidth divided the sheet exactly; the explicit range also
        // guards against sheets with trailing padding.
        const frameCount = state === 'run' ? char.runFrameCount : char.idleFrameCount;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(key, {
            start: 0,
            end: frameCount - 1,
          }),
          frameRate: state === 'run' ? RUN_FPS : IDLE_FPS,
          repeat: -1,
        });
      }

      // Melee attack one-shot. Frame rate normalizes to the fixed
      // ATTACK_SWING_SECONDS duration (see that constant) because the
      // roster's attack sheets ship 4/4/8/7 frames.
      const attackKey = `${prefix}_${dir}_attack`;
      this.anims.create({
        key: attackKey,
        frames: this.anims.generateFrameNumbers(attackKey, {
          start: 0,
          end: char.attackFrameCount - 1,
        }),
        frameRate: char.attackFrameCount / ATTACK_SWING_SECONDS,
        repeat: 0,
      });
    }

    this.createDeathAnimationSet(prefix, deathFrameCount);
  }

  private createDeathVariantAnimations(
    variants: readonly DeathVariantDef[] | undefined,
    animatedPrefixes: Set<string>,
  ): void {
    for (const variant of variants ?? []) {
      if (animatedPrefixes.has(variant.spritePrefix)) continue;
      animatedPrefixes.add(variant.spritePrefix);
      this.createDeathAnimationSet(variant.spritePrefix, variant.deathFrameCount);
    }
  }

  /** Normalize every body collapse to the same presentation duration. */
  private createDeathAnimationSet(prefix: string, deathFrameCount: number): void {
    for (const dir of DEATH_DIRECTIONS) {
      const deathKey = `${prefix}_${dir}_death`;
      this.anims.create({
        key: deathKey,
        frames: this.anims.generateFrameNumbers(deathKey, {
          start: 0,
          end: deathFrameCount - 1,
        }),
        frameRate: deathFrameCount / DEATH_ANIMATION_SECONDS,
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
    px(GROOVE, 5, 10);
    px(GROOVE, 8, 10);
    px(GROOVE, 10, 10);
    px(GROOVE, 5, 12);
    px(GROOVE, 8, 12);
    px(GROOVE, 10, 12);
    // Left-edge highlight pixels.
    px(HIGHLIGHT, 5, 9);
    px(HIGHLIGHT, 5, 11);
    // Neck (steel collar between body and lever).
    px(STEEL, 7, 7);
    px(STEEL, 8, 7);
    // Spoon/lever sweeping up to the right.
    px(STEEL, 7, 6);
    px(STEEL, 8, 6);
    px(STEEL, 9, 6);
    px(STEEL, 9, 5);
    px(STEEL, 10, 5);
    px(STEEL, 11, 5);
    px(STEEL, 11, 4);
    // Pin ring (gold loop above the lever).
    px(PIN, 11, 3);
    px(PIN, 12, 3);
    px(PIN, 10, 2);
    px(PIN, 13, 2);
    px(PIN, 11, 1);
    px(PIN, 12, 1);
    pickupGrenadeGfx.generateTexture('pickup_grenade', 16, 16);
    pickupGrenadeGfx.destroy();

    // Scrap Armor — compact riveted plate, authored procedurally so its
    // hard-blue silhouette remains readable at the pickup renderer's 3x scale.
    const armorGfx = gfx();
    armorGfx.fillStyle(0x2e222f, 1);
    armorGfx.fillRect(2, 3, 12, 10);
    armorGfx.fillStyle(Wasteland.PICKUP_ARMOR, 1);
    armorGfx.fillRect(3, 4, 10, 8);
    armorGfx.fillStyle(Wasteland.ARMOR_FILL, 1);
    armorGfx.fillRect(4, 5, 8, 2);
    armorGfx.fillStyle(0xc7dcd0, 1);
    armorGfx.fillRect(4, 9, 2, 2);
    armorGfx.fillRect(10, 9, 2, 2);
    armorGfx.generateTexture('pickup_armor', 16, 16);
    armorGfx.destroy();

    // Overcharge Cell — violet power canister with a hot lightning core.
    // The authored halo/label adds motion; this compact silhouette keeps the
    // resource distinct from cyan Scrap Armor at the renderer's 3x scale.
    const overchargeGfx = gfx();
    overchargeGfx.fillStyle(0x2e222f, 1);
    overchargeGfx.fillRect(4, 2, 8, 12);
    overchargeGfx.fillStyle(0x6c3aa8, 1);
    overchargeGfx.fillRect(5, 3, 6, 10);
    overchargeGfx.fillStyle(0xc77dff, 1);
    overchargeGfx.fillRect(6, 4, 4, 8);
    overchargeGfx.fillStyle(0xffd166, 1);
    overchargeGfx.fillRect(8, 4, 2, 3);
    overchargeGfx.fillRect(7, 7, 2, 2);
    overchargeGfx.fillRect(6, 9, 2, 3);
    overchargeGfx.fillStyle(0xe0aaff, 1);
    overchargeGfx.fillRect(3, 5, 1, 6);
    overchargeGfx.fillRect(12, 5, 1, 6);
    overchargeGfx.generateTexture('pickup_overcharge', 16, 16);
    overchargeGfx.destroy();

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
