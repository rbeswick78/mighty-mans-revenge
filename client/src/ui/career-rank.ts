import { careerRankProgressForContracts } from '@shared/config/game.js';

export interface CareerRankPresentation {
  text: string;
  promoted: boolean;
}

/**
 * Results-screen reputation copy. Undefined career totals are old/partial
 * payloads and render nothing; Practice never implies persisted progress.
 */
export function careerRankPresentation(
  careerCompletions: number | undefined,
  completedThisMatch: boolean,
  isPractice: boolean,
): CareerRankPresentation | null {
  if (careerCompletions === undefined || isPractice) return null;

  const progress = careerRankProgressForContracts(careerCompletions);
  const before = careerRankProgressForContracts(
    completedThisMatch ? Math.max(0, progress.completed - 1) : progress.completed,
  );
  const promoted = completedThisMatch && before.current.id !== progress.current.id;
  if (promoted) {
    return { text: `RANK UP! ${progress.current.title}`, promoted: true };
  }
  if (progress.next) {
    return {
      text: `RANK: ${progress.current.title}  ${progress.completed}/${progress.next.minContracts} TO ${progress.next.title}`,
      promoted: false,
    };
  }
  return {
    text: `RANK: ${progress.current.title}  ${progress.completed} CLEARS`,
    promoted: false,
  };
}
