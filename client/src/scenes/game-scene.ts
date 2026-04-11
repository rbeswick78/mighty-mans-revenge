import Phaser from 'phaser';

import type { MapData } from '@shared/types/map.js';
import type { PlayerId } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';
import { MatchPhase } from '@shared/types/game.js';
import { PLAYER } from '@shared/config/game.js';
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
  private lastCountdownValue = -1;
  private matchPhase: MatchPhase = MatchPhase.WAITING;

  // Event handler references for cleanup
  private onMatchCountdown: ((countdown: number) => void) | null = null;
  private onMatchStart: (() => void) | null = null;
  private onMatchEnd: ((result: MatchResult) => void) | null = null;
  private onOpponentDisconnected: ((playerId: PlayerId) => void) | null = null;

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

  update(_time: number, _delta: number): void {
    if (!this.inputManager || !this.hud) return;

    const networkManager = this.gameService.getNetworkManager();
    const localState = networkManager.getLocalPlayerState();

    // Read input and send to server
    if (localState && this.matchPhase === MatchPhase.ACTIVE) {
      this.currentTick++;
      const input = this.inputManager.update(localState.position, this.currentTick);
      this.gameService.sendInput(input);
    }

    // Update local player rendering
    if (localState && this.playerManager) {
      const playerId = networkManager.getPlayerId();
      if (playerId) {
        // Build serialized state array for the player manager
        const allPlayers = [{
          id: localState.id,
          position: localState.position,
          velocity: localState.velocity,
          aimAngle: localState.aimAngle,
          health: localState.health,
          ammo: localState.ammo,
          grenades: localState.grenades,
          isReloading: localState.isReloading,
          isSprinting: localState.isSprinting,
          stamina: localState.stamina,
          isDead: localState.isDead,
          invulnerableTimer: localState.invulnerableTimer,
          lastProcessedInput: localState.lastProcessedInput,
          score: localState.score,
          deaths: localState.deaths,
          nickname: localState.nickname,
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
            invulnerableTimer: interpState.invulnerableTimer,
            lastProcessedInput: 0,
            score: interpState.score,
            deaths: interpState.deaths,
            nickname: interpState.nickname,
          });
        }

        this.playerManager.updatePlayers(allPlayers, playerId);

        // Update HUD
        this.hud.updateHealth(localState.health, PLAYER.MAX_HEALTH);
        this.hud.updateAmmo(localState.ammo, 30, localState.isReloading);
        this.hud.updateGrenades(localState.grenades);
        this.hud.updateStamina(localState.stamina, PLAYER.SPRINT_DURATION);

        // Update scores
        let opponentScore = 0;
        for (const [, interpState] of interpolatedPlayers) {
          opponentScore = Math.max(opponentScore, interpState.score);
        }
        this.hud.updateScores(localState.score, opponentScore);
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

    this.gameService.on('matchCountdown', this.onMatchCountdown);
    this.gameService.on('matchStart', this.onMatchStart);
    this.gameService.on('matchEnd', this.onMatchEnd);
    this.gameService.on('opponentDisconnected', this.onOpponentDisconnected);
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
