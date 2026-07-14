import type { KillFeedEntry, PlayerId, RumbleGrudges } from '@shared/game';

interface RumbleFighter {
  id: PlayerId;
  nickname: string;
}

interface KnockoutTally {
  count: number;
  lastIndex: number;
}

/**
 * Resolve one personal rematch target per connected fighter from the
 * authoritative knockout history. Count wins; the latest wound breaks ties.
 */
export function resolveRumbleGrudges(
  killFeed: readonly KillFeedEntry[],
  fighters: readonly RumbleFighter[],
  connectedPlayerIds: readonly PlayerId[],
): RumbleGrudges {
  const fightersById = new Map(fighters.map((fighter) => [fighter.id, fighter]));
  const connected = new Set(connectedPlayerIds.filter((playerId) => fightersById.has(playerId)));
  const tallies = new Map<PlayerId, Map<PlayerId, KnockoutTally>>();

  killFeed.forEach((entry, index) => {
    if (
      entry.killerId === entry.victimId ||
      !connected.has(entry.killerId) ||
      !connected.has(entry.victimId)
    ) {
      return;
    }
    const victimTallies = tallies.get(entry.victimId) ?? new Map<PlayerId, KnockoutTally>();
    const existing = victimTallies.get(entry.killerId);
    victimTallies.set(entry.killerId, {
      count: (existing?.count ?? 0) + 1,
      lastIndex: index,
    });
    tallies.set(entry.victimId, victimTallies);
  });

  const grudges: RumbleGrudges = {};
  for (const ownerId of [...connected].sort()) {
    const candidates = [...(tallies.get(ownerId) ?? [])].sort(
      ([targetA, tallyA], [targetB, tallyB]) =>
        tallyB.count - tallyA.count ||
        tallyB.lastIndex - tallyA.lastIndex ||
        targetA.localeCompare(targetB),
    );
    const [targetId, tally] = candidates[0] ?? [];
    const target = targetId ? fightersById.get(targetId) : undefined;
    if (!target || !tally) continue;
    grudges[ownerId] = {
      targetId,
      targetNickname: target.nickname,
      knockouts: tally.count,
    };
  }
  return grudges;
}
