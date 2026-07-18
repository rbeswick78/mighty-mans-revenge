import type { BattleRoyaleRecord } from '@shared/types/game.js';

export function battleRoyaleRecordResponse(
  requestedNickname: string,
  responseNickname: string,
  record: Readonly<BattleRoyaleRecord> | null,
): { accepted: false } | { accepted: true; record: BattleRoyaleRecord | null } {
  const requested = requestedNickname.trim().toLowerCase();
  const response = responseNickname.trim().toLowerCase();
  if (requested === '' || requested !== response) return { accepted: false };
  return { accepted: true, record: record ? { ...record } : null };
}
