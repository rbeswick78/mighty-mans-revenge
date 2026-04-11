import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { PLAYER } from '@shared/config/game.js';
import { PlayerRenderer } from './player-renderer.js';

export class ClientPlayerManager {
  private scene: Phaser.Scene;
  private renderers: Map<string, PlayerRenderer> = new Map();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  updatePlayers(
    players: SerializedPlayerState[],
    localPlayerId: string,
  ): PlayerRenderer | null {
    const currentIds = new Set<string>();
    let localRenderer: PlayerRenderer | null = null;

    for (const playerState of players) {
      currentIds.add(playerState.id);

      let renderer = this.renderers.get(playerState.id);
      if (!renderer) {
        const isLocal = playerState.id === localPlayerId;
        renderer = new PlayerRenderer(this.scene, isLocal);
        this.renderers.set(playerState.id, renderer);
      }

      // Convert SerializedPlayerState to a shape update expects
      renderer.setPosition(playerState.position.x, playerState.position.y);
      renderer.setAimAngle(playerState.aimAngle);
      renderer.updateHealthBar(playerState.health, PLAYER.MAX_HEALTH);

      if (playerState.id === localPlayerId) {
        localRenderer = renderer;
      }

      // Handle visibility based on death state
      renderer.getContainer().setVisible(!playerState.isDead);

      if (playerState.invulnerableTimer > 0) {
        renderer.setInvulnerable(true);
      } else {
        renderer.setInvulnerable(false);
      }

      renderer.setSprintEffect(playerState.isSprinting);
    }

    // Remove renderers for players that are no longer in the state
    for (const [id, renderer] of this.renderers) {
      if (!currentIds.has(id)) {
        renderer.destroy();
        this.renderers.delete(id);
      }
    }

    return localRenderer;
  }

  getRenderer(playerId: string): PlayerRenderer | undefined {
    return this.renderers.get(playerId);
  }

  destroy(): void {
    for (const renderer of this.renderers.values()) {
      renderer.destroy();
    }
    this.renderers.clear();
  }
}
