import { characterMasteryProgressForWins } from '@shared/config/game.js';

/** Compact, card-safe mastery copy for one fighter. */
export function characterMasteryLabel(value: number | undefined): string {
  const progress = characterMasteryProgressForWins(value ?? 0);
  if (progress.next) {
    const unit = progress.next.minWins === 1 ? 'WIN' : 'WINS';
    return `${progress.current.title} · ${progress.wins}/${progress.next.minWins} ${unit}`;
  }
  return `${progress.current.title} · ${progress.wins} WINS`;
}
