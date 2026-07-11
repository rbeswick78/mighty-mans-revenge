/** Pure death-state copy so stock elimination and respawn countdown stay testable. */
export function deathOverlayLabel(
  isDead: boolean,
  respawnSecondsRemaining: number,
  eliminated: boolean,
): string | null {
  if (!isDead) return null;
  if (eliminated) return 'ELIMINATED';
  const seconds = Math.max(0, Math.ceil(respawnSecondsRemaining));
  return `YOU DIED\nRESPAWN IN ${seconds}`;
}
