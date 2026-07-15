export interface MatchScoreEntry {
  name: string;
  score: number;
}

export interface MatchScorePresentation {
  text: string;
  fontSize: number;
}

export type MatchTimerTone = 'normal' | 'warning' | 'danger' | 'overtime';

export interface MatchTimerPresentation {
  text: string;
  tone: MatchTimerTone;
}

function scoreName(name: string, maxLength: number): string {
  const normalized = name.trim().replace(/\s+/g, ' ').toUpperCase();
  return (normalized || 'FIGHTER').slice(0, maxLength).trimEnd();
}

export function matchScorePresentation(
  scores: ReadonlyArray<MatchScoreEntry>,
): MatchScorePresentation {
  const compact = scores.length > 2;
  const maxNameLength = compact ? 8 : 12;
  const labels = scores.map(
    ({ name, score }) => `${scoreName(name, maxNameLength)}: ${score}`,
  );

  return {
    text: compact
      ? [labels.slice(0, 2).join('  ·  '), labels.slice(2).join('  ·  ')]
          .filter(Boolean)
          .join('\n')
      : labels.join('  |  '),
    fontSize: compact ? 11 : 16,
  };
}

export function matchTimerPresentation(
  secondsRemaining: number,
  overtime: boolean,
): MatchTimerPresentation {
  const safeSeconds = Number.isFinite(secondsRemaining)
    ? Math.max(0, Math.ceil(secondsRemaining))
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  let tone: MatchTimerTone = 'normal';
  if (overtime) {
    tone = 'overtime';
  } else if (safeSeconds <= 10) {
    tone = 'danger';
  } else if (safeSeconds <= 30) {
    tone = 'warning';
  }

  return {
    text: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    tone,
  };
}
