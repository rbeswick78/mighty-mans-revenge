import type { Vec2 } from '@shared/types/common.js';
import type { CollisionGrid } from '@shared/types/map.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import { calculateMovement } from '@shared/utils/physics.js';
import { SERVER } from '@shared/config/game.js';
import type { PredictionEntry } from './types.js';

/** Below this distance (px), smoothly interpolate toward the server position. */
const SMOOTH_THRESHOLD = 2;

/** Above this distance (px), snap immediately to the server position. */
const SNAP_THRESHOLD = 50;

/** Lerp factor for smooth corrections (per reconciliation pass). */
const CORRECTION_LERP = 0.3;

export interface ReconciliationResult {
  position: Vec2;
  velocity: Vec2;
  stamina: number;
  shouldSnap: boolean;
}

export class ServerReconciliation {
  /**
   * Reconcile the local player against the authoritative server state.
   *
   * 1. Start from the server's authoritative position.
   * 2. Re-simulate every unacknowledged input (seq > server.lastProcessedInput)
   *    using the same shared physics code the server uses.
   * 3. Compare the resulting position to our current predicted position and
   *    decide whether to snap or smoothly correct.
   */
  reconcile(
    serverState: SerializedPlayerState,
    predictions: PredictionEntry[],
    grid: CollisionGrid,
  ): ReconciliationResult {
    const dt = 1 / SERVER.TICK_RATE;

    // Filter to only unacknowledged predictions
    const unacked = predictions.filter(
      (p) => p.input.sequenceNumber > serverState.lastProcessedInput,
    );

    // Start from server authoritative values
    let pos: Vec2 = { x: serverState.position.x, y: serverState.position.y };
    let vel: Vec2 = { x: serverState.velocity.x, y: serverState.velocity.y };
    let stamina = serverState.stamina;

    // Replay unacknowledged inputs on top of server state
    for (const entry of unacked) {
      const result = calculateMovement(entry.input, pos, stamina, dt, grid);
      pos = result.newPos;
      vel = result.velocity;
      stamina = result.newStamina;
    }

    // The reconciled position is where we *should* be after replaying inputs.
    // Compare it to the latest local prediction to decide correction strategy.
    const lastPrediction = predictions[predictions.length - 1];
    if (!lastPrediction) {
      // No local predictions — just take server state directly
      return { position: pos, velocity: vel, stamina, shouldSnap: true };
    }

    const predicted = lastPrediction.predictedState;
    const dx = pos.x - predicted.position.x;
    const dy = pos.y - predicted.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > SNAP_THRESHOLD) {
      // Large mismatch — snap immediately
      return { position: pos, velocity: vel, stamina, shouldSnap: true };
    }

    if (dist < SMOOTH_THRESHOLD) {
      // Close enough — keep current predicted position (no visible jitter)
      return {
        position: { x: predicted.position.x, y: predicted.position.y },
        velocity: vel,
        stamina,
        shouldSnap: false,
      };
    }

    // Medium difference — lerp toward reconciled position
    return {
      position: {
        x: predicted.position.x + dx * CORRECTION_LERP,
        y: predicted.position.y + dy * CORRECTION_LERP,
      },
      velocity: vel,
      stamina,
      shouldSnap: false,
    };
  }
}
