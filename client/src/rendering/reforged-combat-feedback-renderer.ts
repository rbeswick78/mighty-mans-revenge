import Phaser from 'phaser';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { declareWorldSpace, placeInWorld, worldPoint } from './gameplay-coordinate-space.js';
import type { WorldRenderQualityBudget } from './dynamic-world-rendering.js';
import {
  REFORGED_ARMOR_FRAMES,
  REFORGED_COMBAT_FEEDBACK_EXPLOSION_RADIUS_PX,
  REFORGED_COMBAT_FEEDBACK_FIGHTERS,
  REFORGED_COMBAT_FEEDBACK_POOL_CAPACITY,
  REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY,
  REFORGED_COMBAT_FEEDBACK_TIMING_MS,
  REFORGED_EXPLOSION_FRAMES,
  REFORGED_HEALING_FRAMES,
  REFORGED_ZONE_FRAMES,
  reforgedAbilityFrames,
  reforgedAbilityReleaseRotation,
  reforgedCombatFeedbackDirection,
  reforgedCombatFeedbackQualityTreatment,
  reforgedEliminationFrames,
  reforgedFeedbackAnimationFrame,
  reforgedImpactFrames,
  reforgedMuzzleFrames,
  reforgedRarityFrame,
  selectReforgedFeedbackPoolSlot,
  shouldReleaseReforgedAbilityFeedback,
  shouldPresentReforgedCombatFeedback,
  type ReforgedCombatFeedbackFamily,
  type ReforgedCombatFeedbackFighter,
  type ReforgedCombatFeedbackRarity,
} from './reforged-combat-feedback-contract.js';
import { reforgedCombatFeedbackAtlasAvailable } from './reforged-combat-feedback-runtime.js';

const FEEDBACK_DEPTH = 32;

interface FeedbackSlot {
  readonly sprite: Phaser.GameObjects.Image;
  frames: readonly string[];
  family: ReforgedCombatFeedbackFamily;
  elapsedMs: number;
  durationMs: number;
  sequence: number;
  active: boolean;
}

interface AbilityEdgeState {
  readonly active: boolean;
  readonly cooling: boolean;
}

export class ReforgedCombatFeedbackRenderer {
  private readonly slots: FeedbackSlot[] = [];
  private readonly previousAbilityStates = new Map<string, AbilityEdgeState>();
  private sequence = 0;

  static create(
    scene: Phaser.Scene,
    modernArtEnabled: boolean,
    getBudget: () => WorldRenderQualityBudget,
  ): ReforgedCombatFeedbackRenderer | null {
    const atlasAvailable = reforgedCombatFeedbackAtlasAvailable(scene);
    if (
      !shouldPresentReforgedCombatFeedback(
        'muzzle',
        'live-established-event',
        modernArtEnabled,
        atlasAvailable,
      )
    )
      return null;
    return new ReforgedCombatFeedbackRenderer(scene, getBudget);
  }

  private constructor(
    scene: Phaser.Scene,
    private readonly getBudget: () => WorldRenderQualityBudget,
  ) {
    for (let index = 0; index < REFORGED_COMBAT_FEEDBACK_POOL_CAPACITY; index += 1) {
      const sprite = declareWorldSpace(
        scene.add.image(
          0,
          0,
          REFORGED_COMBAT_FEEDBACK_TEXTURE_KEY,
          reforgedMuzzleFrames('side')[0],
        ),
      );
      sprite.setDepth(FEEDBACK_DEPTH).setVisible(false).setActive(false);
      this.slots.push({
        sprite,
        frames: reforgedMuzzleFrames('side'),
        family: 'muzzle',
        elapsedMs: 0,
        durationMs: REFORGED_COMBAT_FEEDBACK_TIMING_MS.muzzle,
        sequence: 0,
        active: false,
      });
    }
  }

  showMuzzle(x: number, y: number, angle: number): void {
    this.trigger(
      'muzzle',
      reforgedMuzzleFrames(reforgedCombatFeedbackDirection(angle)),
      x,
      y,
      REFORGED_COMBAT_FEEDBACK_TIMING_MS.muzzle,
    );
  }

  showImpact(kind: 'scenery' | 'player', x: number, y: number, angle: number): void {
    const family = kind === 'player' ? 'player-impact' : 'scenery-impact';
    this.trigger(
      family,
      reforgedImpactFrames(kind, reforgedCombatFeedbackDirection(angle)),
      x,
      y,
      REFORGED_COMBAT_FEEDBACK_TIMING_MS[family],
    );
  }

  showExplosion(x: number, y: number, radius: number): void {
    this.trigger(
      'explosion',
      REFORGED_EXPLOSION_FRAMES,
      x,
      y,
      REFORGED_COMBAT_FEEDBACK_TIMING_MS.explosion,
      radius / REFORGED_COMBAT_FEEDBACK_EXPLOSION_RADIUS_PX,
    );
  }

  showHealing(x: number, y: number): void {
    this.trigger(
      'healing',
      REFORGED_HEALING_FRAMES,
      x,
      y,
      REFORGED_COMBAT_FEEDBACK_TIMING_MS.healing,
    );
  }

  showArmor(x: number, y: number): void {
    this.trigger('armor', REFORGED_ARMOR_FRAMES, x, y, REFORGED_COMBAT_FEEDBACK_TIMING_MS.armor);
  }

  showElimination(x: number, y: number, angle: number): void {
    this.trigger(
      'elimination',
      reforgedEliminationFrames(reforgedCombatFeedbackDirection(angle)),
      x,
      y,
      REFORGED_COMBAT_FEEDBACK_TIMING_MS.elimination,
    );
  }

  showRarityPreview(x: number, y: number, rarity: ReforgedCombatFeedbackRarity): void {
    this.trigger(
      'rarity',
      [reforgedRarityFrame(rarity)],
      x,
      y,
      REFORGED_COMBAT_FEEDBACK_TIMING_MS.rarity,
    );
  }

  showZonePreview(x: number, y: number): void {
    this.trigger('zone', REFORGED_ZONE_FRAMES, x, y, REFORGED_COMBAT_FEEDBACK_TIMING_MS.zone);
  }

  update(players: readonly SerializedPlayerState[], deltaMs: number): void {
    this.updateSlots(deltaMs);
    const seen = new Set<string>();
    for (const player of players) {
      seen.add(player.id);
      const current = {
        active: player.abilityActiveSeconds > 0,
        cooling: player.abilityCooldownSeconds > 0,
      };
      const previous = this.previousAbilityStates.get(player.id);
      if (previous && !player.isDead) {
        const fighter = player.characterId as ReforgedCombatFeedbackFighter;
        const released = shouldReleaseReforgedAbilityFeedback(
          fighter,
          previous,
          current,
          player.isDead,
        );
        if (released && REFORGED_COMBAT_FEEDBACK_FIGHTERS.includes(fighter)) {
          this.trigger(
            'ability',
            reforgedAbilityFrames(fighter),
            player.position.x,
            player.position.y,
            REFORGED_COMBAT_FEEDBACK_TIMING_MS.ability,
            1,
            reforgedAbilityReleaseRotation(fighter, player.aimAngle),
          );
        }
      }
      this.previousAbilityStates.set(player.id, current);
    }
    for (const playerId of this.previousAbilityStates.keys()) {
      if (!seen.has(playerId)) this.previousAbilityStates.delete(playerId);
    }
  }

  getRenderState(): Readonly<{
    capacity: number;
    poolLimit: number;
    activeFamilies: readonly ReforgedCombatFeedbackFamily[];
    sequence: number;
  }> {
    return Object.freeze({
      capacity: this.slots.length,
      poolLimit: reforgedCombatFeedbackQualityTreatment(this.getBudget().tier).poolLimit,
      activeFamilies: Object.freeze(
        this.slots
          .filter((slot) => slot.active)
          .sort((a, b) => a.sequence - b.sequence)
          .map((slot) => slot.family),
      ),
      sequence: this.sequence,
    });
  }

  destroy(): void {
    for (const slot of this.slots) slot.sprite.destroy();
    this.slots.length = 0;
    this.previousAbilityStates.clear();
  }

  private trigger(
    family: ReforgedCombatFeedbackFamily,
    frames: readonly string[],
    x: number,
    y: number,
    durationMs: number,
    scale = 1,
    rotation = 0,
  ): void {
    const treatment = reforgedCombatFeedbackQualityTreatment(this.getBudget().tier);
    const index = selectReforgedFeedbackPoolSlot(this.slots, treatment.poolLimit);
    if (index < 0) return;
    const slot = this.slots[index];
    slot.frames = frames;
    slot.family = family;
    slot.elapsedMs = 0;
    slot.durationMs = durationMs;
    slot.sequence = ++this.sequence;
    slot.active = true;
    placeInWorld(slot.sprite, worldPoint(x, y));
    slot.sprite
      .setFrame(frames[0])
      .setScale(scale)
      .setAlpha(1)
      .setRotation(rotation)
      .setVisible(true)
      .setActive(true);
  }

  private updateSlots(deltaMs: number): void {
    const activeLimit = reforgedCombatFeedbackQualityTreatment(this.getBudget().tier).poolLimit;
    for (let index = 0; index < this.slots.length; index += 1) {
      const slot = this.slots[index];
      if (!slot.active) continue;
      if (index >= activeLimit) {
        this.release(slot);
        continue;
      }
      slot.elapsedMs += Math.max(0, deltaMs);
      if (slot.elapsedMs >= slot.durationMs) {
        this.release(slot);
        continue;
      }
      slot.sprite.setFrame(
        slot.frames[
          reforgedFeedbackAnimationFrame(slot.frames.length, slot.elapsedMs, slot.durationMs)
        ],
      );
      slot.sprite.setAlpha(Math.max(0.55, 1 - slot.elapsedMs / slot.durationMs));
    }
  }

  private release(slot: FeedbackSlot): void {
    slot.active = false;
    slot.sprite.setVisible(false).setActive(false);
  }
}
