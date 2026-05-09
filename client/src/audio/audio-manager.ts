/**
 * AudioManager — Singleton managing all game audio at the game level.
 *
 * Intentionally bound to Phaser.Game (process lifetime), NOT Phaser.Scene.
 * Sounds and fades survive scene transitions because both the SoundManager
 * (game.sound) and our fade driver (requestAnimationFrame) live above the
 * scene graph. Scenes do not need to "register" with this manager.
 *
 * ===== INTEGRATION POINTS =====
 *
 * Combat sounds (trigger in GameScene / EffectsRenderer):
 *   - gunshot          → when local player fires (InputManager shoot action)
 *   - grenadeThrow     → when local player throws grenade
 *   - explosion        → when grenade/explosion effect spawns (EffectsRenderer)
 *   - bulletImpact     → when bullet hits wall/cover (EffectsRenderer)
 *   - playerHit        → when any player takes damage (server state update)
 *   - playerDeath      → when any player dies (server state update)
 *   - reload           → when player starts reloading
 *
 * Movement sounds (trigger in GameScene update loop):
 *   - footstepWalk     → when local player velocity > 0 and not sprinting
 *   - footstepRun      → when local player is sprinting
 *   - pickupCollect    → when player collects a pickup (server state update)
 *
 * UI sounds (trigger in LobbyScene / GameScene / ResultsScene):
 *   - menuSelect       → lobby button clicks, menu interactions
 *   - countdownBeep    → each countdown tick before match start
 *   - matchStartHorn   → when countdown hits 0 / "FIGHT!" displays
 *   - victoryFanfare   → results screen for winner
 *   - defeatSound      → results screen for loser
 *
 * Music (trigger in scene transitions):
 *   - playMusic()      → lobby background music, in-game ambient track
 *   - stopMusic()      → on scene transitions or match end
 *
 * ==================================
 */

import Phaser from 'phaser';

/** Sound definition with asset key, default volume, and category. */
interface SoundConfig {
  readonly key: string;
  readonly volume: number;
  readonly category: 'sfx' | 'music';
}

/**
 * Data-driven sound map. To add a new sound:
 *   1. Add an entry here with a unique name, asset key, default volume, and category.
 *   2. Load the actual audio asset in BootScene (or let AudioManager gracefully skip if missing).
 *   No other code changes needed.
 */
const SOUND_MAP = {
  // Combat
  gunshot: { key: 'sfx-gunshot', volume: 0.7, category: 'sfx' },
  grenadeThrow: { key: 'sfx-grenade-throw', volume: 0.6, category: 'sfx' },
  explosion: { key: 'sfx-explosion', volume: 0.8, category: 'sfx' },
  bulletImpact: { key: 'sfx-bullet-impact', volume: 0.5, category: 'sfx' },
  playerHit: { key: 'sfx-player-hit', volume: 0.6, category: 'sfx' },
  playerDeath: { key: 'sfx-player-death', volume: 0.7, category: 'sfx' },

  // Movement
  footstepWalk: { key: 'sfx-footstep-walk', volume: 0.3, category: 'sfx' },
  footstepRun: { key: 'sfx-footstep-run', volume: 0.4, category: 'sfx' },
  pickupCollect: { key: 'sfx-pickup', volume: 0.5, category: 'sfx' },

  // UI
  menuSelect: { key: 'sfx-menu-select', volume: 0.5, category: 'sfx' },
  countdownBeep: { key: 'sfx-countdown', volume: 0.6, category: 'sfx' },
  matchStartHorn: { key: 'sfx-match-start', volume: 0.8, category: 'sfx' },
  victoryFanfare: { key: 'sfx-victory', volume: 0.7, category: 'sfx' },
  defeatSound: { key: 'sfx-defeat', volume: 0.6, category: 'sfx' },
  reload: { key: 'sfx-reload', volume: 0.5, category: 'sfx' },
  kill: { key: 'sfx-kill', volume: 0.7, category: 'sfx' },
  death: { key: 'sfx-death', volume: 0.7, category: 'sfx' },
  outOfAmmo: { key: 'sfx-out-of-ammo', volume: 0.7, category: 'sfx' },
} as const satisfies Record<string, SoundConfig>;

/** Valid sound names derived from the sound map. */
type SoundName = keyof typeof SOUND_MAP;

/** Options when playing a sound. */
interface PlayOptions {
  volume?: number;
  loop?: boolean;
}

/** Cancellable handle for an in-flight volume fade. */
interface FadeHandle {
  /** Stop the rAF chain and run the completion callback synchronously. */
  cancel: () => void;
}

/** localStorage keys for persisted volume settings. */
const STORAGE_KEY_MASTER_VOLUME = 'mmr_audio_master';
const STORAGE_KEY_SFX_VOLUME = 'mmr_audio_sfx';
const STORAGE_KEY_MUSIC_VOLUME = 'mmr_audio_music';
const STORAGE_KEY_MUTED = 'mmr_audio_muted';

/** Maximum distance (in world pixels) at which positional audio is audible. */
const MAX_AUDIO_DISTANCE = 800;

export class AudioManager {
  private static instance: AudioManager | null = null;

  private game: Phaser.Game;
  private masterVolume: number;
  private sfxVolume: number;
  private musicVolume: number;
  private isMuted: boolean;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private audioUnlocked = false;
  /** Active volume-fade handle, if any. Cancelling runs the completion callback. */
  private activeFade: FadeHandle | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;

    // Restore persisted volume settings, defaulting to full volume
    this.masterVolume = this.loadNumber(STORAGE_KEY_MASTER_VOLUME, 1);
    this.sfxVolume = this.loadNumber(STORAGE_KEY_SFX_VOLUME, 1);
    this.musicVolume = this.loadNumber(STORAGE_KEY_MUSIC_VOLUME, 0.5);
    this.isMuted = localStorage.getItem(STORAGE_KEY_MUTED) === 'true';

    // Check if audio context is already running (user may have interacted before init)
    this.audioUnlocked = !this.game.sound.locked;

    // Listen for Phaser's unlock event (fires after first user interaction)
    if (this.game.sound.locked) {
      this.game.sound.once('unlocked', () => {
        this.audioUnlocked = true;
      });
    }

    AudioManager.instance = this;
  }

  /** Get the singleton instance. Returns null if not yet created. */
  static getInstance(): AudioManager | null {
    return AudioManager.instance;
  }

  // ───────────────────── Playback ─────────────────────

  /** Play a named sound effect. Gracefully skips if the asset is not loaded. */
  play(soundName: SoundName, options?: PlayOptions): void {
    if (this.isMuted) return;

    const config = SOUND_MAP[soundName];
    if (!this.isSoundLoaded(config.key)) {
      if (import.meta.env.DEV) {
        console.debug(`[AudioManager] Sound not loaded, skipping: ${config.key}`);
      }
      return;
    }

    const effectiveVolume = this.computeVolume(config.volume, config.category, options?.volume);

    this.game.sound.play(config.key, {
      volume: effectiveVolume,
      loop: options?.loop ?? false,
    });
  }

  /**
   * Play a sound with distance-based volume attenuation.
   * Sounds beyond MAX_AUDIO_DISTANCE are silent.
   */
  playAtPosition(
    soundName: SoundName,
    worldX: number,
    worldY: number,
    listenerX: number,
    listenerY: number,
    options?: PlayOptions,
  ): void {
    const dx = worldX - listenerX;
    const dy = worldY - listenerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance >= MAX_AUDIO_DISTANCE) return;

    // Linear falloff: full volume at distance 0, silence at MAX_AUDIO_DISTANCE
    const distanceFactor = 1 - distance / MAX_AUDIO_DISTANCE;

    this.play(soundName, {
      ...options,
      volume: (options?.volume ?? 1) * distanceFactor,
    });
  }

  /** Play background music. Stops any currently playing music first. */
  playMusic(key: string, fadeIn = 0): void {
    // Tear down anything still in flight from a prior call. cancelFade runs the
    // pending stop-and-destroy synchronously, so we can't end up with two
    // tracks layered on top of each other if playMusic arrives mid fade-out.
    this.cancelFade();
    this.destroyCurrentMusic();

    if (!this.isSoundLoaded(key)) {
      if (import.meta.env.DEV) {
        console.debug(`[AudioManager] Music not loaded, skipping: ${key}`);
      }
      return;
    }

    const targetVolume = this.computeMusicVolume();
    const startVolume = fadeIn > 0 ? 0 : targetVolume;

    const music = this.game.sound.add(key, {
      volume: startVolume,
      loop: true,
    });
    this.currentMusic = music;
    music.play();

    if (fadeIn > 0 && music instanceof Phaser.Sound.WebAudioSound) {
      this.startFade(music, targetVolume, fadeIn, () => {});
    }
  }

  /** Stop the currently playing music with an optional fade out. */
  stopMusic(fadeOut = 0): void {
    if (!this.currentMusic) return;

    // Detach from currentMusic FIRST so subsequent playMusic/stopMusic calls
    // route to the new state without racing this destroy.
    const music = this.currentMusic;
    this.currentMusic = null;
    this.cancelFade();

    if (fadeOut > 0 && music instanceof Phaser.Sound.WebAudioSound) {
      this.startFade(music, 0, fadeOut, () => {
        music.stop();
        music.destroy();
      });
    } else {
      music.stop();
      music.destroy();
    }
  }

  // ───────────────────── Volume Controls ─────────────────────

  setMasterVolume(volume: number): void {
    this.masterVolume = this.clampVolume(volume);
    this.persistNumber(STORAGE_KEY_MASTER_VOLUME, this.masterVolume);
    this.updateMusicVolume();
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = this.clampVolume(volume);
    this.persistNumber(STORAGE_KEY_SFX_VOLUME, this.sfxVolume);
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = this.clampVolume(volume);
    this.persistNumber(STORAGE_KEY_MUSIC_VOLUME, this.musicVolume);
    this.updateMusicVolume();
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  // ───────────────────── Mute ─────────────────────

  mute(): void {
    this.isMuted = true;
    localStorage.setItem(STORAGE_KEY_MUTED, 'true');
    this.game.sound.mute = true;
  }

  unmute(): void {
    this.isMuted = false;
    localStorage.setItem(STORAGE_KEY_MUTED, 'false');
    this.game.sound.mute = false;
  }

  toggleMute(): void {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
  }

  getIsMuted(): boolean {
    return this.isMuted;
  }

  // ───────────────────── Autoplay Policy ─────────────────────

  /**
   * Call on the first user interaction (click/tap/keydown) to unlock the
   * browser audio context. Phaser handles this automatically in most cases,
   * but this provides an explicit hook if needed.
   */
  handleUserInteraction(): void {
    if (this.audioUnlocked) return;

    // Phaser's WebAudioSoundManager will resume the AudioContext when it
    // detects user interaction. We can force it by accessing the context.
    const soundManager = this.game.sound;
    if ('context' in soundManager) {
      const ctx = (soundManager as Phaser.Sound.WebAudioSoundManager).context;
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.audioUnlocked = true;
        }).catch(() => {
          // Silently ignore — will retry on next interaction
        });
      } else {
        this.audioUnlocked = true;
      }
    }
  }

  isAudioUnlocked(): boolean {
    return this.audioUnlocked;
  }

  // ───────────────────── Destroy ─────────────────────

  destroy(): void {
    this.stopMusic();
    if (AudioManager.instance === this) {
      AudioManager.instance = null;
    }
  }

  // ───────────────────── Private Helpers ─────────────────────

  /**
   * rAF-driven volume ramp. Runs above the scene graph, so a scene shutdown
   * mid-fade can't strand the sound. Cancelling runs onComplete synchronously,
   * so callers can rely on cleanup happening exactly once.
   */
  private startFade(
    sound: Phaser.Sound.WebAudioSound,
    toVolume: number,
    durationMs: number,
    onComplete: () => void,
  ): void {
    this.cancelFade();

    const fromVolume = sound.volume;
    const startTime = performance.now();
    let rafId = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(rafId);
      if (this.activeFade?.cancel === finish) {
        this.activeFade = null;
      }
      onComplete();
    };

    const step = () => {
      if (done) return;
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      sound.setVolume(fromVolume + (toVolume - fromVolume) * t);
      if (t >= 1) {
        finish();
      } else {
        rafId = requestAnimationFrame(step);
      }
    };

    this.activeFade = { cancel: finish };
    rafId = requestAnimationFrame(step);
  }

  private cancelFade(): void {
    const handle = this.activeFade;
    this.activeFade = null;
    handle?.cancel();
  }

  private destroyCurrentMusic(): void {
    if (!this.currentMusic) return;
    this.currentMusic.stop();
    this.currentMusic.destroy();
    this.currentMusic = null;
  }

  private isSoundLoaded(key: string): boolean {
    return this.game.cache.audio.exists(key);
  }

  private computeVolume(
    baseVolume: number,
    category: 'sfx' | 'music',
    overrideVolume?: number,
  ): number {
    const categoryVol = category === 'sfx' ? this.sfxVolume : this.musicVolume;
    const base = overrideVolume !== undefined ? baseVolume * overrideVolume : baseVolume;
    return this.clampVolume(base * categoryVol * this.masterVolume);
  }

  private computeMusicVolume(): number {
    return this.isMuted ? 0 : this.clampVolume(this.masterVolume * this.musicVolume);
  }

  private clampVolume(v: number): number {
    return Math.max(0, Math.min(1, v));
  }

  private updateMusicVolume(): void {
    if (
      this.currentMusic &&
      this.currentMusic instanceof Phaser.Sound.WebAudioSound
    ) {
      this.currentMusic.setVolume(this.computeMusicVolume());
    }
  }

  private loadNumber(key: string, fallback: number): number {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const parsed = parseFloat(stored);
    return Number.isFinite(parsed) ? this.clampVolume(parsed) : fallback;
  }

  private persistNumber(key: string, value: number): void {
    localStorage.setItem(key, value.toString());
  }
}
