import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { CollisionGrid } from '@shared/types/map.js';
import {
  calculateDashEndpoint,
  calculateMovement,
  type MovementModifiers,
} from '@shared/utils/physics.js';
import { ABILITY, MAP, SERVER } from '@shared/config/game.js';
import type { PredictionEntry } from './types.js';

export class ClientPrediction {
  private history: PredictionEntry[] = [];

  /**
   * Apply an input locally using the shared physics code,
   * producing a predicted state without waiting for the server.
   */
  predictInput(
    input: PlayerInput,
    currentState: PlayerState,
    grid: CollisionGrid,
    modifiers?: MovementModifiers,
    abilitiesEnabled = true,
  ): PlayerState {
    const dt = 1 / SERVER.TICK_RATE;

    // Mirror the server's frozen branch: full lockout, position holds, no
    // sprint, no movement. Aim still tracks so the cosmetic facing follows
    // the cursor. Sits above Bruce-locked so a frozen Bruce mid-breath
    // also stops re-aiming locally (matching server behavior).
    if (currentState.frozenTimer > 0) {
      return {
        ...currentState,
        velocity: { x: 0, y: 0 },
        isSprinting: false,
        aimAngle: input.aimAngle,
        lastProcessedInput: input.sequenceNumber,
      };
    }

    // Mirror the server's Bruce-locked branch: while Bruce is breathing fire
    // his movement is pinned (predicting it would drift the sprite forward,
    // then reconcile would snap it back when the server's authoritative
    // position arrives — visible rubber-banding). Aim still updates so the
    // breath cone can sweep with the cursor mid-cast.
    const isBruceLocked =
      currentState.characterId === 'bruce' && currentState.abilityActiveSeconds > 0;
    if (isBruceLocked) {
      return {
        ...currentState,
        velocity: { x: 0, y: 0 },
        isSprinting: false,
        aimAngle: input.aimAngle,
        lastProcessedInput: input.sequenceNumber,
      };
    }

    let movementOrigin = currentState.position;
    let dashActivated = false;
    if (
      abilitiesEnabled &&
      currentState.characterId === 'rook' &&
      input.abilityPressed &&
      currentState.abilityActiveSeconds <= 0 &&
      currentState.abilityCooldownSeconds <= 0
    ) {
      const endpoint = calculateDashEndpoint(
        currentState.position,
        input.aimAngle,
        ABILITY.ROOK_BREACH_DASH.DISTANCE_TILES * MAP.TILE_SIZE,
        grid,
      );
      dashActivated =
        Math.hypot(
          endpoint.x - currentState.position.x,
          endpoint.y - currentState.position.y,
        ) >= 1;
      if (dashActivated) movementOrigin = endpoint;
    }

    const { newPos, newStamina, velocity } = calculateMovement(
      input,
      movementOrigin,
      currentState.stamina,
      dt,
      grid,
      modifiers,
    );

    const predicted: PlayerState = {
      ...currentState,
      position: { ...newPos },
      velocity: { ...velocity },
      stamina: newStamina,
      isSprinting: input.sprint && (input.moveX !== 0 || input.moveY !== 0) && newStamina > 0,
      aimAngle: input.aimAngle,
      abilityCooldownSeconds: dashActivated
        ? ABILITY.ROOK_BREACH_DASH.COOLDOWN
        : currentState.abilityCooldownSeconds,
      lastProcessedInput: input.sequenceNumber,
    };

    return predicted;
  }

  /** Save a prediction to the history buffer. */
  addPrediction(input: PlayerInput, state: PlayerState): void {
    this.history.push({ input, predictedState: state });
  }

  /** Return all prediction entries. */
  getHistory(): PredictionEntry[] {
    return this.history;
  }

  /** Remove all entries with sequenceNumber < the given number. */
  clearBefore(sequenceNumber: number): void {
    this.history = this.history.filter(
      (entry) => entry.input.sequenceNumber >= sequenceNumber,
    );
  }
}
