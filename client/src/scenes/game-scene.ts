import Phaser from 'phaser';

import type { MapData } from '@shared/types/map.js';
import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';
import { MatchPhase } from '@shared/types/game.js';
import { PLAYER, SERVER } from '@shared/config/game.js';
import {
  predictBulletRay,
  predictGrenadePath,
} from '@shared/utils/trajectory-prediction.js';
import type { PlayerState } from '@shared/types/player.js';
import { MapRenderer } from '../rendering/map-renderer.js';
import { ClientPlayerManager } from '../rendering/player-manager.js';
import { EffectsRenderer } from '../rendering/effects-renderer.js';
import { PickupRenderer } from '../rendering/pickup-renderer.js';
import { GrenadeRenderer } from '../rendering/grenade-renderer.js';
import { HUD } from '../ui/hud.js';
import { InputManager } from '../input/input-manager.js';
import { GameService, type MatchData } from '../services/game-service.js';
import type { LocalCorrection, NetworkManager } from '../network/network-manager.js';

// Vite handles JSON imports
import wastelandOutpost from '../../../shared/maps/wasteland-outpost.json';

const LOCAL_CORRECTION_SMOOTH_MS = 120;
const LOCAL_CORRECTION_EPSILON = 0.01;

interface GameSceneData {
  nickname?: string;
  matchData?: MatchData;
}

export class GameScene extends Phaser.Scene {
  private mapRenderer: MapRenderer | null = null;
  private playerManager: ClientPlayerManager | null = null;
  private effectsRenderer: EffectsRenderer | null = null;
  private pickupRenderer: PickupRenderer | null = null;
  private grenadeRenderer: GrenadeRenderer | null = null;
  private hud: HUD | null = null;
  private inputManager: InputManager | null = null;
  private gameService!: GameService;
  private nickname = '';
  private matchData: MatchData | null = null;
  private currentTick = 0;
  private inputAccumulatorMs = 0;
  private lastCountdownValue = -1;
  private matchPhase: MatchPhase = MatchPhase.WAITING;

  /** Previous and current predicted positions for render-rate interpolation. */
  private prevLocalPos: Vec2 | null = null;
  private currLocalPos: Vec2 | null = null;
  private localCorrectionOffset: Vec2 = { x: 0, y: 0 };
  private localCorrectionOffsetStart: Vec2 = { x: 0, y: 0 };
  private localCorrectionElapsedMs = 0;
  private lastRenderedLocalPos: Vec2 | null = null;

  // Event handler references for cleanup
  private onMatchCountdown: ((countdown: number) => void) | null = null;
  private onMatchStart: (() => void) | null = null;
  private onMatchEnd: ((result: MatchResult) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onBulletTrail: ((trail: any) => void) | null = null;
  private onGrenadeExploded: ((pos: Vec2) => void) | null = null;
  private onLocalCorrection: ((correction: LocalCorrection) => void) | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameSceneData): void {
    this.nickname = data.nickname ?? 'Unknown';
    this.matchData = data.matchData ?? null;
  }

  create(): void {
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.gameService = GameService.getInstance();

    // Render the map
    this.mapRenderer = new MapRenderer(this);
    this.mapRenderer.renderMap(wastelandOutpost as MapData);

    // Wire the collision grid into the network manager so client-side
    // prediction and reconciliation use the same physics as the server.
    const grid = this.mapRenderer.getCollisionGrid();
    if (grid) {
      this.gameService.getNetworkManager().setCollisionGrid(grid);
    }

    // Create subsystems
    this.playerManager = new ClientPlayerManager(this);
    this.effectsRenderer = new EffectsRenderer(this);
    this.pickupRenderer = new PickupRenderer(this);
    this.grenadeRenderer = new GrenadeRenderer(this);
    this.hud = new HUD(this);
    this.inputManager = new InputManager(this);

    // Wire up network events
    this.wireGameServiceEvents();
  }

  update(_time: number, delta: number): void {
    if (!this.inputManager || !this.hud) return;

    const networkManager = this.gameService.getNetworkManager();
    let localState = networkManager.getLocalPlayerState();

    // Rate-limit input to the server tick rate. Client prediction uses
    // dt = 1/TICK_RATE, so inputs must be emitted at exactly that cadence
    // or the client will over-predict.
    if (this.matchPhase === MatchPhase.ACTIVE) {
      this.inputAccumulatorMs += delta;
    } else {
      this.inputAccumulatorMs = 0;
    }
    while (
      this.inputAccumulatorMs >= SERVER.TICK_INTERVAL &&
      localState &&
      this.matchPhase === MatchPhase.ACTIVE
    ) {
      this.inputAccumulatorMs -= SERVER.TICK_INTERVAL;
      this.currentTick++;

      localState = networkManager.getLocalPlayerState();
      if (!localState) break;

      // Capture the position as it was going into this tick for render
      // interpolation. The most recent predicted position after sendInput
      // becomes the new "current" target.
      this.prevLocalPos = this.currLocalPos ?? { x: localState.position.x, y: localState.position.y };

      const playerId = networkManager.getPlayerId();
      const hasActiveGrenade = playerId
        ? networkManager.hasActiveGrenadeFor(playerId)
        : false;
      const input = this.inputManager.update(
        localState.position,
        this.currentTick,
        hasActiveGrenade,
      );
      this.gameService.sendInput(input);

      const updatedState = networkManager.getLocalPlayerState();
      if (updatedState) {
        this.currLocalPos = { x: updatedState.position.x, y: updatedState.position.y };
      }
    }

    // Re-read latest local state after any input ticks that ran this frame.
    const currentLocalState = networkManager.getLocalPlayerState();
    this.decayLocalCorrectionOffset(delta);

    // Update local player rendering
    if (currentLocalState && this.playerManager) {
      const playerId = networkManager.getPlayerId();
      if (playerId) {
        // Interpolate local player position between the previous and
        // current predicted positions. Alpha = fraction of the way through
        // the current tick window, so rendering runs at 60fps even though
        // prediction ticks at 20Hz.
        let renderPos = currentLocalState.position;
        if (this.prevLocalPos && this.currLocalPos) {
          const alpha = Math.min(1, this.inputAccumulatorMs / SERVER.TICK_INTERVAL);
          renderPos = {
            x: this.prevLocalPos.x + (this.currLocalPos.x - this.prevLocalPos.x) * alpha,
            y: this.prevLocalPos.y + (this.currLocalPos.y - this.prevLocalPos.y) * alpha,
          };
        }
        renderPos = {
          x: renderPos.x + this.localCorrectionOffset.x,
          y: renderPos.y + this.localCorrectionOffset.y,
        };
        this.lastRenderedLocalPos = { x: renderPos.x, y: renderPos.y };

        // Build serialized state array for the player manager
        const allPlayers = [{
          id: currentLocalState.id,
          position: renderPos,
          velocity: currentLocalState.velocity,
          aimAngle: currentLocalState.aimAngle,
          health: currentLocalState.health,
          ammo: currentLocalState.ammo,
          isReloading: currentLocalState.isReloading,
          isSprinting: currentLocalState.isSprinting,
          stamina: currentLocalState.stamina,
          isDead: currentLocalState.isDead,
          respawnTimer: currentLocalState.respawnTimer,
          invulnerableTimer: currentLocalState.invulnerableTimer,
          lastProcessedInput: currentLocalState.lastProcessedInput,
          score: currentLocalState.score,
          deaths: currentLocalState.deaths,
          nickname: currentLocalState.nickname,
        }];

        // Add interpolated remote players
        const interpolatedPlayers = networkManager.getInterpolatedPlayers();
        for (const [remoteId, interpState] of interpolatedPlayers) {
          allPlayers.push({
            id: remoteId,
            position: interpState.position,
            velocity: interpState.velocity,
            aimAngle: interpState.aimAngle,
            health: interpState.health,
            ammo: interpState.ammo,
            isReloading: interpState.isReloading,
            isSprinting: interpState.isSprinting,
            stamina: interpState.stamina,
            isDead: interpState.isDead,
            respawnTimer: interpState.respawnTimer,
            invulnerableTimer: interpState.invulnerableTimer,
            lastProcessedInput: 0,
            score: interpState.score,
            deaths: interpState.deaths,
            nickname: interpState.nickname,
          });
        }

        this.playerManager.updatePlayers(allPlayers, playerId);

        // Update HUD
        this.hud.updateHealth(currentLocalState.health, PLAYER.MAX_HEALTH);
        this.hud.updateAmmo(currentLocalState.ammo, 30, currentLocalState.isReloading);
        this.hud.updateGrenadeStatus(networkManager.hasActiveGrenadeFor(playerId));
        this.hud.updateStamina(currentLocalState.stamina, PLAYER.SPRINT_DURATION);
        this.hud.updateDeathState(currentLocalState.isDead, currentLocalState.respawnTimer);

        // Update scores — use actual opponent nickname from the most
        // recent interpolated state; fall back to matchData for the
        // frame between match start and the first gameState.
        let opponentScore = 0;
        let opponentName = this.matchData?.opponents[0]?.nickname ?? 'OPPONENT';
        for (const [, interpState] of interpolatedPlayers) {
          if (interpState.score > opponentScore) opponentScore = interpState.score;
          if (interpState.nickname) opponentName = interpState.nickname;
        }
        this.hud.updateScores(
          currentLocalState.nickname || this.nickname,
          currentLocalState.score,
          opponentName,
          opponentScore,
        );

        this.hud.updateTimer(networkManager.getMatchTimer());
      }
    }

    // Render in-flight grenades from the server's authoritative list.
    if (this.grenadeRenderer) {
      this.grenadeRenderer.updateGrenades(networkManager.getActiveGrenades());
    }

    // Render pickups (active ones visible, collected ones hidden).
    if (this.pickupRenderer) {
      this.pickupRenderer.updatePickups(networkManager.getPickups());
    }

    // Aim line preview (white) — re-drawn each render frame so it tracks the
    // mouse smoothly, not just on server-tick boundaries.
    this.updateAimLine(currentLocalState);
  }

  private updateAimLine(localState: ReturnType<NetworkManager['getLocalPlayerState']>): void {
    if (!this.effectsRenderer || !this.inputManager || !localState || localState.isDead) {
      this.effectsRenderer?.clearAim();
      return;
    }

    const raw = this.inputManager.getLastRawInput();
    if (!raw) {
      this.effectsRenderer.clearAim();
      return;
    }

    const grid = this.mapRenderer?.getCollisionGrid();
    if (!grid) {
      this.effectsRenderer.clearAim();
      return;
    }

    const networkManager = this.gameService.getNetworkManager();

    if (raw.aimingGun) {
      // Build the players map (local + remotes) for ray hit-testing. Use
      // current/interpolated positions so the preview matches what the
      // server will see at firing time.
      const players = this.collectPlayersForAim(localState, networkManager);
      const aim = predictBulletRay(localState.id, localState.position, raw.aimAngle, players, grid);
      this.effectsRenderer.showBulletAim(
        localState.position.x,
        localState.position.y,
        aim.endPos.x,
        aim.endPos.y,
      );
    } else if (raw.aimingGrenade) {
      const path = predictGrenadePath(localState.position, raw.aimAngle, grid);
      this.effectsRenderer.showGrenadeAim(path);
    } else {
      this.effectsRenderer.clearAim();
    }
  }

  private collectPlayersForAim(
    localState: PlayerState,
    networkManager: NetworkManager,
  ): Map<string, PlayerState> {
    const players = new Map<string, PlayerState>();
    players.set(localState.id, localState);
    for (const [remoteId, interp] of networkManager.getInterpolatedPlayers()) {
      // Build a minimal PlayerState from the interpolated snapshot.
      players.set(remoteId, {
        id: remoteId,
        position: interp.position,
        velocity: interp.velocity,
        aimAngle: interp.aimAngle,
        health: interp.health,
        maxHealth: PLAYER.MAX_HEALTH,
        ammo: interp.ammo,
        isReloading: interp.isReloading,
        reloadTimer: 0,
        isSprinting: interp.isSprinting,
        stamina: interp.stamina,
        isDead: interp.isDead,
        respawnTimer: interp.respawnTimer,
        invulnerableTimer: interp.invulnerableTimer,
        lastProcessedInput: 0,
        score: interp.score,
        deaths: interp.deaths,
        nickname: interp.nickname,
      });
    }
    return players;
  }

  shutdown(): void {
    this.cleanup();
  }

  private wireGameServiceEvents(): void {
    this.onMatchCountdown = (countdown: number) => {
      const value = Math.ceil(countdown);
      if (value !== this.lastCountdownValue && this.hud) {
        this.lastCountdownValue = value;
        this.hud.showCountdown(value);
      }
      this.matchPhase = MatchPhase.COUNTDOWN;
    };

    this.onMatchStart = () => {
      this.matchPhase = MatchPhase.ACTIVE;
      if (this.hud) {
        this.hud.showCountdown(0); // Shows "FIGHT!"
      }
    };

    this.onMatchEnd = (result: MatchResult) => {
      this.matchPhase = MatchPhase.ENDED;
      this.time.delayedCall(1500, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cleanup();
          this.scene.start('ResultsScene', {
            result,
            nickname: this.nickname,
            matchData: this.matchData,
          });
        });
      });
    };

    this.onOpponentDisconnected = (_playerId: PlayerId) => {
      // Show disconnect message
      const msg = this.add.text(
        this.cameras.main.width / 2,
        this.cameras.main.height / 2,
        'OPPONENT DISCONNECTED',
        {
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '24px',
          color: '#ff4444',
          stroke: '#000000',
          strokeThickness: 4,
        },
      ).setOrigin(0.5).setScrollFactor(0).setDepth(2000);

      this.time.delayedCall(3000, () => {
        msg.destroy();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.cleanup();
          this.scene.start('LobbyScene');
        });
      });
    };

    this.onBulletTrail = (trail: { startPos: Vec2; endPos: Vec2 }) => {
      this.effectsRenderer?.showBulletTrail(
        trail.startPos.x,
        trail.startPos.y,
        trail.endPos.x,
        trail.endPos.y,
      );
      this.effectsRenderer?.showMuzzleFlash(trail.startPos.x, trail.startPos.y, 0);
    };

    this.onGrenadeExploded = (pos: Vec2) => {
      this.effectsRenderer?.showExplosion(pos.x, pos.y);
    };

    this.onLocalCorrection = (correction: LocalCorrection) => {
      this.prevLocalPos = {
        x: correction.correctedPosition.x,
        y: correction.correctedPosition.y,
      };
      this.currLocalPos = {
        x: correction.correctedPosition.x,
        y: correction.correctedPosition.y,
      };

      if (correction.shouldSnap) {
        this.localCorrectionOffset = { x: 0, y: 0 };
        this.localCorrectionOffsetStart = { x: 0, y: 0 };
        this.localCorrectionElapsedMs = 0;
        this.lastRenderedLocalPos = {
          x: correction.correctedPosition.x,
          y: correction.correctedPosition.y,
        };
        return;
      }

      const visualStart = this.lastRenderedLocalPos ?? correction.previousPosition;
      this.localCorrectionOffset = {
        x: visualStart.x - correction.correctedPosition.x,
        y: visualStart.y - correction.correctedPosition.y,
      };
      this.localCorrectionOffsetStart = { ...this.localCorrectionOffset };
      this.localCorrectionElapsedMs = 0;
    };

    this.gameService.on('matchCountdown', this.onMatchCountdown);
    this.gameService.on('matchStart', this.onMatchStart);
    this.gameService.on('matchEnd', this.onMatchEnd);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('bulletTrail', this.onBulletTrail);
    this.gameService.on('grenadeExploded', this.onGrenadeExploded);
    this.gameService.on('localCorrection', this.onLocalCorrection);
  }

  private cleanupEvents(): void {
    if (this.onMatchCountdown) {
      this.gameService.off('matchCountdown', this.onMatchCountdown);
      this.onMatchCountdown = null;
    }
    if (this.onMatchStart) {
      this.gameService.off('matchStart', this.onMatchStart);
      this.onMatchStart = null;
    }
    if (this.onMatchEnd) {
      this.gameService.off('matchEnd', this.onMatchEnd);
      this.onMatchEnd = null;
    }
    if (this.onOpponentDisconnected) {
      this.gameService.off('opponentDisconnected', this.onOpponentDisconnected);
      this.onOpponentDisconnected = null;
    }
    if (this.onBulletTrail) {
      this.gameService.off('bulletTrail', this.onBulletTrail);
      this.onBulletTrail = null;
    }
    if (this.onGrenadeExploded) {
      this.gameService.off('grenadeExploded', this.onGrenadeExploded);
      this.onGrenadeExploded = null;
    }
    if (this.onLocalCorrection) {
      this.gameService.off('localCorrection', this.onLocalCorrection);
      this.onLocalCorrection = null;
    }
  }

  private decayLocalCorrectionOffset(deltaMs: number): void {
    const distanceSq =
      this.localCorrectionOffset.x * this.localCorrectionOffset.x +
      this.localCorrectionOffset.y * this.localCorrectionOffset.y;

    if (distanceSq < LOCAL_CORRECTION_EPSILON * LOCAL_CORRECTION_EPSILON) {
      this.localCorrectionOffset = { x: 0, y: 0 };
      this.localCorrectionOffsetStart = { x: 0, y: 0 };
      this.localCorrectionElapsedMs = 0;
      return;
    }

    this.localCorrectionElapsedMs = Math.min(
      LOCAL_CORRECTION_SMOOTH_MS,
      this.localCorrectionElapsedMs + deltaMs,
    );
    const t = this.localCorrectionElapsedMs / LOCAL_CORRECTION_SMOOTH_MS;
    const keep = (1 - t) * (1 - t);
    this.localCorrectionOffset = {
      x: this.localCorrectionOffsetStart.x * keep,
      y: this.localCorrectionOffsetStart.y * keep,
    };
  }

  private cleanup(): void {
    this.cleanupEvents();

    if (this.mapRenderer) {
      this.mapRenderer.destroy();
      this.mapRenderer = null;
    }
    if (this.playerManager) {
      this.playerManager.destroy();
      this.playerManager = null;
    }
    if (this.effectsRenderer) {
      this.effectsRenderer.destroy();
      this.effectsRenderer = null;
    }
    if (this.pickupRenderer) {
      this.pickupRenderer.destroy();
      this.pickupRenderer = null;
    }
    if (this.grenadeRenderer) {
      this.grenadeRenderer.destroy();
      this.grenadeRenderer = null;
    }
    if (this.hud) {
      this.hud.destroy();
      this.hud = null;
    }
    if (this.inputManager) {
      this.inputManager.destroy();
      this.inputManager = null;
    }
  }
}
