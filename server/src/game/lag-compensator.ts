import { type PlayerId, type PlayerState, type CollisionGrid, type WeaponId } from '@shared/game';

import { RewindBuffer } from './rewind-buffer.js';
import { CombatManager, type CanDamagePlayer, type ShotResult } from './combat-manager.js';

export class LagCompensator {
  private readonly rewindBuffer: RewindBuffer;

  constructor(
    private readonly combatManager: CombatManager,
    bufferSize?: number,
  ) {
    this.rewindBuffer = new RewindBuffer(bufferSize);
  }

  saveCurrentState(tick: number, timestamp: number, players: Map<PlayerId, PlayerState>): void {
    this.rewindBuffer.saveState(tick, timestamp, players);
  }

  processShootWithRewind(
    shooterId: PlayerId,
    aimAngle: number,
    currentPlayers: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    rtt: number,
    piercing: boolean = false,
    weaponId: WeaponId = 'rifle',
    hitboxScale: number = 1,
    canDamage: CanDamagePlayer = () => true,
  ): ShotResult {
    return this.processMultiShotWithRewind(
      shooterId,
      [aimAngle],
      currentPlayers,
      grid,
      rtt,
      piercing,
      weaponId,
      hitboxScale,
      canDamage,
    )[0];
  }

  /**
   * Validate several rays from one trigger pull (a shotgun's pellets)
   * against a single rewound snapshot. The rewind lookup and the hybrid
   * shooter-current/others-rewound map are built once and reused for
   * every pellet, so a 6-pellet blast costs barely more than one shot.
   */
  processMultiShotWithRewind(
    shooterId: PlayerId,
    aimAngles: readonly number[],
    currentPlayers: Map<PlayerId, PlayerState>,
    grid: CollisionGrid,
    rtt: number,
    piercing: boolean = false,
    weaponId: WeaponId = 'rifle',
    hitboxScale: number = 1,
    canDamage: CanDamagePlayer = () => true,
  ): ShotResult[] {
    const currentTime = Date.now();
    const renderTime = currentTime - rtt / 2;

    const rewoundState = this.rewindBuffer.getStateAtTime(renderTime);

    // No rewind data available — fall back to current positions.
    let targetStates: Map<PlayerId, PlayerState> | undefined;

    if (rewoundState) {
      // Build hybrid player map: shooter at current position, others at
      // rewound positions.
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

      targetStates = hybridPlayers;
    }

    return aimAngles.map((angle) =>
      this.combatManager.processShot(
        shooterId,
        angle,
        currentPlayers,
        grid,
        targetStates,
        piercing,
        weaponId,
        hitboxScale,
        canDamage,
      ),
    );
  }

  /** Expose the rewind buffer for testing. */
  getRewindBuffer(): RewindBuffer {
    return this.rewindBuffer;
  }
}
