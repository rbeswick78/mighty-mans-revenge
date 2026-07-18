import type { ServerCapabilities } from '@shared/types/network.js';

import type { MatchData } from '../../services/game-service.js';

export type MatchFoundDestination = 'game' | 'character-select' | 'reject';

/**
 * Route only from the validated server contract. Practice always retains its
 * setup screen; legacy servers retain Character Select; capability-owned
 * standard matches require the complete additive direct-launch projection.
 */
export function matchFoundDestination(
  capabilities: Readonly<ServerCapabilities>,
  matchData: Readonly<MatchData>,
): MatchFoundDestination {
  const status = matchData.standardLaunchStatus ?? 'absent';
  if (status === 'invalid' || (status === 'absent' && matchData.standardMatch)) return 'reject';

  const battleRoyaleStatus = matchData.battleRoyaleLaunchStatus ?? 'absent';
  if (matchData.matchKind === 'battle_royale') {
    return status === 'absent' &&
      battleRoyaleStatus === 'valid' &&
      capabilities.battleRoyale &&
      matchData.battleRoyale
      ? 'game'
      : 'reject';
  }
  if (battleRoyaleStatus !== 'absent' || matchData.battleRoyale) return 'reject';

  if (matchData.practiceKind !== undefined || matchData.matchKind === 'practice') {
    return status === 'absent' ? 'character-select' : 'reject';
  }

  if (status === 'valid') {
    return capabilities.newShell && capabilities.schedules && matchData.standardMatch
      ? 'game'
      : 'reject';
  }

  // Absence is the additive old-server boundary, even when that server already
  // advertised an earlier newShell revision. Malformed or capability-drifted
  // projections were rejected above; a genuinely absent field stays legacy.
  return 'character-select';
}
