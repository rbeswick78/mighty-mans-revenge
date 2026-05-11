import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { CollisionGrid } from '@shared/types/map.js';
import { calculateMovement, type MovementModifiers } from '@shared/utils/physics.js';
import { SERVER } from '@shared/config/game.js';
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

    const { newPos, newStamina, velocity } = calculateMovement(
      input,
      currentState.position,
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
