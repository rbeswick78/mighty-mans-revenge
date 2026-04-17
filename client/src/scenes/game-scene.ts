import Phaser from 'phaser';

import type { MapData } from '@shared/types/map.js';
import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';
import { MatchPhase } from '@shared/types/game.js';
import { PLAYER, SERVER } from '@shared/config/game.js';
import { MapRenderer } from '../rendering/map-renderer.js';
import { ClientPlayerManager } from '../rendering/player-manager.js';
import { EffectsRenderer } from '../rendering/effects-renderer.js';
import { PickupRenderer } from '../rendering/pickup-renderer.js';
import { HUD } from '../ui/hud.js';
import { InputManager } from '../input/input-manager.js';
import { GameService, type MatchData } from '../services/game-service.js';

// Vite handles JSON imports
import wastelandOutpost from '../../../shared/maps/wasteland-outpost.json';

interface GameSceneData {
  nickname?: string;
  matchData?: MatchData;
}

export class GameScene extends Phaser.Scene {
  private mapRenderer: MapRenderer | null = null;
  private playerManager: ClientPlayerManager | null = null;
  private effectsRenderer: EffectsRenderer | null = null;
  private pickupRenderer: PickupRenderer | null = null;
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

  // Event handler references for cleanup
  private onMatchCountdown: ((countdown: number) => void) | null = null;
  private onMatchStart: (() => void) | null = null;
  private onMatchEnd: ((result: MatchResult) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onBulletTrail: ((trail: any) => void) | null = null;

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
    this.hud = new HUD(this);
    this.inputManager = new InputManager(this);

    // Wire up network events
    this.wireGameServiceEvents();

    // Status text overlay
    const opponentName = this.matchData?.opponents[0]?.nickname ?? 'opponent';
    const statusText = this.add.text(
      this.cameras.main.width / 2,
      16,
      `${this.nickname} vs ${opponentName}`,
      {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '14px',
        color: '#00ff66',
        stroke: '#000000',
        strokeThickness: 3,
      },
    ).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    statusText.setData('type', 'status');
  }

  update(_time: number, delta: number): void {
    if (!this.inputManager || !this.hud) return;

    const networkManager = this.gameService.getNetworkManager();
    const localState = networkManager.getLocalPlayerState();

    // Rate-limit input to the server tick rate. Client prediction uses
    // dt = 1/TICK_RATE, so inputs must be emitted at exactly that cadence
    // or the client will over-predict.
    this.inputAccumulatorMs += delta;
    while (
      this.inputAccumulatorMs >= SERVER.TICK_INTERVAL &&
      localState &&
      this.matchPhase !== MatchPhase.ENDED
    ) {
      this.inputAccumulatorMs -= SERVER.TICK_INTERVAL;
      this.currentTick++;

      // Capture the position as it was going into this tick for render
      // interpolation. The most recent predicted position after sendInput
      // becomes the new "current" target.
      this.prevLocalPos = this.currLocalPos ?? { x: localState.position.x, y: localState.position.y };

      const input = this.inputManager.update(localState.position, this.currentTick);
      this.gameService.sendInput(input);

      const updatedState = networkManager.getLocalPlayerState();
      if (updatedState) {
        this.currLocalPos = { x: updatedState.position.x, y: updatedState.position.y };
      }
    }

    // Re-read latest local state after any input ticks that ran this frame.
    const currentLocalState = networkManager.getLocalPlayerState();

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

        // Build serialized state array for the player manager
        const allPlayers = [{
          id: currentLocalState.id,
          position: renderPos,
          velocity: currentLocalState.velocity,
          aimAngle: currentLocalState.aimAngle,
          health: currentLocalState.health,
          ammo: currentLocalState.ammo,
          grenades: currentLocalState.grenades,
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
            grenades: interpState.grenades,
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
        this.hud.updateGrenades(currentLocalState.grenades);
        this.hud.updateStamina(currentLocalState.stamina, PLAYER.SPRINT_DURATION);
        this.hud.updateDeathState(currentLocalState.isDead, currentLocalState.respawnTimer);

        // Update scores
        let opponentScore = 0;
        for (const [, interpState] of interpolatedPlayers) {
          opponentScore = Math.max(opponentScore, interpState.score);
        }
        this.hud.updateScores(currentLocalState.score, opponentScore);
      }
    }
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

    this.gameService.on('matchCountdown', this.onMatchCountdown);
    this.gameService.on('matchStart', this.onMatchStart);
    this.gameService.on('matchEnd', this.onMatchEnd);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
    this.gameService.on('bulletTrail', this.onBulletTrail);
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
