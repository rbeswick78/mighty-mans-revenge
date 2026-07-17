import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { PlayerRenderer } from './player-renderer.js';

export class ClientPlayerManager {
  private scene: Phaser.Scene;
  private readonly modernArtEnabled: boolean;
  private renderers: Map<string, PlayerRenderer> = new Map();
  private previousPresentation = new Map<
    string,
    {
      readonly health: number;
      readonly abilityActive: boolean;
      readonly abilityCoolingDown: boolean;
    }
  >();
  /** big_heads mutator flag — applied to every renderer each update. */
  private bigHeadsActive = false;

  constructor(scene: Phaser.Scene, modernArtEnabled = false) {
    this.scene = scene;
    this.modernArtEnabled = modernArtEnabled;
  }

  /** Toggle the big_heads render scale for all players (current and future). */
  setBigHeads(active: boolean): void {
    this.bigHeadsActive = active;
  }

  updatePlayers(
    players: SerializedPlayerState[],
    localPlayerId: string,
    bountyTargetId: string | null = null,
    crownHolder: { id: string; wins: number } | null = null,
    teammateIds: ReadonlySet<string> = new Set(),
  ): PlayerRenderer | null {
    const currentIds = new Set<string>();
    let localRenderer: PlayerRenderer | null = null;

    for (const playerState of players) {
      currentIds.add(playerState.id);

      let renderer = this.renderers.get(playerState.id);
      // A PlayerRenderer bakes its character in at construction (sheets,
      // tint, overlays). If the authoritative characterId ever disagrees
      // — e.g. the first frame rendered off a placeholder before the
      // first snapshot arrived — rebuild instead of showing the wrong
      // body for the rest of the match.
      if (renderer && renderer.getCharacterId() !== playerState.characterId) {
        renderer.destroy();
        this.renderers.delete(playerState.id);
        this.previousPresentation.delete(playerState.id);
        renderer = undefined;
      }
      if (!renderer) {
        // SerializedPlayerState.characterId is non-null inside an active
        // match (server only ships gameState messages from COUNTDOWN
        // onward, by which point both players are locked).
        renderer = new PlayerRenderer(this.scene, playerState.characterId, this.modernArtEnabled);
        this.renderers.set(playerState.id, renderer);
      }

      const previous = this.previousPresentation.get(playerState.id);
      const abilityActive = playerState.abilityActiveSeconds > 0;
      const abilityCoolingDown = playerState.abilityCooldownSeconds > 0;
      if (
        previous &&
        !playerState.isDead &&
        ((abilityActive && !previous.abilityActive) ||
          (['frost_wizard', 'jack', 'rook'].includes(playerState.characterId) &&
            abilityCoolingDown &&
            !previous.abilityCoolingDown))
      ) {
        renderer.playAbilityAnimation();
      }
      if (previous && !playerState.isDead && playerState.health < previous.health) {
        renderer.playDamageAnimation();
      }
      this.previousPresentation.set(playerState.id, {
        health: playerState.health,
        abilityActive,
        abilityCoolingDown,
      });

      // Convert SerializedPlayerState to a shape update expects
      renderer.setBigHeads(this.bigHeadsActive);
      renderer.setPosition(playerState.position.x, playerState.position.y);
      renderer.setAimAngle(playerState.aimAngle);
      // Held-weapon overlay follows the server-authoritative weapon slot
      // (guns swap sheets; fists hide them; bat uses universal held art).
      renderer.setWeapon(playerState.weaponId);
      // Jack's no-axe body renders exactly while his ability cooldown
      // runs (axe in flight / regrowing). No-op for every character
      // without a CharacterDef.altBody.
      renderer.setAxeless(playerState.abilityCooldownSeconds > 0);
      // Per-character HP pool (Bubba 150, Frost Wizard 85, ...) — the
      // serialized state carries the authoritative max.
      renderer.updateHealthBar(playerState.health, playerState.maxHealth, playerState.armor);

      if (playerState.id === localPlayerId) {
        localRenderer = renderer;
      }

      // Death presentation is edge-driven inside the renderer. Repeated
      // dead snapshots must hold the corpse's final frame, not hide or
      // restart the one-shot animation.
      renderer.updateLifeState(playerState.isDead, playerState.deaths);
      renderer.setBountyMarked(playerState.id === bountyTargetId);
      renderer.setCrownMarked(playerState.id === crownHolder?.id ? crownHolder.wins : null);
      renderer.setTeammateMarked(
        playerState.id !== localPlayerId && teammateIds.has(playerState.id),
      );

      if (playerState.invulnerableTimer > 0) {
        renderer.setInvulnerable(true);
      } else {
        renderer.setInvulnerable(false);
      }

      // Temporary boosts use the existing dust streak so Blood Rush and
      // Second Wind stay visible without any client-only state.
      renderer.setSprintEffect(playerState.isSprinting || playerState.secondWindTimer > 0);
    }

    // Remove renderers for players that are no longer in the state
    for (const [id, renderer] of this.renderers) {
      if (!currentIds.has(id)) {
        renderer.destroy();
        this.renderers.delete(id);
        this.previousPresentation.delete(id);
      }
    }

    return localRenderer;
  }

  getRenderer(playerId: string): PlayerRenderer | undefined {
    return this.renderers.get(playerId);
  }

  getReforgedArtStates(): readonly Readonly<{
    playerId: string;
    art: ReturnType<PlayerRenderer['getReforgedArtState']>;
  }>[] {
    return [...this.renderers.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([playerId, renderer]) =>
        Object.freeze({ playerId, art: renderer.getReforgedArtState() }),
      );
  }

  destroy(): void {
    for (const renderer of this.renderers.values()) {
      renderer.destroy();
    }
    this.renderers.clear();
    this.previousPresentation.clear();
  }
}
