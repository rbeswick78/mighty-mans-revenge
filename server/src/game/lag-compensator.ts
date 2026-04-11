import {
  type PlayerId,
  type PlayerState,
  type CollisionGrid,
} from '@shared/game';

import { RewindBuffer } from './rewind-buffer.js';
import { CombatManager, type ShotResult } from './combat-manager.js';

export class LagCompensator {
  private readonly rewindBuffer: RewindBuffer;

  constructor(
    private readonly combatManager: CombatManager,
    bufferSize?: number,
  ) {
    this.rewindBuffer = new RewindBuffer(bufferSize);
  }

  saveCurrentState(
    tick: number,
    timestamp: number,
    players: Map<PlayerId, PlayerState>,
  ): void {
    this.rewindBuffer.saveState(tick, timestamp, players);
  }

  processShootWithRewind(
    shooterId: PlayerId,
    aimAngle: number,
    currentPlayers: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    rtt: number,
  ): ShotResult {
    const currentTime = Date.now();
    const renderTime = currentTime - rtt / 2;

    const rewoundState = this.rewindBuffer.getStateAtTime(renderTime);

    if (!rewoundState) {
      // No rewind data available — fall back to current positions
      return this.combatManager.processShot(
        shooterId,
        aimAngle,
        currentPlayers,
        grid,
      );
    }

    // Build hybrid player map: shooter at current position, others at rewound positions
    const hybridPlayers = new Map<PlayerId, PlayerState>();

    for (const [playerId, currentState] of currentPlayers) {
      if (playerId === shooterId) {
        // Shooter uses current position
        hybridPlayers.set(playerId, currentState);
      } else {
        // Other players use rewound positions
        const rewoundPlayer = rewoundState.players.get(playerId);
        if (rewoundPlayer) {
          // Create a hybrid: current state data but rewound position
          hybridPlayers.set(playerId, {
            ...currentState,
            position: { ...rewoundPlayer.position },
          });
        } else {
          // Player wasn't in the rewind buffer — use current position
          hybridPlayers.set(playerId, currentState);
        }
      }
    }

    return this.combatManager.processShot(
      shooterId,
      aimAngle,
      currentPlayers,
      grid,
      hybridPlayers,
    );
  }

  /** Expose the rewind buffer for testing. */
  getRewindBuffer(): RewindBuffer {
    return this.rewindBuffer;
  }
}
