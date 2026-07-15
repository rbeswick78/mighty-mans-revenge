export type SprintTone = 'normal' | 'warning' | 'danger';

export interface SprintPresentation {
  label: string;
  ratio: number;
  tone: SprintTone;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function healthStatusLabel(current: number, max: number, armor: number): string {
  const safeMax = Math.max(1, Math.ceil(finiteOrZero(max)));
  const safeCurrent = Math.max(0, Math.min(safeMax, Math.ceil(finiteOrZero(current))));
  const safeArmor = Math.max(0, Math.ceil(finiteOrZero(armor)));
  return `HP  ${safeCurrent}/${safeMax}${safeArmor > 0 ? `  ARM ${safeArmor}` : ''}`;
}

export function sprintPresentation(current: number, max: number): SprintPresentation {
  const safeMax = Math.max(1, finiteOrZero(max));
  const ratio = Math.max(0, Math.min(1, finiteOrZero(current) / safeMax));
  if (ratio === 0) return { label: 'SPRINT  EMPTY', ratio, tone: 'danger' };
  if (ratio === 1) return { label: 'SPRINT  READY', ratio, tone: 'normal' };
  const percent = Math.min(99, Math.ceil(ratio * 100));
  return {
    label: `SPRINT  ${percent}%`,
    ratio,
    tone: ratio <= 0.25 ? 'warning' : 'normal',
  };
}
