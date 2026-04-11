import type { PlayerInput, PlayerState } from '@shared/types/player.js';
import type { CollisionGrid } from '@shared/types/map.js';
import { calculateMovement } from '@shared/utils/physics.js';
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
  ): PlayerState {
    const dt = 1 / SERVER.TICK_RATE;

    const { newPos, newStamina, velocity } = calculateMovement(
      input,
      currentState.position,
      currentState.stamina,
      dt,
      grid,
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
